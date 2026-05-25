import { EntityMappingRegistry } from '../integration/entity-mapping';
import { hydrateSerializedComposition, serializeComposition } from '../integration/serialization';
import { syncLayerToScrawl } from '../integration/synchronization';
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
  PrecompositionLayerConfig,
  ScrawlEffectConfig,
  ScrawlEffectsAdapter,
  ScrawlGroupAdapter,
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
    if (targetGroup.moveArtefactsIntoGroup !== undefined) {
      targetGroup.moveArtefactsIntoGroup(layer.scrawlEntity);
      continue;
    }

    previousGroup?.removeArtefacts?.(layer.scrawlEntity);
    targetGroup.addArtefacts?.(layer.scrawlEntity);
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
    renderer: adapters.createRenderer?.(runtime) ?? new NoopRenderer(runtime),

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
      activeGroup?.addArtefacts?.(entity);
      syncLayerToScrawl(layer);
      for (const effect of layer.effects) attachLayerEffect(effectsController, layer, effect);
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
      layer.effects.splice(index, 1);
    },

    clearEffects(layer: Layer): void {
      for (const effect of layer.effects) detachLayerEffect(effectsController, layer, effect);
      layer.effects.length = 0;
    },

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
      for (const effect of layer.effects) detachLayerEffect(effectsController, layer, effect);
      activeGroup?.removeArtefacts?.(layer.scrawlEntity);
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
      this.timeline.play();
      this.renderer.play();
    },

    pause(): void {
      this.timeline.pause();
      this.renderer.pause();
    },

    seek(time: number): void {
      this.timeline.seek(time);
      for (const layer of this.layers) {
        syncPrecompositionLayer(layer, time, precompositionTimes);
        syncLayerToScrawl(layer);
      }
      void this.renderer.renderFrame();
    },

    serialize(): string {
      return serializeComposition(this);
    },
  } satisfies Composition;

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
