import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core';
import type { CompositionRuntime, FrameCaptureOptions, RenderAdapter } from '../shared/types';
import {
  createMediabunnyVideoExportAdapter,
  exportFrame,
  exportVideo,
  normalizeVideoExportConfig,
  type MediabunnyVideoRuntime,
} from './index';

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

  getFrameCanvas(): HTMLCanvasElement {
    return {} as HTMLCanvasElement;
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

describe('exportVideo', () => {
  test('normalizes frame count and delegates to the video adapter', async () => {
    const composition = createComposition({ width: 100, height: 100, duration: 2, frameRate: 24 });
    const seen: unknown[] = [];
    const result = await exportVideo(
      composition,
      { format: 'webm', frameRate: 10, quality: 'low' },
      {
        async export(targetComposition, config) {
          seen.push(targetComposition, config);
          return new Blob(['video'], { type: 'video/webm' });
        },
      },
    );

    expect(result.type).toBe('video/webm');
    expect(seen[0]).toBe(composition);
    expect(seen[1]).toMatchObject({
      format: 'webm',
      codec: 'vp9',
      frameRate: 10,
      frameCount: 20,
      frameDuration: 0.1,
      quality: 'low',
      includeAudio: false,
    });
  });

  test('rejects invalid video export options', () => {
    const composition = createComposition({ width: 100, height: 100, duration: 2 });

    expect(() => normalizeVideoExportConfig(composition, { format: 'mp4', frameRate: 0 })).toThrow();
    expect(() => normalizeVideoExportConfig(composition, { format: 'mp4', bitrate: 0 })).toThrow();
  });

  test('encodes canvas frames sequentially with Mediabunny backpressure', async () => {
    const progress: number[] = [];
    let renderer: CapturingRenderer | undefined;
    const composition = createComposition(
      { width: 100, height: 100, duration: 0.25, frameRate: 4 },
      {
        createRenderer(runtime) {
          renderer = new CapturingRenderer(runtime);
          return renderer;
        },
      },
    );
    const samples: Array<{ timestamp: number; duration?: number }> = [];
    let started = false;
    let finalized = false;

    const runtime: MediabunnyVideoRuntime = {
      BufferTarget: class {
        buffer: ArrayBuffer | null = new TextEncoder().encode('encoded').buffer;
      },
      CanvasSource: class {
        constructor(_canvas: HTMLCanvasElement | OffscreenCanvas, readonly _config: Readonly<Record<string, unknown>>) {}

        async add(timestamp: number, duration?: number): Promise<void> {
          expect(started).toBe(true);
          samples.push(duration === undefined ? { timestamp } : { timestamp, duration });
        }
      },
      Mp4OutputFormat: class {},
      Output: class {
        constructor(private readonly options: Readonly<{ format: unknown; target: { buffer: ArrayBuffer | null } }>) {}

        addVideoTrack(_source: unknown): void {}

        async start(): Promise<void> {
          started = true;
        }

        async finalize(): Promise<void> {
          finalized = true;
        }

        async cancel(): Promise<void> {
          throw new Error('cancel should not run');
        }

        async getMimeType(): Promise<string> {
          return 'video/mp4; codecs="avc1"';
        }
      },
      QUALITY_HIGH: Symbol('high'),
      QUALITY_LOW: Symbol('low'),
      QUALITY_MEDIUM: Symbol('medium'),
      QUALITY_VERY_HIGH: Symbol('very-high'),
      QUALITY_VERY_LOW: Symbol('very-low'),
      WebMOutputFormat: class {},
    };

    const result = await exportVideo(
      composition,
      { format: 'mp4', onProgress: (value) => progress.push(value) },
      createMediabunnyVideoExportAdapter(async () => runtime),
    );

    expect(result.type).toBe('video/mp4; codecs="avc1"');
    expect(renderer?.renderTimes).toEqual([0]);
    expect(samples).toEqual([{ timestamp: 0, duration: 0.25 }]);
    expect(progress).toEqual([1]);
    expect(finalized).toBe(true);
  });
});
