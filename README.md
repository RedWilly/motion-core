motion-core is a small TypeScript engine for building 2D motion work in the browser.

It sits between three libraries:

- Scrawl-canvas draws things, owns the canvas scene, and handles Cells, Groups, entities, filters, styles, and render cycles.
- GSAP owns timeline movement, easing, and choreography.
- Mediabunny owns media metadata, decoding, frame/audio access, and export plumbing.

This package is the part that keeps those jobs lined up. It gives you a typed composition model, layers, animation state, effects, masks, media sync, serialization, and export helpers without asking app code to glue every library together by hand.

The package has one public import path:

```ts
import { createComposition } from 'motion-core';
```

The source code is split into folders, but package users should import from `motion-core` only. That keeps the public API small while the internals can keep changing as the engine gets better.

## Install

```bash
bun install
```

The browser/runtime libraries are peer dependencies:

```json
{
  "gsap": "^3.15.0",
  "mediabunny": "^1.44.0",
  "scrawl-canvas": "^8.19.0"
}
```

## Check The Project

```bash
bun run typecheck
bun test
bun run build
```

## A Small Composition

For browser preview, start with a real canvas and the Scrawl adapter.

```ts
import {
  createComposition,
  loadBrowserScrawlAdapter,
} from 'motion-core';

const adapters = await loadBrowserScrawlAdapter({
  canvas: 'preview-canvas',
  namespace: 'demo',
  fit: 'contain',
  backgroundColor: '#101114',
});

const composition = createComposition(
  {
    name: 'main',
    width: 1920,
    height: 1080,
    duration: 8,
    frameRate: 60,
    backgroundColor: '#101114',
  },
  adapters,
);

const title = composition.addText('Motion', {
  name: 'title',
  transform: {
    position: { x: 960, y: 540 },
    anchor: { x: 0.5, y: 0.5 },
  },
});

composition.seek(0);
composition.play();
```

Layer helpers are the normal way to add content:

```ts
composition.addShape({ name: 'background' });
composition.addText('Caption', { name: 'caption' });
composition.addImage('/assets/plate.png', { name: 'plate' });
composition.addVideo('/assets/clip.mp4', { name: 'clip' });
composition.addAudio('/assets/voice.wav', { name: 'voice' });
composition.addSvg('/assets/logo.svg', { name: 'logo' });
```

`addLayer` still exists for dynamic code, but most app code should use the typed helpers.

## Playback

The public controls are simple:

```ts
composition.play();
composition.pause();
composition.seek(2.5);
```

Internally, `composition.syncFrame()` is the single frame-state path. It updates the timeline, Scrawl layer state, precomposition Cells, and motion targets. It does not render and it does not seek media by itself.

That separation matters. It keeps preview, seeking, export, effects, masks, and precompositions from each inventing their own frame logic.

## Animation

Use the animation controller for keyframes and expressions. GSAP stays responsible for interpolation; the engine syncs the resulting values into Scrawl.

```ts
import {
  createAnimationController,
  createComposition,
} from 'motion-core';

const composition = createComposition({
  width: 1280,
  height: 720,
  duration: 5,
});

const layer = composition.addShape({
  name: 'box',
  transform: {
    position: { x: 100, y: 120 },
  },
});

const animation = createAnimationController(composition);

animation.addKeyframe(layer, 'position.x', 0, 100);
animation.addKeyframe(layer, 'position.x', 2, 900, {
  easing: 'power2.inOut',
});

composition.seek(1);
```

For browser preview with GSAP, give the composition a GSAP timeline factory:

```ts
import {
  createComposition,
  createGsapTimelineFactory,
  loadBrowserScrawlAdapter,
} from 'motion-core';
import { gsap } from 'gsap';

const adapters = await loadBrowserScrawlAdapter({
  canvas: 'preview-canvas',
});

adapters.createTimeline = createGsapTimelineFactory(gsap);

const composition = createComposition({
  width: 1280,
  height: 720,
  duration: 5,
}, adapters);
```

## Effects

