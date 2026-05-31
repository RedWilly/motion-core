import type {
  CompositionAssetKind,
  CompositionAssetSourceType,
  EnhancedTextLayerConfig,
  LayerConfig,
  LayerType,
  Transform,
} from './project';

export interface SerializedComposition {
  version: string;
  composition: {
    id: string;
    name: string;
    width: number;
    height: number;
    duration: number;
    frameRate: number;
    backgroundColor: string;
  };
  layers: Array<{
    id: string;
    type: LayerType;
    name: string;
    parentId: string | null;
    zIndex: number;
    config?: SerializedLayerConfig;
    scrawlEntityName: string;
    source?: string;
    content?: unknown;
    transform: Transform;
    visible: boolean;
    locked: boolean;
    opacity: number;
    scrawlPacket?: string;
  }>;
  timeline: {
    time: number;
    duration: number;
  };
  assets: SerializedAsset[];
}

export type SerializedLayerConfig = Omit<
  LayerConfig,
  'content' | 'enhancedText' | 'locked' | 'name' | 'opacity' | 'parent' | 'precomp' | 'transform' | 'visible'
> & {
  enhancedText?: SerializedEnhancedTextLayerConfig;
};

export type SerializedEnhancedTextLayerConfig = Omit<EnhancedTextLayerConfig, 'layoutTemplate'> & {
  readonly layoutTemplate?: string;
  readonly layoutTemplateLayerId?: string;
};

export interface SerializedAsset {
  id: string;
  kind: CompositionAssetKind;
  sourceType: CompositionAssetSourceType;
  ownerLayerId?: string;
  source?: string;
  label?: string;
}
