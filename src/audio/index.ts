export interface AudioAnalysisConfig {
  fftSize?: 512 | 1024 | 2048 | 4096;
}

export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
}

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

export * from './media-metadata';
