# Motion Graphics Engine Core

Thin TypeScript orchestration over Scrawl-canvas, GSAP, and Mediabunny for programmatic 2D motion graphics.

This package does not try to replace those libraries. The core rule is:

- Scrawl-canvas owns rendering, scene graph objects, Cells, Groups, entities, filters, and canvas display cycles.
- GSAP owns timeline interpolation and choreography.
- Mediabunny owns media metadata, demuxing/decoding/encoding, and container output.
- This engine owns the typed composition/layer model, adapter wiring, validation, serialization metadata, and synchronization glue.

## Install

```bash
bun install
```

## Verify

```bash
bun run typecheck
bun test
bun run build
```

## Public Module Map

The package intentionally keeps a small top-level map:

- `motion-core/core`: composition and layer lifecycle.
- `motion-core/animation`: GSAP-backed keyframes and expressions.
- `motion-core/audio`: audio metadata, analysis, and reactive data helpers.
- `motion-core/export`: frame, sequence, and video export orchestration.
- `motion-core/integration`: Scrawl, GSAP, Mediabunny, serialization, and synchronization adapters.
- `motion-core/shared`: shared types, errors, validation, and effect presets.
- `motion-core`: barrel export for all public modules.

The codebase enforces this shape with module-boundary tests.

## Browser Scrawl Setup

Use `loadBrowserScrawlAdapter` when running in a browser with a real `<canvas>`.

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
    frameRate: 30,
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

The browser adapter creates:

- Scrawl entity factories for layer types.
- One Scrawl Group for the composition.
- One Scrawl Render object for preview playback.
- A Scrawl effects controller through `makeFilter`.
- Scrawl layer Cells for precomposition layers when the canvas exposes `buildCell`.

Prefer the typed layer helpers for application code:

```ts
composition.addShape({ name: 'background' });
composition.addText('Caption', { name: 'caption' });
composition.addImage('/assets/plate.png', { name: 'plate' });
composition.addVideo('/assets/clip.mp4', { name: 'clip' });
composition.addAudio('/assets/voice.wav', { name: 'voice' });
composition.addSvg('/assets/logo.svg', { name: 'logo' });
```

`addLayer` remains available as the lower-level primitive when a caller already has a `LayerType` and wants to dispatch dynamically. URL-backed image, video, audio, and SVG layers are registered in `composition.assets` automatically and are removed with their owning layer.

Generated runtime resources can be registered explicitly when the host needs them to appear in serialized project metadata:

```ts
composition.registerAsset({
  id: 'style:orb-gradient',
  kind: 'style',
  sourceType: 'generated',
  label: 'orb-gradient',
});
```

## Effects

Effects are Scrawl-canvas Filter objects attached to layer entities through the Scrawl filter mixin methods: `addFilters`, `removeFilters`, and `clearFilters`.

The engine uses Scrawl's modern `actions` filter form only. It does not emit legacy `method` filter configs. This is deliberate because action arrays are the Scrawl path for chained filter primitives.

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

