import type { AudioLayerConfig, Layer, MediaSyncTarget } from '../shared/types';
import { capabilityError, validationError } from '../shared/errors';

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

export interface AudioLayerBridgeConfig extends AudioLayerConfig {
  analysis?: AudioAnalysisConfig;
  name?: string;
}

export interface AudioLayerBridge extends MediaSyncTarget {
  readonly kind: 'audio';
  readonly analyzer: AudioAnalyzer;
  analyze(): Readonly<AudioAnalysisFrame>;
  analyzeInto(target: AudioAnalysisFrame): AudioAnalysisFrame;
  play(compositionTime?: number): Promise<void>;
  pause(): void;
  seek(compositionTime: number): Promise<void>;
  dispose(): void;
}

export interface MediabunnyAudioRuntime {
  ALL_FORMATS: unknown;
  AudioBufferSink: new (audioTrack: unknown) => AudioBufferSinkLike;
  BlobSource: new (source: Blob) => unknown;
  Input: new (options: { source: unknown; formats: unknown }) => AudioInputLike;
}

interface AudioInputLike {
  getDurationFromMetadata(): Promise<number | null>;
  computeDuration(): Promise<number>;
  getPrimaryAudioTrack(): Promise<unknown | null>;
  dispose(): void;
}

interface AudioBufferSinkLike {
  getBuffer(timestamp: number): Promise<WrappedAudioBufferLike | null>;
}

interface WrappedAudioBufferLike {
  buffer: AudioBuffer;
  timestamp: number;
  duration: number;
}

interface AudioPlaybackConfig {
  inPoint: number;
  outPoint: number | null;
  playbackRate: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
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

export async function createMediabunnyAudioBridge(
  source: Blob,
  context: AudioContext,
  config: AudioLayerBridgeConfig = {},
  runtimeLoader: () => Promise<MediabunnyAudioRuntime> = loadMediabunnyAudioRuntime,
): Promise<AudioLayerBridge> {
  const playback = normalizeAudioPlaybackConfig(config);
  const runtime = await runtimeLoader();
  const input = new runtime.Input({
    source: new runtime.BlobSource(source),
    formats: runtime.ALL_FORMATS,
  });

  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (audioTrack === null) {
      throw capabilityError('AUDIO_TRACK_MISSING', 'Media source does not contain an audio track.');
    }

    const [metadataDuration, sink] = await Promise.all([
      input.getDurationFromMetadata(),
      Promise.resolve(new runtime.AudioBufferSink(audioTrack)),
    ]);
    const duration = metadataDuration ?? (await input.computeDuration());
    const gain = context.createGain();
    const analyzer = createAudioAnalyzer(context, gain, config.analysis);

    return new MediabunnyAudioLayerBridge(config.name ?? 'audio', input, sink, context, gain, analyzer, playback, duration);
  } catch (error) {
    input.dispose();
    throw error;
  }
}

