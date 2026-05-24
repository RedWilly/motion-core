import { validationError } from './errors';
import type { ScrawlEffectConfig, ScrawlFilterAction, ScrawlFilterLine } from './types';
import { assertPositiveNumber, assertUnitRange } from './validation';

export type RgbaColor = readonly [number, number, number, number];

export interface EffectPresetBase {
  readonly id?: string;
  readonly opacity?: number;
  readonly lineIn?: ScrawlFilterLine;
  readonly lineOut?: string;
}

export interface BlurEffectConfig extends EffectPresetBase {
  readonly radius?: number;
  readonly radiusHorizontal?: number;
  readonly radiusVertical?: number;
  readonly angle?: number;
  readonly includeRed?: boolean;
  readonly includeGreen?: boolean;
  readonly includeBlue?: boolean;
  readonly includeAlpha?: boolean;
  readonly excludeTransparentPixels?: boolean;
  readonly premultiply?: boolean;
}

export interface ThresholdEffectConfig extends EffectPresetBase {
  readonly level?: number;
  readonly high?: RgbaColor;
  readonly low?: RgbaColor;
  readonly includeRed?: boolean;
  readonly includeGreen?: boolean;
  readonly includeBlue?: boolean;
  readonly includeAlpha?: boolean;
  readonly useMixedChannel?: boolean;
}

export interface PixelateEffectConfig extends EffectPresetBase {
  readonly tileWidth: number;
  readonly tileHeight?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly includeRed?: boolean;
  readonly includeGreen?: boolean;
  readonly includeBlue?: boolean;
  readonly includeAlpha?: boolean;
}

export interface TintEffectConfig extends EffectPresetBase {
  readonly redInRed?: number;
  readonly redInGreen?: number;
  readonly redInBlue?: number;
  readonly greenInRed?: number;
  readonly greenInGreen?: number;
  readonly greenInBlue?: number;
  readonly blueInRed?: number;
  readonly blueInGreen?: number;
  readonly blueInBlue?: number;
}

export interface ChannelModulationEffectConfig extends EffectPresetBase {
  readonly red?: number;
  readonly green?: number;
  readonly blue?: number;
  readonly alpha?: number;
  readonly saturation?: boolean;
}

export interface UniformChannelModulationEffectConfig extends EffectPresetBase {
  readonly level: number;
}

export const effectPresets = {
  blur,
  brightness,
  channels,
  grayscale,
  invert,
  pixelate,
  saturation,
  threshold,
  tint,
} as const;

export function blur(config: BlurEffectConfig = {}): ScrawlEffectConfig {
  const radiusHorizontal = config.radiusHorizontal ?? config.radius ?? 1;
  const radiusVertical = config.radiusVertical ?? config.radius ?? 1;
  assertNonNegative(radiusHorizontal, 'radiusHorizontal');
  assertNonNegative(radiusVertical, 'radiusVertical');

  return createEffectConfig(config, {
    action: 'gaussian-blur',
    radiusHorizontal,
    radiusVertical,
    ...(config.angle === undefined ? null : { angle: config.angle }),
    ...(config.includeRed === undefined ? null : { includeRed: config.includeRed }),
    ...(config.includeGreen === undefined ? null : { includeGreen: config.includeGreen }),
    ...(config.includeBlue === undefined ? null : { includeBlue: config.includeBlue }),
    ...(config.includeAlpha === undefined ? null : { includeAlpha: config.includeAlpha }),
    ...(config.excludeTransparentPixels === undefined ? null : { excludeTransparentPixels: config.excludeTransparentPixels }),
    ...(config.premultiply === undefined ? null : { premultiply: config.premultiply }),
  });
}

export function threshold(config: ThresholdEffectConfig = {}): ScrawlEffectConfig {
  const level = config.level ?? 128;
  assertByte(level, 'level');
  const high = cloneColor(config.high ?? [255, 255, 255, 255]);
  const low = cloneColor(config.low ?? [0, 0, 0, 0]);

  return createEffectConfig(config, {
    action: 'threshold',
    level,
    high,
    low,
    ...(config.includeRed === undefined ? null : { includeRed: config.includeRed }),
    ...(config.includeGreen === undefined ? null : { includeGreen: config.includeGreen }),
    ...(config.includeBlue === undefined ? null : { includeBlue: config.includeBlue }),
    ...(config.includeAlpha === undefined ? null : { includeAlpha: config.includeAlpha }),
    ...(config.useMixedChannel === undefined ? null : { useMixedChannel: config.useMixedChannel }),
  });
}

