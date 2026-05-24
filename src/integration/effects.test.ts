import { describe, expect, test } from 'bun:test';
import { EngineError } from '../shared/errors';
import type { ScrawlEntityAdapter, ScrawlFilterAdapter } from '../shared/types';
import { createScrawlEffectsController } from './effects';
import type { ScrawlFactoryModule } from './scrawl-factories';

class FakeFilter implements ScrawlFilterAdapter {
  readonly name: string;
  readonly type = 'Filter';
  readonly updates: Array<Record<string, unknown>> = [];
  killed = false;

  constructor(readonly config: Record<string, unknown>) {
    this.name = String(config.name);
  }

  set(values: Readonly<Record<string, unknown>>): void {
    this.updates.push({ ...values });
  }

  kill(): void {
    this.killed = true;
  }
}

class FakeEntity implements ScrawlEntityAdapter {
  readonly type = 'Block';
  readonly filters: ScrawlFilterAdapter[] = [];
  state: Record<string, unknown> = {};

  constructor(readonly name: string) {}

  set(values: Readonly<Record<string, unknown>>): void {
    this.state = { ...this.state, ...values };
  }

  addFilters(...filters: ScrawlFilterAdapter[]): void {
    this.filters.push(...filters);
  }

  removeFilters(...filters: ScrawlFilterAdapter[]): void {
    for (const filter of filters) {
      const index = this.filters.indexOf(filter);
      if (index >= 0) this.filters.splice(index, 1);
    }
  }

  clearFilters(): void {
    this.filters.length = 0;
  }
}

function createRuntime(): { scrawl: Pick<ScrawlFactoryModule, 'makeFilter'>; filters: FakeFilter[] } {
  const filters: FakeFilter[] = [];
  return {
    filters,
    scrawl: {
      makeFilter: (items) => {
        const filter = new FakeFilter(items);
        filters.push(filter);
        return filter;
      },
    },
  };
}

describe('Scrawl effects controller', () => {
  test('creates named filters and attaches them in Scrawl stack order', () => {
    const { scrawl, filters } = createRuntime();
    const target = new FakeEntity('clip');
    const controller = createScrawlEffectsController(scrawl, { namespace: 'scene' });

    const blur = controller.addEffect(target, {
      id: 'soften',
      actions: [{ action: 'gaussian-blur', radius: 4 }],
      opacity: 0.35,
    });
    const threshold = controller.addEffect(target, {
      id: 'edge',
      actions: [{ action: 'threshold', level: 6, low: [0, 0, 0, 0], high: [0, 0, 0, 255] }],
    });

    expect(blur.id).toBe('scene-soften');
    expect(filters[0]?.config).toMatchObject({
      name: 'scene-soften',
      actions: [{ action: 'gaussian-blur', radius: 4 }],
      opacity: 0.35,
    });
    expect(filters[1]?.config).toMatchObject({
      name: 'scene-edge',
      actions: [{ action: 'threshold', level: 6 }],
    });
    expect(target.filters.map((filter) => filter.name)).toEqual([blur.filter.name, threshold.filter.name]);
  });

  test('updates, removes, clears, and kills wrapper-owned filters', () => {
    const { scrawl } = createRuntime();
    const target = new FakeEntity('subject');
    const controller = createScrawlEffectsController(scrawl);

    const tint = controller.addEffect(target, { id: 'tint', actions: [{ action: 'tint-channels', red: 1 }] });
    const pixelate = controller.addEffect(target, { id: 'px', actions: [{ action: 'pixelate', tileWidth: 8 }] });
    controller.updateEffect(tint, { opacity: 0.5 });
    controller.removeEffect(target, tint);

    expect((tint.filter as FakeFilter).updates).toEqual([{ opacity: 0.5 }]);
    expect((tint.filter as FakeFilter).killed).toBe(true);
    expect(target.filters.map((filter) => filter.name)).toEqual([pixelate.filter.name]);

    controller.clearEffects(target);

    expect(target.filters).toEqual([]);
    expect((pixelate.filter as FakeFilter).killed).toBe(true);
  });

  test('configures clip and composition masks with optional feather filter', () => {
    const { scrawl } = createRuntime();
    const mask = new FakeEntity('matte');
    const controller = createScrawlEffectsController(scrawl, { namespace: 'scene' });

    const clipFeather = controller.applyMask(mask, { mode: 'clip', feather: 2, memoize: true });

    expect(mask.state).toMatchObject({ method: 'clip', memoizeFilterOutput: true });
    expect(clipFeather?.id).toBe('scene-matte-mask-feather');
    expect((clipFeather?.filter as FakeFilter).config).toMatchObject({
      actions: [{ action: 'gaussian-blur', radius: 2 }],
    });
    expect(mask.filters.map((filter) => filter.name)).toEqual(['scene-matte-mask-feather']);

    controller.applyMask(mask, { mode: 'destination-in', opacity: 0.7 });

    expect(mask.state).toMatchObject({ globalCompositeOperation: 'destination-in', globalAlpha: 0.7 });
  });

  test('rejects empty effects and targets without Scrawl filter mixin methods', () => {
    const { scrawl } = createRuntime();
    const controller = createScrawlEffectsController(scrawl);
    const target = {
      name: 'raw',
      type: 'Block',
      set() {},
    } satisfies ScrawlEntityAdapter;

    expect(() => controller.createEffect({ actions: [] })).toThrow(EngineError);
    expect(() => controller.addEffect(target, { actions: [{ action: 'grayscale' }] })).toThrow('does not support addFilters');
    expect(() => controller.applyMask(new FakeEntity('bad'), { feather: -1 })).toThrow(EngineError);
  });
});
