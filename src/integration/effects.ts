import { capabilityError } from '../shared/errors';
import type {
  ScrawlEffectConfig,
  ScrawlEffectHandle,
  ScrawlEffectsAdapter,
  ScrawlEntityAdapter,
  ScrawlFilterAdapter,
  ScrawlFilterAction,
  ScrawlFilterActionName,
  ScrawlFilterLine,
  ScrawlGroupAdapter,
  ScrawlMaskConfig,
  ScrawlMaskMode,
} from '../shared/types';
import { normalizeScrawlEffectConfig, normalizeScrawlMaskConfig } from '../shared/validation';
import type { ScrawlFactoryModule } from './scrawl-factories';

export type ScrawlFilterTarget = ScrawlEntityAdapter | ScrawlGroupAdapter;

export type {
  ScrawlEffectConfig,
  ScrawlFilterAction,
  ScrawlFilterActionName,
  ScrawlFilterLine,
  ScrawlMaskConfig,
  ScrawlMaskMode,
} from '../shared/types';

export type { ScrawlEffectHandle, ScrawlEffectsAdapter } from '../shared/types';

export interface ScrawlEffectsController extends ScrawlEffectsAdapter {}

export interface ScrawlEffectsOptions {
  readonly namespace?: string;
}

export function createScrawlEffectsController(
  scrawl: Pick<ScrawlFactoryModule, 'makeFilter'>,
  options: ScrawlEffectsOptions = {},
): ScrawlEffectsController {
  if (!scrawl.makeFilter) {
    throw capabilityError(
      'SCRAWL_FILTER_FACTORY_MISSING',
      'Scrawl runtime does not expose makeFilter().',
      'Use a Scrawl-canvas v8 runtime with the filter factory available.',
    );
  }

  const makeFilter = scrawl.makeFilter;
  const namespace = options.namespace ?? 'motion-effect';
  let nextId = 0;
  const ownedFilters = new WeakMap<ScrawlFilterTarget, Set<ScrawlEffectHandle>>();

  const createEffect = (config: ScrawlEffectConfig): ScrawlEffectHandle => {
    const normalized = normalizeScrawlEffectConfig(config, `filter-${nextId++}`);
    const id = namespacedName(namespace, normalized.id);
    const filter = makeFilter({
      name: id,
      actions: normalized.actions.map((action) => ({ ...action })),
      ...(normalized.opacity === undefined ? null : { opacity: normalized.opacity }),
    });
    return { id, filter };
  };

  const addEffect = (target: ScrawlFilterTarget, config: ScrawlEffectConfig): ScrawlEffectHandle => {
    const effect = createEffect(config);
    addFilter(target, effect.filter);
    trackFilter(ownedFilters, target, effect);
    return effect;
  };

  const updateEffect = (effect: ScrawlEffectHandle, values: Readonly<Record<string, unknown>>): void => {
    if (!effect.filter.set) {
      throw capabilityError(
        'SCRAWL_FILTER_SET_MISSING',
        `Scrawl filter "${effect.id}" does not support set().`,
      );
    }
    effect.filter.set(values);
  };

  const removeEffect = (target: ScrawlFilterTarget, effect: ScrawlEffectHandle): void => {
    if (!target.removeFilters) {
      throw missingFilterTargetError(target, 'removeFilters');
    }
    target.removeFilters(effect.filter);
    forgetFilter(ownedFilters, target, effect);
    effect.filter.kill?.();
  };

  const clearEffects = (target: ScrawlFilterTarget): void => {
    if (!target.clearFilters) {
      throw missingFilterTargetError(target, 'clearFilters');
    }
    target.clearFilters();
    const owned = ownedFilters.get(target);
    if (!owned) return;
    for (const effect of owned) effect.filter.kill?.();
    owned.clear();
  };

  const applyMask = (maskEntity: ScrawlEntityAdapter, config: ScrawlMaskConfig = {}): ScrawlEffectHandle | undefined => {
    const normalized = normalizeScrawlMaskConfig(config);
    if (normalized === null) return undefined;

    const mode = normalized.mode;
    const state =
      mode === 'clip'
        ? { method: 'clip' }
        : {
            globalCompositeOperation: mode,
            globalAlpha: normalized.opacity ?? 1,
          };

    maskEntity.set({
      ...state,
      ...(normalized.memoize === undefined ? null : { memoizeFilterOutput: normalized.memoize }),
    });

    if (normalized.feather === undefined || normalized.feather === 0) return undefined;

    return addEffect(maskEntity, {
      id: `${maskEntity.name}-mask-feather`,
      actions: [{ action: 'gaussian-blur', radius: normalized.feather }],
    });
  };

  return {
    createEffect,
    addEffect,
    updateEffect,
    removeEffect,
    clearEffects,
    applyMask,
  };
}

function addFilter(target: ScrawlFilterTarget, filter: ScrawlFilterAdapter): void {
  if (!target.addFilters) {
    throw missingFilterTargetError(target, 'addFilters');
  }
  target.addFilters(filter);
}

function missingFilterTargetError(target: ScrawlFilterTarget, requiredFunction: string) {
  return capabilityError(
    'SCRAWL_FILTER_TARGET_UNSUPPORTED',
    `Scrawl target "${target.name}" does not support ${requiredFunction}().`,
    'Pass a Scrawl Cell, Group, or entity adapter with filter mixin methods.',
  );
}

function namespacedName(namespace: string, id: string): string {
  return id.startsWith(`${namespace}-`) ? id : `${namespace}-${id}`;
}

function trackFilter(
  ownedFilters: WeakMap<ScrawlFilterTarget, Set<ScrawlEffectHandle>>,
  target: ScrawlFilterTarget,
  effect: ScrawlEffectHandle,
): void {
  const filters = ownedFilters.get(target);
  if (filters) {
    filters.add(effect);
    return;
  }
  ownedFilters.set(target, new Set([effect]));
}

function forgetFilter(
  ownedFilters: WeakMap<ScrawlFilterTarget, Set<ScrawlEffectHandle>>,
  target: ScrawlFilterTarget,
  effect: ScrawlEffectHandle,
): void {
  const filters = ownedFilters.get(target);
  if (!filters) return;

  for (const owned of filters) {
    if (owned === effect || owned.filter === effect.filter) {
      filters.delete(owned);
      return;
    }
  }
}
