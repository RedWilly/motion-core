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
  method?: string;
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
  scrawlCell?: ScrawlCellAdapter;
  scrawlEntity: ScrawlEntityAdapter;
  scrawlState: ScrawlTransformState;
}

export interface PrecompositionLayerConfig {
  readonly composition: Composition;
  readonly timeOffset?: number;
  readonly playbackRate?: number;
}

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

export type LayerMaskStrategy = 'entity' | 'cell';

export interface LayerMaskConfig extends ScrawlMaskConfig {
  readonly sourceLayerId?: string;
  readonly strategy?: LayerMaskStrategy;
}

export interface LayerEffectState extends Omit<ScrawlEffectConfig, 'id'> {
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

export interface ScrawlEffectHandle {
  readonly id: string;
  readonly filter: ScrawlFilterAdapter;
}

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

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  backgroundColor: string;
  layers: Layer[];
  timeline: TimelineAdapter;
  renderer: RenderAdapter;
  addLayer(type: LayerType, config?: LayerConfig): Layer;
  addLayer(type: LayerType, source?: string, config?: LayerConfig): Layer;
  addPrecomposition(composition: Composition, config?: Omit<LayerConfig, 'content' | 'precomp'> & {
    readonly timeOffset?: number;
    readonly playbackRate?: number;
  }): Layer;
  addEffect(layer: Layer, config: ScrawlEffectConfig): LayerEffectState;
  removeEffect(layer: Layer, effect: LayerEffectState | string): void;
  clearEffects(layer: Layer): void;
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

export interface ScrawlEntityAdapter {
  readonly name: string;
  readonly type: string;
  set(values: Readonly<Record<string, unknown>> | Readonly<ScrawlTransformState>): unknown;
  addFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  removeFilters?(...filters: Array<ScrawlFilterAdapter | string>): unknown;
  clearFilters?(): unknown;
  kill?(): unknown;
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

export interface RenderAdapter {
  play(): void;
  pause(): void;
  renderFrame(): void | Promise<void>;
  captureFrame?(options: Readonly<FrameCaptureOptions>): Promise<Blob>;
  getFrameCanvas?(): HTMLCanvasElement | OffscreenCanvas;
}

export interface FrameCaptureOptions {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}

export interface TimelineAdapter {
  play(): void;
  pause(): void;
  seek(time: number, suppressEvents?: boolean): void;
  time(): number;
  duration(value?: number): number;
  eventCallback?(event: string, callback: (() => void) | null): void;
  to?(
    target: object,
    vars: Readonly<Record<string, unknown>>,
    position?: number | string,
  ): TimelineTweenAdapter;
  set?(target: object, vars: Readonly<Record<string, unknown>>, position?: number | string): TimelineTweenAdapter;
  remove?(tween: TimelineTweenAdapter): void;
  killTweensOf?(target: object, properties?: string): void;
}

export interface TimelineTweenAdapter {
  kill(): void;
}

export interface LayerEntityFactoryContext {
  id: string;
  type: LayerType;
  name: string;
  source?: string;
  config: Readonly<LayerConfig>;
  group?: ScrawlGroupAdapter;
}

export type LayerEntityFactory = (context: LayerEntityFactoryContext) => ScrawlEntityAdapter;

export interface EngineAdapters {
  createTimeline?: (duration: number) => TimelineAdapter;
  createRenderer?: (composition: CompositionRuntime) => RenderAdapter;
  createGroup?: (compositionName: string) => ScrawlGroupAdapter | undefined;
  createPrecompositionCell?: (context: PrecompositionCellFactoryContext) => ScrawlCellAdapter | undefined;
  createLayerMaskCell?: (context: LayerMaskCellFactoryContext) => ScrawlCellAdapter | undefined;
  createEffectsController?: () => ScrawlEffectsAdapter | undefined;
  entityFactories?: Partial<Record<LayerType, LayerEntityFactory>>;
  importScrawlPacket?: (packet: string) => unknown;
}

export interface PrecompositionCellFactoryContext {
  readonly parent: CompositionRuntime;
  readonly composition: Composition;
  readonly layerName: string;
}

export interface LayerMaskCellFactoryContext {
  readonly composition: CompositionRuntime;
  readonly targetLayer: Layer;
  readonly sourceLayer: Layer;
  readonly mask: LayerMaskState;
}

export interface CompositionRuntime {
  id: string;
  name: string;
  width: number;
  height: number;
  group?: ScrawlGroupAdapter;
  layers: Layer[];
  timeline: TimelineAdapter;
}

export interface SerializedComposition {
  version: string;
  composition: {
    id: string;
    name: string;
    width: number;
    height: number;
    duration: number;
    frameRate: number;
    backgroundColor: string;
  };
  layers: Array<{
    id: string;
    type: LayerType;
    name: string;
    parentId: string | null;
    zIndex: number;
    config?: SerializedLayerConfig;
    scrawlEntityName: string;
    source?: string;
    content?: unknown;
    transform: Transform;
    visible: boolean;
    locked: boolean;
    opacity: number;
    scrawlPacket?: string;
  }>;
  timeline: {
    time: number;
    duration: number;
  };
  assets: SerializedAsset[];
}

export type SerializedLayerConfig = Omit<
  LayerConfig,
  'content' | 'locked' | 'name' | 'opacity' | 'parent' | 'precomp' | 'transform' | 'visible'
>;

export interface SerializedAsset {
  id: string;
  layerId: string;
  type: LayerType;
  source: string;
}
