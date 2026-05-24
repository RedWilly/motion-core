import { describe, expect, test } from 'bun:test';
import {
  analyzeFrequencyBands,
  createAudioAnalyzer,
  createEmptyAudioAnalysisFrame,
  createMediabunnyAudioBridge,
  normalizeAmplitude,
  normalizeBand,
  type AudioFftSize,
  type MediabunnyAudioRuntime,
} from './index';

describe('audio normalization helpers', () => {
  test('normalizes amplitude into the 0..1 range', () => {
    expect(normalizeAmplitude(new Float32Array([0, 0.5, -0.5, 1]))).toBeGreaterThan(0);
    expect(normalizeAmplitude(new Float32Array([2, 2]))).toBe(1);
  });

  test('normalizes frequency bands into the 0..1 range', () => {
    expect(normalizeBand(-1)).toBe(0);
    expect(normalizeBand(128, 255)).toBeGreaterThan(0.5);
    expect(normalizeBand(300, 255)).toBe(1);
  });

  test('extracts bass, mid, and treble ranges from FFT bins', () => {
    const data = new Uint8Array(1024);
    data[2] = 255; // about 43Hz at 44.1kHz / 1024
    data[20] = 128; // about 861Hz
    data[200] = 64; // about 8613Hz

    const bands = analyzeFrequencyBands(data, { sampleRate: 44_100, fftSize: 1024 });

    expect(bands.bass).toBeGreaterThan(0);
    expect(bands.mid).toBeGreaterThan(0);
    expect(bands.treble).toBeGreaterThan(0);
    expect(bands.bass).toBeLessThanOrEqual(1);
    expect(bands.mid).toBeLessThanOrEqual(1);
    expect(bands.treble).toBeLessThanOrEqual(1);
  });
});

class FakeAnalyserNode {
  fftSize: AudioFftSize = 2048;
  minDecibels = -90;
  maxDecibels = -10;
  smoothingTimeConstant = 0.8;
  private readonly frequency = new Uint8Array(2048);
  private readonly timeDomain = new Float32Array(4096);

  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }

  setFrequency(bin: number, value: number): void {
    this.frequency[bin] = value;
  }

  setTimeDomain(value: number): void {
    this.timeDomain.fill(value);
  }

  getByteFrequencyData(array: Uint8Array): void {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = this.frequency[index] ?? 0;
    }
  }

  getFloatTimeDomainData(array: Float32Array): void {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = this.timeDomain[index] ?? 0;
    }
  }

  connect(_node: unknown): void {}

  disconnect(_node?: unknown): void {}
}

class FakeAudioParam {
  value = 1;
}

class FakeAudioNode {
  connectedTo: unknown[] = [];
  disconnectedFrom: unknown[] = [];

  connect(node: unknown): unknown {
    this.connectedTo.push(node);
    return node;
  }