Effects are Scrawl filters. The engine uses Scrawl's modern `actions` filter format.

The preset helpers return plain `EffectConfig` objects:

```ts
import {
  blur,
  brightness,
  createComposition,
  pixelate,
  threshold,
  tint,
} from 'motion-core';

const composition = createComposition({ width: 1280, height: 720 });

const image = composition.addImage('/assets/plate.png', {
  name: 'plate',
  effects: [
    blur({ id: 'soften', radius: 3 }),
    brightness({ id: 'lift', level: 1.1, opacity: 0.8 }),
  ],
});

composition.addEffect(image, threshold({
  id: 'matte-threshold',
  level: 120,
  high: [255, 255, 255, 255],
  low: [0, 0, 0, 0],
}));

composition.addEffect(image, tint({
  id: 'cool-tint',
  blueInBlue: 1,
  greenInBlue: 0.25,
}));

composition.addEffect(image, pixelate({
  id: 'blocks',
  tileWidth: 12,
  tileHeight: 12,
}));
```

Effects can also be animated because their numeric action values are stable motion targets:

```ts
const blurEffect = composition.addEffect(image, blur({
  id: 'animated-blur',
  radius: 0,
}));

composition.timeline.to?.(blurEffect.values, {
  radius: 12,
  duration: 0.5,
}, 1.2);
```

Current presets:

- `blur`
- `threshold`
- `pixelate`
- `tint`
- `brightness`
- `saturation`
- `channels`
- `grayscale`
- `invert`

For advanced filters, pass Scrawl action objects directly:

```ts
composition.addEffect(image, {
  id: 'outline-composite',
  actions: [
    { action: 'gaussian-blur', radius: 2, lineOut: 'blurred' },
    {
      action: 'threshold',
      lineIn: 'blurred',
      level: 8,
      high: [0, 0, 0, 255],
      low: [0, 0, 0, 0],
      lineOut: 'edge',
    },
    {
      action: 'compose',
      compose: 'source-over',
      lineIn: 'source',
      lineMix: 'edge',
    },
  ],
});
```

Filters are expensive. Keep stacks small, animate only the values you need, and memoize masks only when the output is mostly static.

## Masks

There are two mask paths.

Same-layer masks apply directly to one Scrawl entity:

```ts
const foreground = composition.addShape({
  name: 'foreground',
  shape: {
    kind: 'rectangle',
    width: 600,
    height: 320,
    fillStyle: '#ffcc00',
  },
});

composition.setMask(foreground, {
  mode: 'destination-in',
  opacity: 0.9,
  feather: 4,
  memoize: true,
});
```

Layer-to-layer masks use a Scrawl Cell when the browser adapter can create one:

```ts
const target = composition.addImage('/assets/subject.png', {
  name: 'subject',
});

const matte = composition.addShape({
  name: 'subject-matte',
  shape: {
    kind: 'wheel',
    radius: 180,
    fillStyle: '#ffffff',
  },
});

composition.setLayerMask(target, matte, {
  mode: 'clip',
  feather: 2,
});
```

The default layer-mask strategy is `cell`. The target and matte are moved into the Cell's Group. The target stamps first, the matte stamps after it, and `clip` maps to `destination-in` inside the Cell. The Cell output is then shown back in the parent composition.

If the runtime cannot create Cells, the engine still records the mask relationship and hides the matte layer, but visual Cell compositing will not happen in that runtime.

## Precomposition

Precomposition uses Scrawl Cells as nested render targets.

```ts
const child = createComposition({
  name: 'lower-third',
  width: 640,
  height: 180,
  duration: 4,
  frameRate: 30,
});

child.addText('Live', {
  name: 'label',
});

const parent = createComposition({
  name: 'program',
  width: 1920,
  height: 1080,
  duration: 10,
  frameRate: 30,
}, adapters);

parent.addPrecomposition(child, {
  name: 'lower-third-layer',
  timeOffset: 1,
  playbackRate: 1.5,
  transform: {
    position: { x: 120, y: 820 },
  },
  effects: [
    blur({ id: 'precomp-soft-shadow', radius: 1, opacity: 0.35 }),
  ],
});

parent.seek(3);
```

