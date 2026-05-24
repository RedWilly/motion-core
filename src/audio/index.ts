export type AudioFftSize = 512 | 1024 | 2048 | 4096;

export interface AudioAnalysisConfig {
  fftSize?: AudioFftSize;
  minDecibels?: number;
  maxDecibels?: number;
  smoothingTimeConstant?: number;
  output?: AudioNode;
}

export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
}

export interface AudioAnalysisFrame {
  amplitude: number;
  bands: AudioBands;
}

export interface AudioAnalyzer {
  readonly analyser: AnalyserNode;
  analyze(): Readonly<AudioAnalysisFrame>;
  analyzeInto(target: AudioAnalysisFrame): AudioAnalysisFrame;
  dispose(): void;
}

export interface FrequencyBandRange {
  minHz: number;
  maxHz: number;
}

export interface AudioFrequencyBandRanges {
  bass: FrequencyBandRange;
  mid: FrequencyBandRange;
  treble: FrequencyBandRange;
}

export interface FrequencyAnalysisOptions {
  sampleRate: number;
  fftSize: number;
  bands?: Partial<AudioFrequencyBandRanges>;
}

interface AnalyserLike {
  readonly frequencyBinCount: number;
  fftSize: number;
  minDecibels: number;
  maxDecibels: number;
  smoothingTimeConstant: number;
  getByteFrequencyData(array: Uint8Array): void;
  getFloatTimeDomainData(array: Float32Array): void;
}

const defaultFftSize = 2048;
const defaultMinDecibels = -90;
const defaultMaxDecibels = -10;
const defaultSmoothingTimeConstant = 0.8;
const byteMaxValue = 255;

const defaultBandRanges: AudioFrequencyBandRanges = {
  bass: { minHz: 20, maxHz: 250 },
  mid: { minHz: 250, maxHz: 4000 },
  treble: { minHz: 4000, maxHz: 20000 },
};

export function normalizeAmplitude(samples: Float32Array): number {
  if (samples.length === 0) return 0;

  let sum = 0;
  for (const sample of samples) sum += sample * sample;

  return Math.min(Math.sqrt(sum / samples.length), 1);
}

export function normalizeBand(value: number, maxValue = 255): number {
  if (!Number.isFinite(value) || maxValue <= 0) return 0;
  return Math.min(Math.max(value / maxValue, 0), 1);
}

export function createAudioAnalyzer(
  context: BaseAudioContext,
  source: AudioNode,
  config: AudioAnalysisConfig = {},
): AudioAnalyzer {
  const analyser = context.createAnalyser();
  configureAnalyser(analyser, config);
  source.connect(analyser);
  if (config.output !== undefined) analyser.connect(config.output);

  return new WebAudioAnalyzer(analyser, context.sampleRate, () => {
    source.disconnect(analyser);
    if (config.output !== undefined) analyser.disconnect(config.output);
  });
}

export function analyzeFrequencyBands(
  frequencyData: Uint8Array,
  options: FrequencyAnalysisOptions,
): AudioBands {
  const ranges = resolveBandRanges(options.bands);
  return {
    bass: averageFrequencyRange(frequencyData, ranges.bass, options.sampleRate, options.fftSize),
    mid: averageFrequencyRange(frequencyData, ranges.mid, options.sampleRate, options.fftSize),
    treble: averageFrequencyRange(frequencyData, ranges.treble, options.sampleRate, options.fftSize),
  };
}

export function createEmptyAudioAnalysisFrame(): AudioAnalysisFrame {
  return {
    amplitude: 0,
    bands: { bass: 0, mid: 0, treble: 0 },
  };
}

class WebAudioAnalyzer implements AudioAnalyzer {
  readonly analyser: AnalyserNode;
  private readonly frequencyData: Uint8Array<ArrayBuffer>;
  private readonly timeDomainData: Float32Array<ArrayBuffer>;
  private readonly frame = createEmptyAudioAnalysisFrame();
  private readonly sampleRate: number;
  private readonly cleanup: () => void;

  constructor(analyser: AnalyserNode, sampleRate: number, cleanup: () => void) {
    this.analyser = analyser;
    this.sampleRate = sampleRate;
    this.cleanup = cleanup;
    this.frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    this.timeDomainData = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
  }

  analyze(): Readonly<AudioAnalysisFrame> {
    return this.analyzeInto(this.frame);
  }

  analyzeInto(target: AudioAnalysisFrame): AudioAnalysisFrame {
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    target.amplitude = normalizeAmplitude(this.timeDomainData);
    const bands = analyzeFrequencyBands(this.frequencyData, {
      sampleRate: this.sampleRate,
      fftSize: this.analyser.fftSize,
    });
    target.bands.bass = bands.bass;
    target.bands.mid = bands.mid;
    target.bands.treble = bands.treble;

    return target;
  }

  dispose(): void {
    this.cleanup();
  }
}

function configureAnalyser(analyser: AnalyserLike, config: AudioAnalysisConfig): void {
  const fftSize = config.fftSize ?? defaultFftSize;
  const minDecibels = config.minDecibels ?? defaultMinDecibels;
  const maxDecibels = config.maxDecibels ?? defaultMaxDecibels;
  const smoothingTimeConstant = config.smoothingTimeConstant ?? defaultSmoothingTimeConstant;

  assertFftSize(fftSize);
  if (!Number.isFinite(minDecibels) || !Number.isFinite(maxDecibels) || minDecibels >= maxDecibels) {
    throw new RangeError('Audio analysis decibel range must be finite and ascending.');
  }
  if (!Number.isFinite(smoothingTimeConstant) || smoothingTimeConstant < 0 || smoothingTimeConstant > 1) {
    throw new RangeError('Audio analysis smoothingTimeConstant must be between 0 and 1.');
  }

  analyser.fftSize = fftSize;
  analyser.minDecibels = minDecibels;
  analyser.maxDecibels = maxDecibels;
  analyser.smoothingTimeConstant = smoothingTimeConstant;
}

function resolveBandRanges(bands?: Partial<AudioFrequencyBandRanges>): AudioFrequencyBandRanges {
  return {
    bass: bands?.bass ?? defaultBandRanges.bass,
    mid: bands?.mid ?? defaultBandRanges.mid,
    treble: bands?.treble ?? defaultBandRanges.treble,
  };
}

function averageFrequencyRange(
  frequencyData: Uint8Array,
  range: FrequencyBandRange,
  sampleRate: number,
  fftSize: number,
): number {
  if (frequencyData.length === 0 || sampleRate <= 0 || fftSize <= 0) return 0;

  const nyquist = sampleRate / 2;
  const minHz = Math.max(range.minHz, 0);
  const maxHz = Math.min(range.maxHz, nyquist);
  if (maxHz <= minHz) return 0;

  const binWidth = sampleRate / fftSize;
  const startBin = Math.max(Math.floor(minHz / binWidth), 0);
  const endBin = Math.min(Math.ceil(maxHz / binWidth), frequencyData.length - 1);
  if (endBin < startBin) return 0;

  let sum = 0;
  let count = 0;
  for (let bin = startBin; bin <= endBin; bin += 1) {
    sum += frequencyData[bin] ?? 0;
    count += 1;
  }

  return count === 0 ? 0 : normalizeBand(sum / count, byteMaxValue);
}

function assertFftSize(fftSize: number): asserts fftSize is AudioFftSize {
  if (fftSize !== 512 && fftSize !== 1024 && fftSize !== 2048 && fftSize !== 4096) {
    throw new RangeError('Audio analysis fftSize must be 512, 1024, 2048, or 4096.');
  }
}
