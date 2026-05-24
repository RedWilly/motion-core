import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core/composition';
import { syncToTimelineTime } from '../integration/synchronization';
import { createAnimationController, createExpressionRenderHook } from './index';

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

  test('evaluates expressions with time, frame, layer, and helper context', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5, frameRate: 24 });
    const layer = composition.addLayer('shape', undefined, {
      name: 'box',
      transform: { position: { x: 10, y: 0 } },
    });
    const controller = createAnimationController(composition);

    controller.setExpression(layer, 'position.x', 'clamp(value + time + frame + layer.transform.position.y, 0, 100)');
    const result = controller.applyExpressions(1);

    expect(result.errors).toHaveLength(0);
    expect(result.applied).toBe(1);
    expect(layer.transform.position.x).toBe(35);
    expect(layer.scrawlState.startX).toBe(35);
  });

  test('lets expressions consume audio analysis data', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5 });
    const layer = composition.addLayer('shape');
    const controller = createAnimationController(composition);

    controller.setExpression(layer, 'opacity', 'audio.amplitude * audio.bands.bass');
    controller.applyExpressions(0, {
      amplitude: 0.5,
      bands: { bass: 0.8, mid: 0.2, treble: 0.1 },
    });

    expect(layer.opacity).toBeCloseTo(0.4);
    expect(layer.scrawlState.globalAlpha).toBeCloseTo(0.4);
  });

  test('keeps the last valid expression value after evaluation errors', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5 });
    const layer = composition.addLayer('shape', undefined, {
      transform: { position: { x: 2, y: 0 } },
    });
    const controller = createAnimationController(composition);

    controller.setExpression(layer, 'position.x', 'time < 1 ? 20 : missing.value');
    expect(controller.applyExpressions(0).errors).toHaveLength(0);
    expect(layer.transform.position.x).toBe(20);

    const result = controller.applyExpressions(1);

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('position.x');
    expect(result.errors[0]?.message).toContain('missing.value');
    expect(layer.transform.position.x).toBe(20);
  });

  test('supports deterministic random and wiggle helpers', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5 });
    const layer = composition.addLayer('shape');
    const controller = createAnimationController(composition);

    controller.setExpression(layer, 'rotation', 'random(10, 20, 3) + wiggle(2, 5, 1)');
    controller.applyExpressions(0.5);
    const first = layer.transform.rotation;
    controller.applyExpressions(0.5);
    const second = layer.transform.rotation;

    expect(second).toBe(first);
  });

  test('removes expressions without touching existing property values', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5 });
    const layer = composition.addLayer('shape');
    const controller = createAnimationController(composition);

    controller.setExpression(layer, 'rotation', '30');
    controller.applyExpressions(0);
    controller.removeExpression(layer, 'rotation');
    controller.applyExpressions(1);

    expect(layer.transform.rotation).toBe(30);
  });

  test('applies expressions through the synchronization render hook', async () => {
    const { composition, layer, setCalls } = createObservedLayer();
    const controller = createAnimationController(composition);
    const hook = createExpressionRenderHook(controller);

    controller.setExpression(layer, 'position.x', 'time * 10');
    await syncToTimelineTime(composition, 2, {
      frameRate: composition.frameRate,
      hooks: [hook],
    });

    expect(layer.transform.position.x).toBe(20);
    expect(setCalls.at(-1)?.['startX']).toBe(20);
  });

  test('expression render hook can provide current audio data', async () => {
    const { composition, layer } = createObservedLayer();
    const controller = createAnimationController(composition);
    const hook = createExpressionRenderHook(controller, () => ({
      amplitude: 0.25,
      bands: { bass: 0.5, mid: 0, treble: 0 },
    }));

    controller.setExpression(layer, 'opacity', 'audio.amplitude + audio.bands.bass');
    await syncToTimelineTime(composition, 0, {
      frameRate: composition.frameRate,
      hooks: [hook],
    });

    expect(layer.opacity).toBe(0.75);
  });
});
