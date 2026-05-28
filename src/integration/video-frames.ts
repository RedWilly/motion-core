import { capabilityError, validationError } from '../shared/errors';
import type { Layer, MediaSyncTarget, VideoLayerConfig } from '../shared/types';
import { mapCompositionTimeToMediaTime, normalizeVideoLayerConfig, type NormalizedVideoLayerConfig } from './media-metadata';

export type VideoFrameSource = Blob | string | URL | Request;

export interface VideoFrameBridgeConfig extends VideoLayerConfig {
  readonly assetName?: string;
  readonly requestInit?: RequestInit;
}

export interface VideoFrameBridge extends MediaSyncTarget {
  readonly asset: ScrawlRawAssetAdapter;
  dispose(): void;
}

export interface ScrawlRawAssetAdapter {
  readonly name: string;
  readonly element: HTMLCanvasElement;
  readonly engine: CanvasRenderingContext2D;
  data?: unknown;
  set(values: Readonly<Record<string, unknown>>): unknown;
  kill?(): unknown;
}

export interface ScrawlVideoFrameModule {
  makeRawAsset(items: Readonly<Record<string, unknown>>): ScrawlRawAssetAdapter | false;
}

interface MediabunnyVideoInputLike {
  getPrimaryVideoTrack(): Promise<unknown | null>;
  dispose(): void;
}

interface MediabunnyVideoSampleSinkLike {
  getSample(timestamp: number): Promise<VideoSampleLike | null>;
}

interface VideoSampleLike {
  readonly displayWidth: number;
  readonly displayHeight: number;
  draw(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, dx: number, dy: number, dWidth?: number, dHeight?: number): void;
  close(): void;
}

export interface MediabunnyVideoFrameRuntime {
  ALL_FORMATS: unknown;
  BlobSource: new (source: Blob) => unknown;
  Input: new (options: { source: unknown; formats: unknown }) => MediabunnyVideoInputLike;
  UrlSource: new (source: string | URL | Request, options?: { requestInit?: RequestInit }) => unknown;
  VideoSampleSink: new (videoTrack: unknown) => MediabunnyVideoSampleSinkLike;
}

export async function createMediabunnyVideoFrameBridge(
  layer: Layer,
  source: VideoFrameSource,
  scrawl: ScrawlVideoFrameModule,
  config: VideoFrameBridgeConfig = {},
  runtimeLoader: () => Promise<MediabunnyVideoFrameRuntime> = loadMediabunnyVideoFrameRuntime,
): Promise<VideoFrameBridge> {
  if (layer.type !== 'video') {
    throw validationError('VIDEO_FRAME_LAYER_REQUIRED', 'Mediabunny video frame bridge requires a video layer.', {
      propertyName: 'layer.type',
      value: layer.type,
    });
  }

  const runtime = await runtimeLoader();
  const input = new runtime.Input({
    source: createMediabunnySource(runtime, source, config),
    formats: runtime.ALL_FORMATS,
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack === null) {
      throw capabilityError('VIDEO_FRAME_TRACK_MISSING', 'Mediabunny input does not contain a video track.');
    }

    const sink = new runtime.VideoSampleSink(videoTrack);
    let pendingSample: VideoSampleLike | null = null;
    const asset = scrawl.makeRawAsset({
      name: config.assetName ?? `${layer.name}-video-frame`,
      updateSource(rawAsset: ScrawlRawAssetAdapter) {
        const sample = pendingSample;
        if (sample === null) return;

        try {
          drawSampleToRawAsset(sample, rawAsset);
        } finally {
          sample.close();
          pendingSample = null;
          delete rawAsset.data;
        }
      },
    });

    if (asset === false) {
      throw capabilityError('SCRAWL_RAW_ASSET_UNAVAILABLE', 'Scrawl-canvas did not create a RawAsset for video frames.');
    }

    layer.scrawlEntity.set({ asset });
    const bridge = new MediabunnyVideoFrameBridge(layer, input, sink, asset, normalizeVideoLayerConfig({
      ...layer.config.video,
      ...config,
    }), (sample) => {
      if (pendingSample !== null) pendingSample.close();
      pendingSample = sample;
    }, () => {
      if (pendingSample === null) return;
      pendingSample.close();
      pendingSample = null;
    });
    layer.media = bridge;
    return bridge;
  } catch (error) {
    input.dispose();
    throw error;
  }
}

class MediabunnyVideoFrameBridge implements VideoFrameBridge {
  readonly kind = 'video';
  readonly name: string;
  readonly asset: ScrawlRawAssetAdapter;
  private readonly layer: Layer;
  private readonly input: MediabunnyVideoInputLike;
  private readonly sink: MediabunnyVideoSampleSinkLike;
  private readonly config: NormalizedVideoLayerConfig;
  private readonly setPendingSample: (sample: VideoSampleLike) => void;
  private readonly closePendingSample: () => void;
  private readonly assetData: { data?: VideoSampleLike } = {};
  private currentTime = 0;
  private disposed = false;

  constructor(
    layer: Layer,
    input: MediabunnyVideoInputLike,
    sink: MediabunnyVideoSampleSinkLike,
    asset: ScrawlRawAssetAdapter,
    config: NormalizedVideoLayerConfig,
    setPendingSample: (sample: VideoSampleLike) => void,
    closePendingSample: () => void,
  ) {
    this.layer = layer;
    this.name = layer.name;
    this.input = input;
    this.sink = sink;
    this.asset = asset;
    this.config = config;
    this.setPendingSample = setPendingSample;
    this.closePendingSample = closePendingSample;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  async seek(time: number): Promise<void> {
    this.assertActive();
    const mediaTime = mapCompositionTimeToMediaTime(time, this.config);
    const sample = await this.sink.getSample(mediaTime);
    this.currentTime = time;
    if (sample === null) return;

    this.setPendingSample(sample);
    this.assetData.data = sample;
    this.asset.set(this.assetData);
  }

  pause(): void {
    return undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.layer.media === this) delete this.layer.media;
    this.closePendingSample();
    delete this.assetData.data;
    this.asset.kill?.();
    this.input.dispose();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw capabilityError('VIDEO_FRAME_BRIDGE_DISPOSED', 'Mediabunny video frame bridge has already been disposed.');
    }
  }
}

function createMediabunnySource(
  runtime: MediabunnyVideoFrameRuntime,
  source: VideoFrameSource,
  config: VideoFrameBridgeConfig,
): unknown {
  if (source instanceof Blob) return new runtime.BlobSource(source);
  return new runtime.UrlSource(source, config.requestInit === undefined ? undefined : { requestInit: config.requestInit });
}

function drawSampleToRawAsset(sample: VideoSampleLike, asset: ScrawlRawAssetAdapter): void {
  const width = Math.max(1, Math.ceil(sample.displayWidth));
  const height = Math.max(1, Math.ceil(sample.displayHeight));
  if (asset.element.width !== width) asset.element.width = width;
  if (asset.element.height !== height) asset.element.height = height;
  asset.engine.clearRect(0, 0, width, height);
  sample.draw(asset.engine, 0, 0, width, height);
}

async function loadMediabunnyVideoFrameRuntime(): Promise<MediabunnyVideoFrameRuntime> {
  return import('mediabunny') as unknown as Promise<MediabunnyVideoFrameRuntime>;
}
