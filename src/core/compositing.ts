import type { Composition, Layer, LayerMaskState } from '../shared/project';
import type { CompositionRuntime, EngineAdapters } from '../shared/runtime';
import type { ScrawlEffectsAdapter, ScrawlGroupAdapter } from '../shared/scrawl';

type ScrawlGroupArtefact = Layer['scrawlEntity'];

export function containsPrecomposition(root: Composition, search: Composition, seen = new Set<string>()): boolean {
  if (root.id === search.id) return true;
  if (seen.has(root.id)) return false;
  seen.add(root.id);

  for (const layer of root.layers) {
    if (layer.precomposition !== null && containsPrecomposition(layer.precomposition, search, seen)) return true;
  }

  return false;
}

export function layerArtefacts(layer: Layer): ScrawlGroupArtefact[] {
  const fill = layer.scrawlEntity.parts?.fill;
  const stroke = layer.scrawlEntity.parts?.stroke;
  return fill === undefined && stroke === undefined
    ? [layer.scrawlEntity]
    : [fill, stroke].filter((entity): entity is ScrawlGroupArtefact => entity !== undefined);
}

export function syncPrecompositionLayer(
  layer: Layer,
  parentTime: number,
  precompositionTimes: WeakMap<Layer, number>,
): void {
  if (layer.precomposition === null) return;
  const config = layer.config.precomp;
  const childTime = Math.max(0, (parentTime - (config?.timeOffset ?? 0)) * (config?.playbackRate ?? 1));
  const clampedTime = Math.min(childTime, layer.precomposition.duration);
  if (precompositionTimes.get(layer) === clampedTime) return;

  precompositionTimes.set(layer, clampedTime);
  layer.precomposition.seek(clampedTime);
  layer.scrawlCell?.render?.();
}

export function moveLayersIntoGroup(
  layers: ReadonlyArray<Layer>,
  targetGroup: ScrawlGroupAdapter,
  previousGroup: ScrawlGroupAdapter | undefined,
): void {
  for (const layer of layers) {
    const artefacts = layerArtefacts(layer);
    if (targetGroup.moveArtefactsIntoGroup !== undefined) {
      targetGroup.moveArtefactsIntoGroup(...artefacts);
      continue;
    }

    previousGroup?.removeArtefacts?.(...artefacts);
    targetGroup.addArtefacts?.(...artefacts);
  }
}

export function findLayerById(layers: ReadonlyArray<Layer>, id: string | undefined): Layer | undefined {
  if (id === undefined) return undefined;
  for (const layer of layers) {
    if (layer.id === id) return layer;
  }
  return undefined;
}

export function applyLayerMask(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
  mask: LayerMaskState | null,
): void {
  if (controller === undefined || mask === null) return;
  if (mask.sourceLayerId !== undefined) return;
  const handle = controller.applyMask(layer.scrawlEntity, mask);
  if (handle !== undefined) mask.scrawlFilter = handle.filter;
}

export function detachMaskFeather(
  controller: ScrawlEffectsAdapter | undefined,
  layer: Layer,
): void {
  const filter = layer.mask?.scrawlFilter;
  if (filter === undefined) return;
  const target = layer.mask?.scrawlFilterTarget ?? layer.scrawlEntity;

  if (controller !== undefined) {
    controller.removeEffect(target, { id: filter.name, filter });
  } else {
    filter.kill?.();
  }
  delete layer.mask?.scrawlFilter;
  delete layer.mask?.scrawlFilterTarget;
}

export function attachLayerMaskCell(
  adapters: EngineAdapters,
  controller: ScrawlEffectsAdapter | undefined,
  runtime: CompositionRuntime,
  targetLayer: Layer,
  sourceLayer: Layer,
  mask: LayerMaskState,
  activeGroup: ScrawlGroupAdapter | undefined,
): void {
  if (mask.strategy !== 'cell') return;
  const cell = adapters.createLayerMaskCell?.({
    composition: runtime,
    targetLayer,
    sourceLayer,
    mask,
  });
  const cellGroup = cell?.getGroup?.();
  if (cell === undefined || cellGroup === undefined) return;

  moveLayersIntoGroup([targetLayer, sourceLayer], cellGroup, activeGroup);
  targetLayer.scrawlEntity.set({
    visibility: targetLayer.visible,
    globalCompositeOperation: 'source-over',
    globalAlpha: targetLayer.opacity,
    order: 0,
  });
  sourceLayer.scrawlEntity.set({
    visibility: true,
    globalCompositeOperation: mask.mode === 'clip' ? 'destination-in' : mask.mode,
    globalAlpha: mask.opacity ?? 1,
    order: 1,
  });

  if (mask.feather !== undefined && mask.feather > 0 && controller !== undefined) {
    const handle = controller.addEffect(sourceLayer.scrawlEntity, {
      id: `${targetLayer.id}-layer-mask-feather`,
      actions: [{ action: 'gaussian-blur', radius: mask.feather }],
    });
    mask.scrawlFilter = handle.filter;
    mask.scrawlFilterTarget = sourceLayer.scrawlEntity;
  }

  mask.scrawlCell = cell;
}

export function detachLayerMaskCell(
  targetLayer: Layer,
  sourceLayer: Layer | undefined,
  activeGroup: ScrawlGroupAdapter | undefined,
): void {
  const cell = targetLayer.mask?.scrawlCell;
  if (cell === undefined) return;

  const layers = sourceLayer === undefined ? [targetLayer] : [targetLayer, sourceLayer];
  if (activeGroup !== undefined) moveLayersIntoGroup(layers, activeGroup, cell.getGroup?.());
  targetLayer.scrawlEntity.set({
    globalCompositeOperation: 'source-over',
    globalAlpha: targetLayer.opacity,
    visibility: targetLayer.visible,
  });

  if (sourceLayer !== undefined) {
    sourceLayer.scrawlEntity.set({
      globalCompositeOperation: 'source-over',
      globalAlpha: sourceLayer.opacity,
      visibility: sourceLayer.visible,
    });
  }

  cell.kill?.();
  delete targetLayer.mask?.scrawlCell;
}
