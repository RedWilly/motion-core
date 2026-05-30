import { capabilityError, validationError } from '../shared/errors';
import type { Composition } from '../shared/project';
import type { FrameCaptureOptions } from '../shared/runtime';
import { syncToTimelineTime } from '../integration/synchronization';

export type FrameExportFormat = 'png' | 'jpg' | 'jpeg' | 'webp';
export type FrameExportOutputType = 'blob' | 'arraybuffer' | 'dataurl';

export interface FrameExportConfig {
  format?: FrameExportFormat;
  quality?: number;
  outputType?: FrameExportOutputType;
}

export interface FrameSequenceExportConfig extends FrameExportConfig {
  startTime?: number;
  endTime?: number;
  frameRate?: number;
  frameStep?: number;
  filenamePrefix?: string;
  filenamePadding?: number;
  onProgress?: (progress: number) => void;
}

export interface ExportedFrame<TData = Blob | ArrayBuffer | string> {
  index: number;
  time: number;
  filename: string;
  data: TData;
}

export interface VideoExportConfig {
  format: 'mp4' | 'webm';
  bitrate?: number;
  quality?: VideoExportQuality;
  frameRate?: number;
  includeAudio?: boolean;
  onProgress?: (progress: number) => void;
}

export type VideoExportQuality = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface VideoExportAdapter {
  export(composition: Composition, config: Readonly<NormalizedVideoExportConfig>): Promise<Blob>;
}

export async function exportFrame(
  composition: Composition,
  time: number,
  config: FrameExportConfig = {},
): Promise<Blob | ArrayBuffer | string> {
  validateExportTime(composition, time);
  const normalized = normalizeFrameExportConfig(config);

  await syncToTimelineTime(composition, time, { frameRate: composition.frameRate });
  const blob = await captureFrameBlob(composition, normalized.capture);

  if (normalized.outputType === 'blob') return blob;
  if (normalized.outputType === 'arraybuffer') return blob.arrayBuffer();
  return blobToDataUrl(blob);
}

export async function exportFrameSequence(
  composition: Composition,
  config: FrameSequenceExportConfig = {},
): Promise<Array<ExportedFrame<Blob | ArrayBuffer | string>>> {
  const normalized = normalizeFrameSequenceExportConfig(composition, config);
  const frames: Array<ExportedFrame<Blob | ArrayBuffer | string>> = [];

  for (let index = 0; index < normalized.frameCount; index += 1) {
    const frameNumber = index * normalized.frameStep;
    const time = normalized.startTime + frameNumber * normalized.frameDuration;
    const data = await exportFrame(composition, time, normalized.frameConfig);
    frames.push({
      index: frameNumber,
      time,
      filename: createFrameFilename(
        normalized.filenamePrefix,
        frameNumber,
        normalized.filenamePadding,
        normalized.extension,
      ),
      data,
    });
    normalized.onProgress?.((index + 1) / normalized.frameCount);
  }

  return frames;
}

export async function exportVideo(
  composition: Composition,
  config: VideoExportConfig,
  adapter: VideoExportAdapter = createMediabunnyVideoExportAdapter(),
): Promise<Blob> {
  return adapter.export(composition, normalizeVideoExportConfig(composition, config));
}

interface NormalizedFrameExportConfig {
  capture: FrameCaptureOptions;
  outputType: FrameExportOutputType;
}

interface NormalizedFrameSequenceExportConfig {
  startTime: number;
  endTime: number;
  frameRate: number;
  frameDuration: number;
  frameStep: number;
  frameCount: number;
  filenamePrefix: string;
  filenamePadding: number;
  extension: string;
  frameConfig: FrameExportConfig;
  onProgress?: (progress: number) => void;
}

export interface NormalizedVideoExportConfig {
  format: 'mp4' | 'webm';
  codec: 'avc' | 'vp9';
  frameRate: number;
  frameCount: number;
  frameDuration: number;
  bitrate?: number;
  quality: VideoExportQuality;
  includeAudio: boolean;
  onProgress?: (progress: number) => void;
}

interface BufferTargetLike {
  buffer: ArrayBuffer | null;
}

interface OutputLike {
  addVideoTrack(source: CanvasSourceLike): unknown;
  start(): Promise<void>;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
  getMimeType(): Promise<string>;
}

interface CanvasSourceLike {
  add(timestamp: number, duration?: number): Promise<void>;
}

