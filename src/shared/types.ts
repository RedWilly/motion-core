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
  canvas?: HTMLCanvasElement;
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
  scrawl?: Readonly<Record<string, unknown>>;
  text?: string;
  variant?: 'emitter' | 'net' | 'tracer';
}

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  parent: Layer | null;
  children: Layer[];
  zIndex: number;
  transform: Transform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  source?: string;
  content?: unknown;
  scrawlEntity: ScrawlEntityAdapter;
  scrawlState: ScrawlTransformState;
}

export interface ScrawlTransformState {
  startX: number;
  startY: number;
  roll: number;
  scale: number;
  handleX: number;
  handleY: number;
  globalAlpha: number;
  visibility: boolean;
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
  addLayer(type: LayerType, source?: string, config?: LayerConfig): Layer;
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
  kill?(): unknown;
  saveAsPacket?(options?: unknown): string;
}

export interface ScrawlGroupAdapter {
  readonly name: string;
  addArtefacts?(...entities: Array<ScrawlEntityAdapter | string>): unknown;
  removeArtefacts?(...entities: Array<ScrawlEntityAdapter | string>): unknown;
  setArtefacts?(values: Record<string, unknown>): unknown;
}

export interface RenderAdapter {
  play(): void;
  pause(): void;
  renderFrame(): void | Promise<void>;
}

export interface TimelineAdapter {
  play(): void;
  pause(): void;
  seek(time: number, suppressEvents?: boolean): void;
  time(): number;
  duration(value?: number): number;
  eventCallback?(event: string, callback: (() => void) | null): void;
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
  entityFactories?: Partial<Record<LayerType, LayerEntityFactory>>;
}

export interface CompositionRuntime {
  id: string;
  name: string;
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
    source?: string;
    content?: unknown;
    transform: Transform;
    visible: boolean;
    locked: boolean;
    opacity: number;
    scrawlPacket?: string;
  }>;
}
