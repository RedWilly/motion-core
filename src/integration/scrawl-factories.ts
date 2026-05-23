import type {
  LayerEntityFactory,
  LayerEntityFactoryContext,
  LayerType,
  ScrawlEntityAdapter,
  ScrawlGroupAdapter,
} from '../shared/types';

type ScrawlFactory = (items: Record<string, unknown>) => ScrawlEntityAdapter;

export interface ScrawlFactoryModule {
  makeBlock: ScrawlFactory;
  makeEmitter: ScrawlFactory;
  makeGroup: (items: Record<string, unknown>) => ScrawlGroupAdapter;
  makeLabel: ScrawlFactory;
  makeNet: ScrawlFactory;
  makePicture: ScrawlFactory;
  makeTracer: ScrawlFactory;
}

function baseEntityConfig(context: LayerEntityFactoryContext): Record<string, unknown> {
  return {
    name: context.name,
    group: context.group,
    ...(context.config.scrawl ?? null),
  };
}

function pictureFactory(scrawl: ScrawlFactoryModule, assetKey: 'imageSource' | 'videoSource'): LayerEntityFactory {
  return (context) =>
    scrawl.makePicture({
      ...baseEntityConfig(context),
      [assetKey]: context.source,
      copyMethod: context.config.scaleMode ?? 'fit',
    });
}

function particleFactory(scrawl: ScrawlFactoryModule): LayerEntityFactory {
  return (context) => {
    const variant = context.config.variant ?? 'emitter';
    const config = baseEntityConfig(context);

    if (variant === 'net') return scrawl.makeNet(config);
    if (variant === 'tracer') return scrawl.makeTracer(config);
    return scrawl.makeEmitter(config);
  };
}

export function createScrawlEntityFactories(
  scrawl: ScrawlFactoryModule,
): Partial<Record<LayerType, LayerEntityFactory>> {
  return {
    image: pictureFactory(scrawl, 'imageSource'),
    video: pictureFactory(scrawl, 'videoSource'),
    svg: pictureFactory(scrawl, 'imageSource'),
    shape: (context) => scrawl.makeBlock(baseEntityConfig(context)),
    text: (context) =>
      scrawl.makeLabel({
        ...baseEntityConfig(context),
        text: context.config.text ?? '',
      }),
    particle: particleFactory(scrawl),
    precomp: (context) => scrawl.makePicture(baseEntityConfig(context)),
  };
}

export function createScrawlGroupFactory(scrawl: ScrawlFactoryModule) {
  return (compositionName: string): ScrawlGroupAdapter =>
    scrawl.makeGroup({ name: `${compositionName}-main-group` });
}
