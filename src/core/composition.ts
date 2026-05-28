import { EntityMappingRegistry } from '../integration/entity-mapping';
import { hydrateSerializedComposition, serializeComposition } from '../integration/serialization';
import { syncLayerToScrawl } from '../integration/synchronization';
import { capabilityError } from '../shared/errors';
import { createId } from '../shared/ids';
import type {
  Composition,
  CompositionConfig,
  CompositionRuntime,
  EngineAdapters,
  Layer,
  LayerEffectState,
  LayerMaskConfig,
  LayerMaskState,
  LayerConfig,
  LayerType,
  MotionStateTarget,
  PrecompositionLayerConfig,
  RenderAdapter,
  ScrawlEffectConfig,
  ScrawlEffectsAdapter,
  ScrawlGroupAdapter,
  ScrawlGradientConfig,
  ScrawlPatternConfig,
  ScrawlStyleState,
  ShapeLayerState,
  ScrawlTransformState,
  Transform,
} from '../shared/types';
import {
  normalizeCompositionConfig,
  normalizeLayerEffects,
  normalizeScrawlEffectConfig,
  normalizeScrawlMaskConfig,
} from '../shared/validation';
import { MemoryTimeline, NoopRenderer } from './adapters';

const defaultPositionX = 0;
const defaultPositionY = 0;
const defaultRotation = 0;
const defaultScaleX = 1;
const defaultScaleY = 1;
const defaultAnchorX = 0;
const defaultAnchorY = 0;

interface CompositionInternals {
  setHostGroup(group: ScrawlGroupAdapter | undefined): void;
}

const compositionInternals = new WeakMap<Composition, CompositionInternals>();

function mergeTransform(transform?: Partial<Transform>): Transform {
  const position = transform?.position;
  const scale = transform?.scale;
  const anchor = transform?.anchor;

  return {
    position: {
      x: position?.x ?? defaultPositionX,
      y: position?.y ?? defaultPositionY,
    },
    rotation: transform?.rotation ?? defaultRotation,
    scale: {
      x: scale?.x ?? defaultScaleX,
      y: scale?.y ?? defaultScaleY,
    },
    anchor: {
      x: anchor?.x ?? defaultAnchorX,
      y: anchor?.y ?? defaultAnchorY,
    },
    ...(transform?.rotationX === undefined ? null : { rotationX: transform.rotationX }),
    ...(transform?.rotationY === undefined ? null : { rotationY: transform.rotationY }),
    ...(transform?.rotationZ === undefined ? null : { rotationZ: transform.rotationZ }),
  };
}

function createScrawlState(transform: Transform, opacity: number, visible: boolean): ScrawlTransformState {
  return {
    startX: transform.position.x,
    startY: transform.position.y,
    offsetX: 0,
    offsetY: 0,
    roll: transform.rotation,
    scale: transform.scale.x,
    handleX: transform.anchor.x,
    handleY: transform.anchor.y,
    globalAlpha: opacity,
    visibility: visible,
  };
}

function containsPrecomposition(root: Composition, search: Composition, seen = new Set<string>()): boolean {
  if (root.id === search.id) return true;
  if (seen.has(root.id)) return false;
  seen.add(root.id);

  for (const layer of root.layers) {
    if (layer.precomposition !== null && containsPrecomposition(layer.precomposition, search, seen)) return true;
  }

  return false;
}

function layerArtefacts(layer: Layer): ScrawlGroupArtefact[] {
  const fill = layer.scrawlEntity.parts?.fill;
  const stroke = layer.scrawlEntity.parts?.stroke;
  return fill === undefined && stroke === undefined
    ? [layer.scrawlEntity]
    : [fill, stroke].filter((entity): entity is ScrawlGroupArtefact => entity !== undefined);
}

type ScrawlGroupArtefact = Layer['scrawlEntity'];

function syncPrecompositionLayer(
  layer: Layer,
  parentTime: number,
  precompositionTimes: WeakMap<Layer, number>,
): void {
  if (layer.precomposition === null) return;
  const config = layer.config.precomp;
  const childTime = Math.max(0, (parentTime - (config?.timeOffset ?? 0)) * (config?.playbackRate ?? 1));
  const clampedTime = Math.min(childTime, layer.precomposition.duration);
  if (precompositionTimes.get(layer) === clampedTime) return;

  precompositionTimes.set(layer, clampedTime);
  layer.precomposition.seek(clampedTime);
  layer.scrawlCell?.render?.();
}

