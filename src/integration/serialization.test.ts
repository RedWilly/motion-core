import { describe, expect, test } from 'bun:test';
import { createComposition, deserializeComposition } from '../core';
import type { LayerEntityFactoryContext, ScrawlEntityAdapter } from '../shared/types';
import {
  hydrateSerializedComposition,
  parseSerializedComposition,
  serializeComposition,
} from './serialization';

class PacketEntity implements ScrawlEntityAdapter {
  readonly type: string;
  readonly name: string;
  state: Record<string, unknown> = {};

  constructor(context: LayerEntityFactoryContext) {
    this.type = context.type;
    this.name = context.name;
  }

  set(values: Readonly<Record<string, unknown>>): void {
    this.state = { ...this.state, ...values };
  }

  saveAsPacket(): string {
    return JSON.stringify([this.name, this.type, 'entity', this.state]);
  }
}

describe('serialization', () => {
  test('serializes composition metadata, timeline state, assets, config, and Scrawl packets', () => {
    const composition = createComposition(
      { name: 'scene', width: 1920, height: 1080, duration: 4, frameRate: 24 },
      {
        entityFactories: {
          image: (context) => new PacketEntity(context),
          shape: (context) => new PacketEntity(context),
        },
      },
    );
    const parent = composition.addLayer('shape', {
      name: 'box',
      shape: { kind: 'wheel', radius: 32, fillStyle: 'red' },
      transform: { position: { x: 10, y: 20 } },
    });
    composition.addLayer('image', 'asset.png', {
      name: 'image',
      parent,
      scaleMode: 'fit',
      scrawl: { method: 'fill' },
      effects: [
        { id: 'soft', actions: [{ action: 'gaussian-blur', radiusHorizontal: 4, radiusVertical: 4 }] },
      ],
      mask: { mode: 'destination-in', opacity: 0.75, feather: 2, memoize: true },
    });
    composition.timeline.seek(1.5);

    const payload = parseSerializedComposition(serializeComposition(composition));

    expect(payload.version).toBe('0.2.0');
    expect(payload.composition).toMatchObject({
      name: 'scene',
      width: 1920,
      height: 1080,
      duration: 4,
      frameRate: 24,
    });
    expect(payload.timeline).toEqual({ time: 1.5, duration: 4 });
    expect(payload.layers[0]?.config).toMatchObject({
      shape: { kind: 'wheel', radius: 32, fillStyle: 'red' },
    });
    expect(payload.layers[1]?.parentId).toBe(parent.id);
    expect(payload.layers[1]?.config).toMatchObject({
      scaleMode: 'fit',
      scrawl: { method: 'fill' },
      effects: [
        { id: 'soft', actions: [{ action: 'gaussian-blur', radiusHorizontal: 4, radiusVertical: 4 }] },
      ],
      mask: { mode: 'destination-in', opacity: 0.75, feather: 2, memoize: true },
    });
    expect(payload.layers[0]?.scrawlEntityName).toBe('box');
    expect(payload.layers[0]?.scrawlPacket).toContain('box');
    expect(payload.assets).toEqual([
      { id: `${payload.layers[1]?.id}:source`, layerId: payload.layers[1]?.id, type: 'image', source: 'asset.png' },
    ]);
  });

  test('hydrates a serialized composition through factories and imports packets', () => {
    const packets: string[] = [];
    const original = createComposition(
      { name: 'scene', width: 100, height: 100, duration: 2 },
      {
        entityFactories: {
          shape: (context) => new PacketEntity(context),
          text: (context) => new PacketEntity(context),
        },
      },
    );
    const parent = original.addLayer('shape', {
      name: 'parent',
      shape: { kind: 'rectangle', width: 10, height: 20 },
    });
    original.addLayer('text', {
      name: 'child',
      parent,
      text: 'Hello',
      textMode: 'enhanced',
      opacity: 0.5,
      effects: [{ id: 'edge', actions: [{ action: 'threshold', level: 6, high: [255, 255, 255, 255] }] }],
      mask: { mode: 'clip', feather: 1 },
    });
    original.seek(1);

    const hydrated = deserializeComposition(serializeComposition(original), {
      importScrawlPacket(packet) {
        packets.push(packet);
      },
      entityFactories: {
        shape: (context) => new PacketEntity(context),
        text: (context) => new PacketEntity(context),
      },
    });

    expect(hydrated.name).toBe(original.name);
    expect(hydrated.layers.map((layer) => layer.id)).toEqual(original.layers.map((layer) => layer.id));
    expect(hydrated.layers[1]?.parent).toBe(hydrated.layers[0]);
    expect(hydrated.layers[1]?.opacity).toBe(0.5);
    expect(hydrated.layers[1]?.config.text).toBe('Hello');
    expect(hydrated.layers[1]?.effects).toEqual([
      {
        id: 'edge',
        actions: [{ action: 'threshold', level: 6, high: [255, 255, 255, 255] }],
      },
    ]);
    expect(hydrated.layers[1]?.mask).toEqual({ mode: 'clip', strategy: 'entity', feather: 1 });
    expect(hydrated.timeline.time()).toBe(1);
    expect(packets).toHaveLength(2);
  });

  test('rejects invalid serialized payloads', () => {
    expect(() => parseSerializedComposition('{')).toThrow('valid JSON');
    expect(() => parseSerializedComposition(JSON.stringify({}))).toThrow('Serialized composition is invalid');
  });

  test('hydrates through an injected composition factory without importing core', () => {
    const original = createComposition({ width: 10, height: 10 });
    const json = serializeComposition(original);
    const hydrated = hydrateSerializedComposition(json, createComposition);

    expect(hydrated.width).toBe(10);
    expect(hydrated.height).toBe(10);
  });

  test('serializes effects and layer mask relationships added through the core API', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const target = composition.addLayer('shape', { name: 'target' });
    const matte = composition.addLayer('shape', { name: 'matte' });
    composition.addEffect(target, { id: 'soft', actions: [{ action: 'gaussian-blur', radiusHorizontal: 3 }] });
    composition.setLayerMask(target, matte, { mode: 'clip', feather: 2 });

    const payload = parseSerializedComposition(serializeComposition(composition));
    const hydrated = deserializeComposition(serializeComposition(composition));

    expect(payload.layers[0]?.config?.effects).toEqual([
      { id: 'soft', actions: [{ action: 'gaussian-blur', radiusHorizontal: 3 }] },
    ]);
    expect(payload.layers[0]?.config?.mask).toEqual({
      mode: 'clip',
      strategy: 'cell',
      sourceLayerId: matte.id,
      feather: 2,
    });
    expect(hydrated.layers[0]?.mask?.sourceLayerId).toBe(hydrated.layers[1]?.id);
  });
});
