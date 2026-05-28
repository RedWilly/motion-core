import { capabilityError } from '../shared/errors';
import type {
  ScrawlGradientConfig,
  ScrawlGradientKind,
  ScrawlPatternConfig,
  ScrawlStyleAdapter,
  ScrawlStylesAdapter,
  ScrawlStyleState,
} from '../shared/types';

interface ScrawlStyleFactoryModule {
  makeConicGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makeGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makePattern?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makeRadialGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
}

export type {
  ScrawlGradientColorStop,
  ScrawlGradientConfig,
  ScrawlGradientKind,
  ScrawlPatternConfig,
  ScrawlStyleAdapter,
  ScrawlStylesAdapter,
  ScrawlStyleState,
} from '../shared/types';

export interface ScrawlStylesOptions {
  readonly namespace?: string;
}

export function createScrawlStylesController(
  scrawl: ScrawlStyleFactoryModule,
  options: ScrawlStylesOptions = {},
): ScrawlStylesAdapter {
  const namespace = options.namespace ?? 'motion-style';
  let nextId = 0;

  const createGradient = (config: ScrawlGradientConfig): ScrawlStyleState => {
    const id = namespacedName(namespace, config.id ?? `gradient-${nextId++}`);
    const kind = config.kind ?? 'linear';
    const factory = gradientFactory(scrawl, kind);
    const style = factory({
      ...config,
      name: id,
    });
    return createStyleState(id, style, config);
  };

  const createPattern = (config: ScrawlPatternConfig): ScrawlStyleState => {
    if (scrawl.makePattern === undefined) {
      throw capabilityError(
        'SCRAWL_PATTERN_FACTORY_MISSING',
        'Scrawl runtime does not expose makePattern().',
        'Use a Scrawl-canvas v8 runtime with the Pattern factory available.',
      );
    }

    const id = namespacedName(namespace, config.id ?? `pattern-${nextId++}`);
    const style = scrawl.makePattern({
      ...config,
      name: id,
    });
    return createStyleState(id, style, config);
  };

  const updateStyle = (style: ScrawlStyleState, values: Readonly<Record<string, unknown>>): void => {
    if (style.style.set === undefined) {
      throw capabilityError(
        'SCRAWL_STYLE_SET_MISSING',
        `Scrawl style "${style.id}" does not support set().`,
      );
    }
    style.style.set(values);
  };

  const removeStyle = (style: ScrawlStyleState): void => {
    style.style.kill?.();
  };

  return {
    createGradient,
    createPattern,
    updateStyle,
    removeStyle,
  };
}

function gradientFactory(
  scrawl: ScrawlStyleFactoryModule,
  kind: ScrawlGradientKind,
): (items: Record<string, unknown>) => ScrawlStyleAdapter {
  if (kind === 'radial') {
    if (scrawl.makeRadialGradient !== undefined) return scrawl.makeRadialGradient;
    throw missingGradientFactory('makeRadialGradient');
  }
  if (kind === 'conic') {
    if (scrawl.makeConicGradient !== undefined) return scrawl.makeConicGradient;
    throw missingGradientFactory('makeConicGradient');
  }
  if (scrawl.makeGradient !== undefined) return scrawl.makeGradient;
  throw missingGradientFactory('makeGradient');
}

function missingGradientFactory(factoryName: string): never {
  throw capabilityError(
    'SCRAWL_GRADIENT_FACTORY_MISSING',
    `Scrawl runtime does not expose ${factoryName}().`,
    'Use a Scrawl-canvas v8 runtime with the Gradient factory available.',
  );
}

function createStyleState(
  id: string,
  style: ScrawlStyleAdapter,
  config: Readonly<Record<string, unknown>>,
): ScrawlStyleState {
  const values = createNumericValues(config);
  const previousValues: Record<string, number> = {};
  for (const key of Object.keys(values)) previousValues[key] = values[key]!;

  const state: ScrawlStyleState = {
    id,
    style,
    values,
    apply(): void {
      const updates: Record<string, number> = {};
      let changed = false;

      for (const key of Object.keys(values)) {
        const value = values[key]!;
        if (previousValues[key] === value) continue;

        previousValues[key] = value;
        updates[key] = value;
        changed = true;
      }

      if (changed) style.set?.(updates);
    },
  };

  return state;
}

function createNumericValues(config: Readonly<Record<string, unknown>>): Record<string, number> {
  const values: Record<string, number> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === 'id' || key === 'kind' || key === 'colors') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    values[key] = value;
  }

  return values;
}

function namespacedName(namespace: string, id: string): string {
  return id.startsWith(`${namespace}-`) ? id : `${namespace}-${id}`;
}