function moveLayersIntoGroup(
  layers: ReadonlyArray<Layer>,
  targetGroup: ScrawlGroupAdapter,
  previousGroup: ScrawlGroupAdapter | undefined,
): void {
  for (const layer of layers) {
    const artefacts = layerArtefacts(layer);
    if (targetGroup.moveArtefactsIntoGroup !== undefined) {
      targetGroup.moveArtefactsIntoGroup(...artefacts);
      continue;
    }

    previousGroup?.removeArtefacts?.(...artefacts);
    targetGroup.addArtefacts?.(...artefacts);
  }
}

function findLayerById(layers: ReadonlyArray<Layer>, id: string | undefined): Layer | undefined {
  if (id === undefined) return undefined;
  for (const layer of layers) {
    if (layer.id === id) return layer;
  }
  return undefined;
}

function normalizeAddLayerArgs(
  sourceOrConfig: string | LayerConfig | undefined,
  config: LayerConfig | undefined,
): { source: string | undefined; config: LayerConfig } {
  if (typeof sourceOrConfig === 'string') return { source: sourceOrConfig, config: config ?? {} };
  return { source: undefined, config: sourceOrConfig ?? config ?? {} };
}

function attachLayerEffect(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  effect: LayerEffectState,
): void {
  if (controller === undefined) return;
  const handle = controller.addEffect(layer.scrawlEntity, effect);
  effect.scrawlFilter = handle.filter;
}

function configureLayerEffectMotionTarget(
  controller: ScrawlEffectsAdapter | undefined,
  effect: LayerEffectState,
): void {
  const valueKeys = Object.keys(effect.values);
  const previousValues: Record<string, number> = {};
  for (const key of valueKeys) previousValues[key] = effect.values[key]!;

  effect.apply = (): void => {
    let changed = false;

    for (const key of valueKeys) {
      const value = effect.values[key]!;
      if (previousValues[key] === value) continue;

      previousValues[key] = value;
      writeEffectActionValue(effect, key, value);
      changed = true;
    }

    if (!changed || controller === undefined || effect.scrawlFilter === undefined) return;
    controller.updateEffect({ id: effect.id, filter: effect.scrawlFilter }, { actions: effect.actions });
  };
}