export interface MediabunnyVideoRuntime {
  BufferTarget: new () => BufferTargetLike;
  CanvasSource: new (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    encodingConfig: Readonly<Record<string, unknown>>,
  ) => CanvasSourceLike;
  Mp4OutputFormat: new () => unknown;
  Output: new (options: Readonly<{ format: unknown; target: BufferTargetLike }>) => OutputLike;
  QUALITY_HIGH: unknown;
  QUALITY_LOW: unknown;
  QUALITY_MEDIUM: unknown;
  QUALITY_VERY_HIGH: unknown;
  QUALITY_VERY_LOW: unknown;
  WebMOutputFormat: new () => unknown;
}

function normalizeFrameExportConfig(config: FrameExportConfig): NormalizedFrameExportConfig {
  const outputType = config.outputType ?? 'blob';
  const mimeType = formatToMimeType(config.format ?? 'png');

  if (config.quality !== undefined) validateQuality(config.quality);

  return config.quality === undefined
    ? { capture: { mimeType }, outputType }
    : { capture: { mimeType, quality: config.quality }, outputType };
}

export function normalizeFrameSequenceExportConfig(
  composition: Composition,
  config: FrameSequenceExportConfig,
): NormalizedFrameSequenceExportConfig {
  const startTime = config.startTime ?? 0;
  const endTime = config.endTime ?? composition.duration;
  const frameRate = config.frameRate ?? composition.frameRate;
  const frameStep = config.frameStep ?? 1;
  const filenamePrefix = config.filenamePrefix ?? 'frame';
  const filenamePadding = config.filenamePadding ?? 4;
  const format = config.format ?? 'png';

  validateExportTime(composition, startTime);
  validateExportTime(composition, endTime);
  validateFrameRate(frameRate);
  validateFrameStep(frameStep);
  validateFilenamePadding(filenamePadding);

  if (endTime < startTime) {
    throw validationError(
      'INVALID_FRAME_SEQUENCE_RANGE',
      'Frame sequence endTime must be greater than or equal to startTime.',
      { propertyName: 'endTime', value: endTime },
    );
  }

  const frameDuration = 1 / frameRate;
  const totalFrameSlots = Math.floor((endTime - startTime) * frameRate) + 1;
  const frameCount = totalFrameSlots <= 0 ? 0 : Math.ceil(totalFrameSlots / frameStep);
  const frameConfig: FrameExportConfig = {
    format,
    ...(config.quality === undefined ? null : { quality: config.quality }),
    ...(config.outputType === undefined ? null : { outputType: config.outputType }),
  };

  return {
    startTime,
    endTime,
    frameRate,
    frameDuration,
    frameStep,
    frameCount,
    filenamePrefix,
    filenamePadding,
    extension: format === 'jpeg' ? 'jpg' : format,
    frameConfig,
    ...(config.onProgress === undefined ? null : { onProgress: config.onProgress }),
  };
}

export function normalizeVideoExportConfig(
  composition: Composition,
  config: VideoExportConfig,
): NormalizedVideoExportConfig {
  const frameRate = config.frameRate ?? composition.frameRate;
  validateFrameRate(frameRate);
  if (config.bitrate !== undefined) validateBitrate(config.bitrate);

  const frameCount = Math.ceil(composition.duration * frameRate);
  const frameDuration = 1 / frameRate;
  const quality = config.quality ?? 'medium';
  const base = {
    format: config.format,
    codec: config.format === 'mp4' ? 'avc' : 'vp9',
    frameRate,
    frameCount,
    frameDuration,
    quality,
    includeAudio: config.includeAudio ?? false,
  } satisfies Omit<NormalizedVideoExportConfig, 'bitrate' | 'onProgress'>;

  return {
    ...base,
    ...(config.bitrate === undefined ? null : { bitrate: config.bitrate }),
    ...(config.onProgress === undefined ? null : { onProgress: config.onProgress }),
  };
}

export function createMediabunnyVideoExportAdapter(
  runtimeLoader: () => Promise<MediabunnyVideoRuntime> = loadMediabunnyVideoRuntime,
): VideoExportAdapter {
  return {
    async export(composition: Composition, config: Readonly<NormalizedVideoExportConfig>): Promise<Blob> {
      const canvas = getExportCanvas(composition);
      const runtime = await runtimeLoader();
      const target = new runtime.BufferTarget();
      const output = new runtime.Output({
        format: config.format === 'mp4' ? new runtime.Mp4OutputFormat() : new runtime.WebMOutputFormat(),
        target,
      });
      const source = new runtime.CanvasSource(canvas, {
        codec: config.codec,
        bitrate: config.bitrate ?? qualityToMediabunny(runtime, config.quality),
        keyFrameInterval: 2,
        sizeChangeBehavior: 'deny',
      });

      output.addVideoTrack(source);

      try {
        await output.start();
        for (let frame = 0; frame < config.frameCount; frame += 1) {
          const time = frame * config.frameDuration;
          await syncToTimelineTime(composition, time, { frameRate: config.frameRate });
          await source.add(time, config.frameDuration);
          config.onProgress?.((frame + 1) / config.frameCount);
        }

        await output.finalize();
      } catch (error) {
        await output.cancel();
        throw error;
      }

      if (target.buffer === null) {
        throw capabilityError('VIDEO_EXPORT_EMPTY', 'Mediabunny finalized without producing an output buffer.');
      }

      return new Blob([target.buffer], { type: await output.getMimeType() });
    },
  };
}

