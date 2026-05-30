import type { Layer, LayerEffectState } from '../shared/project';
import type { ScrawlEffectsAdapter } from '../shared/scrawl';

export function attachLayerEffect(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  effect: LayerEffectState,
): void {
  if (controller === undefined) return;
  const handle = controller.addEffect(layer.scrawlEntity, effect);
  effect.scrawlFilter = handle.filter;
}

export function configureLayerEffectMotionTarget(
  controller: ScrawlEffectsAdapter | undefined,
  effect: LayerEffectState,
): void {
  const valueKeys = Object.keys(effect.values);
  const previousValues: Record<string, number> = {};
  for (const key of valueKeys) previousValues[key] = effect.values[key]!;

  effect.apply = (): void => {
    let changed = false;

    for (const key of valueKeys) {
      const value = effect.values[key]!;
      if (previousValues[key] === value) continue;

      previousValues[key] = value;
      writeEffectActionValue(effect, key, value);
      changed = true;
    }

    if (!changed || controller === undefined || effect.scrawlFilter === undefined) return;
    controller.updateEffect({ id: effect.id, filter: effect.scrawlFilter }, { actions: effect.actions });
  };
}

export function detachLayerEffect(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  effect: LayerEffectState,
): void {
  if (controller !== undefined && effect.scrawlFilter !== undefined) {
    controller.removeEffect(layer.scrawlEntity, {
      id: effect.scrawlFilter.name,
      filter: effect.scrawlFilter,
    });
    delete effect.scrawlFilter;
    return;
  }

  effect.scrawlFilter?.kill?.();
  delete effect.scrawlFilter;
}

function writeEffectActionValue(effect: LayerEffectState, key: string, value: number): void {
  for (const action of effect.actions) {
    if (typeof action[key] === 'number') {
      (action as Record<string, unknown>)[key] = value;
    }
  }
}
