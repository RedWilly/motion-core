import type { TimelineAdapter } from '../shared/types';

export interface GsapModule {
  timeline(vars?: Record<string, unknown>): GsapTimelineLike;
}

export interface GsapTimelineLike {
  play(): unknown;
  pause(): unknown;
  seek(time: number, suppressEvents?: boolean): unknown;
  time(): number;
  duration(value?: number): number;
  eventCallback?(event: string, callback: (() => void) | null): unknown;
}

export function createGsapTimelineFactory(gsap: GsapModule) {
  return (duration: number): TimelineAdapter => {
    const timeline = gsap.timeline({ paused: true });
    timeline.duration(duration);

    return {
      play: () => {
        timeline.play();
      },
      pause: () => {
        timeline.pause();
      },
      seek: (time, suppressEvents) => {
        timeline.seek(time, suppressEvents);
      },
      time: () => timeline.time(),
      duration: (value?: number) => timeline.duration(value),
      eventCallback: (event, callback) => {
        timeline.eventCallback?.(event, callback);
      },
    };
  };
}
