import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core/composition';
import { EntityMappingRegistry } from './entity-mapping';

describe('EntityMappingRegistry', () => {
  test('keeps layer/entity lookup consistent', () => {
    const registry = new EntityMappingRegistry();
    const composition = createComposition({ width: 100, height: 100 });
    const layer = composition.addLayer('shape');

    registry.register(layer, layer.scrawlEntity);

    expect(registry.mapEntityToLayer(layer.scrawlEntity)).toBe(layer);
    expect(registry.mapLayerToEntity(layer)).toBe(layer.scrawlEntity);
  });
});