function createShapeState(layerConfig: LayerConfig, entity: { readonly parts?: Layer['scrawlEntity']['parts']; set(values: Readonly<Record<string, unknown>>): unknown }): ShapeLayerState | undefined {
  const config = layerConfig.shape;
  if (config === undefined) return undefined;
  if (config.fill === undefined && config.stroke === undefined) return undefined;

  const fillEntity = entity.parts?.fill;
  const strokeEntity = entity.parts?.stroke;
  if (fillEntity === undefined || strokeEntity === undefined) {
    throw capabilityError(
      'SHAPE_PARTS_UNAVAILABLE',
      'Typed shape fill/stroke animation requires separate Scrawl entity parts.',
      'Create shape layers through the Scrawl adapter or provide an entity factory that returns fill and stroke parts.',
    );
  }
  const fillColor = config.fill?.color ?? config.fillStyle ?? 'rgb(0 0 0 / 1)';
  const strokeColor = config.stroke?.color ?? config.strokeStyle ?? 'rgb(0 0 0 / 1)';
  const fill = {
    color: fillColor,
    values: {
      opacity: config.fill?.opacity ?? 1,
    },
    apply() {},
  };
  const stroke = {
    color: strokeColor,
    values: {
      opacity: config.stroke?.opacity ?? (config.stroke === undefined && config.strokeStyle === undefined ? 0 : 1),
      width: config.stroke?.width ?? config.lineWidth ?? 1,
    },
    apply() {},
  };
  let previousFillOpacity = Number.NaN;
  let previousStrokeOpacity = Number.NaN;
  let previousStrokeWidth = Number.NaN;

  const shape: ShapeLayerState = {
    fill,
    stroke,
    apply(): void {
      const fillOpacity = clampUnit(fill.values.opacity);
      const strokeOpacity = clampUnit(stroke.values.opacity);
      const strokeWidth = Math.max(stroke.values.width, 0);
      if (previousFillOpacity !== fillOpacity) {
        previousFillOpacity = fillOpacity;
        fillEntity.set({ globalAlpha: fillOpacity, visibility: fillOpacity > 0 });
      }
      if (previousStrokeOpacity !== strokeOpacity || previousStrokeWidth !== strokeWidth) {
        previousStrokeOpacity = strokeOpacity;
        previousStrokeWidth = strokeWidth;
        strokeEntity.set({
          globalAlpha: strokeOpacity,
          lineWidth: strokeWidth,
          visibility: strokeOpacity > 0 && strokeWidth > 0,
        });
      }
    },
  };

  fill.apply = shape.apply;
  stroke.apply = shape.apply;
  return shape;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function writeEffectActionValue(effect: LayerEffectState, key: string, value: number): void {
  for (const action of effect.actions) {
    if (typeof action[key] === 'number') {
      (action as Record<string, unknown>)[key] = value;
    }
  }
}

function detachLayerEffect(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  effect: LayerEffectState,
): void {
  if (controller !== undefined && effect.scrawlFilter !== undefined) {
    controller.removeEffect(layer.scrawlEntity, {
      id: effect.scrawlFilter.name,
      filter: effect.scrawlFilter,
    });
    delete effect.scrawlFilter;
    return;
  }

  effect.scrawlFilter?.kill?.();
  delete effect.scrawlFilter;
}

function applyLayerMask(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  mask: LayerMaskState | null,
): void {
  if (controller === undefined || mask === null) return;
  if (mask.sourceLayerId !== undefined) return;
  const handle = controller.applyMask(layer.scrawlEntity, mask);
  if (handle !== undefined) mask.scrawlFilter = handle.filter;
}

function detachMaskFeather(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
): void {
  const filter = layer.mask?.scrawlFilter;
  if (filter === undefined) return;
  const target = layer.mask?.scrawlFilterTarget ?? layer.scrawlEntity;

  if (controller !== undefined) {
    controller.removeEffect(target, { id: filter.name, filter });
  } else {
    filter.kill?.();
  }
  delete layer.mask?.scrawlFilter;
  delete layer.mask?.scrawlFilterTarget;
}

function attachLayerMaskCell(
  adapters: EngineAdapters,
  controller: ScrawlEffectsAdapter | undefined,
  runtime: CompositionRuntime,
  targetLayer: Layer,
  sourceLayer: Layer,
  mask: LayerMaskState,
  activeGroup: ScrawlGroupAdapter | undefined,
): void {
  if (mask.strategy !== 'cell') return;
  const cell = adapters.createLayerMaskCell?.({
    composition: runtime,
    targetLayer,
    sourceLayer,
    mask,
  });
  const cellGroup = cell?.getGroup?.();
  if (cell === undefined || cellGroup === undefined) return;

  moveLayersIntoGroup([targetLayer, sourceLayer], cellGroup, activeGroup);
  targetLayer.scrawlEntity.set({
    visibility: targetLayer.visible,
    globalCompositeOperation: 'source-over',
    globalAlpha: targetLayer.opacity,
    order: 0,
  });
  sourceLayer.scrawlEntity.set({
    visibility: true,
    globalCompositeOperation: mask.mode === 'clip' ? 'destination-in' : mask.mode,
    globalAlpha: mask.opacity ?? 1,
    order: 1,
  });

  if (mask.feather !== undefined && mask.feather > 0 && controller !== undefined) {
    const handle = controller.addEffect(sourceLayer.scrawlEntity, {
      id: `${targetLayer.id}-layer-mask-feather`,
      actions: [{ action: 'gaussian-blur', radius: mask.feather }],
    });
    mask.scrawlFilter = handle.filter;
    mask.scrawlFilterTarget = sourceLayer.scrawlEntity;
  }

  mask.scrawlCell = cell;
}

function detachLayerMaskCell(
  targetLayer: Layer,
  sourceLayer: Layer | undefined,
  activeGroup: ScrawlGroupAdapter | undefined,
): void {
  const cell = targetLayer.mask?.scrawlCell;
  if (cell === undefined) return;

  const layers = sourceLayer === undefined ? [targetLayer] : [targetLayer, sourceLayer];
  if (activeGroup !== undefined) moveLayersIntoGroup(layers, activeGroup, cell.getGroup?.());
  targetLayer.scrawlEntity.set({
    globalCompositeOperation: 'source-over',
    globalAlpha: targetLayer.opacity,
    visibility: targetLayer.visible,
  });

  if (sourceLayer !== undefined) {
    sourceLayer.scrawlEntity.set({
      globalCompositeOperation: 'source-over',
      globalAlpha: sourceLayer.opacity,
      visibility: sourceLayer.visible,
    });
  }

  cell.kill?.();
  delete targetLayer.mask?.scrawlCell;
}

function syncCompositionFrame(
  layers: ReadonlyArray<Layer>,
  time: number,
  precompositionTimes: WeakMap<Layer, number>,
): void {
  for (const layer of layers) {
    syncPrecompositionLayer(layer, time, precompositionTimes);
    syncLayerToScrawl(layer);
  }
}

function currentTimeMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function createComposition(
  config: CompositionConfig,
  adapters: EngineAdapters = {},
): Composition {
  const normalized = normalizeCompositionConfig(config);
  const id = createId('composition');
  const timeline = adapters.createTimeline?.(normalized.duration) ?? new MemoryTimeline(normalized.duration);
  let activeGroup = adapters.createGroup?.(normalized.name);
  const effectsController = adapters.createEffectsController?.();
  const precompositionTimes = new WeakMap<Layer, number>();
  const registry = new EntityMappingRegistry(adapters.entityFactories);
  const runtime: CompositionRuntime = {
    id,
    name: normalized.name,
    width: normalized.width,
    height: normalized.height,
    layers: [],
    timeline,
  };
  if (activeGroup !== undefined) runtime.group = activeGroup;
  const renderer: RenderAdapter = adapters.createRenderer?.(runtime) ?? new NoopRenderer(runtime);
  const rendererDrivesPlayback = renderer.setFrameCallback !== undefined;
  const stylesController = adapters.createStylesController?.();
  const motionTargets: MotionStateTarget[] = [];
  const livePlayback = {
    running: false,
    startedAtMs: 0,
  };

  const registerMotionTarget = (target: MotionStateTarget): (() => void) => {
    if (!motionTargets.includes(target)) motionTargets.push(target);

    return () => {
      const index = motionTargets.indexOf(target);
      if (index >= 0) motionTargets.splice(index, 1);
    };
  };

  const removeMotionTarget = (target: MotionStateTarget): void => {
    const index = motionTargets.indexOf(target);
    if (index >= 0) motionTargets.splice(index, 1);
  };

  const applyMotionTargets = (): void => {
    for (const target of motionTargets) target.apply();
  };

  const syncLiveFrame = (): void => {
    if (livePlayback.running) {
      const elapsedSeconds = (currentTimeMs() - livePlayback.startedAtMs) / 1000;
      const nextTime = normalized.duration > 0 ? elapsedSeconds % normalized.duration : 0;
      timeline.seek(nextTime, true);
    }
    syncCompositionFrame(runtime.layers, timeline.time(), precompositionTimes);
    applyMotionTargets();
  };

  const composition = {
    id,
    name: normalized.name,
    width: normalized.width,
    height: normalized.height,
    duration: normalized.duration,
    frameRate: normalized.frameRate,
    backgroundColor: normalized.backgroundColor,
    layers: runtime.layers,
    timeline,
    renderer,

    addLayer(type: LayerType, sourceOrConfig?: string | LayerConfig, config?: LayerConfig): Layer {
      const { source, config: layerConfig } = normalizeAddLayerArgs(sourceOrConfig, config);
      const layerId = createId(type);
      const baseEntityContext = {
        id: layerId,
        type,
        name: layerConfig.name ?? layerId,
        config: layerConfig,
      };
      const groupedEntityContext =
        activeGroup === undefined ? baseEntityContext : { ...baseEntityContext, group: activeGroup };
      const entity = registry.createEntity(
        source === undefined ? groupedEntityContext : { ...groupedEntityContext, source },
      );
      const parent = layerConfig.parent ?? null;
      const transform = mergeTransform(layerConfig.transform);
      const visible = layerConfig.visible ?? true;
      const opacity = layerConfig.opacity ?? 1;
      const effects = normalizeLayerEffects(layerConfig.effects);
      const mask = normalizeScrawlMaskConfig(layerConfig.mask);
      const precomposition = layerConfig.precomp?.composition ?? null;
      const shape = createShapeState(layerConfig, entity);
      const scrawlCell = layerConfig.precomp === undefined ? undefined : adapters.createPrecompositionCell?.({
        parent: runtime,
        composition: layerConfig.precomp.composition,
        layerName: layerConfig.name ?? layerId,
      });
      const baseLayer = {
        id: layerId,
        type,
        name: layerConfig.name ?? layerId,
        config: layerConfig,
        parent,
        children: [],
        zIndex: this.layers.length,
        transform,
        visible,
        locked: layerConfig.locked ?? false,
        opacity,
        effects,
        mask,
        precomposition,
        ...(shape === undefined ? null : { shape }),
        ...(scrawlCell === undefined ? null : { scrawlCell }),
        scrawlEntity: entity,
        scrawlState: createScrawlState(transform, opacity, visible),
      };
      const layer: Layer =
        source === undefined
          ? layerConfig.content === undefined
            ? baseLayer
            : { ...baseLayer, content: layerConfig.content }
          : layerConfig.content === undefined
            ? { ...baseLayer, source }
            : { ...baseLayer, source, content: layerConfig.content };

      parent?.children.push(layer);
      this.layers.push(layer);
      registry.register(layer, entity);
      activeGroup?.addArtefacts?.(...layerArtefacts(layer));
      syncLayerToScrawl(layer);
      if (layer.shape !== undefined) {
        layer.shape.apply();
        registerMotionTarget(layer.shape.fill);
        registerMotionTarget(layer.shape.stroke);
      }
      for (const effect of layer.effects) {
        attachLayerEffect(effectsController, layer, effect);
        configureLayerEffectMotionTarget(effectsController, effect);
        registerMotionTarget(effect);
      }
      applyLayerMask(effectsController, layer, layer.mask);

      return layer;
    },

    addPrecomposition(
      childComposition: Composition,
      layerConfig: Omit<LayerConfig, 'content' | 'precomp'> & {
        readonly timeOffset?: number;
        readonly playbackRate?: number;
      } = {},
    ): Layer {
      if (childComposition.id === id || containsPrecomposition(childComposition, composition)) {
        throw new Error('Precomposition circular reference detected.');
      }

      const precompConfig: PrecompositionLayerConfig = {
        composition: childComposition,
        ...(layerConfig.timeOffset === undefined ? null : { timeOffset: layerConfig.timeOffset }),
        ...(layerConfig.playbackRate === undefined ? null : { playbackRate: layerConfig.playbackRate }),
      };
      const layer = this.addLayer('precomp', {
        ...layerConfig,
        precomp: precompConfig,
      });

      if (layer.scrawlCell !== undefined) {
        layer.source = layer.scrawlCell.name;
        layer.scrawlEntity.set({ imageSource: layer.scrawlCell.name });
        const cellGroup = layer.scrawlCell.getGroup?.();
        if (cellGroup !== undefined) compositionInternals.get(childComposition)?.setHostGroup(cellGroup);
      }

      return layer;
    },

    addEffect(layer: Layer, config: ScrawlEffectConfig): LayerEffectState {
      const effect = normalizeScrawlEffectConfig(config, `effect-${layer.effects.length}`);
      layer.effects.push(effect);
      attachLayerEffect(effectsController, layer, effect);
      configureLayerEffectMotionTarget(effectsController, effect);
      registerMotionTarget(effect);
      return effect;
    },

    removeEffect(layer: Layer, effectOrId: LayerEffectState | string): void {
      const index =
        typeof effectOrId === 'string'
          ? layer.effects.findIndex((effect) => effect.id === effectOrId)
          : layer.effects.indexOf(effectOrId);
      if (index < 0) return;

      const effect = layer.effects[index];
      if (effect === undefined) return;
      detachLayerEffect(effectsController, layer, effect);
      removeMotionTarget(effect);
      layer.effects.splice(index, 1);
    },

    clearEffects(layer: Layer): void {
      for (const effect of layer.effects) {
        detachLayerEffect(effectsController, layer, effect);
        removeMotionTarget(effect);
      }
      layer.effects.length = 0;
    },

    createGradient(config: ScrawlGradientConfig): ScrawlStyleState {
      if (stylesController === undefined) {
        throw capabilityError(
          'SCRAWL_STYLES_UNAVAILABLE',
          'Composition does not have a Scrawl styles controller.',
          'Create the composition with the browser Scrawl-canvas adapter before creating Scrawl styles.',
        );
      }

      const style = stylesController.createGradient(config);
      registerMotionTarget(style);
      return style;
    },

    createPattern(config: ScrawlPatternConfig): ScrawlStyleState {
      if (stylesController === undefined) {
        throw capabilityError(
          'SCRAWL_STYLES_UNAVAILABLE',
          'Composition does not have a Scrawl styles controller.',
          'Create the composition with the browser Scrawl-canvas adapter before creating Scrawl styles.',
        );
      }

      const style = stylesController.createPattern(config);
      registerMotionTarget(style);
      return style;
    },

    removeStyle(style: ScrawlStyleState): void {
      removeMotionTarget(style);
      stylesController?.removeStyle(style);
    },

    registerMotionTarget,

    applyMotionTargets,

    setMask(layer: Layer, config: LayerMaskConfig): LayerMaskState {
      detachLayerMaskCell(layer, findLayerById(this.layers, layer.mask?.sourceLayerId), activeGroup);
      detachMaskFeather(effectsController, layer);
      const mask = normalizeScrawlMaskConfig(config) as LayerMaskState;

      layer.mask = mask;
      applyLayerMask(effectsController, layer, mask);
      return mask;
    },

    setLayerMask(
      targetLayer: Layer,
      sourceLayer: Layer,
      config: Omit<LayerMaskConfig, 'sourceLayerId'> = {},
    ): LayerMaskState {
      const mask = this.setMask(targetLayer, {
        ...config,
        sourceLayerId: sourceLayer.id,
        strategy: config.strategy ?? 'cell',
      });
      attachLayerMaskCell(adapters, effectsController, runtime, targetLayer, sourceLayer, mask, activeGroup);
      if (mask.scrawlCell === undefined) sourceLayer.scrawlEntity.set({ visibility: false });
      return mask;
    },

    clearMask(layer: Layer): void {
      detachLayerMaskCell(layer, findLayerById(this.layers, layer.mask?.sourceLayerId), activeGroup);
      detachMaskFeather(effectsController, layer);
      layer.mask = null;
    },

    removeLayer(layer: Layer): void {
      while (layer.children.length > 0) {
        const child = layer.children[layer.children.length - 1];
        if (child) this.removeLayer(child);
      }

      for (const item of this.layers) {
        if (item !== layer && item.mask?.sourceLayerId === layer.id) this.clearMask(item);
      }

      const siblingIndex = layer.parent?.children.indexOf(layer) ?? -1;
      if (siblingIndex >= 0) layer.parent?.children.splice(siblingIndex, 1);
      this.clearMask(layer);
      detachMaskFeather(effectsController, layer);
      for (const effect of layer.effects) {
        detachLayerEffect(effectsController, layer, effect);
        removeMotionTarget(effect);
      }
      if (layer.shape !== undefined) {
        removeMotionTarget(layer.shape.fill);
        removeMotionTarget(layer.shape.stroke);
      }
      activeGroup?.removeArtefacts?.(...layerArtefacts(layer));
      layer.scrawlEntity.kill?.();
      precompositionTimes.delete(layer);
      registry.unregister(layer);

      const index = this.layers.indexOf(layer);
      if (index >= 0) this.layers.splice(index, 1);
      this.layers.forEach((item, nextIndex) => {
        item.zIndex = nextIndex;
      });
    },

    reorderLayer(layer: Layer, newIndex: number): void {
      const currentIndex = this.layers.indexOf(layer);
      if (currentIndex < 0) return;

      const boundedIndex = Math.min(Math.max(newIndex, 0), this.layers.length - 1);
      this.layers.splice(currentIndex, 1);
      this.layers.splice(boundedIndex, 0, layer);
      this.layers.forEach((item, index) => {
        item.zIndex = index;
      });
    },

    play(): void {
      if (rendererDrivesPlayback) {
        livePlayback.startedAtMs = currentTimeMs() - this.timeline.time() * 1000;
        livePlayback.running = true;
      } else {
        this.timeline.play();
      }
      this.renderer.play();
    },

    pause(): void {
      if (rendererDrivesPlayback) livePlayback.running = false;
      else this.timeline.pause();
      this.renderer.pause();
    },

    seek(time: number): void {
      livePlayback.running = false;
      this.timeline.seek(time);
      syncCompositionFrame(this.layers, time, precompositionTimes);
      applyMotionTargets();
      void this.renderer.renderFrame();
    },

    serialize(): string {
      return serializeComposition(this);
    },
  } satisfies Composition;

  composition.renderer.setFrameCallback?.(syncLiveFrame);

  compositionInternals.set(composition, {
    setHostGroup(group: ScrawlGroupAdapter | undefined): void {
      if (group === activeGroup) return;
      const previousGroup = activeGroup;
      activeGroup = group;
      if (group === undefined) delete runtime.group;
      else {
        runtime.group = group;
        moveLayersIntoGroup(runtime.layers, group, previousGroup);
      }
    },
  });

  return composition;
}

export function deserializeComposition(
  json: string,
  adapters: EngineAdapters = {},
): Composition {
  return hydrateSerializedComposition(json, createComposition, adapters);
}
