import { capabilityError } from '../shared/errors';
import type {
  CompositionRuntime,
  EngineAdapters,
  RenderAdapter,
  ScrawlCellAdapter,
  ScrawlGroupAdapter,
} from '../shared/types';
import {
  createScrawlEntityFactories,
  type ScrawlFactoryModule,
} from './scrawl-factories';
import { createScrawlEffectsController } from './effects';

type CanvasFit = 'none' | 'contain' | 'cover' | 'fill';

interface ScrawlCanvasAdapter {
  readonly name: string;
  readonly base?: { readonly name: string };
  readonly element?: HTMLCanvasElement;
  buildCell?(items: Readonly<Record<string, unknown>>): ScrawlCellAdapter;
  set(values: Readonly<Record<string, unknown>>): unknown;
  render(): unknown;
}

interface ScrawlRenderAdapter {
  run(): unknown;
  halt(): unknown;
  isRunning(): boolean;
  kill?(): unknown;
}

export interface ScrawlBrowserModule extends ScrawlFactoryModule {
  addCanvas(items?: Readonly<Record<string, unknown>>): ScrawlCanvasAdapter;
  findCanvas(name: string): ScrawlCanvasAdapter | undefined;
  getCanvas(name: string): ScrawlCanvasAdapter | undefined;
  importPacket?(packet: string): unknown;
  makeRender(items: Readonly<Record<string, unknown>>): ScrawlRenderAdapter;
  purge(namespace: string): void;
  setCurrentCanvas?(canvas: ScrawlCanvasAdapter | string): void;
}

export interface BrowserScrawlAdapterOptions {
  canvas: HTMLCanvasElement | string;
  namespace?: string;
  fit?: CanvasFit;
  backgroundColor?: string;
  title?: string;
  label?: string;
  description?: string;
}

export interface BrowserScrawlAdapter extends EngineAdapters {
  readonly namespace: string;
  readonly canvas: ScrawlCanvasAdapter;
  renderFrame(): void;
  dispose(): void;
}

class BrowserScrawlRenderer implements RenderAdapter {
  private readonly canvas: ScrawlCanvasAdapter;
  private readonly element: HTMLCanvasElement;
  private readonly render: ScrawlRenderAdapter;

  constructor(canvas: ScrawlCanvasAdapter, element: HTMLCanvasElement, render: ScrawlRenderAdapter) {
    this.canvas = canvas;
    this.element = element;
    this.render = render;
  }

  play(): void {
    if (!this.render.isRunning()) this.render.run();
  }

  pause(): void {
    if (this.render.isRunning()) this.render.halt();
  }

  renderFrame(): void {
    this.canvas.render();
  }

  async captureFrame(options: Readonly<{ mimeType: string; quality?: number }>): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.element.toBlob(
        (blob) => {
          if (blob === null) {
            reject(capabilityError('CANVAS_CAPTURE_FAILED', 'Canvas did not produce a frame blob.'));
            return;
          }

          resolve(blob);
        },
        options.mimeType,
        options.quality,
      );
    });
  }

  getFrameCanvas(): HTMLCanvasElement {
    return this.element;
  }

  kill(): void {
    this.render.kill?.();
  }
}

function requireCanvasElement(canvas: HTMLCanvasElement | string): HTMLCanvasElement {
  if (typeof canvas !== 'string') return canvas;

  const element = globalThis.document?.getElementById(canvas);
  if (element instanceof HTMLCanvasElement) return element;

  throw capabilityError(
    'SCROLL_CANVAS_ELEMENT_MISSING',
    `Unable to find canvas element "${canvas}".`,
    'Pass an existing HTMLCanvasElement or an id for a canvas already in the document.',
  );
}

