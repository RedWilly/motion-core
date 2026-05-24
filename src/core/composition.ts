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
  LayerMaskState,
  LayerConfig,
  LayerType,
  ScrawlEffectConfig,
  ScrawlEffectsAdapter,
  ScrawlMaskConfig,
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
  const handle = controller.applyMask(layer.scrawlEntity, mask);
  if (handle !== undefined) mask.scrawlFilter = handle.filter;
}

function detachMaskFeather(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
): void {
  const filter = layer.mask?.scrawlFilter;
  if (filter === undefined) return;

  if (controller !== undefined) {
    controller.removeEffect(layer.scrawlEntity, { id: filter.name, filter });
  } else {
    filter.kill?.();
  }
  delete layer.mask?.scrawlFilter;
}

export function createComposition(
  config: CompositionConfig,
  adapters: EngineAdapters = {},
): Composition {
  const normalized = normalizeCompositionConfig(config);
  const id = createId('composition');
  const timeline = adapters.createTimeline?.(normalized.duration) ?? new MemoryTimeline(normalized.duration);
  const group = adapters.createGroup?.(normalized.name);
  const effectsController = adapters.createEffectsController?.();
  const registry = new EntityMappingRegistry(adapters.entityFactories);
  const baseRuntime = {
    id,
    name: normalized.name,
    layers: [],
    timeline,
  };
  const runtime: CompositionRuntime =
    group === undefined ? baseRuntime : { ...baseRuntime, group };

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

    addLayer(type: LayerType, source?: string, layerConfig: LayerConfig = {}): Layer {
      const layerId = createId(type);
      const baseEntityContext = {
        id: layerId,
        type,
        name: layerConfig.name ?? layerId,
        config: layerConfig,
      };
      const groupedEntityContext =
        group === undefined ? baseEntityContext : { ...baseEntityContext, group };
      const entity = registry.createEntity(
        source === undefined ? groupedEntityContext : { ...groupedEntityContext, source },
      );
      const parent = layerConfig.parent ?? null;
      const transform = mergeTransform(layerConfig.transform);
      const visible = layerConfig.visible ?? true;
      const opacity = layerConfig.opacity ?? 1;
      const effects = normalizeLayerEffects(layerConfig.effects);
      const mask = normalizeScrawlMaskConfig(layerConfig.mask);
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
      group?.addArtefacts?.(entity);
      syncLayerToScrawl(layer);
      for (const effect of layer.effects) attachLayerEffect(effectsController, layer, effect);
      applyLayerMask(effectsController, layer, layer.mask);

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
      for (const effect of layer.effects) delete effect.scrawlFilter;
      layer.effects.length = 0;
    },

    setMask(layer: Layer, config: ScrawlMaskConfig): LayerMaskState {
      detachMaskFeather(effectsController, layer);
      const mask = normalizeScrawlMaskConfig(config) as LayerMaskState;

      layer.mask = mask;
      applyLayerMask(effectsController, layer, mask);
      return mask;
    },

    removeLayer(layer: Layer): void {
      while (layer.children.length > 0) {
        const child = layer.children[layer.children.length - 1];
        if (child) this.removeLayer(child);
      }

      const siblingIndex = layer.parent?.children.indexOf(layer) ?? -1;
      if (siblingIndex >= 0) layer.parent?.children.splice(siblingIndex, 1);
      detachMaskFeather(effectsController, layer);
      for (const effect of layer.effects) detachLayerEffect(effectsController, layer, effect);
      group?.removeArtefacts?.(layer.scrawlEntity);
      layer.scrawlEntity.kill?.();
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
      for (const layer of this.layers) syncLayerToScrawl(layer);
      void this.renderer.renderFrame();
    },

    serialize(): string {
      return serializeComposition(this);
    },
  } satisfies Composition;

  return composition;
}

export function deserializeComposition(
  json: string,
  adapters: EngineAdapters = {},
): Composition {
  return hydrateSerializedComposition(json, createComposition, adapters);
}
