import type { Composition, Layer, ScrawlEntityAdapter, ScrawlTransformState } from '../shared/types';

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

export function mapTransformToScrawl(layer: Layer): ScrawlTransformState {
  const transform = layer.transform;
  const state = layer.scrawlState;

  state.startX = transform.position.x;
  state.startY = transform.position.y;
  state.roll = transform.rotation;
  state.scale = transform.scale.x;
  state.handleX = transform.anchor.x;
  state.handleY = transform.anchor.y;
  state.globalAlpha = layer.opacity;
  state.visibility = layer.visible;

  return state;
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