function resolveScrawlCanvas(
  scrawl: ScrawlBrowserModule,
  canvasInput: HTMLCanvasElement | string,
  namespace: string,
  options: BrowserScrawlAdapterOptions,
): ScrawlCanvasAdapter {
  const element = requireCanvasElement(canvasInput);
  if (!element.id) element.id = `${namespace}-canvas`;

  const existing = scrawl.findCanvas(element.id) ?? scrawl.getCanvas(element.id);
  if (existing) return existing;

  return scrawl.addCanvas({
    name: element.id,
    element,
    fit: options.fit ?? 'contain',
    backgroundColor: options.backgroundColor,
    title: options.title,
    label: options.label,
    description: options.description,
  });
}

function createGroupFactory(
  scrawl: ScrawlBrowserModule,
  canvas: ScrawlCanvasAdapter,
  namespace: string,
) {
  return (compositionName: string): ScrawlGroupAdapter => {
    const groupName = `${namespace}-${compositionName}-main-group`;
    const host = canvas.base?.name ?? canvas.name;
    return scrawl.makeGroup({ name: groupName, host });
  };
}

export function createBrowserScrawlAdapter(
  scrawl: ScrawlBrowserModule,
  options: BrowserScrawlAdapterOptions,
): BrowserScrawlAdapter {
  const namespace = options.namespace ?? 'motion';
  const element = requireCanvasElement(options.canvas);
  const canvas = resolveScrawlCanvas(scrawl, element, namespace, options);
  scrawl.setCurrentCanvas?.(canvas);

  let renderer: BrowserScrawlRenderer | undefined;

  return {
    namespace,
    canvas,
    entityFactories: createScrawlEntityFactories(scrawl, { namespace }),
    importScrawlPacket(packet: string): unknown {
      return scrawl.importPacket?.(packet);
    },
    createGroup: createGroupFactory(scrawl, canvas, namespace),
    createPrecompositionCell(context) {
      if (!canvas.buildCell) {
        throw capabilityError(
          'SCRAWL_CELL_FACTORY_MISSING',
          'Scrawl canvas does not expose buildCell().',
          'Use a Scrawl-canvas Canvas artefact capable of creating layer Cells.',
        );
      }

      return canvas.buildCell({
        name: `${namespace}-${context.layerName}-cell`,
        dimensions: [context.composition.width, context.composition.height],
        shown: false,
        compiled: true,
        cleared: true,
        setRelativeDimensionsUsingBase: false,
      });
    },
    createLayerMaskCell(context) {
      if (!canvas.buildCell) {
        throw capabilityError(
          'SCRAWL_CELL_FACTORY_MISSING',
          'Scrawl canvas does not expose buildCell().',
          'Use a Scrawl-canvas Canvas artefact capable of creating layer Cells.',
        );
      }

      return canvas.buildCell({
        name: `${namespace}-${context.targetLayer.name}-mask-cell`,
        dimensions: [context.composition.width, context.composition.height],
        shown: true,
        compiled: true,
        cleared: true,
        compileOrder: context.targetLayer.zIndex,
        showOrder: context.targetLayer.zIndex,
        setRelativeDimensionsUsingBase: false,
      });
    },
    createEffectsController() {
      return createScrawlEffectsController(scrawl, { namespace });
    },
    createRenderer(composition: CompositionRuntime): RenderAdapter {
      const render = scrawl.makeRender({
        name: `${namespace}-${composition.name}-render`,
        target: canvas.name,
        maxFrameRate: 0,
      });
      renderer = new BrowserScrawlRenderer(canvas, element, render);
      return renderer;
    },
    renderFrame(): void {
      canvas.render();
    },
    dispose(): void {
      renderer?.kill();
      scrawl.purge(namespace);
    },
  };
}

export async function loadBrowserScrawlAdapter(
  options: BrowserScrawlAdapterOptions,
): Promise<BrowserScrawlAdapter> {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') {
    throw capabilityError(
      'BROWSER_REQUIRED',
      'Scrawl-canvas browser adapter requires a DOM window and document.',
    );
  }

  const scrawl = (await import('scrawl-canvas')) as unknown as ScrawlBrowserModule;
  return createBrowserScrawlAdapter(scrawl, options);
}
