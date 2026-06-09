import type {
  MediaSyncTarget,
  MotionStateTarget,
  RenderAdapter,
  TimelineAdapter,
  TimelineTweenAdapter,
} from './runtime';
import type { EngineError } from './errors';
import type {
  ScrawlCellAdapter,
  ScrawlEntityAdapter,
  ScrawlFilterAdapter,
  ScrawlGroupAdapter,
  ScrawlTransformState,
  EffectConfig,
  GradientConfig,
  MaskConfig,
  MotionStyle,
  PatternConfig,
} from './scrawl';

export type LayerType =
  | 'image'
  | 'video'
  | 'audio'
  | 'svg'
  | 'shape'
  | 'text'
  | 'particle'
  | 'precomp';

export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  position: Point;
  rotation: number;
  scale: Point;
  anchor: Point;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

export interface CompositionConfig {
  width: number;
  height: number;
  duration?: number;
  frameRate?: number;
  backgroundColor?: string;
  name?: string;
}

export type LayerMotionProperty =
  | 'position.x'
  | 'position.y'
  | 'rotation'
  | 'scale.x'
  | 'scale.y'
  | 'anchor.x'
  | 'anchor.y'
  | 'opacity';

export type AnimatableProperty = LayerMotionProperty;

export type Easing = string | ((progress: number) => number);

export type AnimationValues = Partial<Record<AnimatableProperty, number>>;

export type MotionTargetValues<TValues extends Record<string, number>> = Partial<TValues>;

export interface KeyframeConfig {
  easing?: Easing;
  hold?: boolean;
}

export interface AnimationConfig {
  duration: number;
  delay?: number;
  easing?: Easing;
  repeat?: number;
  yoyo?: boolean;
  onComplete?: () => void;
}

export interface Keyframe {
  id: string;
  property: AnimatableProperty;
  time: number;
  value: number;
  easing: Easing;
  hold: boolean;
}

export interface Animation {
  id: string;
  tweens: readonly TimelineTweenAdapter[];
  kill(): void;
}

export interface ExpressionAudioContext {
  amplitude: number;
  bands: {
    bass: number;
    mid: number;
    treble: number;
  };
}

export interface ExpressionContext {
  time: number;
  frame: number;
  layer: Layer;
  property: AnimatableProperty;
  value: number;
  audio?: ExpressionAudioContext;
}

export interface ExpressionHelpers {
  clamp(value: number, min: number, max: number): number;
  lerp(start: number, end: number, amount: number): number;
  random(min?: number, max?: number, seed?: number): number;
  wiggle(frequency: number, amplitude: number, seed?: number): number;
}

export interface Expression {
  id: string;
  layer: Layer;
  property: AnimatableProperty;
  evaluator: ExpressionEvaluator;
}

export interface ExpressionApplyResult {
  applied: number;
  errors: readonly EngineError[];
}

export type ExpressionAudioProvider = () => ExpressionAudioContext | undefined;

export type ExpressionEvaluator = (context: ExpressionContext, helpers: ExpressionHelpers) => unknown;

export type LiveEditParseMode =
  | 'float'
  | 'int'
  | 'round'
  | 'roundDown'
  | 'roundUp'
  | 'boolean'
  | ((value: string, input: LiveEditInput) => number);

export interface LiveEditInput {
  readonly value: string;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export type LiveEditMode = 'set' | 'autoKey';

export interface LiveEditOptions {
  readonly mode?: LiveEditMode;
  readonly animation?: Pick<MotionCommands, 'editKeyframe'>;
  readonly keyframe?: KeyframeConfig;
  readonly time?: number;
}

export interface LiveEditBindingOptions {
  readonly event?: string | readonly string[];
  readonly parse?: LiveEditParseMode;
  readonly edit?: LiveEditOptions;
  readonly render?: boolean;
}

export interface LiveEditSessionOptions {
  readonly schedule?: (callback: () => void) => () => void;
  readonly render?: boolean;
}

export interface MotionSetOptions extends LiveEditOptions {
  readonly render?: boolean;
}

export interface MotionCommands {
  readonly values: Record<string, number>;
  addKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  editKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  key(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  findKeyframe(layer: Layer, property: AnimatableProperty, time: number): Keyframe | undefined;
  removeKeyframe(layer: Layer, keyframe: Keyframe): void;
  animate(layer: Layer, values: AnimationValues, config: AnimationConfig): Animation;
  animateTarget<TValues extends Record<string, number>>(
    target: MotionStateTarget<TValues>,
    values: MotionTargetValues<TValues>,
    config: AnimationConfig,
  ): Animation;
  set(layer: Layer, property: AnimatableProperty, value: number, options?: MotionSetOptions): void;
  set<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: MotionSetOptions,
  ): void;
  bind(input: LiveEditInput, layer: Layer, property: AnimatableProperty, options?: LiveEditBindingOptions): () => void;
  bind<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  setExpression(layer: Layer, property: AnimatableProperty, evaluator: ExpressionEvaluator): Expression;
  removeExpression(layer: Layer, property: AnimatableProperty): void;
  applyExpressions(time?: number, audio?: ExpressionAudioContext): ExpressionApplyResult;
  getExpressionErrors(): readonly EngineError[];
  removeAnimationsForLayer(layer: Layer): void;
  flush(): void;
  dispose(): void;
}

export interface LiveEditSession {
  bindInput<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  setValue<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: MotionSetOptions,
  ): void;
  bindLayerInput(
    input: LiveEditInput,
    layer: Layer,
    property: AnimatableProperty,
    options?: LiveEditBindingOptions,
  ): () => void;
  setLayerProperty(
    layer: Layer,
    property: AnimatableProperty,
    value: number,
    options?: MotionSetOptions,
  ): void;
  bind(input: LiveEditInput, layer: Layer, property: AnimatableProperty, options?: LiveEditBindingOptions): () => void;
  bind<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  set(layer: Layer, property: AnimatableProperty, value: number, options?: MotionSetOptions): void;
  set<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: MotionSetOptions,
  ): void;
  flush(): void;
  dispose(): void;
}

