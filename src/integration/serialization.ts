import { validationError } from '../shared/errors';
import type {
  Composition,
  CompositionAsset,
  CompositionConfig,
  Layer,
  LayerConfig,
  LayerMaskConfig,
  EnhancedTextLayerConfig,
} from '../shared/project';
import type { EngineAdapters } from '../shared/runtime';
import type { ScrawlEffectConfig } from '../shared/scrawl';
import type {
  SerializedAsset,
  SerializedComposition,
  SerializedEnhancedTextLayerConfig,
  SerializedLayerConfig,
} from '../shared/serialization-types';

type SerializedLayer = SerializedComposition['layers'][number];

const serializationVersion = '0.1.0';

function serializeLayer(layer: Composition['layers'][number]): SerializedLayer {
  const serialized: SerializedLayer = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    parentId: layer.parent?.id ?? null,
    zIndex: layer.zIndex,
    scrawlEntityName: layer.scrawlEntity.name,
    transform: layer.transform,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
  };

  if (layer.source !== undefined) serialized.source = layer.source;
  if (layer.content !== undefined) serialized.content = layer.content;
  const config = serializeLayerConfig(layer);
  if (Object.keys(config).length > 0) serialized.config = config;

  const packet = layer.scrawlEntity.saveAsPacket?.();
  if (packet !== undefined) serialized.scrawlPacket = packet;

  return serialized;
}

export function serializeComposition(composition: Composition): string {
  const payload: SerializedComposition = {
    version: serializationVersion,
    composition: {
      id: composition.id,
      name: composition.name,
      width: composition.width,
      height: composition.height,
      duration: composition.duration,
      frameRate: composition.frameRate,
      backgroundColor: composition.backgroundColor,
    },
    layers: composition.layers.map(serializeLayer),
    timeline: {
      time: composition.timeline.time(),
      duration: composition.timeline.duration(),
    },
    assets: composition.assets.map(serializeAsset),
  };

  return JSON.stringify(payload);
}

export type CompositionFactory = (
  config: CompositionConfig,
  adapters?: EngineAdapters,
) => Composition;

export function parseSerializedComposition(json: string): SerializedComposition {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw validationError('INVALID_SERIALIZED_JSON', 'Serialized composition must be valid JSON.', {
      value: error,
    });
  }

  assertSerializedComposition(value);
  return value;
}

export function hydrateSerializedComposition(
  json: string,
  createComposition: CompositionFactory,
  adapters: EngineAdapters = {},
): Composition {
  const payload = parseSerializedComposition(json);
  const composition = createComposition(
    {
      name: payload.composition.name,
      width: payload.composition.width,
      height: payload.composition.height,
      duration: payload.composition.duration,
      frameRate: payload.composition.frameRate,
      backgroundColor: payload.composition.backgroundColor,
    },
    adapters,
  );

  const layersById = new Map<string, Layer>();
  const orderedLayers = [...payload.layers].sort((a, b) => a.zIndex - b.zIndex);

  for (const layerPayload of orderedLayers) {
    const config = deserializeLayerConfig(layerPayload, layersById);
    const layer = composition.addLayer(layerPayload.type, layerPayload.source, config);
    layer.id = layerPayload.id;
    layersById.set(layerPayload.id, layer);
    if (layerPayload.scrawlPacket !== undefined) adapters.importScrawlPacket?.(layerPayload.scrawlPacket);
  }

  hydrateAssets(composition, payload.assets);
  composition.timeline.duration(payload.timeline.duration);
  composition.seek(payload.timeline.time);

  return composition;
}

function serializeLayerConfig(layer: Readonly<Layer>): SerializedLayerConfig {
  const config = layer.config;
  const serialized: SerializedLayerConfig = {};

  if (config.scaleMode !== undefined) serialized.scaleMode = config.scaleMode;
  if (config.shape !== undefined) serialized.shape = config.shape;
  if (config.video !== undefined) serialized.video = config.video;
  if (config.audio !== undefined) serialized.audio = config.audio;
  if (config.scrawl !== undefined) serialized.scrawl = config.scrawl;
  if (config.textMode !== undefined) serialized.textMode = config.textMode;
  if (config.text !== undefined) serialized.text = config.text;
  if (config.enhancedText !== undefined) serialized.enhancedText = serializeEnhancedTextConfig(config.enhancedText);
  if (config.variant !== undefined) serialized.variant = config.variant;
  if (layer.effects.length > 0) serialized.effects = layer.effects.map(serializeEffectConfig);
  if (layer.mask !== null) serialized.mask = serializeMaskConfig(layer.mask);

  return serialized;
}

function serializeEffectConfig(effect: Readonly<Layer['effects'][number]>): ScrawlEffectConfig {
  return {
    id: effect.id,
    actions: effect.actions.map((action) => ({ ...action })),
    ...(effect.opacity === undefined ? null : { opacity: effect.opacity }),
  };
}

function serializeMaskConfig(mask: Readonly<NonNullable<Layer['mask']>>): LayerMaskConfig {
  return {
    mode: mask.mode,
    strategy: mask.strategy,
    ...(mask.sourceLayerId === undefined ? null : { sourceLayerId: mask.sourceLayerId }),
    ...(mask.opacity === undefined ? null : { opacity: mask.opacity }),
    ...(mask.feather === undefined ? null : { feather: mask.feather }),
    ...(mask.memoize === undefined ? null : { memoize: mask.memoize }),
  };
}

