import type { Composition, CompositionAsset, Layer, LayerMaskState } from './project';
import type {
  LayerEntityFactory,
  ScrawlCellAdapter,
  ScrawlEffectsAdapter,
  ScrawlGroupAdapter,
  ScrawlStylesAdapter,
} from './scrawl';

export interface MotionStateTarget<TValues extends Record<string, number> = Record<string, number>> {
  readonly values: TValues;
  apply(): void;
}

export interface MediaSyncTarget {
  readonly kind: 'video' | 'audio';
  readonly name: string;
  getCurrentTime(): number;
  seek(time: number): void | Promise<void>;
  play?(): void | Promise<void>;
  pause?(): void;
  dispose?(): void;
}

export interface RenderAdapter {
  play(): void;
  pause(): void;
  renderFrame(): void | Promise<void>;
  setFrameCallback?(callback: (() => void) | null): void;
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

export interface EngineAdapters {
  createTimeline?: (duration: number) => TimelineAdapter;
  createRenderer?: (composition: CompositionRuntime) => RenderAdapter;
  createGroup?: (compositionName: string) => ScrawlGroupAdapter | undefined;
  createPrecompositionCell?: (context: PrecompositionCellFactoryContext) => ScrawlCellAdapter | undefined;
  createLayerMaskCell?: (context: LayerMaskCellFactoryContext) => ScrawlCellAdapter | undefined;
  createEffectsController?: () => ScrawlEffectsAdapter | undefined;
  createStylesController?: () => ScrawlStylesAdapter | undefined;
  entityFactories?: Partial<Record<Layer['type'], LayerEntityFactory>>;
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
  assets: CompositionAsset[];
  timeline: TimelineAdapter;
}
