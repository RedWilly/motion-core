import { describe, expect, test } from 'bun:test';
import { createAnimationController } from '../animation';
import { createComposition } from '../core/composition';
import { createLiveEditSession, type LiveEditInput } from './index';

class FakeInput implements LiveEditInput {
  value: string;
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(value: string) {
    this.value = value;
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    let listeners = this.listeners.get(type);
    if (listeners === undefined) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }
}

describe('LiveEditSession', () => {
  test('binds input changes to motion-core state and batches sync/render work', () => {
    const events: string[] = [];
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        createRenderer() {
          return {
            play() {},
            pause() {},
            renderFrame() {
              events.push('render');
            },
          };
        },
      },
    );
    const layer = composition.addShape();
    const effect = composition.addEffect(layer, {
      id: 'blur',
      actions: [{ action: 'gaussian-blur', radius: 0 }],
    });
    const session = createLiveEditSession(composition, {
      schedule(callback) {
        events.push('schedule');
        return () => events.push('cancel');
      },
    });
    const input = new FakeInput('8');

    session.bindInput(input, effect.values, 'radius');
    input.emit('input');
    input.value = '12';
    input.emit('input');

    expect(effect.values.radius).toBe(12);
    expect(events).toEqual(['schedule']);

    session.flush();

    expect(events).toEqual(['schedule', 'render']);
  });

  test('can update without rendering and ignores invalid numeric values', () => {
    const events: string[] = [];
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        createRenderer() {
          return {
            play() {},
            pause() {},
            renderFrame() {
              events.push('render');
            },
          };
        },
      },
    );
    const session = createLiveEditSession(composition, { render: false });
    const values = { opacity: 0.25 };

    session.setValue(values, 'opacity', Number.NaN);
    session.setValue(values, 'opacity', 0.75);
    session.flush();

    expect(values.opacity).toBe(0.75);
    expect(events).toEqual([]);
  });

  test('removes listeners and cancels queued work on dispose', () => {
    const events: string[] = [];
    const composition = createComposition({ width: 100, height: 100 });
    const session = createLiveEditSession(composition, {
      schedule() {
        return () => events.push('cancel');
      },
    });
    const input = new FakeInput('1');
    const values = { x: 0 };

    const unbind = session.bindInput(input, values, 'x', { parse: 'int' });
    input.emit('change');
    expect(values.x).toBe(1);

    unbind();
    input.value = '2';
    input.emit('change');
    expect(values.x).toBe(1);

    session.dispose();
    expect(events).toEqual(['cancel']);
  });

  test('binds layer motion properties through the same property map as animation', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const layer = composition.addShape({
      transform: { position: { x: 4, y: 6 } },
    });
    const session = createLiveEditSession(composition, {
      schedule(callback) {
        callback();
        return () => undefined;
      },
      render: false,
    });
    const input = new FakeInput('42');

    session.bindLayerInput(input, layer, 'position.x', { parse: 'round' });
    input.emit('input');

    expect(layer.transform.position.x).toBe(42);
    expect(layer.scrawlState.startX).toBe(42);
  });

  test('auto-key layer edits before writing the live value', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 4 });
    const animation = createAnimationController(composition);
    const layer = composition.addShape({
      transform: { position: { x: 0, y: 0 } },
    });
    const session = createLiveEditSession(composition, { render: false });

    session.setLayerProperty(layer, 'position.x', 100, {
      mode: 'autoKey',
      animation,
      time: 1,
    });

    composition.seek(0.5);

    expect(layer.transform.position.x).toBe(50);
    expect(layer.scrawlState.startX).toBe(50);
  });

  test('auto-key layer edits replace an existing keyframe at the same time', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 4 });
    const animation = createAnimationController(composition);
    const layer = composition.addShape({
      transform: { position: { x: 0, y: 0 } },
    });
    const session = createLiveEditSession(composition, { render: false });

    session.setLayerProperty(layer, 'position.x', 100, {
      mode: 'autoKey',
      animation,
      time: 1,
    });
    session.setLayerProperty(layer, 'position.x', 240, {
      mode: 'autoKey',
      animation,
      time: 1,
    });

    composition.seek(1);

    expect(layer.transform.position.x).toBe(240);
    expect(animation.findKeyframe(layer, 'position.x', 1)?.value).toBe(240);
  });

  test('auto-key value edits on generic motion targets through the timeline', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 4 });
    const layer = composition.addShape();
    const effect = composition.addEffect(layer, {
      id: 'blur',
      actions: [{ action: 'gaussian-blur', radius: 0 }],
    });
    const session = createLiveEditSession(composition, { render: false });

    session.setValue(effect.values, 'radius', 16, {
      mode: 'autoKey',
      time: 2,
    });
    effect.values.radius = 0;
    composition.seek(2);

    expect(effect.values.radius).toBe(16);
  });
  test('edits effects and generic motion targets through the same value path', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 4 });
    const layer = composition.addShape();
    const effect = composition.addEffect(layer, {
      id: 'blur',
      actions: [{ action: 'gaussian-blur', radius: 0 }],
    });
    const session = createLiveEditSession(composition, { render: false });

    session.setValue(effect.values, 'radius', 18, {
      mode: 'autoKey',
      time: 2,
    });
    effect.values.radius = 0;
    composition.seek(2);

    expect(effect.values.radius).toBe(18);
  });

  test('edits enhanced text values and applies them on flush', () => {
    const updates: Record<string, unknown>[] = [];
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        entityFactories: {
          text: ({ name, type }) => ({
            name,
            type,
            set(values) {
              updates.push(values);
              return this;
            },
          }),
        },
      },
    );
    const layer = composition.addText('Hello', {
      textMode: 'enhanced',
      enhancedText: { lineSpacing: 1 },
    });
    const session = createLiveEditSession(composition, { render: false });

    session.setValue(layer.textState!.values, 'lineSpacing', 1.5);
    session.flush();

    expect(layer.textState?.values.lineSpacing).toBe(1.5);
    expect(updates).toContainEqual({ lineSpacing: 1.5 });
  });
});
