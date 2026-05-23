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
});
