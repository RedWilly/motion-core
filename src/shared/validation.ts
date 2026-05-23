import { validationError } from './errors';
import type { CompositionConfig } from './types';

export interface NormalizedCompositionConfig {
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  backgroundColor: string;
  name: string;
  canvas?: HTMLCanvasElement;
}

export function assertPositiveInteger(value: number, propertyName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw validationError(
      'INVALID_POSITIVE_INTEGER',
      `${propertyName} must be a positive integer.`,
      { propertyName, value },
    );
  }
}

export function assertPositiveNumber(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw validationError(
      'INVALID_POSITIVE_NUMBER',
      `${propertyName} must be a positive number.`,
      { propertyName, value },
    );
  }
}

export function assertFrameRate(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 120) {
    throw validationError(
      'INVALID_FRAME_RATE',
      'frameRate must be an integer between 1 and 120.',
      { propertyName: 'frameRate', value },
    );
  }
}

export function normalizeCompositionConfig(config: CompositionConfig): NormalizedCompositionConfig {
  const normalized: NormalizedCompositionConfig = {
    width: config.width,
    height: config.height,
    duration: config.duration ?? 10,
    frameRate: config.frameRate ?? 30,
    backgroundColor: config.backgroundColor ?? 'transparent',
    name: config.name ?? 'composition',
  };

  if (config.canvas !== undefined) normalized.canvas = config.canvas;

  assertPositiveInteger(normalized.width, 'width');
  assertPositiveInteger(normalized.height, 'height');
  assertPositiveNumber(normalized.duration, 'duration');
  assertFrameRate(normalized.frameRate);

  return normalized;
}
