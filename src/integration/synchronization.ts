import type { Composition, Layer, ScrawlEntityAdapter } from '../shared/types';

export interface MediaSyncTarget {
  readonly kind: 'video' | 'audio';
  readonly name: string;
  getCurrentTime(): number;
  seek(time: number): Promise<void>;
  play?(): void | Promise<void>;
  pause?(): void;
}

export interface SynchronizationOptions {
  frameRate: number;
  media?: MediaSyncTarget[];
  onDesync?: (details: { target: MediaSyncTarget; timelineTime: number; mediaTime: number }) => void;
}

export function mapTransformToScrawl(layer: Layer): Record<string, unknown> {
  return {
    startX: layer.transform.position.x,
    startY: layer.transform.position.y,
    roll: layer.transform.rotation,
    scale: layer.transform.scale.x,
    handleX: layer.transform.anchor.x,
    handleY: layer.transform.anchor.y,
    globalAlpha: layer.opacity,
    visibility: layer.visible,
  };
}

export function syncLayerToScrawl(layer: Layer): void {
  const target: ScrawlEntityAdapter = layer.scrawlEntity;
  target.set(mapTransformToScrawl(layer));
}

export async function syncToTimelineTime(
  composition: Composition,
  time = composition.timeline.time(),
  options: SynchronizationOptions,
): Promise<void> {
  composition.timeline.seek(time, true);

  for (const layer of composition.layers) {
    syncLayerToScrawl(layer);
  }

  for (const target of options.media ?? []) {
    await target.seek(time);
    const mediaTime = target.getCurrentTime();
    const tolerance = 1 / options.frameRate;
    if (Math.abs(mediaTime - time) > tolerance) {
      options.onDesync?.({ target, timelineTime: time, mediaTime });
    }
  }

  await composition.renderer.renderFrame();
}
