import { describe, expect, test } from 'bun:test';
import type { ScrawlEffectConfig, ScrawlEffectHandle, ScrawlEffectsAdapter } from '../shared/types';
import { createComposition } from './composition';

function createFakeEffectsAdapter(): { adapter: ScrawlEffectsAdapter; calls: string[] } {
  const calls: string[] = [];
  let nextFilter = 0;
  const adapter: ScrawlEffectsAdapter = {
    createEffect(config: ScrawlEffectConfig): ScrawlEffectHandle {
      const id = config.id ?? `filter-${nextFilter}`;
      const filter = {
        name: `${id}-${nextFilter++}`,
        type: 'Filter',
        kill() {
          calls.push(`kill:${id}`);
        },
      };
      calls.push(`create:${id}`);
      return { id, filter };
    },
    addEffect(_target, config) {
      const handle = this.createEffect(config);
      calls.push(`add:${handle.id}`);
      return handle;
    },
    updateEffect(effect, values) {
      calls.push(`update:${effect.id}:${Object.keys(values).join(',')}`);
    },
    removeEffect(_target, effect) {
      calls.push(`remove:${effect.id}`);
    },
    clearEffects() {
      calls.push('clear');
    },
    applyMask(_target, config) {
      calls.push(`mask:${config?.mode ?? 'clip'}`);
      if (config?.feather === undefined || config.feather === 0) return undefined;
      return this.addEffect(_target, {
        id: 'mask-feather',
        actions: [{ action: 'gaussian-blur', radius: config.feather }],
      });
    },
  };

  return { adapter, calls };
}

