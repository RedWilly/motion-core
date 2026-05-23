import { EntityMappingRegistry } from '../integration/entity-mapping';
import { serializeComposition } from '../integration/serialization';
import { syncLayerToScrawl } from '../integration/synchronization';
import { createId } from '../shared/ids';
import type {
  Composition,
  CompositionConfig,
  CompositionRuntime,
  EngineAdapters,
  Layer,
  LayerConfig,
  LayerType,
  Transform,
} from '../shared/types';
import { normalizeCompositionConfig } from '../shared/validation';
import { MemoryTimeline, NoopRenderer } from './adapters';

const defaultTransform: Transform = {
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0, y: 0 },
};

function mergeTransform(transform?: Partial<Transform>): Transform {
  return {
    ...defaultTransform,
    ...transform,
    position: { ...defaultTransform.position, ...transform?.position },
    scale: { ...defaultTransform.scale, ...transform?.scale },
    anchor: { ...defaultTransform.anchor, ...transform?.anchor },
  };
}

export function createComposition(
  config: CompositionConfig,
  adapters: EngineAdapters = {},
): Composition {
  const normalized = normalizeCompositionConfig(config);
  const id = createId('composition');
  const timeline = adapters.createTimeline?.(normalized.duration) ?? new MemoryTimeline(normalized.duration);
  const group = adapters.createGroup?.(normalized.name);
  const registry = new EntityMappingRegistry(adapters.entityFactories);
  const runtime: CompositionRuntime = {
    id,
    name: normalized.name,
    group,
    layers: [],
    timeline,
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
    renderer: adapters.createRenderer?.(runtime) ?? new NoopRenderer(runtime),

    addLayer(type: LayerType, source?: string, layerConfig: LayerConfig = {}): Layer {
      const layerId = createId(type);
      const entity = registry.createEntity({
        id: layerId,
        type,
        name: layerConfig.name ?? layerId,
        source,
        config: layerConfig,
        group,
      });
      const parent = layerConfig.parent ?? null;
      const layer: Layer = {
        id: layerId,
        type,
        name: layerConfig.name ?? layerId,
        parent,
        children: [],
        zIndex: this.layers.length,
        transform: mergeTransform(layerConfig.transform),
        visible: layerConfig.visible ?? true,
        locked: layerConfig.locked ?? false,
        opacity: layerConfig.opacity ?? 1,
        source,
        content: layerConfig.content,
        scrawlEntity: entity,
      };

      parent?.children.push(layer);
      this.layers.push(layer);
      registry.register(layer, entity);
      group?.addArtefacts?.(entity);
      syncLayerToScrawl(layer);

      return layer;
    },

    removeLayer(layer: Layer): void {
      for (const child of [...layer.children]) {
        this.removeLayer(child);
      }

      layer.parent?.children.splice(layer.parent.children.indexOf(layer), 1);
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
