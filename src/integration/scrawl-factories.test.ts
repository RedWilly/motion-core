import { describe, expect, test } from 'bun:test';
import type { LayerType, ScrawlEntityAdapter, ScrawlGroupAdapter } from '../shared/types';
import { createScrawlEntityFactories, type ScrawlFactoryModule } from './scrawl-factories';

function createEntity(type: string, name: string): ScrawlEntityAdapter {
  return {
    name,
    type,
    set() {
      return this;
    },
  };
}

function createFactoryRecorder() {
  const calls: string[] = [];
  const itemCalls: Array<Record<string, unknown>> = [];
  const factory = (type: string) => (items: Record<string, unknown>) => {
    calls.push(type);
    itemCalls.push({ ...items });
    return createEntity(type, String(items['name']));
  };
  const scrawl: ScrawlFactoryModule = {
    makeBlock: factory('Block'),
    makeEmitter: factory('Emitter'),
    makeEnhancedLabel: factory('EnhancedLabel'),
    makeGroup(items) {
      return { name: String(items['name']) } satisfies ScrawlGroupAdapter;
    },
    makeLabel: factory('Label'),
    makeNet: factory('Net'),
    makePicture: factory('Picture'),
    makeRectangle: factory('Rectangle'),
    makeShape: factory('Shape'),
    makeTracer: factory('Tracer'),
    makeWheel: factory('Wheel'),
  };

  return { calls, items: itemCalls, scrawl };
}

describe('createScrawlEntityFactories', () => {
  test('routes supported layer variants to Scrawl factories', () => {
    const { calls, scrawl } = createFactoryRecorder();
    const factories = createScrawlEntityFactories(scrawl, { namespace: 'ns' });
    const invoke = (type: LayerType, config = {}) =>
      factories[type]?.({
        id: `${type}-1`,
        type,
        name: type,
        source: 'asset.png',
        config,
      });

    invoke('shape', { shape: { kind: 'wheel' } });
    invoke('shape', { shape: { kind: 'rectangle' } });
    invoke('shape', { shape: { kind: 'shape' } });
    invoke('text', { textMode: 'enhanced', text: 'hello' });
    invoke('particle', { variant: 'net' });
    invoke('particle', { variant: 'tracer' });
    const image = invoke('image');

    expect(calls).toEqual(['Wheel', 'Rectangle', 'Shape', 'EnhancedLabel', 'Net', 'Tracer', 'Picture']);
    expect(image?.name).toBe('ns-image');
  });

  test('creates separate Scrawl entity parts for typed shape fill and stroke', () => {
    const { calls, items, scrawl } = createFactoryRecorder();
    const factories = createScrawlEntityFactories(scrawl, { namespace: 'ns' });
    const style = {
      id: 'gradient',
      style: { name: 'gradient-style' },
      values: {},
      apply() {},
    };

    const entity = factories.shape?.({
      id: 'shape-1',
      type: 'shape',
      name: 'orb',
      config: {
        shape: {
          kind: 'wheel',
          fill: { style, opacity: 0 },
          stroke: { color: '#ffffff', opacity: 1, width: 2 },
        },
      },
    });

    expect(entity?.type).toBe('CompositeShape');
    expect(entity?.parts?.fill?.name).toBe('ns-orb-fill');
    expect(entity?.parts?.stroke?.name).toBe('ns-orb-stroke');
    expect(calls).toEqual(['Wheel', 'Wheel']);
    expect(items[0]?.['fillStyle']).toBe(style.style);
    expect(items[1]?.['strokeStyle']).toBe('#ffffff');
  });
});