composition.removeEffect(image, 'blocks');
composition.clearEffects(image);
```

Preset helpers return plain `ScrawlEffectConfig` objects:

- `blur`: emits `gaussian-blur`.
- `threshold`: emits `threshold`.
- `pixelate`: emits `pixelate`.
- `tint`: emits `tint-channels`.
- `brightness`, `saturation`, and `channels`: emit `modulate-channels`.
- `grayscale`: emits `grayscale`.
- `invert`: emits `invert-channels`.

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

Performance notes:

- Scrawl filters are computationally expensive; use the smallest useful stack.
- Filter order matters because Scrawl applies filters sequentially.
- Use `memoize: true` on masks only when the filtered output is mostly static. Scrawl invalidates memoized output when the filtered object or its filter array changes.

## Masks

There are two mask workflows in the current API.

Same-layer masks are applied immediately to the target Scrawl entity:

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

`mode: 'clip'` maps to Scrawl's entity clipping path. Other modes map to canvas `globalCompositeOperation` values on the target entity. `feather` is implemented as a Scrawl `gaussian-blur` filter on the masked entity.

Layer-to-layer masks are recorded as layer state and serialized:

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

Current behavior:

- The target layer stores `mask.sourceLayerId`.
- The default strategy is `cell`.
- The browser adapter creates a Scrawl layer Cell for the mask pair when Cell support is available.
- The target and matte entities are moved into the Cell's namesake Group.
- The target stamps first, and the matte stamps after it with `destination-in` when `mode: 'clip'`.
- The Cell output stamps back into the base display at the target layer's order.
- `feather` adds a Scrawl `gaussian-blur` filter to the matte entity.
- The relationship survives serialization.

Current limitation:

- If an adapter does not expose layer Cell creation, the engine still records the relationship and hides the matte/source layer, but it cannot produce visual Cell compositing in that runtime.

## Precomposition

Precomposition layers use Scrawl Cells as the offscreen target concept. A parent composition can hold a child composition as a `precomp` layer and remap the child time.

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

const parent = createComposition(
  {
    name: 'program',
    width: 1920,
    height: 1080,
    duration: 10,
    frameRate: 30,
  },
  adapters,
);

const precomp = parent.addPrecomposition(child, {
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

The engine clamps that value to the child composition duration, seeks the child composition, and renders the precomp Cell when the computed child time changes. Circular precomposition references throw a validation error.

Current behavior:

- The API allocates and tracks the Scrawl Cell through the adapter.
- When the Cell exposes its namesake Group, the child composition is rehosted into that Group so existing and future child layers compile into the precomp Cell.
- The parent precomp layer uses the Cell name as its Picture source.
- Child timeline sync is cached so repeated parent seeks to the same child time do not re-render the Cell.

## Serialization

```ts
import { deserializeComposition } from 'motion-core';

const json = composition.serialize();
const restored = deserializeComposition(json, adapters);
```

Serialization currently includes:

- Composition metadata.
- Layer transform, visibility, lock, opacity, source, content, parent id, z-index, and Scrawl entity packet when available.
- Layer effect configs from runtime state.
- Layer mask configs, including layer-to-layer `sourceLayerId`.
- Timeline time and duration.
- Asset metadata from `composition.assets`, including URL-backed layer sources and explicitly registered generated/style assets.

Serialization stores asset references and labels, not opaque runtime objects. A `Blob`, decoded frame cache, WebCodecs handle, Scrawl object instance, or runtime `dispose` callback must be recreated by the host integration after load. Serialization intentionally does not include live `precomp.composition` object graphs. Nested composition persistence needs an explicit project-file format so it can avoid circular graphs and make asset ownership clear.

## Animation And Sync

Use `createAnimationController` for GSAP-backed property animation. GSAP is the interpolation owner; Scrawl entities receive synchronized state through `entity.set`.

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

GSAP timelines support tweens, timelines, easing, callbacks, and stagger-style choreography. This engine does not create independent Scrawl Tweens for layer animation because the project uses GSAP as the single timeline source.

## Media Preview

Video layers can use Scrawl's native Picture video controls when the source is a browser media element. For deterministic decoded-frame preview, the browser adapter exposes a Mediabunny bridge that decodes frames into one reusable Scrawl RawAsset canvas and installs that asset on the video Picture.

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

`composition.play()`, `pause()`, and `seek(time)` are the public playback controls. The composition coordinates the GSAP timeline, Scrawl renderer, video frame bridge, and audio bridge through each layer's `media` target.

## Export

Frame export renders through the composition renderer and captures canvas data with `toBlob`.

Video export delegates frame encoding/container writing to the configured video adapter. The Mediabunny integration is responsible for WebCodecs-backed encoding and muxing.

```ts
import { exportFrame, exportFrameSequence } from 'motion-core';

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

## Browser Requirements

For preview/rendering:

- A modern browser with Canvas support.
- Scrawl-canvas v8 runtime.
- A real DOM `HTMLCanvasElement` for `loadBrowserScrawlAdapter`.

For video export:

- Browser APIs required by the selected encoder, typically WebCodecs for hardware-backed video encoding.
- A configured video adapter, normally Mediabunny-backed.

For audio reactivity:

- Web Audio API support.
- Mediabunny for media metadata/decoding where audio files are involved.

## References

- Scrawl-canvas reference: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html
- Scrawl-canvas filters: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-filter-engine.html
- Scrawl-canvas Groups and Cells: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-groups-cells.html
- GSAP docs: https://gsap.com/docs/
- Mediabunny docs: https://mediabunny.dev/
- Mediabunny LLM docs: https://mediabunny.dev/llms.txt
