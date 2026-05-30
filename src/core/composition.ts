import { EntityMappingRegistry } from '../integration/entity-mapping';
import { hydrateSerializedComposition, serializeComposition } from '../integration/serialization';
import { syncLayerToScrawl } from '../integration/synchronization';
import { capabilityError } from '../shared/errors';
import { createId } from '../shared/ids';
import type {
  Composition,
  CompositionConfig,
  Layer,
  LayerEffectState,
  LayerMaskConfig,
  LayerMaskState,
  LayerConfig,
  LayerType,
  PrecompositionLayerConfig,
  Transform,
} from '../shared/project';
import type {
  ScrawlEffectConfig,
  ScrawlGroupAdapter,
  ScrawlGradientConfig,
  ScrawlPatternConfig,
  ScrawlStyleState,
  ScrawlTransformState,
} from '../shared/scrawl';
import type { CompositionRuntime, EngineAdapters, RenderAdapter } from '../shared/runtime';
import {
  normalizeCompositionConfig,
  normalizeLayerEffects,
  normalizeScrawlEffectConfig,
  normalizeScrawlMaskConfig,
} from '../shared/validation';
import { MemoryTimeline, NoopRenderer } from './adapters';
import { AssetRegistry } from './assets';
import {
  applyLayerMask,
  attachLayerMaskCell,
  containsPrecomposition,
  detachLayerMaskCell,
  detachMaskFeather,
  findLayerById,
  layerArtefacts,
  moveLayersIntoGroup,
  syncPrecompositionLayer,
} from './compositing';
import {
  attachLayerEffect,
  configureLayerEffectMotionTarget,
  detachLayerEffect,
} from './layer-effects';
import { createShapeState, createTextState } from './layer-state';
import { createVideoMediaTarget } from './media-targets';
import { MotionTargetRegistry } from './motion-targets';

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

function normalizeAddLayerArgs(
  sourceOrConfig: string | LayerConfig | undefined,
  config: LayerConfig | undefined,
): { source: string | undefined; config: LayerConfig } {
  if (typeof sourceOrConfig === 'string') return { source: sourceOrConfig, config: config ?? {} };
  return { source: undefined, config: sourceOrConfig ?? config ?? {} };
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
  const assets = new AssetRegistry();
  const motionTargets = new MotionTargetRegistry();
  const runtime: CompositionRuntime = {
    id,
    name: normalized.name,
    width: normalized.width,
    height: normalized.height,
    layers: [],
    assets: assets.items,
    timeline,
  };
  if (activeGroup !== undefined) runtime.group = activeGroup;
  const renderer: RenderAdapter = adapters.createRenderer?.(runtime) ?? new NoopRenderer(runtime);
  const rendererDrivesPlayback = renderer.setFrameCallback !== undefined;
  const stylesController = adapters.createStylesController?.();
  const livePlayback = {
    running: false,
    startedAtMs: 0,
  };

  const syncLiveFrame = (): void => {
    if (livePlayback.running) {
      const elapsedSeconds = (currentTimeMs() - livePlayback.startedAtMs) / 1000;
      const nextTime = normalized.duration > 0 ? elapsedSeconds % normalized.duration : 0;
      timeline.seek(nextTime, true);
    }
    syncCompositionFrame(runtime.layers, timeline.time(), precompositionTimes);
    motionTargets.apply();
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
    assets: runtime.assets,
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
      const textState = type === 'text' ? createTextState(layerConfig, entity) : undefined;
      const media = type === 'video' ? createVideoMediaTarget(layerConfig, entity, layerConfig.name ?? layerId) : undefined;
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
        ...(media === undefined ? null : { media }),
        ...(shape === undefined ? null : { shape }),
        ...(textState === undefined ? null : { textState }),
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
      assets.registerLayerSource(layer);
      registry.register(layer, entity);
      activeGroup?.addArtefacts?.(...layerArtefacts(layer));
      syncLayerToScrawl(layer);
      if (layer.shape !== undefined) {
        layer.shape.apply();
        motionTargets.register(layer.shape.fill);
        motionTargets.register(layer.shape.stroke);
      }
      if (layer.textState !== undefined) {
        layer.textState.apply();
        motionTargets.register(layer.textState);
      }
      for (const effect of layer.effects) {
        attachLayerEffect(effectsController, layer, effect);
        configureLayerEffectMotionTarget(effectsController, effect);
        motionTargets.register(effect);
      }
      applyLayerMask(effectsController, layer, layer.mask);

      return layer;
    },

    addImage(source: string, layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('image', source, layerConfig);
    },

    addVideo(source: string, layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('video', source, layerConfig);
    },

    addAudio(source: string, layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('audio', source, layerConfig);
    },

    addSvg(source: string, layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('svg', source, layerConfig);
    },

    addShape(layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('shape', layerConfig);
    },

    addText(text: string, layerConfig: LayerConfig = {}): Layer {
      return this.addLayer('text', { ...layerConfig, text });
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
      motionTargets.register(effect);
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
      motionTargets.remove(effect);
      layer.effects.splice(index, 1);
    },

    clearEffects(layer: Layer): void {
      for (const effect of layer.effects) {
        detachLayerEffect(effectsController, layer, effect);
        motionTargets.remove(effect);
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
      motionTargets.register(style);
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
      motionTargets.register(style);
      return style;
    },

    removeStyle(style: ScrawlStyleState): void {
      motionTargets.remove(style);
      stylesController?.removeStyle(style);
    },

    registerAsset: (asset) => assets.register(asset),

    removeAsset: (asset) => assets.remove(asset),

    registerMotionTarget: (target) => motionTargets.register(target),

    applyMotionTargets: () => motionTargets.apply(),

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
        motionTargets.remove(effect);
      }
      if (layer.shape !== undefined) {
        motionTargets.remove(layer.shape.fill);
        motionTargets.remove(layer.shape.stroke);
      }
      if (layer.textState !== undefined) motionTargets.remove(layer.textState);
      layer.media?.pause?.();
      layer.media?.dispose?.();
      delete layer.media;
      assets.removeOwnedByLayer(layer);
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
      for (const layer of this.layers) void layer.media?.play?.();
      if (rendererDrivesPlayback) {
        livePlayback.startedAtMs = currentTimeMs() - this.timeline.time() * 1000;
        livePlayback.running = true;
      } else {
        this.timeline.play();
      }
      this.renderer.play();
    },

    pause(): void {
      for (const layer of this.layers) layer.media?.pause?.();
      if (rendererDrivesPlayback) livePlayback.running = false;
      else this.timeline.pause();
      this.renderer.pause();
    },

    seek(time: number): void {
      livePlayback.running = false;
      this.timeline.seek(time);
      syncCompositionFrame(this.layers, time, precompositionTimes);
      for (const layer of this.layers) void layer.media?.seek(time);
      motionTargets.apply();
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
