import type {
  MediaSyncTarget,
  MotionStateTarget,
  RenderAdapter,
  TimelineAdapter,
} from './runtime';
import type {
  ScrawlCellAdapter,
  ScrawlEffectConfig,
  ScrawlEntityAdapter,
  ScrawlFilterAdapter,
  ScrawlGradientConfig,
  ScrawlGroupAdapter,
  ScrawlMaskConfig,
  ScrawlPatternConfig,
  ScrawlStyleState,
  ScrawlTransformState,
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
  effects?: readonly ScrawlEffectConfig[];
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

export type ShapePaintStyle = string | ScrawlStyleState;

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

export interface LayerMaskConfig extends ScrawlMaskConfig {
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

export interface LayerEffectState extends Omit<ScrawlEffectConfig, 'id'>, MotionStateTarget {
  readonly id: string;
  scrawlFilter?: ScrawlFilterAdapter;
}

export interface LayerMaskState extends Required<Pick<ScrawlMaskConfig, 'mode'>> {
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
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  backgroundColor: string;
  layers: Layer[];
  assets: CompositionAsset[];
  timeline: TimelineAdapter;
  renderer: RenderAdapter;
  addLayer(type: LayerType, config?: LayerConfig): Layer;
  addLayer(type: LayerType, source?: string, config?: LayerConfig): Layer;
  addImage(source: string, config?: LayerConfig): Layer;
  addVideo(source: string, config?: LayerConfig): Layer;
  addAudio(source: string, config?: LayerConfig): Layer;
  addSvg(source: string, config?: LayerConfig): Layer;
  addShape(config?: LayerConfig): Layer;
  addText(text: string, config?: LayerConfig): Layer;
  addPrecomposition(composition: Composition, config?: Omit<LayerConfig, 'content' | 'precomp'> & {
    readonly timeOffset?: number;
    readonly playbackRate?: number;
  }): Layer;
  addEffect(layer: Layer, config: ScrawlEffectConfig): LayerEffectState;
  removeEffect(layer: Layer, effect: LayerEffectState | string): void;
  clearEffects(layer: Layer): void;
  createGradient(config: ScrawlGradientConfig): ScrawlStyleState;
  createPattern(config: ScrawlPatternConfig): ScrawlStyleState;
  removeStyle(style: ScrawlStyleState): void;
  registerAsset(asset: CompositionAsset): CompositionAsset;
  removeAsset(asset: CompositionAsset | string): void;
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
