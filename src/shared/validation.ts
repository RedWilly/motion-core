import { validationError } from './errors';
import type {
  CompositionConfig,
  LayerEffectState,
  LayerMaskConfig,
  LayerMaskState,
  ScrawlEffectConfig,
  ScrawlFilterAction,
} from './types';

export interface NormalizedCompositionConfig {
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  backgroundColor: string;
  name: string;
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

export function assertUnitRange(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw validationError('INVALID_UNIT_RANGE', `${propertyName} must be between 0 and 1.`, {
      propertyName,
      value,
    });
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

  assertPositiveInteger(normalized.width, 'width');
  assertPositiveInteger(normalized.height, 'height');
  assertPositiveNumber(normalized.duration, 'duration');
  assertFrameRate(normalized.frameRate);

  return normalized;
}

export function normalizeScrawlEffectConfig(
  config: Readonly<ScrawlEffectConfig>,
  fallbackId: string,
): LayerEffectState {
  if (config.actions.length === 0) {
    throw validationError(
      'SCRAWL_EFFECT_EMPTY',
      'Scrawl effect requires at least one filter action.',
    );
  }

  if (config.opacity !== undefined) assertUnitRange(config.opacity, 'opacity');

  return {
    id: normalizeEffectId(config.id, fallbackId),
    actions: config.actions.map(cloneFilterAction),
    ...(config.opacity === undefined ? null : { opacity: config.opacity }),
  };
}

export function normalizeLayerEffects(
  effects: readonly ScrawlEffectConfig[] | undefined,
): LayerEffectState[] {
  if (effects === undefined) return [];
  const normalized: LayerEffectState[] = new Array(effects.length);
  for (let index = 0; index < effects.length; index += 1) {
    normalized[index] = normalizeScrawlEffectConfig(effects[index]!, `effect-${index}`);
  }
  return normalized;
}

export function normalizeScrawlMaskConfig(
  config: Readonly<LayerMaskConfig> | undefined,
): LayerMaskState | null {
  if (config === undefined) return null;

  if (config.opacity !== undefined) assertUnitRange(config.opacity, 'opacity');

  if (config.feather !== undefined && (!Number.isFinite(config.feather) || config.feather < 0)) {
    throw validationError('SCRAWL_MASK_INVALID_FEATHER', 'Scrawl mask feather must be a non-negative number.', {
      propertyName: 'feather',
      value: config.feather,
    });
  }

  return {
    mode: config.mode ?? 'clip',
    strategy: config.strategy ?? 'entity',
    ...(config.sourceLayerId === undefined ? null : { sourceLayerId: config.sourceLayerId }),
    ...(config.opacity === undefined ? null : { opacity: config.opacity }),
    ...(config.feather === undefined ? null : { feather: config.feather }),
    ...(config.memoize === undefined ? null : { memoize: config.memoize }),
  };
}

function normalizeEffectId(id: string | undefined, fallbackId: string): string {
  const normalized = id?.trim();
  return normalized === undefined || normalized.length === 0 ? fallbackId : normalized;
}

function cloneFilterAction(action: ScrawlFilterAction): ScrawlFilterAction {
  const cloned: Record<string, unknown> = {};
  const keys = Object.keys(action) as Array<keyof ScrawlFilterAction>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    const value = action[key];
    cloned[key] = Array.isArray(value) ? [...value] : value;
  }
  return cloned as ScrawlFilterAction;
}
