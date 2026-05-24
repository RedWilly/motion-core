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
  makeEnhancedLabel: ScrawlFactory;
  makeGroup: (items: Record<string, unknown>) => ScrawlGroupAdapter;
  makeLabel: ScrawlFactory;
  makeNet: ScrawlFactory;
  makePicture: ScrawlFactory;
  makeRectangle: ScrawlFactory;
  makeShape: ScrawlFactory;
  makeTracer: ScrawlFactory;
  makeWheel: ScrawlFactory;
}

export interface ScrawlEntityFactoryOptions {
  namespace?: string;
}

function namespacedName(namespace: string | undefined, name: string): string {
  if (!namespace || name.startsWith(`${namespace}-`)) return name;
  return `${namespace}-${name}`;
}

function baseEntityConfig(context: LayerEntityFactoryContext): Record<string, unknown> {
  return {
    name: context.name,
    group: context.group,
    ...(context.config.scrawl ?? null),
  };
}

function shapeFactory(scrawl: ScrawlFactoryModule): LayerEntityFactory {
  return (context) => {
    const config = context.config.shape;
    const base = {
      ...baseEntityConfig(context),
      width: config?.width,
      height: config?.height,
      radius: config?.radius,
      pathDefinition: config?.path,
      fillStyle: config?.fillStyle,
      strokeStyle: config?.strokeStyle,
      method: config?.method ?? 'fill',
    };

    switch (config?.kind ?? 'block') {
      case 'wheel':
        return scrawl.makeWheel(base);
      case 'rectangle':
        return scrawl.makeRectangle(base);
      case 'shape':
        return scrawl.makeShape(base);
      case 'block':
        return scrawl.makeBlock(base);
    }
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
  options: ScrawlEntityFactoryOptions = {},
): Partial<Record<LayerType, LayerEntityFactory>> {
  const wrapContext = (context: LayerEntityFactoryContext): LayerEntityFactoryContext => {
    const name = namespacedName(options.namespace, context.name);
    return name === context.name ? context : { ...context, name };
  };

  return {
    image: (context) => pictureFactory(scrawl, 'imageSource')(wrapContext(context)),
    video: (context) => pictureFactory(scrawl, 'videoSource')(wrapContext(context)),
    svg: (context) => pictureFactory(scrawl, 'imageSource')(wrapContext(context)),
    shape: (context) => shapeFactory(scrawl)(wrapContext(context)),
    text: (context) =>
      (context.config.textMode === 'enhanced' ? scrawl.makeEnhancedLabel : scrawl.makeLabel)({
          ...baseEntityConfig(wrapContext(context)),
          text: context.config.text ?? '',
        }),
    particle: (context) => particleFactory(scrawl)(wrapContext(context)),
    precomp: (context) => scrawl.makePicture(baseEntityConfig(wrapContext(context))),
  };
}

export function createScrawlGroupFactory(scrawl: ScrawlFactoryModule, options: ScrawlEntityFactoryOptions = {}) {
  return (compositionName: string): ScrawlGroupAdapter =>
    scrawl.makeGroup({ name: namespacedName(options.namespace, `${compositionName}-main-group`) });
}
