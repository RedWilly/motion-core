import { describe, expect, test } from 'bun:test';
import { createScrawlStylesController } from './styles';

describe('Scrawl styles controller', () => {
  test('creates gradient styles and updates only changed numeric values', () => {
    const created: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const controller = createScrawlStylesController({
      makeGradient(items) {
        created.push(items);
        return {
          name: String(items['name']),
          type: 'Gradient',
          set(values) {
            updates.push({ ...values });
          },
        };
      },
    }, { namespace: 'scene' });

    const gradient = controller.createGradient({
      id: 'sky',
      colors: [[0, '#000000'], [999, '#ffffff']],
      paletteStart: 0,
      paletteEnd: 999,
      cyclePalette: true,
    });

    gradient.values.paletteStart = 120;
    gradient.apply();
    gradient.apply();

    expect(gradient.id).toBe('scene-sky');
    expect(created[0]).toMatchObject({
      name: 'scene-sky',
      colors: [[0, '#000000'], [999, '#ffffff']],
      paletteStart: 0,
      paletteEnd: 999,
    });
    expect(updates).toEqual([{ paletteStart: 120 }]);
  });

  test('routes radial, conic, and pattern styles to their real Scrawl factories', () => {
    const calls: string[] = [];
    const controller = createScrawlStylesController({
      makeConicGradient(items) {
        calls.push(`conic:${String(items['name'])}`);
        return { name: String(items['name']), type: 'ConicGradient' };
      },
      makePattern(items) {
        calls.push(`pattern:${String(items['name'])}:${String(items['asset'])}`);
        return {
          name: String(items['name']),
          type: 'Pattern',
          kill() {
            calls.push(`kill:${String(items['name'])}`);
          },
        };
      },
      makeRadialGradient(items) {
        calls.push(`radial:${String(items['name'])}`);
        return { name: String(items['name']), type: 'RadialGradient' };
      },
    }, { namespace: 'scene' });

    controller.createGradient({ id: 'spot', kind: 'radial', colors: [[0, 'red']], endRadius: 200 });
    controller.createGradient({ id: 'sweep', kind: 'conic', colors: [[0, 'red']], startAngle: 45 });
    const pattern = controller.createPattern({ id: 'brick', asset: 'brick-image' });
    controller.removeStyle(pattern);

    expect(calls).toEqual([
      'radial:scene-spot',
      'conic:scene-sweep',
      'pattern:scene-brick:brick-image',
      'kill:scene-brick',
    ]);
  });
});