function formatToMimeType(format: FrameExportFormat): FrameCaptureOptions['mimeType'] {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
  }
}

async function captureFrameBlob(
  composition: Composition,
  options: Readonly<FrameCaptureOptions>,
): Promise<Blob> {
  const captureFrame = composition.renderer.captureFrame;
  if (captureFrame === undefined) {
    throw capabilityError(
      'CANVAS_CAPTURE_UNAVAILABLE',
      'Frame export requires a renderer backed by a capturable canvas.',
      'Create the composition with the browser Scrawl-canvas adapter before exporting frames.',
    );
  }

  return captureFrame.call(composition.renderer, options);
}

function validateExportTime(composition: Composition, time: number): void {
  if (!Number.isFinite(time) || time < 0 || time > composition.duration) {
    throw validationError(
      'INVALID_EXPORT_TIME',
      'Frame export time must be inside the composition duration.',
      { propertyName: 'time', value: time },
    );
  }
}

function validateQuality(quality: number): void {
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw validationError(
      'INVALID_EXPORT_QUALITY',
      'Frame export quality must be between 0 and 1.',
      { propertyName: 'quality', value: quality },
    );
  }
}

function validateFrameRate(frameRate: number): void {
  if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 120) {
    throw validationError(
      'INVALID_VIDEO_EXPORT_FRAME_RATE',
      'Video export frameRate must be an integer between 1 and 120.',
      { propertyName: 'frameRate', value: frameRate },
    );
  }
}

function validateFrameStep(frameStep: number): void {
  if (!Number.isInteger(frameStep) || frameStep <= 0) {
    throw validationError(
      'INVALID_FRAME_SEQUENCE_STEP',
      'Frame sequence frameStep must be a positive integer.',
      { propertyName: 'frameStep', value: frameStep },
    );
  }
}

function validateFilenamePadding(filenamePadding: number): void {
  if (!Number.isInteger(filenamePadding) || filenamePadding < 0) {
    throw validationError(
      'INVALID_FRAME_SEQUENCE_PADDING',
      'Frame sequence filenamePadding must be a non-negative integer.',
      { propertyName: 'filenamePadding', value: filenamePadding },
    );
  }
}

function createFrameFilename(
  prefix: string,
  frameNumber: number,
  padding: number,
  extension: string,
): string {
  return `${prefix}${String(frameNumber).padStart(padding, '0')}.${extension}`;
}

function validateBitrate(bitrate: number): void {
  if (!Number.isFinite(bitrate) || bitrate <= 0) {
    throw validationError(
      'INVALID_VIDEO_EXPORT_BITRATE',
      'Video export bitrate must be a positive number.',
      { propertyName: 'bitrate', value: bitrate },
    );
  }
}

function getExportCanvas(composition: Composition): HTMLCanvasElement | OffscreenCanvas {
  const getFrameCanvas = composition.renderer.getFrameCanvas;
  if (getFrameCanvas === undefined) {
    throw capabilityError(
      'VIDEO_EXPORT_CANVAS_UNAVAILABLE',
      'Video export requires a renderer backed by a capturable canvas.',
      'Create the composition with the browser Scrawl-canvas adapter before exporting video.',
    );
  }

  return getFrameCanvas.call(composition.renderer);
}

async function loadMediabunnyVideoRuntime(): Promise<MediabunnyVideoRuntime> {
  return import('mediabunny') as unknown as Promise<MediabunnyVideoRuntime>;
}

function qualityToMediabunny(runtime: MediabunnyVideoRuntime, quality: VideoExportQuality): unknown {
  switch (quality) {
    case 'very-low':
      return runtime.QUALITY_VERY_LOW;
    case 'low':
      return runtime.QUALITY_LOW;
    case 'medium':
      return runtime.QUALITY_MEDIUM;
    case 'high':
      return runtime.QUALITY_HIGH;
    case 'very-high':
      return runtime.QUALITY_VERY_HIGH;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(capabilityError('FRAME_DATA_URL_FAILED', 'Unable to convert frame blob to a data URL.'));
    });
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}
