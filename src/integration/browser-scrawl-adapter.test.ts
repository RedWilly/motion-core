import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core/composition';
import { createBrowserScrawlAdapter, type ScrawlBrowserModule } from './browser-scrawl-adapter';

function createFakeScrawl() {
  const calls = {
    addCanvas: 0,
    makeRender: 0,
    renderFrame: 0,
    run: 0,
    halt: 0,
    renderKill: 0,
    buildCell: '',
    purge: '',
    currentCanvas: '',
    groupHost: '',
    entityNames: [] as string[],
  };

	  const canvas = {
    name: 'canvas-a',
    base: { name: 'canvas-a-base' },
    set() {
      return this;
    },
	    render() {
	      calls.renderFrame += 1;
	      return undefined;
	    },
	    buildCell(items: Readonly<Record<string, unknown>>) {
	      calls.buildCell = JSON.stringify(items);
	      return {
	        name: String(items['name']),
	        set() {
	          return this;
	        },
	      };
	    },
	  };

  const scrawl: ScrawlBrowserModule = {
    addCanvas() {
      calls.addCanvas += 1;
      return canvas;
    },
    findCanvas() {
      return undefined;
    },
    getCanvas() {
      return undefined;
    },
    makeRender() {
      calls.makeRender += 1;
      let running = false;
      return {
        run() {
          running = true;
          calls.run += 1;
        },
        halt() {
          running = false;
          calls.halt += 1;
        },
        isRunning() {
          return running;
        },
        kill() {
          calls.renderKill += 1;
        },
      };
    },
    purge(namespace) {
      calls.purge = namespace;
    },
    setCurrentCanvas(scrawlCanvas) {
      calls.currentCanvas = typeof scrawlCanvas === 'string' ? scrawlCanvas : scrawlCanvas.name;
    },
    makeGroup(items) {
      calls.groupHost = String(items['host']);
      return {
        name: String(items['name']),
        addArtefacts() {
          return this;
        },
        removeArtefacts() {
          return this;
        },
      };
    },
    makeFilter(items) {
      return {
        name: String(items['name']),
        type: 'Filter',
        set() {
          return this;
        },
        kill() {
          return undefined;
        },
      };
    },
	    makeBlock(items) {
	      calls.entityNames.push(String(items['name']));
	      return {
        name: String(items['name']),
        type: 'Block',
        set() {
          return this;
        },
        kill() {
          return undefined;
        },
      };
    },
    makeEmitter(items) {
      return this.makeBlock(items);
    },
    makeEnhancedLabel(items) {
      return this.makeBlock(items);
    },
    makeLabel(items) {
      return this.makeBlock(items);
    },
    makeNet(items) {
      return this.makeBlock(items);
    },
    makePicture(items) {
      return this.makeBlock(items);
    },
    makeRectangle(items) {
      return this.makeBlock(items);
    },
    makeShape(items) {
      return this.makeBlock(items);
    },
    makeTracer(items) {
      return this.makeBlock(items);
    },
    makeWheel(items) {
      return this.makeBlock(items);
    },
  };

  return { calls, scrawl };
}

describe('createBrowserScrawlAdapter', () => {
  test('binds canvas, renderer, entity factories, and cleanup under one namespace', () => {
    const { calls, scrawl } = createFakeScrawl();
    const htmlCanvas = { id: 'canvas-a' } as HTMLCanvasElement;
    const adapter = createBrowserScrawlAdapter(scrawl, {
      canvas: htmlCanvas,
      namespace: 'spec',
      fit: 'contain',
    });
    const composition = createComposition({ width: 100, height: 100, name: 'main' }, adapter);

    composition.addLayer('shape', undefined, { name: 'box' });
    composition.addPrecomposition(createComposition({ width: 20, height: 10, name: 'child' }), { name: 'nested' });
    composition.play();
    composition.seek(0);
    composition.pause();
    adapter.dispose();

    expect(calls.addCanvas).toBe(1);
    expect(calls.currentCanvas).toBe('canvas-a');
    expect(calls.groupHost).toBe('canvas-a-base');
    expect(calls.makeRender).toBe(1);
    expect(calls.entityNames).toEqual(['spec-box', 'spec-nested']);
    expect(calls.buildCell).toContain('"name":"spec-nested-cell"');
    expect(calls.buildCell).toContain('"dimensions":[20,10]');
    expect(calls.run).toBe(1);
    expect(calls.halt).toBe(1);
    expect(calls.renderFrame).toBe(1);
    expect(calls.renderKill).toBe(1);
    expect(calls.purge).toBe('spec');
  });
});
