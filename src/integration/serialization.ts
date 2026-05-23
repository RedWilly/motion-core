import type { Composition, SerializedComposition } from '../shared/types';

type SerializedLayer = SerializedComposition['layers'][number];

function serializeLayer(layer: Composition['layers'][number]): SerializedLayer {
  const serialized: SerializedLayer = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    parentId: layer.parent?.id ?? null,
    zIndex: layer.zIndex,
    transform: layer.transform,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
  };

  if (layer.source !== undefined) serialized.source = layer.source;
  if (layer.content !== undefined) serialized.content = layer.content;

  const packet = layer.scrawlEntity.saveAsPacket?.();
  if (packet !== undefined) serialized.scrawlPacket = packet;

  return serialized;
}

export function serializeComposition(composition: Composition): string {
  const payload: SerializedComposition = {
    version: '0.1.0',
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
  };

  return JSON.stringify(payload);
}
