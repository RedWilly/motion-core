import type { Composition, Layer } from '../shared/project';
import type { MediaSyncTarget } from '../shared/runtime';
import type { ScrawlEntityAdapter, ScrawlTransformState } from '../shared/scrawl';

export type { MediaSyncTarget } from '../shared/runtime';

export interface PreRenderHook {
  beforeRender(time: number): void | Promise<void>;
}

export interface TimelineSynchronizerConfig {
  frameRate?: number;
  hooks?: PreRenderHook[];
  onDesync?: (details: { target: MediaSyncTarget; timelineTime: number; mediaTime: number }) => void;
}

interface SynchronizedFrameOptions {
  readonly time?: number;
  readonly suppressEvents: boolean;
  readonly frameRate: number;
  readonly media: readonly MediaSyncTarget[];
  readonly hooks: readonly PreRenderHook[];
  readonly onDesync?: TimelineSynchronizerConfig['onDesync'];
}

export function mapTransformToScrawl(layer: Layer): ScrawlTransformState {
  const transform = layer.transform;
  const state = layer.scrawlState;
  const parent = layer.parent;

  if (parent) {
    state.startX = 0;
    state.startY = 0;
    state.offsetX = transform.position.x;
    state.offsetY = transform.position.y;
    state.lockTo = 'pivot';
    state.pivot = parent.scrawlEntity.name;
    state.addPivotRotation = true;
    state.addPivotOffset = true;
    state.mimic = parent.scrawlEntity.name;
    state.useMimicScale = true;
    state.addOwnScaleToMimic = true;
    state.scale = transform.scale.x - 1;
  } else {
    state.startX = transform.position.x;
    state.startY = transform.position.y;
    state.offsetX = 0;
    state.offsetY = 0;
    state.lockTo = 'start';
    delete state.pivot;
    delete state.addPivotRotation;
    delete state.addPivotOffset;
    delete state.mimic;
    delete state.useMimicScale;
    delete state.addOwnScaleToMimic;
    state.scale = transform.scale.x;
  }

  state.roll = transform.rotation;
  state.handleX = transform.anchor.x;
  state.handleY = transform.anchor.y;
  state.globalAlpha = layer.opacity;
  state.visibility = layer.visible;
  state['order'] = layer.zIndex * 10;

  return state;
}

export function syncLayerToScrawl(layer: Layer): void {
  const target: ScrawlEntityAdapter = layer.scrawlEntity;
  target.set(mapTransformToScrawl(layer));
  target.parts?.fill?.set({ order: layer.zIndex * 10 });
  target.parts?.stroke?.set({ order: layer.zIndex * 10 + 1 });
}

export class TimelineSynchronizer {
  private readonly composition: Composition;
  private readonly media: MediaSyncTarget[] = [];
  private readonly hooks: PreRenderHook[] = [];
  private readonly frameRate: number;
  private readonly onDesync: ((details: { target: MediaSyncTarget; timelineTime: number; mediaTime: number }) => void) | undefined;

  constructor(composition: Composition, config: TimelineSynchronizerConfig = {}) {
    this.composition = composition;
    this.frameRate = config.frameRate ?? composition.frameRate;
    this.onDesync = config.onDesync;
    if (config.hooks !== undefined) this.hooks.push(...config.hooks);
  }

  addMedia(target: MediaSyncTarget): void {
    if (!this.media.includes(target)) this.media.push(target);
  }

  removeMedia(target: MediaSyncTarget): void {
    const index = this.media.indexOf(target);
    if (index >= 0) this.media.splice(index, 1);
  }

  addHook(hook: PreRenderHook): void {
    if (!this.hooks.includes(hook)) this.hooks.push(hook);
  }

  removeHook(hook: PreRenderHook): void {
    const index = this.hooks.indexOf(hook);
    if (index >= 0) this.hooks.splice(index, 1);
  }

  play(): void {
    this.composition.play();

    for (const target of this.media) {
      if (this.isCompositionMedia(target)) continue;
      void target.play?.();
    }
  }

  pause(): void {
    this.composition.pause();

    for (const target of this.media) {
      if (this.isCompositionMedia(target)) continue;
      target.pause?.();
    }
  }

  async seek(time: number, suppressEvents = true): Promise<void> {
    await synchronizeFrame(this.composition, {
      time,
      suppressEvents,
      frameRate: this.frameRate,
      media: this.media,
      hooks: this.hooks,
      onDesync: this.onDesync,
    });
  }

  async syncFrame(): Promise<void> {
    await synchronizeFrame(this.composition, {
      suppressEvents: true,
      frameRate: this.frameRate,
      media: this.media,
      hooks: this.hooks,
      onDesync: this.onDesync,
    });
  }

  private isCompositionMedia(target: MediaSyncTarget): boolean {
    return this.composition.layers.some((layer) => layer.media === target);
  }
}

async function synchronizeFrame(
  composition: Composition,
  options: SynchronizedFrameOptions,
): Promise<void> {
  composition.syncFrame(options.time ?? composition.timeline.time(), options.suppressEvents);
  const syncedTime = composition.timeline.time();
  const tolerance = 1 / options.frameRate;
  const mediaTargets = new Set<MediaSyncTarget>(options.media);
  for (const layer of composition.layers) {
    if (layer.media !== undefined) mediaTargets.add(layer.media);
  }

  for (const target of mediaTargets) {
    await seekMediaTarget(target, syncedTime, options.frameRate, options.onDesync, tolerance);
  }

  for (const hook of options.hooks) await hook.beforeRender(syncedTime);

  await composition.renderer.renderFrame();
}

async function seekMediaTarget(
  target: MediaSyncTarget,
  time: number,
  frameRate: number,
  onDesync: TimelineSynchronizerConfig['onDesync'],
  tolerance = 1 / frameRate,
): Promise<void> {
  const beforeSeekTime = target.getCurrentTime();
  if (Math.abs(beforeSeekTime - time) <= tolerance) return;

  await target.seek(time);
  const mediaTime = target.getCurrentTime();
  if (Math.abs(mediaTime - time) > tolerance) {
    onDesync?.({ target, timelineTime: time, mediaTime });
  }
}

export function createTimelineSynchronizer(
  composition: Composition,
  config?: TimelineSynchronizerConfig,
): TimelineSynchronizer {
  return new TimelineSynchronizer(composition, config);
}
