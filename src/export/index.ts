import { capabilityError } from '../shared/errors';
import type { Composition } from '../shared/types';

export interface FrameExportConfig {
  format: 'png' | 'jpg' | 'webp';
  quality?: number;
  outputType?: 'blob' | 'arraybuffer' | 'dataurl';
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
  _config: FrameExportConfig,
): Promise<Blob> {
  composition.seek(time);
  await composition.renderer.renderFrame();
  throw capabilityError(
    'CANVAS_CAPTURE_UNAVAILABLE',
    'Frame export requires a browser Scrawl-canvas adapter backed by an HTMLCanvasElement.',
    'Create the composition with a browser renderer adapter before exporting frames.',
  );
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
