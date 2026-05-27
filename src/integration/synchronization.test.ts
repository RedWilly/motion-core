import { describe, expect, test } from 'bun:test';
import { createComposition } from '../core/composition';
import { createTimelineSynchronizer, syncToTimelineTime, type MediaSyncTarget } from './synchronization';

function createMediaTarget(name: string, seekOffset = 0) {
  const events: string[] = [];
  let currentTime = 0;
  const target: MediaSyncTarget = {
    kind: 'video',
    name,
    getCurrentTime() {
      return currentTime;
    },
    async seek(time: number) {
      currentTime = time + seekOffset;
      events.push(`seek:${time}`);
    },
    play() {
      events.push('play');
    },
    pause() {
      events.push('pause');
    },
  };

  return { events, target };
}

describe('TimelineSynchronizer', () => {
  test('coordinates play and pause across timeline, renderer, and media', () => {
    const composition = createComposition({ width: 100, height: 100 });
    const { events, target } = createMediaTarget('video');
    const sync = createTimelineSynchronizer(composition);

    sync.addMedia(target);
    sync.play();
    sync.pause();

    expect(events).toEqual(['play', 'pause']);
  });

  test('delegates live playback control to the composition API', () => {
    const calls: string[] = [];
    const composition = createComposition({ width: 100, height: 100 });
    composition.play = () => {
      calls.push('composition-play');
    };
    composition.pause = () => {
      calls.push('composition-pause');
    };
    const sync = createTimelineSynchronizer(composition);

    sync.play();
    sync.pause();

    expect(calls).toEqual(['composition-play', 'composition-pause']);
  });

  test('seeks timeline, media, layers, and renderer to one time source', async () => {
    const composition = createComposition({ width: 100, height: 100, duration: 5 });
    const layer = composition.addLayer('shape', {
      transform: { position: { x: 10, y: 20 } },
    });
    const setCalls: Array<Readonly<Record<string, unknown>>> = [];
    layer.scrawlEntity.set = (values) => {
      setCalls.push({ ...values });
      return layer.scrawlEntity;
    };
    const { events, target } = createMediaTarget('video');
    const sync = createTimelineSynchronizer(composition);

    sync.addMedia(target);
    await sync.seek(2);

    expect(composition.timeline.time()).toBe(2);
    expect(events).toEqual(['seek:2']);
    expect(setCalls.at(-1)?.['startX']).toBe(10);
  });

  test('emits desync only when media exceeds one frame tolerance', async () => {
    const composition = createComposition({ width: 100, height: 100, frameRate: 30 });
    const warnings: string[] = [];
    const withinTolerance = createMediaTarget('within', 1 / 60);
    const outsideTolerance = createMediaTarget('outside', 1 / 15);
    const sync = createTimelineSynchronizer(composition, {
      onDesync: ({ target }) => warnings.push(target.name),
    });

    sync.addMedia(withinTolerance.target);
    sync.addMedia(outsideTolerance.target);
    await sync.seek(1);

    expect(warnings).toEqual(['outside']);
  });

  test('removes media targets without leaving stale sync work', async () => {
    const composition = createComposition({ width: 100, height: 100 });
    const { events, target } = createMediaTarget('video');
    const sync = createTimelineSynchronizer(composition);

    sync.addMedia(target);
    sync.removeMedia(target);
    await sync.seek(1);

    expect(events).toEqual([]);
  });

  test('skips media seeks already within one frame tolerance', async () => {
    const composition = createComposition({ width: 100, height: 100, frameRate: 30 });
    const { events, target } = createMediaTarget('video');
    const sync = createTimelineSynchronizer(composition);

    sync.addMedia(target);
    await sync.seek(1 / 60);

    expect(events).toEqual([]);
  });

  test('runs render hooks after media seek and before rendering', async () => {
    const order: string[] = [];
    const composition = createComposition(
      { width: 100, height: 100, frameRate: 30 },
      {
        createRenderer() {
          return {
            play() {},
            pause() {},
            renderFrame() {
              order.push('render');
            },
          };
        },
      },
    );
    const target: MediaSyncTarget = {
      kind: 'video',
      name: 'video',
      getCurrentTime: () => 0,
      async seek() {
        order.push('media');
      },
    };
    const sync = createTimelineSynchronizer(composition, {
      hooks: [{ beforeRender: (time) => order.push(`hook:${time}`) }],
    });

    sync.addMedia(target);
    await sync.seek(1);

    expect(order).toEqual(['media', 'hook:1', 'render']);
  });

  test('syncToTimelineTime also runs hooks before frame render', async () => {
    const order: string[] = [];
    const composition = createComposition(
      { width: 100, height: 100, frameRate: 30 },
      {
        createRenderer() {
          return {
            play() {},
            pause() {},
            renderFrame() {
              order.push('render');
            },
          };
        },
      },
    );

    await syncToTimelineTime(composition, 0.5, {
      frameRate: 30,
      hooks: [{ beforeRender: (time) => order.push(`hook:${time}`) }],
    });

    expect(order).toEqual(['hook:0.5', 'render']);
  });
});