  disconnect(node: unknown): void {
    this.disconnectedFrom.push(node);
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeAudioBuffer {}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  starts: Array<{ when: number; offset?: number; duration?: number }> = [];
  stopped = false;

  start(when: number, offset?: number, duration?: number): void {
    this.starts.push(
      duration === undefined
        ? offset === undefined
          ? { when }
          : { when, offset }
        : { when, offset, duration },
    );
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  readonly sampleRate = 44_100;
  readonly analyser = new FakeAnalyserNode();
  readonly gain = new FakeGainNode();
  readonly sources: FakeAudioBufferSourceNode[] = [];

  createAnalyser(): FakeAnalyserNode {
    return this.analyser;
  }

  createGain(): FakeGainNode {
    return this.gain;
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    const source = new FakeAudioBufferSourceNode();
    this.sources.push(source);
    return source;
  }
}

describe('AudioAnalyzer', () => {
  test('creates and reuses analysis buffers without per-frame result allocation', () => {
    const context = new FakeAudioContext();
    const source = new FakeAudioNode();
    context.analyser.setFrequency(2, 255);
    context.analyser.setTimeDomain(0.5);

    const analyzer = createAudioAnalyzer(
      context as unknown as BaseAudioContext,
      source as unknown as AudioNode,
      { fftSize: 1024 },
    );
    const first = analyzer.analyze();
    const second = analyzer.analyze();
    const target = createEmptyAudioAnalysisFrame();
    const filled = analyzer.analyzeInto(target);

    expect(source.connectedTo).toEqual([context.analyser]);
    expect(first).toBe(second);
    expect(filled).toBe(target);
    expect(first.amplitude).toBe(0.5);
    expect(first.bands.bass).toBeGreaterThan(0);

    analyzer.dispose();
    expect(source.disconnectedFrom).toEqual([context.analyser]);
  });

  test('rejects invalid analyser configuration', () => {
    const context = new FakeAudioContext();
    const source = new FakeAudioNode();

    expect(() =>
      createAudioAnalyzer(context as unknown as BaseAudioContext, source as unknown as AudioNode, {
        minDecibels: -10,
        maxDecibels: -90,
      }),
    ).toThrow('decibel range');
    expect(() =>
      createAudioAnalyzer(context as unknown as BaseAudioContext, source as unknown as AudioNode, {
        smoothingTimeConstant: 2,
      }),
    ).toThrow('smoothingTimeConstant');
  });
});

describe('Mediabunny audio bridge', () => {
  test('decodes the buffer for the requested source time and routes it into Web Audio', async () => {
    const context = new FakeAudioContext();
    const requestedTimes: number[] = [];
    let inputDisposed = false;
    const audioBuffer = new FakeAudioBuffer() as unknown as AudioBuffer;

    const runtime: MediabunnyAudioRuntime = {
      ALL_FORMATS: Symbol('formats'),
      AudioBufferSink: class {
        constructor(_audioTrack: unknown) {}

        async getBuffer(timestamp: number) {
          requestedTimes.push(timestamp);
          return {
            buffer: audioBuffer,
            timestamp: 2,
            duration: 4,
          };
        }
      },
      BlobSource: class {
        constructor(_source: Blob) {}
      },
      Input: class {
        constructor(_options: { source: unknown; formats: unknown }) {}

        async getDurationFromMetadata(): Promise<number | null> {
          return 10;
        }

        async computeDuration(): Promise<number> {
          throw new Error('metadata duration should be used');
        }

        async getPrimaryAudioTrack(): Promise<unknown> {
          return { id: 'audio' };
        }

        dispose(): void {
          inputDisposed = true;
        }
      },
    };

    const bridge = await createMediabunnyAudioBridge(
      new Blob(['audio']),
      context as unknown as AudioContext,
      { inPoint: 2, outPoint: 6, playbackRate: 1, volume: 0.5, fadeIn: 1, fadeOut: 1 },
      async () => runtime,
    );

    await bridge.play(1);

    expect(requestedTimes).toEqual([3]);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.buffer).toBe(audioBuffer);
    expect(context.sources[0]?.connectedTo).toEqual([context.gain]);
    expect(context.sources[0]?.starts).toEqual([{ when: 0, offset: 1, duration: 3 }]);
    expect(context.gain.gain.value).toBe(0.5);

    bridge.dispose();
    expect(context.sources[0]?.stopped).toBe(true);
    expect(inputDisposed).toBe(true);
  });

  test('seek preloads only the timestamp buffer and does not create a Web Audio source', async () => {
    const context = new FakeAudioContext();
    const requestedTimes: number[] = [];
    const runtime: MediabunnyAudioRuntime = {
      ALL_FORMATS: null,
      AudioBufferSink: class {
        constructor(_audioTrack: unknown) {}
        async getBuffer(timestamp: number) {
          requestedTimes.push(timestamp);
          return null;
        }
      },
      BlobSource: class {},
      Input: class {
        async getDurationFromMetadata(): Promise<number | null> {
          return 2;
        }
        async computeDuration(): Promise<number> {
          return 2;
        }
        async getPrimaryAudioTrack(): Promise<unknown> {
          return {};
        }
        dispose(): void {}
      },
    };

    const bridge = await createMediabunnyAudioBridge(
      new Blob(['audio']),
      context as unknown as AudioContext,
      { inPoint: 0.5 },
      async () => runtime,
    );

    await bridge.seek(0.25);

    expect(requestedTimes).toEqual([0.75]);
    expect(context.sources).toHaveLength(0);
    bridge.dispose();
  });

  test('rejects media without an audio track and invalid playback config', async () => {
    const context = new FakeAudioContext();
    const runtime: MediabunnyAudioRuntime = {
      ALL_FORMATS: null,
      AudioBufferSink: class {
        constructor(_audioTrack: unknown) {}
        async getBuffer(): Promise<null> {
          return null;
        }
      },
      BlobSource: class {},
      Input: class {
        async getDurationFromMetadata(): Promise<number | null> {
          return 2;
        }
        async computeDuration(): Promise<number> {
          return 2;
        }
        async getPrimaryAudioTrack(): Promise<null> {
          return null;
        }
        dispose(): void {}
      },
    };

    await expect(
      createMediabunnyAudioBridge(new Blob(['audio']), context as unknown as AudioContext, {}, async () => runtime),
    ).rejects.toThrow('audio track');
    await expect(
      createMediabunnyAudioBridge(
        new Blob(['audio']),
        context as unknown as AudioContext,
        { outPoint: 1, inPoint: 1 },
        async () => runtime,
      ),
    ).rejects.toThrow('outPoint');
  });
});
