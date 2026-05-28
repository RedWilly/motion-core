import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core';
import {
  createMediabunnyVideoFrameBridge,
  type MediabunnyVideoFrameRuntime,
  type ScrawlRawAssetAdapter,
  type ScrawlVideoFrameModule,
} from './video-frames';

class FakeSample {
  readonly displayWidth = 320;
  readonly displayHeight = 180;
  readonly events: string[];

  constructor(events: string[]) {
    this.events = events;
  }

  draw(_context: CanvasRenderingContext2D, dx: number, dy: number, width?: number, height?: number): void {
    this.events.push(`draw:${dx}:${dy}:${width}:${height}`);
  }

  close(): void {
    this.events.push('sample-close');
  }
}

function createRuntime(events: string[]): MediabunnyVideoFrameRuntime {
  return {
    ALL_FORMATS: 'all-formats',
    BlobSource: class {
      constructor(_source: Blob) {
        events.push('blob-source');
      }
    },
    UrlSource: class {
      constructor(_source: string | URL | Request) {
        events.push('url-source');
      }
    },
    Input: class {
      constructor(_options: { source: unknown; formats: unknown }) {
        events.push('input');
      }

      async getPrimaryVideoTrack(): Promise<unknown> {
        events.push('track');
        return {};
      }

      dispose(): void {
        events.push('input-dispose');
      }
    },
    VideoSampleSink: class {
      constructor(_track: unknown) {
        events.push('sink');
      }

      async getSample(timestamp: number): Promise<FakeSample> {
        events.push(`sample:${timestamp}`);
        return new FakeSample(events);
      }
    },
  };
}

function createScrawl(events: string[]): { scrawl: ScrawlVideoFrameModule; assets: ScrawlRawAssetAdapter[] } {
  const assets: ScrawlRawAssetAdapter[] = [];

  return {
    assets,
    scrawl: {
      makeRawAsset(items) {
        const asset = {
          name: String(items['name']),
          element: { width: 0, height: 0 },
          engine: {
            clearRect(_x: number, _y: number, width: number, height: number) {
              events.push(`clear:${width}:${height}`);
            },
          },
          set(values: Readonly<Record<string, unknown>>) {
            this.data = values['data'];
            events.push('asset-set');
            return this;
          },
          kill() {
            events.push('asset-kill');
          },
          updateSource: items['updateSource'],
        } as ScrawlRawAssetAdapter & {
          updateSource: (asset: ScrawlRawAssetAdapter) => void;
        };
        assets.push(asset);
        return asset;
      },
    },
  };
}

describe('Mediabunny video frame bridge', () => {
  test('decodes a video sample into one reusable Scrawl RawAsset', async () => {
    const events: string[] = [];
    const { scrawl, assets } = createScrawl(events);
    const entitySets: Array<Readonly<Record<string, unknown>>> = [];
    const composition = createComposition(
      { width: 100, height: 100 },
      {
        entityFactories: {
          video: (context) => ({
            name: context.name,
            type: 'Picture',
            set(values) {
              entitySets.push({ ...values });
              return this;
            },
          }),
        },
      },
    );
    const layer = composition.addLayer('video', 'clip.mp4', {
      name: 'clip',
      video: { inPoint: 2, playbackRate: 2 },
    });

    const bridge = await createMediabunnyVideoFrameBridge(
      layer,
      new Blob(['video']),
      scrawl,
      { assetName: 'clip-frame' },
      async () => createRuntime(events),
    );
    await bridge.seek(0.5);
    (assets[0] as ScrawlRawAssetAdapter & { updateSource: (asset: ScrawlRawAssetAdapter) => void }).updateSource(assets[0]!);
    bridge.dispose();

    expect(layer.media).toBeUndefined();
    expect(bridge.getCurrentTime()).toBe(0.5);
    expect(assets[0]?.name).toBe('clip-frame');
    expect(assets[0]?.element.width).toBe(320);
    expect(assets[0]?.element.height).toBe(180);
    expect(entitySets.find((item) => item['asset'] !== undefined)?.['asset']).toBe(assets[0]);
    expect(events).toEqual([
      'blob-source',
      'input',
      'track',
      'sink',
      'sample:3',
      'asset-set',
      'clear:320:180',
      'draw:0:0:320:180',
      'sample-close',
      'asset-kill',
      'input-dispose',
    ]);
  });

  test('uses Mediabunny UrlSource for URL-backed video frame sources', async () => {
    const events: string[] = [];
    const { scrawl } = createScrawl(events);
    const composition = createComposition({ width: 100, height: 100 });
    const layer = composition.addLayer('video', 'clip.mp4');

    const bridge = await createMediabunnyVideoFrameBridge(
      layer,
      'clip.mp4',
      scrawl,
      {},
      async () => createRuntime(events),
    );
    bridge.dispose();

    expect(events[0]).toBe('url-source');
  });
});