export type CompositionUpdateConfig = Partial<CompositionConfig>;

export interface LayerConfig {
  name?: string;
  transform?: Partial<Transform>;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  parent?: Layer;
  content?: unknown;
  scaleMode?: 'fill' | 'fit' | 'none';
  shape?: ShapeLayerConfig;
  video?: VideoLayerConfig;
  audio?: AudioLayerConfig;
  scrawl?: Readonly<Record<string, unknown>>;
  textMode?: 'label' | 'enhanced';
  text?: string;
  enhancedText?: EnhancedTextLayerConfig;
  variant?: 'emitter' | 'net' | 'tracer';
  effects?: readonly EffectConfig[];
  mask?: LayerMaskConfig;
  precomp?: PrecompositionLayerConfig;
}

export interface ShapeLayerConfig {
  kind?: 'block' | 'wheel' | 'rectangle' | 'shape';
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  path?: string;
  fillStyle?: string;
  strokeStyle?: string;
  lineWidth?: number;
  fill?: ShapeFillConfig;
  stroke?: ShapeStrokeConfig;
  method?: string;
}

export interface ShapeFillConfig {
  readonly color?: string;
  readonly style?: ShapePaintStyle;
  readonly opacity?: number;
}

export interface ShapeStrokeConfig {
  readonly color?: string;
  readonly style?: ShapePaintStyle;
  readonly opacity?: number;
  readonly width?: number;
}

export type ShapePaintStyle = string | MotionStyle;

export type EnhancedTextJustifyLine = 'start' | 'end' | 'center' | 'space-between' | 'space-around';

export type EnhancedTextUnitFlow = 'row' | 'row-reverse' | 'column' | 'column-reverse';

export interface EnhancedTextLayerConfig {
  readonly fontString?: string;
  readonly fillStyle?: ShapePaintStyle;
  readonly strokeStyle?: ShapePaintStyle;
  readonly lineWidth?: number;
  readonly method?: string;
  readonly layoutTemplate?: string | Layer | ScrawlEntityAdapter;
  readonly useLayoutTemplateAsPath?: boolean;
  readonly pathPosition?: number;
  readonly alignment?: number;
  readonly lineSpacing?: number;
  readonly lineAdjustment?: number;
  readonly breakTextOnSpaces?: boolean;
  readonly breakWordsOnHyphens?: boolean;
  readonly justifyLine?: EnhancedTextJustifyLine;
  readonly textUnitFlow?: EnhancedTextUnitFlow;
  readonly startTextOnLine?: number;
}

export interface MediaLayerConfig {
  inPoint?: number;
  outPoint?: number;
  playbackRate?: number;
}

export interface VideoLayerConfig extends MediaLayerConfig {}

export interface AudioLayerConfig extends MediaLayerConfig {
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  config: Readonly<LayerConfig>;
  parent: Layer | null;
  children: Layer[];
  zIndex: number;
  transform: Transform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  source?: string;
  content?: unknown;
  effects: LayerEffectState[];
  mask: LayerMaskState | null;
  precomposition: Composition | null;
  media?: MediaSyncTarget;
  shape?: ShapeLayerState;
  textState?: TextLayerState;
  scrawlCell?: ScrawlCellAdapter;
  scrawlEntity: ScrawlEntityAdapter;
  scrawlState: ScrawlTransformState;
}

export type CompositionAssetKind = 'image' | 'video' | 'audio' | 'svg' | 'raw' | 'style';

export type CompositionAssetSourceType = 'url' | 'generated';

export interface CompositionAsset {
  readonly id: string;
  readonly kind: CompositionAssetKind;
  readonly sourceType: CompositionAssetSourceType;
  readonly ownerLayerId?: string;
  readonly source?: string;
  readonly label?: string;
  dispose?(): void;
}

