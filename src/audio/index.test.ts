import { describe, expect, test } from 'bun:test';
import {
  analyzeFrequencyBands,
  createAudioAnalyzer,
  createEmptyAudioAnalysisFrame,
  normalizeAmplitude,
  normalizeBand,
  type AudioFftSize,
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

class FakeAudioContext {
  readonly sampleRate = 44_100;
  readonly analyser = new FakeAnalyserNode();

  createAnalyser(): FakeAnalyserNode {
    return this.analyser;
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
