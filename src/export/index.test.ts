import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core';
import type { CompositionRuntime, FrameCaptureOptions, RenderAdapter } from '../shared/types';
import { exportFrame } from './index';

class CapturingRenderer implements RenderAdapter {
  readonly renderTimes: number[] = [];
  readonly captureOptions: FrameCaptureOptions[] = [];

  constructor(private readonly runtime: CompositionRuntime) {}

  play(): void {}

  pause(): void {}

  renderFrame(): void {
    this.renderTimes.push(this.runtime.timeline.time());
  }

  async captureFrame(options: Readonly<FrameCaptureOptions>): Promise<Blob> {
    this.captureOptions.push({ ...options });
    return new Blob(['frame'], { type: options.mimeType });
  }
}

describe('exportFrame', () => {
  test('seeks, renders, and captures a frame blob', async () => {
    let renderer: CapturingRenderer | undefined;
    const composition = createComposition(
      { width: 100, height: 100, duration: 4 },
      {
        createRenderer(runtime) {
          renderer = new CapturingRenderer(runtime);
          return renderer;
        },
      },
    );

    const result = await exportFrame(composition, 1.25, { format: 'jpg', quality: 0.8 });

    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).type).toBe('image/jpeg');
    expect(renderer?.renderTimes).toEqual([1.25]);
    expect(renderer?.captureOptions).toEqual([{ mimeType: 'image/jpeg', quality: 0.8 }]);
  });

  test('returns an ArrayBuffer only when requested', async () => {
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        createRenderer(runtime) {
          return new CapturingRenderer(runtime);
        },
      },
    );

    const result = await exportFrame(composition, 0, { outputType: 'arraybuffer' });

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(result as ArrayBuffer)).toBe('frame');
  });

  test('rejects invalid times and quality before capture', async () => {
    const composition = createComposition({ width: 100, height: 100, duration: 2 });

    await expect(exportFrame(composition, 3)).rejects.toThrow('Frame export time');
    await expect(exportFrame(composition, 1, { quality: 2 })).rejects.toThrow('Frame export quality');
  });

  test('requires a capturable renderer', async () => {
    const composition = createComposition({ width: 100, height: 100 });

    await expect(exportFrame(composition, 0)).rejects.toThrow('capturable canvas');
  });
});