export function pixelate(config: PixelateEffectConfig): ScrawlEffectConfig {
  const tileHeight = config.tileHeight ?? config.tileWidth;
  assertPositiveNumber(config.tileWidth, 'tileWidth');
  assertPositiveNumber(tileHeight, 'tileHeight');

  return createEffectConfig(config, {
    action: 'pixelate',
    tileWidth: config.tileWidth,
    tileHeight,
    ...(config.offsetX === undefined ? null : { offsetX: config.offsetX }),
    ...(config.offsetY === undefined ? null : { offsetY: config.offsetY }),
    ...(config.includeRed === undefined ? null : { includeRed: config.includeRed }),
    ...(config.includeGreen === undefined ? null : { includeGreen: config.includeGreen }),
    ...(config.includeBlue === undefined ? null : { includeBlue: config.includeBlue }),
    ...(config.includeAlpha === undefined ? null : { includeAlpha: config.includeAlpha }),
  });
}

export function tint(config: TintEffectConfig = {}): ScrawlEffectConfig {
  const action: ScrawlFilterAction = {
    action: 'tint-channels',
    redInRed: config.redInRed ?? 1,
    redInGreen: config.redInGreen ?? 0,
    redInBlue: config.redInBlue ?? 0,
    greenInRed: config.greenInRed ?? 0,
    greenInGreen: config.greenInGreen ?? 1,
    greenInBlue: config.greenInBlue ?? 0,
    blueInRed: config.blueInRed ?? 0,
    blueInGreen: config.blueInGreen ?? 0,
    blueInBlue: config.blueInBlue ?? 1,
  };
  for (const key of tintChannelKeys) assertUnitRange(action[key] as number, key);
  return createEffectConfig(config, action);
}

export function brightness(config: UniformChannelModulationEffectConfig): ScrawlEffectConfig {
  assertNonNegative(config.level, 'level');
  return channels({
    ...config,
    red: config.level,
    green: config.level,
    blue: config.level,
  });
}

export function saturation(config: UniformChannelModulationEffectConfig): ScrawlEffectConfig {
  assertNonNegative(config.level, 'level');
  return channels({
    ...config,
    red: config.level,
    green: config.level,
    blue: config.level,
    saturation: true,
  });
}

export function channels(config: ChannelModulationEffectConfig = {}): ScrawlEffectConfig {
  assertNonNegative(config.red ?? 1, 'red');
  assertNonNegative(config.green ?? 1, 'green');
  assertNonNegative(config.blue ?? 1, 'blue');
  assertNonNegative(config.alpha ?? 1, 'alpha');

  return createEffectConfig(config, {
    action: 'modulate-channels',
    red: config.red ?? 1,
    green: config.green ?? 1,
    blue: config.blue ?? 1,
    alpha: config.alpha ?? 1,
    ...(config.saturation === undefined ? null : { saturation: config.saturation }),
  });
}

export function grayscale(config: EffectPresetBase = {}): ScrawlEffectConfig {
  return createEffectConfig(config, { action: 'grayscale' });
}

export function invert(config: EffectPresetBase = {}): ScrawlEffectConfig {
  return createEffectConfig(config, { action: 'invert-channels' });
}

function createEffectConfig(
  config: EffectPresetBase,
  action: ScrawlFilterAction,
): ScrawlEffectConfig {
  if (config.opacity !== undefined) assertUnitRange(config.opacity, 'opacity');

  return {
    ...(config.id === undefined ? null : { id: config.id }),
    actions: [
      {
        ...action,
        ...(config.lineIn === undefined ? null : { lineIn: config.lineIn }),
        ...(config.lineOut === undefined ? null : { lineOut: config.lineOut }),
      },
    ],
    ...(config.opacity === undefined ? null : { opacity: config.opacity }),
  };
}

function assertNonNegative(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw validationError('INVALID_NON_NEGATIVE_NUMBER', `${propertyName} must be a non-negative number.`, {
      propertyName,
      value,
    });
  }
}

function assertByte(value: number, propertyName: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw validationError('INVALID_BYTE_VALUE', `${propertyName} must be an integer between 0 and 255.`, {
      propertyName,
      value,
    });
  }
}

function cloneColor(color: RgbaColor): RgbaColor {
  for (let index = 0; index < color.length; index += 1) {
    assertByte(color[index] ?? Number.NaN, `color[${index}]`);
  }
  return [color[0], color[1], color[2], color[3]];
}

const tintChannelKeys = [
  'redInRed',
  'redInGreen',
  'redInBlue',
  'greenInRed',
  'greenInGreen',
  'greenInBlue',
  'blueInRed',
  'blueInGreen',
  'blueInBlue',
] as const;
