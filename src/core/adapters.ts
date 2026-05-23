import type { CompositionRuntime, RenderAdapter, TimelineAdapter } from '../shared/types';

export class MemoryTimeline implements TimelineAdapter {
  private currentTime = 0;
  private timelineDuration: number;
  private paused = true;

  constructor(duration: number) {
    this.timelineDuration = duration;
  }

  play(): void {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  seek(time: number): void {
    this.currentTime = Math.min(Math.max(time, 0), this.timelineDuration);
  }

  time(): number {
    return this.currentTime;
  }

  duration(value?: number): number {
    if (typeof value === 'number') this.timelineDuration = value;
    return this.timelineDuration;
  }

  isPaused(): boolean {
    return this.paused;
  }
}

export class NoopRenderer implements RenderAdapter {
  readonly composition: CompositionRuntime;
  private running = false;

  constructor(composition: CompositionRuntime) {
    this.composition = composition;
  }

  play(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  renderFrame(): void {
    return undefined;
  }

  isRunning(): boolean {
    return this.running;
  }
}
