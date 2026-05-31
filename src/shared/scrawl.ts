import type { Layer } from './project';
import type { MotionStateTarget } from './runtime';

export type ScrawlFilterActionName =
  | 'alpha-to-channels'
  | 'alpha-to-luminance'
  | 'area-alpha'
  | 'average-channels'
  | 'blend'
  | 'blur'
  | 'channels-to-alpha'
  | 'chroma'
  | 'clamp-channels'
  | 'colors-to-alpha'
  | 'compose'
  | 'corrode'
  | 'deconvolute'
  | 'displace'
  | 'emboss'
  | 'flood'
  | 'gaussian-blur'
  | 'glitch'
  | 'grayscale'
  | 'invert-channels'
  | 'lock-channels-to-levels'
  | 'luminance-to-alpha'
  | 'map-to-gradient'
  | 'matrix'
  | 'modify-ok-channels'
  | 'modulate-channels'
  | 'modulate-ok-channels'
  | 'negative'
  | 'newsprint'
  | 'offset'
  | 'pixelate'
  | 'process-image'
  | 'random-noise'
  | 'reduce-palette'
  | 'rotate-hue'
  | 'set-channel-to-level'
  | 'step-channels'
  | 'swirl'
  | 'threshold'
  | 'tiles'
  | 'tint-channels'
  | 'unsharp'
  | 'vary-channels-by-weights'
  | 'zoom-blur';

export type ScrawlFilterLine = 'source' | 'source-alpha' | string;

export interface ScrawlFilterAction {
  readonly action: ScrawlFilterActionName;
  readonly lineIn?: ScrawlFilterLine;
  readonly lineMix?: ScrawlFilterLine;
  readonly lineOut?: string;
  readonly opacity?: number;
  readonly [key: string]: unknown;
}

export interface ScrawlEffectConfig {
  readonly id?: string;
  readonly actions: readonly ScrawlFilterAction[];
  readonly opacity?: number;
}

export type EffectActionName = ScrawlFilterActionName;
export type EffectLine = ScrawlFilterLine;
export type EffectAction = ScrawlFilterAction;
export type EffectConfig = ScrawlEffectConfig;

export type ScrawlMaskMode =
  | 'clip'
  | 'copy'
  | 'destination-atop'
  | 'destination-in'
  | 'destination-over'
  | 'destination-out'
  | 'darker'
  | 'lighter'
  | 'source-atop'
  | 'source-in'
  | 'source-out'
  | 'source-over'
  | 'xor';

export interface ScrawlMaskConfig {
  readonly mode?: ScrawlMaskMode;
  readonly opacity?: number;
  readonly feather?: number;
  readonly memoize?: boolean;
}

export type MaskMode = ScrawlMaskMode;
export type MaskConfig = ScrawlMaskConfig;

export interface ScrawlEffectHandle {
  readonly id: string;
  readonly filter: ScrawlFilterAdapter;
}

export type EffectHandle = ScrawlEffectHandle;

export type ScrawlGradientKind = 'linear' | 'radial' | 'conic';

export type ScrawlGradientColorStop = readonly [number, string];

export interface ScrawlGradientConfig {
  readonly id?: string;
  readonly kind?: ScrawlGradientKind;
  readonly colors: readonly ScrawlGradientColorStop[];
  readonly startX?: number | string;
  readonly startY?: number | string;
  readonly endX?: number | string;
  readonly endY?: number | string;
  readonly startRadius?: number | string;
  readonly endRadius?: number | string;
  readonly startAngle?: number;
  readonly angleRange?: number;
  readonly paletteStart?: number;
  readonly paletteEnd?: number;
  readonly cyclePalette?: boolean;
  readonly [key: string]: unknown;
}

export type GradientKind = ScrawlGradientKind;
export type GradientColorStop = ScrawlGradientColorStop;
export type GradientConfig = ScrawlGradientConfig;

export interface ScrawlPatternConfig {
  readonly id?: string;
  readonly asset?: string;
  readonly imageSource?: string;
  readonly videoSource?: string;
  readonly repeat?: string;
  readonly removeAssetOnKill?: boolean | string;
  readonly [key: string]: unknown;
}

export type PatternConfig = ScrawlPatternConfig;