At `parent.seek(3)`, the child time is:

```ts
const childTime = (3 - 1) * 1.5;
```

The engine clamps that time to the child duration, seeks the child composition, and renders the child Cell only when the computed child time changes. Circular precomposition references throw.

## Media

Video layers can use Scrawl's native Picture video controls when the source is a browser media element.

For deterministic decoded-frame preview, the browser adapter also has a Mediabunny bridge. It decodes video frames into one reusable Scrawl RawAsset canvas and installs that asset on the video Picture.

```ts
const video = composition.addVideo('/assets/clip.mp4', {
  name: 'clip',
  video: {
    inPoint: 0,
    playbackRate: 1,
  },
});

await adapters.createVideoFrameBridge(video, '/assets/clip.mp4');

composition.seek(1.25);
composition.play();
```

Audio analysis uses reusable buffers so callers can avoid per-frame allocation:

```ts
const frame = createEmptyAudioAnalysisFrame();
audioAnalyzer.analyzeInto(frame);
```

## Export

Frame export seeks the composition, renders one frame, and captures the renderer canvas.

```ts
import {
  exportFrame,
  exportFrameSequence,
} from 'motion-core';

const frame = await exportFrame(composition, 2, {
  format: 'png',
  outputType: 'blob',
});

const sequence = await exportFrameSequence(composition, {
  startTime: 0,
  endTime: 2,
  frameRate: 30,
  format: 'png',
  outputType: 'blob',
  filenamePadding: 4,
});
```

Video export is delegated to a video export adapter. The built-in adapter path is Mediabunny-backed.

```ts
import { exportVideo } from 'motion-core';

const videoBlob = await exportVideo(composition, {
  format: 'mp4',
  quality: 'high',
  frameRate: 30,
});
```

## Serialization

```ts
import { deserializeComposition } from 'motion-core';

const json = composition.serialize();
const restored = deserializeComposition(json, adapters);
```

Serialization includes composition metadata, layers, transforms, effects, masks, timeline time, duration, and asset metadata.

It does not store live runtime objects like `Blob`s, decoded frames, WebCodecs handles, Scrawl instances, or dispose callbacks. Those need to be recreated by the host integration after load.

Nested composition persistence is intentionally not solved yet. A proper project file format needs to handle child compositions, circular references, and asset ownership clearly.

## Project Shape

The package exports only `"."`.

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

The public API is curated through `src/public`. Implementation folders stay separate:

- `src/core`: composition lifecycle and runtime state.
- `src/animation`: keyframes, expressions, and GSAP-backed motion.
- `src/integration`: Scrawl, GSAP, Mediabunny, serialization, and sync adapters.
- `src/audio`: audio analysis and audio media bridge.
- `src/export`: frame, sequence, and video export.
- `src/shared`: shared contracts, validation, errors, and effect presets.

That layout is deliberate. Users get one import path. The codebase still has clear internal boundaries.

## Browser Requirements

For preview:

- A modern browser.
- A real `HTMLCanvasElement`.
- Scrawl-canvas v8.

For video export:

- Browser APIs required by the selected encoder.
- Usually WebCodecs.
- A video export adapter, normally Mediabunny-backed.

For audio:

- Web Audio API support.
- Mediabunny when audio needs metadata or decoding.

## Current Limits

This is still early.

- The root API is intentionally small.
- Subpath package exports are not exposed.
- Precomposition serialization is not a full project-file format yet.
- Visual layer-to-layer masking needs a runtime that can create Scrawl Cells.
- Very heavy filter stacks are still expensive because filters are real canvas work.

## References

- Scrawl-canvas reference: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html
- Scrawl-canvas filters: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-filter-engine.html
- Scrawl-canvas Groups and Cells: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-groups-cells.html
- GSAP docs: https://gsap.com/docs/
- Mediabunny docs: https://mediabunny.dev/
- Mediabunny LLM docs: https://mediabunny.dev/llms.txt