export interface PrecompositionLayerConfig {
  readonly composition: Composition;
  readonly timeOffset?: number;
  readonly playbackRate?: number;
}

export type LayerMaskStrategy = 'entity' | 'cell';

export interface LayerMaskConfig extends MaskConfig {
  readonly sourceLayerId?: string;
  readonly strategy?: LayerMaskStrategy;
}

export interface ShapeFillState extends MotionStateTarget<{ opacity: number }> {
  readonly color: string;
}

export interface ShapeStrokeState extends MotionStateTarget<{ opacity: number; width: number }> {
  readonly color: string;
}

export interface ShapeLayerState {
  readonly fill: ShapeFillState;
  readonly stroke: ShapeStrokeState;
  apply(): void;
}

export interface TextLayerMotionValues extends Record<string, number> {
  alignment: number;
  lineAdjustment: number;
  lineSpacing: number;
  lineWidth: number;
  pathPosition: number;
  startTextOnLine: number;
}

export interface TextLayerState extends MotionStateTarget<TextLayerMotionValues> {
  readonly mode: 'enhanced';
}

export interface LayerEffectState extends Omit<EffectConfig, 'id'>, MotionStateTarget {
  readonly id: string;
  scrawlFilter?: ScrawlFilterAdapter;
}

export interface LayerMaskState extends Required<Pick<MaskConfig, 'mode'>> {
  readonly sourceLayerId?: string;
  readonly strategy: LayerMaskStrategy;
  readonly opacity?: number;
  readonly feather?: number;
  readonly memoize?: boolean;
  scrawlFilter?: ScrawlFilterAdapter;
  scrawlFilterTarget?: ScrawlEntityAdapter | ScrawlGroupAdapter;
  scrawlCell?: ScrawlCellAdapter;
}

export interface Composition {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly frameRate: number;
  readonly backgroundColor: string;
  readonly layers: Layer[];
  readonly assets: CompositionAsset[];
  readonly timeline: TimelineAdapter;
  readonly renderer: RenderAdapter;
  configure(config: CompositionUpdateConfig): void;
  addLayer(type: LayerType, config?: LayerConfig): Layer;
  addLayer(type: LayerType, source?: string, config?: LayerConfig): Layer;
  addPrecomposition(composition: Composition, config?: Omit<LayerConfig, 'content' | 'precomp'> & {
    readonly timeOffset?: number;
    readonly playbackRate?: number;
  }): Layer;
  addEffect(layer: Layer, config: EffectConfig): LayerEffectState;
  removeEffect(layer: Layer, effect: LayerEffectState | string): void;
  clearEffects(layer: Layer): void;
  createGradient(config: GradientConfig): MotionStyle;
  createPattern(config: PatternConfig): MotionStyle;
  removeStyle(style: MotionStyle): void;
  registerAsset(asset: CompositionAsset): CompositionAsset;
  removeAsset(asset: CompositionAsset | string): void;
  addKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  editKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  key(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  findKeyframe(layer: Layer, property: AnimatableProperty, time: number): Keyframe | undefined;
  removeKeyframe(layer: Layer, keyframe: Keyframe): void;
  animate(layer: Layer, values: AnimationValues, config: AnimationConfig): Animation;
  animateTarget<TValues extends Record<string, number>>(
    target: MotionStateTarget<TValues>,
    values: MotionTargetValues<TValues>,
    config: AnimationConfig,
  ): Animation;
  set(layer: Layer, property: AnimatableProperty, value: number, options?: MotionSetOptions): void;
  set<TKey extends string>(
    values: Record<TKey, number>,
    key: TKey,
    value: number,
    options?: MotionSetOptions,
  ): void;
  bind(input: LiveEditInput, layer: Layer, property: AnimatableProperty, options?: LiveEditBindingOptions): () => void;
  bind<TKey extends string>(
    input: LiveEditInput,
    values: Record<TKey, number>,
    key: TKey,
    options?: LiveEditBindingOptions,
  ): () => void;
  setExpression(layer: Layer, property: AnimatableProperty, evaluator: ExpressionEvaluator): Expression;
  removeExpression(layer: Layer, property: AnimatableProperty): void;
  applyExpressions(time?: number, audio?: ExpressionAudioContext): ExpressionApplyResult;
  getExpressionErrors(): readonly EngineError[];
  removeAnimationsForLayer(layer: Layer): void;
  flush(): void;
  registerMotionTarget(target: MotionStateTarget): () => void;
  applyMotionTargets(): void;
  syncFrame(time?: number, suppressEvents?: boolean): void;
  setMask(layer: Layer, config: LayerMaskConfig): LayerMaskState;
  setLayerMask(targetLayer: Layer, sourceLayer: Layer, config?: Omit<LayerMaskConfig, 'sourceLayerId'>): LayerMaskState;
  clearMask(layer: Layer): void;
  removeLayer(layer: Layer): void;
  reorderLayer(layer: Layer, newIndex: number): void;
  play(): void;
  pause(): void;
  seek(time: number): void;
  serialize(): string;
}