export interface ScrawlStyleAdapter {
  readonly name: string;
  readonly type?: string;
  set?(values: Readonly<Record<string, unknown>>): unknown;
  kill?(): unknown;
  saveAsPacket?(options?: unknown): string;
}

export interface ScrawlStyleState<TValues extends Record<string, number> = Record<string, number>>
  extends MotionStateTarget<TValues> {
  readonly id: string;
  readonly style: ScrawlStyleAdapter;
}

export type MotionStyle<TValues extends Record<string, number> = Record<string, number>> =
  ScrawlStyleState<TValues>;

export interface ScrawlTransformState {
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  roll: number;
  scale: number;
  handleX: number;
  handleY: number;
  globalAlpha: number;
  visibility: boolean;
  lockTo?: 'start' | 'pivot';
  pivot?: string;
  addPivotRotation?: boolean;
  addPivotOffset?: boolean;
  mimic?: string;
  useMimicScale?: boolean;
  addOwnScaleToMimic?: boolean;
  [key: string]: unknown;
}

export interface ScrawlEntityAdapter {
  readonly name: string;
  readonly type: string;
  readonly parts?: {
    readonly fill?: ScrawlEntityAdapter;
    readonly stroke?: ScrawlEntityAdapter;
  };
  get?(key: string): unknown;
  set(values: Readonly<Record<string, unknown>> | Readonly<ScrawlTransformState>): unknown;
  addFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  removeFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  clearFilters?(): unknown;
  kill?(): unknown;
  videoFastSeek?(time: number): unknown;
  videoPause?(): unknown;
  videoPlay?(): Promise<unknown>;
  saveAsPacket?(options?: unknown): string;
}

export interface ScrawlGroupAdapter {
  readonly name: string;
  addArtefacts?(...entities: Array<ScrawlEntityAdapter | string>): unknown;
  moveArtefactsIntoGroup?(...entities: Array<ScrawlEntityAdapter | string>): unknown;
  removeArtefacts?(...entities: Array<ScrawlEntityAdapter | string>): unknown;
  setArtefacts?(values: Record<string, unknown>): unknown;
  addFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  removeFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  clearFilters?(): unknown;
  addFiltersToEntitys?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  removeFiltersFromEntitys?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  clearFiltersFromEntitys?(): unknown;
}

export interface ScrawlFilterAdapter {
  readonly name: string;
  readonly type?: string;
  set?(values: Readonly<Record<string, unknown>>): unknown;
  kill?(): unknown;
  saveAsPacket?(options?: unknown): string;
}

export interface ScrawlCellAdapter {
  readonly name: string;
  getGroup?(): ScrawlGroupAdapter;
  set?(values: Readonly<Record<string, unknown>>): unknown;
  kill?(): unknown;
  render?(): unknown;
  compile?(): unknown;
  show?(): unknown;
  addFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  removeFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  clearFilters?(): unknown;
}

export interface ScrawlEffectsAdapter {
  createEffect(config: ScrawlEffectConfig): ScrawlEffectHandle;
  addEffect(target: ScrawlEntityAdapter | ScrawlGroupAdapter, config: ScrawlEffectConfig): ScrawlEffectHandle;
  updateEffect(effect: ScrawlEffectHandle, values: Readonly<Record<string, unknown>>): void;
  removeEffect(target: ScrawlEntityAdapter | ScrawlGroupAdapter, effect: ScrawlEffectHandle): void;
  clearEffects(target: ScrawlEntityAdapter | ScrawlGroupAdapter): void;
  applyMask(target: ScrawlEntityAdapter, config?: ScrawlMaskConfig): ScrawlEffectHandle | undefined;
}

export interface ScrawlStylesAdapter {
  createGradient(config: ScrawlGradientConfig): ScrawlStyleState;
  createPattern(config: ScrawlPatternConfig): ScrawlStyleState;
  updateStyle(style: ScrawlStyleState, values: Readonly<Record<string, unknown>>): void;
  removeStyle(style: ScrawlStyleState): void;
}

export interface LayerEntityFactoryContext {
  id: string;
  type: Layer['type'];
  name: string;
  source?: string;
  config: Readonly<Layer['config']>;
  group?: ScrawlGroupAdapter;
}

export type LayerEntityFactory = (context: LayerEntityFactoryContext) => ScrawlEntityAdapter;
