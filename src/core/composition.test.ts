import { describe, expect, test } from 'bun:test';
import { createComposition } from './composition';

describe('createComposition', () => {
  test('applies defaults and validates required dimensions', () => {
    const composition = createComposition({ width: 1920, height: 1080 });

    expect(composition.width).toBe(1920);
    expect(composition.height).toBe(1080);
    expect(composition.duration).toBe(10);
    expect(composition.frameRate).toBe(30);
    expect(composition.backgroundColor).toBe('transparent');
  });

  test('rejects invalid frame rates', () => {
    expect(() => createComposition({ width: 1920, height: 1080, frameRate: 121 })).toThrow(
      'frameRate must be an integer between 1 and 120.',
    );
  });

  test('removes child layers when a parent is removed', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const parent = composition.addLayer('shape');
    const child = composition.addLayer('text', undefined, { parent });

    composition.removeLayer(parent);

    expect(composition.layers).not.toContain(parent);
    expect(composition.layers).not.toContain(child);
  });

  test('maps child layers to Scrawl pivot and mimic state', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const parent = composition.addLayer('shape', undefined, {
      name: 'parent',
      transform: { position: { x: 40, y: 50 }, rotation: 15, scale: { x: 2, y: 2 } },
    });
    const child = composition.addLayer('shape', undefined, {
      name: 'child',
      parent,
      transform: { position: { x: 10, y: 20 }, rotation: 5, scale: { x: 1.25, y: 1.25 } },
    });

    expect(child.scrawlState.lockTo).toBe('pivot');
    expect(child.scrawlState.pivot).toBe(parent.scrawlEntity.name);
    expect(child.scrawlState.mimic).toBe(parent.scrawlEntity.name);
    expect(child.scrawlState.offsetX).toBe(10);
    expect(child.scrawlState.offsetY).toBe(20);
    expect(child.scrawlState.addPivotRotation).toBe(true);
    expect(child.scrawlState.useMimicScale).toBe(true);
    expect(child.scrawlState.scale).toBe(0.25);
  });
});
