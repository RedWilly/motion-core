import type { Composition, SerializedComposition } from '../shared/types';

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
    layers: composition.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      name: layer.name,
      parentId: layer.parent?.id ?? null,
      zIndex: layer.zIndex,
      source: layer.source,
      content: layer.content,
      transform: layer.transform,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      scrawlPacket: layer.scrawlEntity.saveAsPacket?.(),
    })),
  };

  return JSON.stringify(payload);
}
