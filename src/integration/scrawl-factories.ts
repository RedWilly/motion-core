import type {
  EnhancedTextLayerConfig,
  Layer,
  LayerEntityFactory,
  LayerEntityFactoryContext,
  LayerType,
  ScrawlEntityAdapter,
  ScrawlFilterAdapter,
  ScrawlGroupAdapter,
  ScrawlStyleAdapter,
} from '../shared/types';

type ScrawlFactory = (items: Record<string, unknown>) => ScrawlEntityAdapter;

export interface ScrawlFactoryModule {
  makeBlock: ScrawlFactory;
  makeConicGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makeEmitter: ScrawlFactory;
  makeEnhancedLabel: ScrawlFactory;
  makeFilter?: (items: Record<string, unknown>) => ScrawlFilterAdapter;
  makeGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makeGroup: (items: Record<string, unknown>) => ScrawlGroupAdapter;
  makeLabel: ScrawlFactory;
  makeNet: ScrawlFactory;
  makePattern?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
  makePicture: ScrawlFactory;
  makeRadialGradient?: (items: Record<string, unknown>) => ScrawlStyleAdapter;
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
    if (config?.fill !== undefined || config?.stroke !== undefined) {
      return createCompositeShape(scrawl, context);
    }

    const base = {
      ...baseEntityConfig(context),
      width: config?.width,
      height: config?.height,
      radius: config?.radius,
      pathDefinition: config?.path,
      fillStyle: config?.fillStyle,
      strokeStyle: config?.strokeStyle,
      lineWidth: config?.lineWidth,
      method: config?.method ?? initialShapeMethod(config),
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

function createCompositeShape(scrawl: ScrawlFactoryModule, context: LayerEntityFactoryContext): ScrawlEntityAdapter {
  const fill = createShapePart(scrawl, context, 'fill');
  const stroke = createShapePart(scrawl, context, 'stroke');

  return {
    name: context.name,
    type: 'CompositeShape',
    parts: { fill, stroke },
    set(values) {
      fill.set(values);
      stroke.set(values);
      return this;
    },
    addFilters(...filters) {
      fill.addFilters?.(...filters);
      stroke.addFilters?.(...filters);
      return this;
    },
    removeFilters(...filters) {
      fill.removeFilters?.(...filters);
      stroke.removeFilters?.(...filters);
      return this;
    },
    clearFilters() {
      fill.clearFilters?.();
      stroke.clearFilters?.();
      return this;
    },
    kill() {
      fill.kill?.();
      stroke.kill?.();
    },
    saveAsPacket(options) {
      const fillPacket = fill.saveAsPacket?.(options);
      const strokePacket = stroke.saveAsPacket?.(options);
      return JSON.stringify({
        type: 'CompositeShape',
        name: context.name,
        fill: fillPacket,
        stroke: strokePacket,
      });
    },
  };
}

function createShapePart(
  scrawl: ScrawlFactoryModule,
  context: LayerEntityFactoryContext,
  part: 'fill' | 'stroke',
): ScrawlEntityAdapter {
  const config = context.config.shape;
  const fillConfig = config?.fill;
  const strokeConfig = config?.stroke;
  const base = {
    ...baseEntityConfig(context),
    name: `${context.name}-${part}`,
    width: config?.width,
    height: config?.height,
    radius: config?.radius,
    pathDefinition: config?.path,
    fillStyle: part === 'fill' ? resolvePaintStyle(fillConfig?.style) ?? fillConfig?.color ?? config?.fillStyle : 'transparent',
    strokeStyle: part === 'stroke' ? resolvePaintStyle(strokeConfig?.style) ?? strokeConfig?.color ?? config?.strokeStyle : 'transparent',
    lineWidth: part === 'stroke' ? strokeConfig?.width ?? config?.lineWidth ?? 1 : 0,
    globalAlpha: part === 'fill' ? fillConfig?.opacity ?? 1 : strokeConfig?.opacity ?? 0,
    method: part === 'fill' ? 'fill' : 'draw',
    order: part === 'fill' ? 0 : 1,
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
}

function resolvePaintStyle(style: unknown): unknown {
  return typeof style === 'object' && style !== null && 'style' in style
    ? (style as { readonly style: unknown }).style
    : style;
}

function textFactory(scrawl: ScrawlFactoryModule): LayerEntityFactory {
  return (context) => {
    const config = context.config.enhancedText;
    const enhanced = context.config.textMode === 'enhanced' || config !== undefined;
    const base = {
      ...baseEntityConfig(context),
      text: context.config.text ?? '',
      ...(enhanced && config !== undefined ? enhancedTextConfig(config) : null),
    };

    return enhanced ? scrawl.makeEnhancedLabel(base) : scrawl.makeLabel(base);
  };
}

function enhancedTextConfig(config: EnhancedTextLayerConfig): Record<string, unknown> {
  return {
    ...(config.fontString === undefined ? null : { fontString: config.fontString }),
    ...(config.fillStyle === undefined ? null : { fillStyle: resolvePaintStyle(config.fillStyle) }),
    ...(config.strokeStyle === undefined ? null : { strokeStyle: resolvePaintStyle(config.strokeStyle) }),
    ...(config.lineWidth === undefined ? null : { lineWidth: config.lineWidth }),
    ...(config.method === undefined ? null : { method: config.method }),
    ...(config.layoutTemplate === undefined ? null : { layoutTemplate: resolveLayoutTemplate(config.layoutTemplate) }),
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
}

function resolveLayoutTemplate(template: EnhancedTextLayerConfig['layoutTemplate']): unknown {
  if (typeof template === 'string') return template;
  if (template === undefined) return undefined;
  if (isLayerReference(template)) {
    return template.scrawlEntity.parts?.fill ?? template.scrawlEntity.parts?.stroke ?? template.scrawlEntity;
  }
  return template;
}

function isLayerReference(template: Exclude<EnhancedTextLayerConfig['layoutTemplate'], undefined>): template is Layer {
  return typeof template === 'object' && template !== null && 'scrawlEntity' in template;
}

function initialShapeMethod(config: LayerEntityFactoryContext['config']['shape']): string {
  if (config?.stroke !== undefined || config?.strokeStyle !== undefined || config?.lineWidth !== undefined) {
    return 'fillThenDraw';
  }
  return 'fill';
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
    text: (context) => textFactory(scrawl)(wrapContext(context)),
    particle: (context) => particleFactory(scrawl)(wrapContext(context)),
    precomp: (context) => scrawl.makePicture(baseEntityConfig(wrapContext(context))),
  };
}
