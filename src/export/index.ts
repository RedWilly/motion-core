import { capabilityError, validationError } from '../shared/errors';
import type { Composition, FrameCaptureOptions } from '../shared/types';
import { syncToTimelineTime } from '../integration/synchronization';

export type FrameExportFormat = 'png' | 'jpg' | 'jpeg' | 'webp';
export type FrameExportOutputType = 'blob' | 'arraybuffer' | 'dataurl';

export interface FrameExportConfig {
  format?: FrameExportFormat;
  quality?: number;
  outputType?: FrameExportOutputType;
}

export interface VideoExportConfig {
  format: 'mp4' | 'webm';
  bitrate?: number;
  quality?: number;
  frameRate?: number;
  includeAudio?: boolean;
  onProgress?: (progress: number) => void;
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

export async function exportVideo(
  _composition: Composition,
  _config: VideoExportConfig,
): Promise<Blob> {
  throw capabilityError(
    'VIDEO_EXPORT_UNAVAILABLE',
    'Video export requires the browser WebCodecs and Mediabunny export adapter.',
    'Use the export adapter once the composition is backed by a browser canvas.',
  );
}

interface NormalizedFrameExportConfig {
  capture: FrameCaptureOptions;
  outputType: FrameExportOutputType;
}

function normalizeFrameExportConfig(config: FrameExportConfig): NormalizedFrameExportConfig {
  const outputType = config.outputType ?? 'blob';
  const mimeType = formatToMimeType(config.format ?? 'png');

  if (config.quality !== undefined) validateQuality(config.quality);

  return config.quality === undefined
    ? { capture: { mimeType }, outputType }
    : { capture: { mimeType, quality: config.quality }, outputType };
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
