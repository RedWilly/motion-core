import { mapCompositionTimeToMediaTime, normalizeVideoLayerConfig } from '../integration/media-metadata';
import type { LayerConfig } from '../shared/project';
import type { MediaSyncTarget } from '../shared/runtime';
import type { ScrawlEntityAdapter } from '../shared/scrawl';

export function createVideoMediaTarget(
  layerConfig: LayerConfig,
  entity: ScrawlEntityAdapter,
  name: string,
): MediaSyncTarget | undefined {
  if (entity.get === undefined) return undefined;
  const config = normalizeVideoLayerConfig(layerConfig.video);

  return {
    kind: 'video',
    name,
    getCurrentTime(): number {
      const value = entity.get?.('video_currentTime');
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      return Math.max(0, (value - config.inPoint) / config.playbackRate);
    },
    seek(time: number): void {
      const mediaTime = mapCompositionTimeToMediaTime(time, config);
      entity.set({
        video_playbackRate: config.playbackRate,
        video_currentTime: mediaTime,
      });
      entity.videoFastSeek?.(mediaTime);
    },
    play(): void | Promise<void> {
      this.seek(this.getCurrentTime());
      entity.set({ video_playbackRate: config.playbackRate });
      const result = entity.videoPlay?.();
      if (result !== undefined) return result.then(() => undefined);
      return undefined;
    },
    pause(): void {
      entity.videoPause?.();
    },
  };
}