describe('createComposition', () => {
  test('applies defaults and validates required dimensions', () => {
    const composition = createComposition({ width: 1920, height: 1080 });

    expect(composition.width).toBe(1920);
    expect(composition.height).toBe(1080);
    expect(composition.duration).toBe(10);
    expect(composition.frameRate).toBe(30);
    expect(composition.backgroundColor).toBe('transparent');
  });

  test('rejects invalid frame rates', () => {
    expect(() => createComposition({ width: 1920, height: 1080, frameRate: 121 })).toThrow(
      'frameRate must be an integer between 1 and 120.',
    );
  });

  test('removes child layers when a parent is removed', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const parent = composition.addLayer('shape');
    const child = composition.addLayer('text', { parent });

    composition.removeLayer(parent);

    expect(composition.layers).not.toContain(parent);
    expect(composition.layers).not.toContain(child);
  });

  test('maps child layers to Scrawl pivot and mimic state', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const parent = composition.addLayer('shape', {
      name: 'parent',
      transform: { position: { x: 40, y: 50 }, rotation: 15, scale: { x: 2, y: 2 } },
    });
    const child = composition.addLayer('shape', {
      name: 'child',
      parent,
      transform: { position: { x: 10, y: 20 }, rotation: 5, scale: { x: 1.25, y: 1.25 } },
    });

    expect(child.scrawlState.lockTo).toBe('pivot');
    expect(child.scrawlState.pivot).toBe(parent.scrawlEntity.name);
    expect(child.scrawlState.mimic).toBe(parent.scrawlEntity.name);
    expect(child.scrawlState.offsetX).toBe(10);
    expect(child.scrawlState.offsetY).toBe(20);
    expect(child.scrawlState.addPivotRotation).toBe(true);
    expect(child.scrawlState.useMimicScale).toBe(true);
    expect(child.scrawlState.scale).toBe(0.25);
  });

  test('normalizes layer effect and mask state without retaining caller-owned action objects', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const action = { action: 'gaussian-blur' as const, radius: 4 };
    const high = [255, 255, 255, 255];
    const layer = composition.addLayer('shape', {
      effects: [
        { actions: [action], opacity: 0.5 },
        { id: 'edge', actions: [{ action: 'threshold', level: 6, high }] },
      ],
      mask: { mode: 'destination-in', opacity: 0.75, feather: 2, memoize: true },
    });

    action.radius = 99;
    high[0] = 0;

    expect(layer.effects).toEqual([
      { id: 'effect-0', actions: [{ action: 'gaussian-blur', radius: 4 }], opacity: 0.5 },
      { id: 'edge', actions: [{ action: 'threshold', level: 6, high: [255, 255, 255, 255] }] },
    ]);
    expect(layer.mask).toEqual({ mode: 'destination-in', strategy: 'entity', opacity: 0.75, feather: 2, memoize: true });
  });

  test('rejects invalid layer effect and mask state before creating the layer', () => {
    const composition = createComposition({ width: 100, height: 100 });

    expect(() => composition.addLayer('shape', { effects: [{ actions: [] }] })).toThrow(
      'Scrawl effect requires at least one filter action.',
    );
    expect(() =>
      composition.addLayer('shape', {
        effects: [{ actions: [{ action: 'grayscale' }], opacity: 2 }],
      }),
    ).toThrow('opacity must be between 0 and 1.');
    expect(() => composition.addLayer('shape', { mask: { feather: -1 } })).toThrow(
      'Scrawl mask feather must be a non-negative number.',
    );
    expect(composition.layers).toHaveLength(0);
  });

  test('wires layer effects and masks through the engine effects adapter', () => {
    const { adapter, calls } = createFakeEffectsAdapter();
    const composition = createComposition(
      { width: 100, height: 100 },
      { createEffectsController: () => adapter },
    );
    const layer = composition.addLayer('shape', {
      effects: [{ id: 'soft', actions: [{ action: 'gaussian-blur', radius: 4 }] }],
      mask: { mode: 'clip', feather: 2 },
    });

    const added = composition.addEffect(layer, {
      id: 'edge',
      actions: [{ action: 'threshold', level: 6 }],
    });
    const addedFilterName = added.scrawlFilter?.name;
    composition.removeEffect(layer, 'soft');
    composition.clearEffects(layer);
    expect(added.scrawlFilter).toBeUndefined();
    composition.setMask(layer, { mode: 'destination-in', feather: 3 });
    composition.removeLayer(layer);

    expect(addedFilterName).toBe('edge-2');
    expect(calls).toEqual([
      'create:soft',
      'add:soft',
      'mask:clip',
      'create:mask-feather',
      'add:mask-feather',
      'create:edge',
      'add:edge',
      'remove:soft-0',
      'remove:edge-2',
      'remove:mask-feather-1',
      'mask:destination-in',
      'create:mask-feather',
      'add:mask-feather',
      'remove:mask-feather-3',
    ]);
    expect(composition.layers).toEqual([]);
  });

  test('records layer-to-layer mask workflow without attaching unsafe entity clipping', () => {
    const { adapter, calls } = createFakeEffectsAdapter();
    const maskCellCalls: string[] = [];
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        createEffectsController: () => adapter,
        createLayerMaskCell(context) {
          maskCellCalls.push(`${context.targetLayer.name}:${context.sourceLayer.name}:${context.composition.width}x${context.composition.height}`);
          const cellGroup = {
            name: `${context.targetLayer.name}-mask-cell`,
            moveArtefactsIntoGroup(entity) {
              maskCellCalls.push(`move:${entity.name}`);
            },
          };
          return {
            name: `${context.targetLayer.name}-mask-cell`,
            getGroup() {
              return cellGroup;
            },
            kill() {
              maskCellCalls.push('kill-cell');
            },
          };
        },
      },
    );
    const target = composition.addLayer('shape', { name: 'target' });
    const matte = composition.addLayer('shape', { name: 'matte' });

    const mask = composition.setLayerMask(target, matte, { mode: 'clip', feather: 2 });

    expect(mask).toMatchObject({ mode: 'clip', strategy: 'cell', sourceLayerId: matte.id, feather: 2 });
    expect(target.mask).toBe(mask);
    expect(mask.scrawlCell?.name).toBe('target-mask-cell');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('layer-mask-feather');
    expect(calls[1]).toContain('layer-mask-feather');
    expect(maskCellCalls).toEqual([
      'target:matte:100x100',
      `move:${target.scrawlEntity.name}`,
      `move:${matte.scrawlEntity.name}`,
    ]);

    composition.clearMask(target);
    expect(target.mask).toBeNull();
    expect(maskCellCalls).toContain('kill-cell');

    composition.setLayerMask(target, matte, { mode: 'clip' });
    composition.removeLayer(matte);
    expect(target.mask).toBeNull();
  });

  test('creates precomposition layers backed by adapter Cells and syncs child time', () => {
    const cellCalls: string[] = [];
    const child = createComposition({ width: 64, height: 48, duration: 10 });
    const childLayer = child.addLayer('shape', { name: 'child-box' });
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        createPrecompositionCell(context) {
          cellCalls.push(`${context.layerName}:${context.composition.width}x${context.composition.height}`);
          const cellGroup = {
            name: `${context.layerName}-cell`,
            moveArtefactsIntoGroup(entity) {
              cellCalls.push(`move:${entity.name}`);
            },
            addArtefacts(entity) {
              cellCalls.push(`add:${entity.name}`);
            },
          };
          return {
            name: `${context.layerName}-cell`,
            getGroup() {
              return cellGroup;
            },
            render() {
              cellCalls.push('render-cell');
            },
          };
        },
      },
    );

    const layer = composition.addPrecomposition(child, {
      name: 'nested',
      timeOffset: 1,
      playbackRate: 2,
    });
    composition.seek(3);
    composition.seek(3);
    const lateChildLayer = child.addLayer('shape', { name: 'late-child-box' });

    expect(layer.type).toBe('precomp');
    expect(layer.source).toBe('nested-cell');
    expect(layer.precomposition).toBe(child);
    expect(layer.scrawlCell?.name).toBe('nested-cell');
    expect(child.timeline.time()).toBe(4);
    expect(cellCalls).toEqual([
      'nested:64x48',
      `move:${childLayer.scrawlEntity.name}`,
      'render-cell',
      `add:${lateChildLayer.scrawlEntity.name}`,
    ]);
  });

  test('rejects circular precomposition references', () => {
    const parent = createComposition({ width: 100, height: 100 });
    const child = createComposition({ width: 50, height: 50 });

    parent.addPrecomposition(child);

    expect(() => child.addPrecomposition(parent)).toThrow('Precomposition circular reference detected.');
  });
});
