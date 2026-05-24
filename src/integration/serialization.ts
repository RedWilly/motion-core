import { validationError } from '../shared/errors';
import type {
  Composition,
  CompositionConfig,
  EngineAdapters,
  Layer,
  LayerConfig,
  SerializedAsset,
  SerializedComposition,
  SerializedLayerConfig,
} from '../shared/types';

type SerializedLayer = SerializedComposition['layers'][number];

const serializationVersion = '0.2.0';

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
  const config = serializeLayerConfig(layer.config);
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
    assets: serializeAssets(composition.layers),
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

  composition.timeline.duration(payload.timeline.duration);
  composition.seek(payload.timeline.time);

  return composition;
}

function serializeLayerConfig(config: Readonly<LayerConfig>): SerializedLayerConfig {
  const serialized: SerializedLayerConfig = {};

  if (config.scaleMode !== undefined) serialized.scaleMode = config.scaleMode;
  if (config.shape !== undefined) serialized.shape = config.shape;
  if (config.video !== undefined) serialized.video = config.video;
  if (config.audio !== undefined) serialized.audio = config.audio;
  if (config.scrawl !== undefined) serialized.scrawl = config.scrawl;
  if (config.textMode !== undefined) serialized.textMode = config.textMode;
  if (config.text !== undefined) serialized.text = config.text;
  if (config.variant !== undefined) serialized.variant = config.variant;
  if (config.effects !== undefined) serialized.effects = config.effects;
  if (config.mask !== undefined) serialized.mask = config.mask;

  return serialized;
}

function serializeAssets(layers: ReadonlyArray<Layer>): SerializedAsset[] {
  const assets: SerializedAsset[] = [];

  for (const layer of layers) {
    if (layer.source === undefined) continue;
    assets.push({
      id: `${layer.id}:source`,
      layerId: layer.id,
      type: layer.type,
      source: layer.source,
    });
  }

  return assets;
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
    name: layerPayload.name,
    transform: layerPayload.transform,
    visible: layerPayload.visible,
    locked: layerPayload.locked,
    opacity: layerPayload.opacity,
    ...(layerPayload.content === undefined ? null : { content: layerPayload.content }),
    ...(parent === null || parent === undefined ? null : { parent }),
  };
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
