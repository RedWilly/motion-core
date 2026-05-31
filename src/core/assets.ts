import type { CompositionAsset, CompositionAssetKind, Layer, LayerType } from '../shared/project';

export class AssetRegistry {
  readonly items: CompositionAsset[] = [];

  register(asset: CompositionAsset): CompositionAsset {
    const existingIndex = this.items.findIndex((item) => item.id === asset.id);
    if (existingIndex >= 0) {
      this.items[existingIndex]?.dispose?.();
      this.items[existingIndex] = asset;
      return asset;
    }

    this.items.push(asset);
    return asset;
  }

  remove(assetOrId: CompositionAsset | string): void {
    const id = typeof assetOrId === 'string' ? assetOrId : assetOrId.id;
    const index = this.items.findIndex((asset) => asset.id === id);
    if (index < 0) return;

    const [asset] = this.items.splice(index, 1);
    asset?.dispose?.();
  }

  registerLayerSource(layer: Layer): void {
    const kind = sourceAssetKind(layer.type);
    if (kind === undefined || layer.source === undefined) return;

    this.register({
      id: `${layer.id}:source`,
      kind,
      sourceType: 'url',
      ownerLayerId: layer.id,
      source: layer.source,
      label: layer.name,
    });
  }

  removeOwnedByLayer(layer: Layer): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const asset = this.items[index];
      if (asset?.ownerLayerId === layer.id) this.remove(asset);
    }
  }
}

function sourceAssetKind(type: LayerType): CompositionAssetKind | undefined {
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'svg') return type;
  return undefined;
}
