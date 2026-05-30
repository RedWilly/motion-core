import type { TimelineAdapter, TimelineTweenAdapter } from '../shared/runtime';

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
  to(target: object, vars: Record<string, unknown>, position?: number | string): GsapTimelineLike;
  set(target: object, vars: Record<string, unknown>, position?: number | string): GsapTimelineLike;
  remove(tween: TimelineTweenAdapter): unknown;
  killTweensOf(target: object, properties?: string): unknown;
  recent(): TimelineTweenAdapter;
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
      to: (target, vars, position) => {
        timeline.to(target, vars, position);
        return timeline.recent();
      },
      set: (target, vars, position) => {
        timeline.set(target, vars, position);
        return timeline.recent();
      },
      remove: (tween) => {
        timeline.remove(tween);
      },
      killTweensOf: (target, properties) => {
        timeline.killTweensOf(target, properties);
      },
    };
  };
}