export function attachAudioBridgeToLayer(layer: Layer, bridge: AudioLayerBridge): AudioLayerBridge {
  if (layer.type !== 'audio') {
    throw validationError('AUDIO_LAYER_REQUIRED', 'Audio bridge can only be attached to an audio layer.', {
      propertyName: 'layer.type',
      value: layer.type,
    });
  }

  if (layer.media !== bridge) {
    layer.media?.pause?.();
    layer.media?.dispose?.();
    layer.media = bridge;
  }

  return bridge;
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

class MediabunnyAudioLayerBridge implements AudioLayerBridge {
  readonly kind = 'audio';
  readonly name: string;
  readonly analyzer: AudioAnalyzer;
  private readonly input: AudioInputLike;
  private readonly sink: AudioBufferSinkLike;
  private readonly context: AudioContext;
  private readonly gain: GainNode;
  private readonly config: AudioPlaybackConfig;
  private readonly duration: number;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentTime = 0;
  private disposed = false;

  constructor(
    name: string,
    input: AudioInputLike,
    sink: AudioBufferSinkLike,
    context: AudioContext,
    gain: GainNode,
    analyzer: AudioAnalyzer,
    config: AudioPlaybackConfig,
    duration: number,
  ) {
    this.name = name;
    this.input = input;
    this.sink = sink;
    this.context = context;
    this.gain = gain;
    this.analyzer = analyzer;
    this.config = config;
    this.duration = duration;
  }

  analyze(): Readonly<AudioAnalysisFrame> {
    return this.analyzer.analyze();
  }

  analyzeInto(target: AudioAnalysisFrame): AudioAnalysisFrame {
    return this.analyzer.analyzeInto(target);
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  async play(compositionTime = this.currentTime): Promise<void> {
    this.assertActive();
    this.pause();
    this.currentTime = compositionTime;

    const mediaTime = mapCompositionTimeToSourceTime(compositionTime, this.config);
    if (mediaTime === null) return;

    const wrapped = await this.sink.getBuffer(mediaTime);
    if (wrapped === null) return;

    const offset = Math.min(Math.max(mediaTime - wrapped.timestamp, 0), wrapped.duration);
    const remaining = this.remainingPlaybackDuration(mediaTime, wrapped.duration - offset);
    if (remaining <= 0) return;

    const node = this.context.createBufferSource();
    node.buffer = wrapped.buffer;
    node.connect(this.gain);
    this.gain.gain.value = computeAudioGain(compositionTime, this.config, this.duration);
    node.start(0, offset, remaining);
    this.currentSource = node;
  }

  pause(): void {
    const source = this.currentSource;
    this.currentSource = null;
    if (source === null) return;

    try {
      source.stop();
    } catch {
      // BufferSourceNode throws if it has already ended; disconnect is still the important cleanup.
    }
    source.disconnect(this.gain);
  }

  async seek(compositionTime: number): Promise<void> {
    this.assertActive();
    this.pause();
    this.currentTime = compositionTime;
    const mediaTime = mapCompositionTimeToSourceTime(compositionTime, this.config);
    if (mediaTime !== null) await this.sink.getBuffer(mediaTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.analyzer.dispose();
    this.input.dispose();
    this.disposed = true;
  }

  private remainingPlaybackDuration(mediaTime: number, bufferRemaining: number): number {
    const outPoint = this.config.outPoint ?? this.duration;
    return Math.min(bufferRemaining, Math.max(outPoint - mediaTime, 0));
  }

  private assertActive(): void {
    if (this.disposed) {
      throw capabilityError('AUDIO_BRIDGE_DISPOSED', 'Audio bridge has already been disposed.');
    }
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

function normalizeAudioPlaybackConfig(config: AudioLayerBridgeConfig): AudioPlaybackConfig {
  const playback: AudioPlaybackConfig = {
    inPoint: config.inPoint ?? 0,
    outPoint: config.outPoint ?? null,
    playbackRate: config.playbackRate ?? 1,
    volume: config.volume ?? 1,
    fadeIn: config.fadeIn ?? 0,
    fadeOut: config.fadeOut ?? 0,
  };

  assertNonNegative(playback.inPoint, 'inPoint');
  if (playback.outPoint !== null) assertNonNegative(playback.outPoint, 'outPoint');
  assertPositive(playback.playbackRate, 'playbackRate');
  assertUnitRange(playback.volume, 'volume');
  assertNonNegative(playback.fadeIn, 'fadeIn');
  assertNonNegative(playback.fadeOut, 'fadeOut');

  if (playback.outPoint !== null && playback.outPoint <= playback.inPoint) {
    throw validationError(
      'INVALID_AUDIO_RANGE',
      'Audio outPoint must be greater than inPoint.',
      { propertyName: 'outPoint', value: playback.outPoint },
    );
  }

  return playback;
}

function mapCompositionTimeToSourceTime(
  compositionTime: number,
  config: AudioPlaybackConfig,
): number | null {
  assertNonNegative(compositionTime, 'compositionTime');
  const mediaTime = config.inPoint + compositionTime * config.playbackRate;
  if (config.outPoint !== null && mediaTime >= config.outPoint) return null;
  return mediaTime;
}

function computeAudioGain(
  compositionTime: number,
  config: AudioPlaybackConfig,
  duration: number,
): number {
  const mediaTime = config.inPoint + compositionTime * config.playbackRate;
  const outPoint = config.outPoint ?? duration;
  const fadeInGain = config.fadeIn <= 0 ? 1 : Math.min(compositionTime / config.fadeIn, 1);
  const fadeOutRemaining = outPoint - mediaTime;
  const fadeOutGain = config.fadeOut <= 0 ? 1 : Math.min(Math.max(fadeOutRemaining / config.fadeOut, 0), 1);
  return config.volume * Math.min(fadeInGain, fadeOutGain);
}

async function loadMediabunnyAudioRuntime(): Promise<MediabunnyAudioRuntime> {
  return import('mediabunny') as unknown as Promise<MediabunnyAudioRuntime>;
}

function assertNonNegative(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw validationError(
      'INVALID_NON_NEGATIVE_NUMBER',
      `${propertyName} must be a non-negative number.`,
      { propertyName, value },
    );
  }
}

function assertPositive(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw validationError(
      'INVALID_POSITIVE_NUMBER',
      `${propertyName} must be a positive number.`,
      { propertyName, value },
    );
  }
}

function assertUnitRange(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw validationError(
      'INVALID_UNIT_RANGE',
      `${propertyName} must be between 0 and 1.`,
      { propertyName, value },
    );
  }
}
