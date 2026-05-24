import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core/composition';
import { createAnimationController } from './index';

function createObservedLayer() {
  const setCalls: Array<Readonly<Record<string, unknown>>> = [];
  const composition = createComposition({ width: 100, height: 100, duration: 5 });
  const layer = composition.addLayer('shape', undefined, {
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
  });
  layer.scrawlEntity.set = (values) => {
    setCalls.push({ ...values });
    return layer.scrawlEntity;
  };

  return { composition, layer, setCalls };
}

describe('AnimationController', () => {
  test('animates typed layer state and syncs through Scrawl state', () => {
    const { composition, layer, setCalls } = createObservedLayer();
    const controller = createAnimationController(composition);

    controller.animate(layer, { 'position.x': 100, opacity: 0.5 }, { duration: 2, easing: 'none' });
    composition.seek(1);

    expect(layer.transform.position.x).toBe(50);
    expect(layer.opacity).toBe(0.75);
    expect(setCalls.at(-1)?.['startX']).toBe(50);
    expect(setCalls.at(-1)?.['globalAlpha']).toBe(0.75);
  });

  test('adds hold keyframes as zero-duration timeline sets', () => {
    const { composition, layer } = createObservedLayer();
    const controller = createAnimationController(composition);

    controller.addKeyframe(layer, 'rotation', 2, 45, { hold: true });
    composition.seek(1);
    expect(layer.transform.rotation).toBe(0);

    composition.seek(2);
    expect(layer.transform.rotation).toBe(45);
  });

  test('rejects locked layers', () => {
    const { composition, layer } = createObservedLayer();
    const controller = createAnimationController(composition);
    layer.locked = true;

    expect(() => controller.animate(layer, { 'position.x': 10 }, { duration: 1 })).toThrow(
      'Cannot animate a locked layer.',
    );
  });

  test('removes keyframes by killing timeline tweens', () => {
    const { composition, layer } = createObservedLayer();
    const controller = createAnimationController(composition);
    const keyframe = controller.addKeyframe(layer, 'position.x', 2, 100);

    controller.removeKeyframe(layer, keyframe);
    composition.seek(2);

    expect(layer.transform.position.x).toBe(0);
  });
});
