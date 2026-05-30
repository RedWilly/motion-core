import { validationError } from '../shared/errors';
import type {
  Layer,
  LayerType,
} from '../shared/project';
import type {
  LayerEntityFactory,
  LayerEntityFactoryContext,
  ScrawlEntityAdapter,
} from '../shared/scrawl';

const fallbackEntityFactory: LayerEntityFactory = ({ name, type }) => ({
  name,
  type,
  set() {
    return this;
  },
  kill() {
    return undefined;
  },
});

const defaultFactories: Record<LayerType, LayerEntityFactory> = {
  image: fallbackEntityFactory,
  video: fallbackEntityFactory,
  audio: fallbackEntityFactory,
  svg: fallbackEntityFactory,
  shape: fallbackEntityFactory,
  text: fallbackEntityFactory,
  particle: fallbackEntityFactory,
  precomp: fallbackEntityFactory,
};

export class EntityMappingRegistry {
  private readonly factories = new Map<LayerType, LayerEntityFactory>();
  private readonly layerByEntity = new WeakMap<ScrawlEntityAdapter, Layer>();
  private readonly entityByLayerId = new Map<string, ScrawlEntityAdapter>();

  constructor(factories: Partial<Record<LayerType, LayerEntityFactory>> = {}) {
    for (const [type, factory] of Object.entries(defaultFactories)) {
      this.factories.set(type as LayerType, factory);
    }

    for (const [type, factory] of Object.entries(factories)) {
      if (factory) this.factories.set(type as LayerType, factory);
    }
  }

  mapLayerTypeToEntityFactory(type: LayerType): LayerEntityFactory {
    const factory = this.factories.get(type);
    if (!factory) {
      throw validationError('UNSUPPORTED_LAYER_TYPE', `Unsupported layer type: ${type}.`, {
        propertyName: 'type',
        value: type,
      });
    }

    return factory;
  }

  createEntity(context: LayerEntityFactoryContext): ScrawlEntityAdapter {
    return this.mapLayerTypeToEntityFactory(context.type)(context);
  }

  register(layer: Layer, entity: ScrawlEntityAdapter): void {
    this.layerByEntity.set(entity, layer);
    this.entityByLayerId.set(layer.id, entity);
  }

  unregister(layer: Layer): void {
    const entity = this.entityByLayerId.get(layer.id);
    if (entity) this.layerByEntity.delete(entity);
    this.entityByLayerId.delete(layer.id);
  }

  mapEntityToLayer(entity: ScrawlEntityAdapter): Layer | undefined {
    return this.layerByEntity.get(entity);
  }

  mapLayerToEntity(layer: Layer): ScrawlEntityAdapter | undefined {
    return this.entityByLayerId.get(layer.id);
  }
}
