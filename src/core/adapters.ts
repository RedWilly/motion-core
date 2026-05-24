import type {
  CompositionRuntime,
  RenderAdapter,
  TimelineAdapter,
  TimelineTweenAdapter,
} from '../shared/types';

interface MemoryTween extends TimelineTweenAdapter {
  target: Record<string, unknown>;
  vars: Readonly<Record<string, unknown>>;
  startTime: number;
  duration: number;
  startValues: Map<string, number>;
  killed: boolean;
  onUpdate?: () => void;
  onComplete?: () => void;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export class MemoryTimeline implements TimelineAdapter {
  private currentTime = 0;
  private timelineDuration: number;
  private paused = true;
  private readonly tweens: MemoryTween[] = [];

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
    this.applyTweens();
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

  to(
    target: object,
    vars: Readonly<Record<string, unknown>>,
    position: number | string = this.currentTime,
  ): TimelineTweenAdapter {
    const startTime = typeof position === 'number' ? position : this.currentTime;
    const duration = numberValue(vars['duration'], 0);
    const baseTween = {
      target: target as Record<string, unknown>,
      vars,
      startTime,
      duration,
      startValues: new Map<string, number>(),
      killed: false,
      kill() {
        tween.killed = true;
      },
    };
    const tween: MemoryTween = baseTween;

    if (typeof vars['onUpdate'] === 'function') tween.onUpdate = vars['onUpdate'] as () => void;
    if (typeof vars['onComplete'] === 'function') tween.onComplete = vars['onComplete'] as () => void;

    for (const key of Object.keys(vars)) {
      if (isTweenControlKey(key)) continue;
      const current = tween.target[key];
      if (typeof current === 'number') tween.startValues.set(key, current);
    }

    this.tweens.push(tween);
    return tween;
  }

  set(
    target: object,
    vars: Readonly<Record<string, unknown>>,
    position: number | string = this.currentTime,
  ): TimelineTweenAdapter {
    return this.to(target, { ...vars, duration: 0 }, position);
  }

  remove(tween: TimelineTweenAdapter): void {
    tween.kill();
  }

  killTweensOf(target: object, properties?: string): void {
    const propertySet = properties === undefined ? null : new Set(properties.split(',').map((item) => item.trim()));
    for (const tween of this.tweens) {
      if (tween.target !== target) continue;
      if (propertySet === null) {
        tween.kill();
        continue;
      }

      for (const key of propertySet) {
        if (tween.startValues.has(key)) tween.kill();
      }
    }
  }

  private applyTweens(): void {
    for (const tween of this.tweens) {
      if (tween.killed) continue;
      if (this.currentTime < tween.startTime) continue;

      const elapsed = this.currentTime - tween.startTime;
      const progress = tween.duration <= 0 ? 1 : Math.min(elapsed / tween.duration, 1);

      for (const [key, startValue] of tween.startValues) {
        const endValue = tween.vars[key];
        if (typeof endValue !== 'number') continue;
        tween.target[key] = startValue + (endValue - startValue) * progress;
      }

      tween.onUpdate?.();
      if (progress >= 1) tween.onComplete?.();
    }
  }
}

function isTweenControlKey(key: string): boolean {
  return (
    key === 'duration' ||
    key === 'delay' ||
    key === 'ease' ||
    key === 'repeat' ||
    key === 'yoyo' ||
    key === 'onUpdate' ||
    key === 'onComplete' ||
    key === 'overwrite' ||
    key === 'immediateRender'
  );
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