function serializeEnhancedTextConfig(config: Readonly<EnhancedTextLayerConfig>): SerializedEnhancedTextLayerConfig {
  const serialized: Omit<SerializedEnhancedTextLayerConfig, 'layoutTemplate' | 'layoutTemplateLayerId'> & {
    layoutTemplate?: string;
    layoutTemplateLayerId?: string;
  } = {
    ...(config.fontString === undefined ? null : { fontString: config.fontString }),
    ...(config.fillStyle === undefined ? null : { fillStyle: config.fillStyle }),
    ...(config.strokeStyle === undefined ? null : { strokeStyle: config.strokeStyle }),
    ...(config.lineWidth === undefined ? null : { lineWidth: config.lineWidth }),
    ...(config.method === undefined ? null : { method: config.method }),
    ...(config.useLayoutTemplateAsPath === undefined ? null : { useLayoutTemplateAsPath: config.useLayoutTemplateAsPath }),
    ...(config.pathPosition === undefined ? null : { pathPosition: config.pathPosition }),
    ...(config.alignment === undefined ? null : { alignment: config.alignment }),
    ...(config.lineSpacing === undefined ? null : { lineSpacing: config.lineSpacing }),
    ...(config.lineAdjustment === undefined ? null : { lineAdjustment: config.lineAdjustment }),
    ...(config.breakTextOnSpaces === undefined ? null : { breakTextOnSpaces: config.breakTextOnSpaces }),
    ...(config.breakWordsOnHyphens === undefined ? null : { breakWordsOnHyphens: config.breakWordsOnHyphens }),
    ...(config.justifyLine === undefined ? null : { justifyLine: config.justifyLine }),
    ...(config.textUnitFlow === undefined ? null : { textUnitFlow: config.textUnitFlow }),
    ...(config.startTextOnLine === undefined ? null : { startTextOnLine: config.startTextOnLine }),
  };

  if (typeof config.layoutTemplate === 'string') {
    serialized.layoutTemplate = config.layoutTemplate;
  } else if (config.layoutTemplate !== undefined && isLayerReference(config.layoutTemplate)) {
    serialized.layoutTemplateLayerId = config.layoutTemplate.id;
  } else if (config.layoutTemplate !== undefined) {
    serialized.layoutTemplate = config.layoutTemplate.name;
  }

  return serialized;
}

function serializeAsset(asset: Readonly<CompositionAsset>): SerializedAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    sourceType: asset.sourceType,
    ...(asset.ownerLayerId === undefined ? null : { ownerLayerId: asset.ownerLayerId }),
    ...(asset.source === undefined ? null : { source: asset.source }),
    ...(asset.label === undefined ? null : { label: asset.label }),
  };
}

function hydrateAssets(composition: Composition, assets: readonly SerializedAsset[]): void {
  for (const asset of [...composition.assets]) {
    composition.removeAsset(asset);
  }

  for (const asset of assets) {
    composition.registerAsset({
      id: asset.id,
      kind: asset.kind,
      sourceType: asset.sourceType,
      ...(asset.ownerLayerId === undefined ? null : { ownerLayerId: asset.ownerLayerId }),
      ...(asset.source === undefined ? null : { source: asset.source }),
      ...(asset.label === undefined ? null : { label: asset.label }),
    });
  }
}

function deserializeLayerConfig(
  layerPayload: SerializedLayer,
  layersById: ReadonlyMap<string, Layer>,
): LayerConfig {
  const base = layerPayload.config === undefined ? {} : { ...layerPayload.config };
  const parent = layerPayload.parentId === null ? null : layersById.get(layerPayload.parentId);
  if (layerPayload.parentId !== null && parent === undefined) {
    throw validationError('SERIALIZED_PARENT_MISSING', 'Serialized layer parent must appear before its child.', {
      value: layerPayload.parentId,
    });
  }

  return {
    ...base,
    ...(base.enhancedText === undefined ? null : { enhancedText: deserializeEnhancedTextConfig(base.enhancedText, layersById) }),
    name: layerPayload.name,
    transform: layerPayload.transform,
    visible: layerPayload.visible,
    locked: layerPayload.locked,
    opacity: layerPayload.opacity,
    ...(layerPayload.content === undefined ? null : { content: layerPayload.content }),
    ...(parent === null || parent === undefined ? null : { parent }),
  };
}

function deserializeEnhancedTextConfig(
  config: Readonly<SerializedEnhancedTextLayerConfig>,
  layersById: ReadonlyMap<string, Layer>,
): EnhancedTextLayerConfig {
  const { layoutTemplateLayerId, ...rest } = config;
  if (layoutTemplateLayerId === undefined) return rest;

  const layoutTemplate = layersById.get(layoutTemplateLayerId);
  if (layoutTemplate === undefined) {
    throw validationError('SERIALIZED_TEXT_TEMPLATE_MISSING', 'Serialized enhanced text layout template must appear before the text layer.', {
      value: layoutTemplateLayerId,
    });
  }

  return { ...rest, layoutTemplate };
}

function isLayerReference(template: Exclude<EnhancedTextLayerConfig['layoutTemplate'], undefined>): template is Layer {
  return typeof template === 'object' && template !== null && 'scrawlEntity' in template;
}

function assertSerializedComposition(value: unknown): asserts value is SerializedComposition {
  if (!isRecord(value)) {
    throw invalidSerializedComposition('root payload must be an object');
  }

  const composition = value['composition'];
  const layers = value['layers'];
  const timeline = value['timeline'];
  const assets = value['assets'];

  if (!isRecord(composition)) throw invalidSerializedComposition('composition must be an object');
  if (!Array.isArray(layers)) throw invalidSerializedComposition('layers must be an array');
  if (!isRecord(timeline)) throw invalidSerializedComposition('timeline must be an object');
  if (!Array.isArray(assets)) throw invalidSerializedComposition('assets must be an array');
}

function invalidSerializedComposition(reason: string): never {
  throw validationError(
    'INVALID_SERIALIZED_COMPOSITION',
    `Serialized composition is invalid: ${reason}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
