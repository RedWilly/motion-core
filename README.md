# MotionKit

Typed 2D motion composition core for browser motion graphics.

`motionkit` gives application code one model for layers, transforms, animation, effects, masks, media sync, live editing, serialization, and export. It coordinates three runtime libraries without making every app rebuild the glue:

- **Scrawl-canvas** draws and owns canvas artefacts, Cells, Groups, styles, filters, and render cycles.
- **GSAP** can own timeline interpolation, easing, and choreography.
- **Mediabunny** can own media metadata, decoded frames/audio, and video export plumbing.

The package has one public import path:

```ts
import { createComposition } from 'motionkit';
```

Do not import from internal folders. The source tree is allowed to change; `motionkit` is the public API.

## Contents

- [When To Use It](#when-to-use-it)
- [Install](#install)
- [Quick Start](#quick-start)
- [Core Model](#core-model)
- [Reconfiguration](#reconfiguration)
- [Layers](#layers)
- [Playback And Synchronization](#playback-and-synchronization)
- [Animation And Expressions](#animation-and-expressions)
- [Effects](#effects)
- [Masks](#masks)
- [Precomposition](#precomposition)
- [Media](#media)
- [Live Editing](#live-editing)
- [Export](#export)
- [Serialization](#serialization)
- [Browser Adapter](#browser-adapter)
- [Internal Architecture](#internal-architecture)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## When To Use It

Use `motionkit` when you need a typed composition model for browser-based motion work:

- Build a timeline of image, video, text, shape, SVG, audio, particle, or precomp layers.
- Animate layer transforms and stable numeric state.
- Apply Scrawl filter effects without leaking Scrawl details through app code.
- Coordinate timeline time, media time, Scrawl state, precompositions, and export.
- Drive live UI controls into the same state model used by playback and export.

Do not use it as a general scene graph or DOM animation library. The design assumes a canvas renderer and frame-based composition workflow.

## Install

For package consumers:

```bash
bun add motionkit gsap mediabunny scrawl-canvas
```

For this repository:

```bash
bun install
bun test
bun run typecheck
bun run build
```

Runtime libraries are peer dependencies:

```json
{
  "gsap": "^3.15.0",
  "mediabunny": "^1.44.0",
  "scrawl-canvas": "^8.19.0"
}
```

## Quick Start

```html
<canvas id="preview-canvas"></canvas>
```

```ts
import {
  createAnimationController,
  createComposition,
  loadBrowserScrawlAdapter,
} from 'motionkit';

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
    duration: 6,
    frameRate: 60,
    backgroundColor: '#101114',
  },
  adapters,
);

const box = composition.addLayer('shape', {
  name: 'box',
  shape: {
    kind: 'rectangle',
    width: 320,
    height: 180,
    fillStyle: '#ffcc00',
  },
  transform: {
    position: { x: 240, y: 540 },
    anchor: { x: 160, y: 90 },
  },
});

const animation = createAnimationController(composition);
animation.addKeyframe(box, 'position.x', 0, 240);
animation.addKeyframe(box, 'position.x', 2, 960, { easing: 'power2.inOut' });

composition.seek(0);
composition.play();
```

What happens:

- `createComposition` creates the typed model and runtime state.
- `addLayer` creates a typed layer and a backing Scrawl entity through the adapter.
- `createAnimationController` registers a motion target with the composition.
- `seek` moves the timeline, applies motion state, syncs layer state to Scrawl, and renders one frame.
- `play` starts media and the renderer-backed playback loop.

## Core Model

A composition is the source of truth.

```ts
const composition = createComposition({
  width: 1280,
  height: 720,
  duration: 10,
  frameRate: 30,
  backgroundColor: 'transparent',
  name: 'program',
});
```

The core objects are:

- **Composition**: owns dimensions, duration, timeline, renderer, assets, layers, and frame sync.
- **Layer**: owns typed layer state, transform, visibility, opacity, mask, effects, media target, and Scrawl backing entity.
- **Motion target**: any object with numeric `values` and an `apply()` method.
- **Adapter**: runtime integration that creates Scrawl entities, timelines, renderers, Cells, effects, and styles.

Design rule: app code writes into `motionkit` state first. The engine then maps that state into Scrawl, media, and export.

## Reconfiguration

Use `configure()` to change composition-owned settings after creation.

```ts
composition.configure({
  width: 800,
  height: 240,
  duration: 8,
  frameRate: 60,
});
```

`configure()` is intentionally one transaction instead of shallow setters. It validates the full next config before mutating and applies only values that actually changed.

Composition-owned updates:

- `width`
- `height`
- `duration`
- `frameRate`
- `backgroundColor`
- `name`

The core updates composition-owned runtime state with the same transaction: timeline duration, renderer configuration, and composition-owned mask Cells. If the current timeline time is beyond a new shorter duration, the composition clamps to the new end time.

Existing synchronizers use the current composition `frameRate` after reconfiguration unless they were created with an explicit `frameRate` override.

Precomposition ownership is explicit. If a child composition is mounted inside a parent precomp layer, calling `child.configure(...)` changes the child only. It does not resize or rebuild the parent-owned Cell. Parent container changes should be done through the parent/precomp API because the parent may want to crop, preserve bounds, scale, or animate the container independently.

Do not mutate config fields directly:

```ts
composition.width = 800; // TypeScript rejects this; use configure().
```

## Layers

Use `addLayer` for all content.

```ts
composition.addLayer('shape', { name: 'background' });
composition.addLayer('text', { text: 'Caption', name: 'caption' });
composition.addLayer('image', '/assets/plate.png', { name: 'plate' });
composition.addLayer('video', '/assets/clip.mp4', { name: 'clip' });
composition.addLayer('audio', '/assets/voice.wav', { name: 'voice' });
composition.addLayer('svg', '/assets/logo.svg', { name: 'logo' });
composition.addLayer('particle', { name: 'sparks', variant: 'emitter' });
```

Layer transforms are typed and stable:

```ts
const layer = composition.addLayer('image', '/assets/plate.png', {
  name: 'plate',
  transform: {
    position: { x: 640, y: 360 },
    rotation: 15,
    scale: { x: 1.2, y: 1.2 },
    anchor: { x: 0.5, y: 0.5 },
  },
  opacity: 0.85,
  visible: true,
});
```

### Parent Layers

Child layers pivot/mimic against their parent Scrawl entity.

```ts
const parent = composition.addLayer('shape', { name: 'card' });

const child = composition.addLayer('text', {
  name: 'label',
  text: 'Hello',
  parent,
  transform: {
    position: { x: 24, y: 36 },
  },
});
```

Removing a parent removes its children.

### Shape Layers

Simple shape:

```ts
composition.addLayer('shape', {
  name: 'circle',
  shape: {
    kind: 'wheel',
    radius: 120,
    fillStyle: '#33ccff',
    strokeStyle: '#ffffff',
    lineWidth: 4,
  },
});
```

Typed fill/stroke animation requires Scrawl entity parts. The browser adapter creates them for supported shape configs.

```ts
const shape = composition.addLayer('shape', {
  name: 'badge',
  shape: {
    kind: 'wheel',
    radius: 90,
    fill: { color: '#f97316', opacity: 1 },
    stroke: { color: '#ffffff', opacity: 1, width: 6 },
  },
});

shape.shape?.fill.values.opacity = 0.5;
composition.applyMotionTargets();
```

### Text Layers

Basic label:

```ts
composition.addLayer('text', {
  name: 'title',
  text: 'Motion',
});
```

Enhanced text exposes numeric motion values:

```ts
const text = composition.addLayer('text', {
  name: 'body',
  text: 'Animated layout text',
  textMode: 'enhanced',
  enhancedText: {
    fontString: '48px sans-serif',
    lineWidth: 2,
    pathPosition: 0,
    lineSpacing: 1.2,
  },
});

text.textState!.values.pathPosition = 0.4;
composition.applyMotionTargets();
```

## Playback And Synchronization

Basic controls:

```ts
composition.play();
composition.pause();
composition.seek(2.5);
```

`composition.syncFrame(time)` is the single frame-state path:

- seeks the timeline,
- syncs precomposition time,
- maps layer transforms into Scrawl state,
- applies registered motion targets.

It does not render a frame and does not seek media. That separation keeps preview, export, and UI editing from inventing separate frame logic.

Use `TimelineSynchronizer` when you need a complete frame:

```ts
import { createTimelineSynchronizer } from 'motionkit';

const sync = createTimelineSynchronizer(composition, {
  frameRate: 30,
  onDesync: ({ target, timelineTime, mediaTime }) => {
    console.warn(target.name, timelineTime, mediaTime);
  },
});

await sync.seek(1.5);
```

The synchronizer:

- runs `composition.syncFrame`,
- seeks explicit media targets and layer-owned media targets once,
- runs pre-render hooks,
- renders the frame.

Add hooks for per-frame work such as expressions:

```ts
const sync = createTimelineSynchronizer(composition, {
  hooks: [createExpressionRenderHook(animation)],
});
```

## Animation And Expressions

Create one animation controller per composition when you need keyframes, tweens, or expressions.

```ts
const animation = createAnimationController(composition);
```

### Keyframes

```ts
animation.addKeyframe(layer, 'position.x', 0, 100);
animation.addKeyframe(layer, 'position.x', 2, 900, {
  easing: 'power2.inOut',
});

composition.seek(1);
```

Editable keyframes:

```ts
animation.editKeyframe(layer, 'position.x', 2, 760);
animation.removeKeyframe(layer, keyframe);
```

`editKeyframe` is the preferred UI path: it creates a keyframe when missing and replaces the existing keyframe at the exact same time.

Supported layer motion properties:

```ts
type AnimatableProperty =
  | 'position.x'
  | 'position.y'
  | 'rotation'
  | 'scale.x'
  | 'scale.y'
  | 'anchor.x'
  | 'anchor.y'
  | 'opacity';
```

### Tweens

With a GSAP timeline adapter:

```ts
import { createGsapTimelineFactory } from 'motionkit';
import { gsap } from 'gsap';

adapters.createTimeline = createGsapTimelineFactory(gsap);

animation.animate(layer, {
  'position.x': 900,
  opacity: 0.4,
}, {
  duration: 1.2,
  easing: 'power2.out',
});
```

### Motion Targets

Any object with numeric `values` and `apply()` can be animated.

```ts
const blurEffect = composition.addEffect(layer, blur({ id: 'soft', radius: 0 }));

animation.animateTarget(blurEffect, {
  radius: 16,
}, {
  duration: 0.6,
});
```

### Expressions

Expressions are evaluator functions. The engine does not compile strings.

```ts
animation.setExpression(
  layer,
  'position.x',
  ({ value, time, frame, layer }, { clamp }) =>
    clamp(value + time * 20 + frame * 0.1 + layer.transform.position.y, 0, 1000),
);

const result = animation.applyExpressions(1);
```

Use a render hook to apply expressions every synchronized frame:

```ts
const hook = createExpressionRenderHook(animation);
const sync = createTimelineSynchronizer(composition, { hooks: [hook] });

await sync.seek(2);
```

Audio-reactive expressions:

```ts
const hook = createExpressionRenderHook(animation, () => ({
  amplitude: 0.5,
  bands: { bass: 0.8, mid: 0.2, treble: 0.1 },
}));

animation.setExpression(
  layer,
  'opacity',
  ({ audio }) => (audio?.amplitude ?? 0) * (audio?.bands.bass ?? 0),
);
```

Helpers available to expression evaluators:

- `clamp(value, min, max)`
- `lerp(start, end, amount)`
- `random(min?, max?, seed?)`
- `wiggle(frequency, amplitude, seed?)`

If evaluation fails, the controller keeps the last valid value and returns an `EngineError` in `ExpressionApplyResult.errors`.

## Effects

Effects are Scrawl filter configs using the modern `actions` format.

```ts
import {
  blur,
  brightness,
  pixelate,
  threshold,
  tint,
} from 'motionkit';

const image = composition.addLayer('image', '/assets/plate.png', {
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

Preset helpers:

- `blur`
- `threshold`
- `pixelate`
- `tint`
- `brightness`
- `saturation`
- `channels`
- `grayscale`
- `invert`

Advanced Scrawl filter actions:

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

Effect numeric action values are collected into `effect.values`, which makes effects stable motion targets.

```ts
const effect = composition.addEffect(image, blur({ id: 'animated-blur', radius: 0 }));

effect.values.radius = 12;
composition.applyMotionTargets();
```

## Masks

There are two mask models.

### Same-Layer Mask

Applies directly to a Scrawl entity.

```ts
composition.setMask(layer, {
  mode: 'destination-in',
  opacity: 0.9,
  feather: 4,
  memoize: true,
});
```

### Layer-To-Layer Mask

Uses a Scrawl Cell when the runtime supports Cells.

```ts
const target = composition.addLayer('image', '/assets/subject.png', {
  name: 'subject',
});

const matte = composition.addLayer('shape', {
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

Layer masks default to `strategy: 'cell'`. Target and matte move into the Cell group. The target stamps first, the matte stamps after it, and `clip` maps to destination-in style compositing in the Cell.

Clear masks:

```ts
composition.clearMask(target);
```

## Precomposition

A precomposition is a child composition rendered into a Scrawl Cell and used as a parent layer source.

```ts
const child = createComposition({
  name: 'lower-third',
  width: 640,
  height: 180,
  duration: 4,
  frameRate: 30,
});

child.addLayer('text', {
  text: 'Live',
  name: 'label',
});

const parent = createComposition({
  name: 'program',
  width: 1920,
  height: 1080,
  duration: 10,
  frameRate: 30,
}, adapters);

const precompLayer = parent.addPrecomposition(child, {
  name: 'lower-third-layer',
  timeOffset: 1,
  playbackRate: 1.5,
  transform: {
    position: { x: 120, y: 820 },
  },
});

parent.seek(3);
```

Child time is:

```ts
const childTime = (parentTime - timeOffset) * playbackRate;
```

The engine clamps child time to the child duration.

Important constraints:

- Circular precomposition references throw.
- A child composition can be mounted into one precomposition owner at a time.
- Removing the precomp layer tears down the Cell and detaches the child composition from that host group.

## Media

Media timing uses normalized config:

```ts
composition.addLayer('video', '/assets/clip.mp4', {
  name: 'clip',
  video: {
    inPoint: 1.2,
    outPoint: 8,
    playbackRate: 1,
  },
});

composition.addLayer('audio', '/assets/voice.wav', {
  name: 'voice',
  audio: {
    inPoint: 0,
    outPoint: 12,
    playbackRate: 1,
    volume: 0.8,
    fadeIn: 0.2,
    fadeOut: 0.5,
  },
});
```

Composition time maps to source time:

```ts
const sourceTime = inPoint + compositionTime * playbackRate;
```

### Video Frame Bridge

The browser adapter can create a Mediabunny-backed decoded-frame bridge. It decodes frames into one reusable Scrawl RawAsset.

```ts
const video = composition.addLayer('video', '/assets/clip.mp4', {
  name: 'clip',
});

await adapters.createVideoFrameBridge(video, '/assets/clip.mp4');

await createTimelineSynchronizer(composition).seek(1.25);
```

### Audio Analysis

```ts
const analyzer = createAudioAnalyzer(audioContext, audioNode, {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
});

const frame = createEmptyAudioAnalysisFrame();
analyzer.analyzeInto(frame);
```

Frequency bands are normalized to `0..1`:

```ts
const bands = analyzeFrequencyBands(frequencyData, {
  sampleRate: 48_000,
  fftSize: 2048,
});
```

Attach a decoded audio bridge to an audio layer:

```ts
const bridge = attachAudioBridgeToLayer(audioLayer, audioBridge);
await bridge.seek(2);
```

## Live Editing

Live edit sessions write UI input into the same state model used by animation and export.

```ts
const editor = createLiveEditSession(composition);

editor.bindLayerInput(xInput, layer, 'position.x', {
  parse: 'float',
});
```

Edit generic motion target values:

```ts
const effect = composition.addEffect(layer, blur({ id: 'blur', radius: 0 }));

editor.bindInput(radiusInput, effect.values, 'radius', {
  parse: 'float',
});
```

Auto-key layer properties:

```ts
const animation = createAnimationController(composition);

editor.setLayerProperty(layer, 'position.x', 400, {
  mode: 'autoKey',
  animation,
  time: composition.timeline.time(),
});
```

Auto-key generic values:

```ts
editor.setValue(effect.values, 'radius', 12, {
  mode: 'autoKey',
  time: composition.timeline.time(),
});
```

Dispose sessions when UI is removed:

```ts
editor.dispose();
```

## Export

### Single Frame

```ts
const blob = await exportFrame(composition, 2, {
  format: 'png',
  outputType: 'blob',
});

const buffer = await exportFrame(composition, 2, {
  format: 'webp',
  quality: 0.8,
  outputType: 'arraybuffer',
});

const dataUrl = await exportFrame(composition, 2, {
  format: 'jpg',
  quality: 0.85,
  outputType: 'dataurl',
});
```

Frame export requires a renderer with `captureFrame`.

### Frame Sequence

```ts
const frames = await exportFrameSequence(composition, {
  startTime: 0,
  endTime: 2,
  frameRate: 30,
  frameStep: 1,
  format: 'png',
  filenamePrefix: 'shot-',
  filenamePadding: 4,
  onProgress: (progress) => console.log(progress),
});
```

### Video

```ts
const videoBlob = await exportVideo(composition, {
  format: 'mp4',
  quality: 'high',
  frameRate: 30,
});
```

The built-in video export adapter uses Mediabunny and requires a renderer with `getFrameCanvas`.

## Serialization

```ts
const json = composition.serialize();
const restored = deserializeComposition(json, adapters);
```

Serialization includes:

- composition metadata,
- timeline time and duration,
- layers and layer config,
- transforms,
- effects,
- masks,
- asset metadata,
- Scrawl packets when available.

Serialization does not include:

- live `Blob` objects,
- decoded frames,
- WebCodecs handles,
- Web Audio nodes,
- Scrawl runtime instances,
- dispose callbacks.

Host integrations recreate those runtime resources after load.

## Browser Adapter

Create an adapter from an existing canvas:

```ts
const adapters = await loadBrowserScrawlAdapter({
  canvas: 'preview-canvas',
  namespace: 'demo',
  fit: 'contain',
  backgroundColor: '#101114',
  title: 'Preview',
  label: 'Motion preview',
  description: 'Canvas preview for the motion composition',
});
```

Options:

- `canvas`: `HTMLCanvasElement | string`
- `namespace`: name prefix for Scrawl objects
- `fit`: `'none' | 'contain' | 'cover' | 'fill'`
- `backgroundColor`: Scrawl canvas background
- `title`, `label`, `description`: canvas accessibility metadata

The browser adapter provides:

- Scrawl entity factories,
- Scrawl group factory,
- renderer backed by Scrawl `makeRender`,
- precomposition and mask Cell factories,
- effects controller,
- styles controller,
- video frame bridge,
- Scrawl packet import,
- `dispose()`.

Custom renderers can react to composition reconfiguration through the renderer contract:

```ts
interface RenderAdapter {
  play(): void;
  pause(): void;
  renderFrame(): void | Promise<void>;
  configure?(composition: CompositionRuntime, changes: Readonly<CompositionUpdateConfig>): void;
  captureFrame?(options: Readonly<FrameCaptureOptions>): Promise<Blob>;
  getFrameCanvas?(): HTMLCanvasElement | OffscreenCanvas;
}
```

## Internal Architecture

The mental map is intentionally small:

```text
app code
  -> motionkit public API
    -> Composition state
      -> adapters
        -> Scrawl / GSAP / Mediabunny
```

### Source Of Truth

`Composition` owns the source of truth. Scrawl entities, media objects, and export encoders are runtime projections of that state.

### Frame Flow

```text
seek/play/export
  -> timeline time
  -> layer and motion target state
  -> Scrawl state
  -> media sync
  -> render/capture
```

### Module Roles

- `src/core`: composition lifecycle, layers, assets, masks, precomp ownership, motion target registry.
- `src/animation`: keyframes, tweens, expression evaluator functions.
- `src/editor`: UI/live-edit bindings that write into core state.
- `src/integration`: Scrawl, GSAP, Mediabunny, serialization, synchronization.
- `src/audio`: audio analysis and audio media bridge.
- `src/export`: frame, sequence, and video export.
- `src/shared`: public contracts, validation, errors, Scrawl types, effect presets.
- `src/public`: curated package exports.

### Why The Design Looks This Way

- One import path keeps package usage stable.
- One layer creation path avoids duplicate layer state.
- One frame-state path prevents preview/export/designer drift.
- Motion targets make effects, text, shape parts, and custom state animatable without special APIs.
- Expression evaluators are functions, not strings, because compiling strings would make untrusted input part of the runtime model.
- Precomposition ownership is exclusive so nested render targets have one obvious host.

## API Reference

This section documents the public API exported from `motionkit`.

### Composition

```ts
function createComposition(
  config: CompositionConfig,
  adapters?: EngineAdapters,
): Composition;

function deserializeComposition(
  json: string,
  adapters?: EngineAdapters,
): Composition;
```

```ts
interface CompositionConfig {
  width: number;
  height: number;
  duration?: number;
  frameRate?: number;
  backgroundColor?: string;
  name?: string;
}
```

```ts
type CompositionUpdateConfig = Partial<CompositionConfig>;
```

```ts
interface Composition {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly frameRate: number;
  readonly backgroundColor: string;
  readonly layers: Layer[];
  readonly assets: CompositionAsset[];
  readonly timeline: TimelineAdapter;
  readonly renderer: RenderAdapter;

  configure(config: CompositionUpdateConfig): void;

  addLayer(type: LayerType, config?: LayerConfig): Layer;
  addLayer(type: LayerType, source?: string, config?: LayerConfig): Layer;
  addPrecomposition(
    composition: Composition,
    config?: Omit<LayerConfig, 'content' | 'precomp'> & {
      readonly timeOffset?: number;
      readonly playbackRate?: number;
    },
  ): Layer;

  addEffect(layer: Layer, config: EffectConfig): LayerEffectState;
  removeEffect(layer: Layer, effect: LayerEffectState | string): void;
  clearEffects(layer: Layer): void;

  createGradient(config: GradientConfig): MotionStyle;
  createPattern(config: PatternConfig): MotionStyle;
  removeStyle(style: MotionStyle): void;

  registerAsset(asset: CompositionAsset): CompositionAsset;
  removeAsset(asset: CompositionAsset | string): void;
  registerMotionTarget(target: MotionStateTarget): () => void;
  applyMotionTargets(): void;

  syncFrame(time?: number, suppressEvents?: boolean): void;
  setMask(layer: Layer, config: LayerMaskConfig): LayerMaskState;
  setLayerMask(targetLayer: Layer, sourceLayer: Layer, config?: Omit<LayerMaskConfig, 'sourceLayerId'>): LayerMaskState;
  clearMask(layer: Layer): void;

  removeLayer(layer: Layer): void;
  reorderLayer(layer: Layer, newIndex: number): void;
  play(): void;
  pause(): void;
  seek(time: number): void;
  serialize(): string;
}
```

### Layers

```ts
type LayerType =
  | 'image'
  | 'video'
  | 'audio'
  | 'svg'
  | 'shape'
  | 'text'
  | 'particle'
  | 'precomp';
```

```ts
interface LayerConfig {
  name?: string;
  transform?: Partial<Transform>;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  parent?: Layer;
  content?: unknown;
  scaleMode?: 'fill' | 'fit' | 'none';
  shape?: ShapeLayerConfig;
  video?: VideoLayerConfig;
  audio?: AudioLayerConfig;
  scrawl?: Readonly<Record<string, unknown>>;
  textMode?: 'label' | 'enhanced';
  text?: string;
  enhancedText?: EnhancedTextLayerConfig;
  variant?: 'emitter' | 'net' | 'tracer';
  effects?: readonly EffectConfig[];
  mask?: LayerMaskConfig;
  precomp?: PrecompositionLayerConfig;
}
```

```ts
interface Transform {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
  anchor: { x: number; y: number };
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}
```

### Animation

```ts
function createAnimationController(composition: Composition): AnimationController;
```

```ts
class AnimationController {
  addKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  editKeyframe(layer: Layer, property: AnimatableProperty, time: number, value: number, config?: KeyframeConfig): Keyframe;
  findKeyframe(layer: Layer, property: AnimatableProperty, time: number): Keyframe | undefined;
  removeKeyframe(layer: Layer, keyframe: Keyframe): void;

  animate(layer: Layer, values: AnimationValues, config: AnimationConfig): Animation;
  animateTarget<TValues extends Record<string, number>>(
    target: MotionStateTarget<TValues>,
    values: Partial<TValues>,
    config: AnimationConfig,
  ): Animation;

  setExpression(layer: Layer, property: AnimatableProperty, evaluator: ExpressionEvaluator): Expression;
  removeExpression(layer: Layer, property: AnimatableProperty): void;
  applyExpressions(time?: number, audio?: ExpressionAudioContext): ExpressionApplyResult;
  getExpressionErrors(): readonly EngineError[];
}
```

```ts
type ExpressionEvaluator = (
  context: ExpressionContext,
  helpers: ExpressionHelpers,
) => unknown;
```

```ts
interface AnimationConfig {
  duration: number;
  delay?: number;
  easing?: string | ((progress: number) => number);
  repeat?: number;
  yoyo?: boolean;
  onComplete?: () => void;
}
```

### Synchronization

```ts
function createTimelineSynchronizer(
  composition: Composition,
  config?: TimelineSynchronizerConfig,
): TimelineSynchronizer;
```

```ts
interface TimelineSynchronizerConfig {
  frameRate?: number;
  hooks?: PreRenderHook[];
  onDesync?: (details: {
    target: MediaSyncTarget;
    timelineTime: number;
    mediaTime: number;
  }) => void;
}
```

### Effects And Masks

```ts
interface EffectConfig {
  id?: string;
  actions: EffectAction[];
  opacity?: number;
}
```

```ts
interface LayerMaskConfig extends MaskConfig {
  sourceLayerId?: string;
  strategy?: 'entity' | 'cell';
}
```

Preset functions:

```ts
blur(config?: BlurEffectConfig): EffectConfig;
threshold(config: ThresholdEffectConfig): EffectConfig;
pixelate(config: PixelateEffectConfig): EffectConfig;
tint(config?: TintEffectConfig): EffectConfig;
brightness(config: UniformChannelModulationEffectConfig): EffectConfig;
saturation(config: UniformChannelModulationEffectConfig): EffectConfig;
channels(config?: ChannelModulationEffectConfig): EffectConfig;
grayscale(config?: EffectPresetBase): EffectConfig;
invert(config?: EffectPresetBase): EffectConfig;
```

### Live Editing

```ts
function createLiveEditSession(
  composition: Composition,
  options?: LiveEditSessionOptions,
): LiveEditSession;
```

```ts
interface LiveEditSession {
  bindInput(input: LiveEditInput, target: Record<string, number>, property: string, options?: LiveEditBindingOptions): () => void;
  bindLayerInput(input: LiveEditInput, layer: Layer, property: AnimatableProperty, options?: LiveEditBindingOptions): () => void;
  setValue(target: Record<string, number>, property: string, value: number, options?: LiveEditOptions): void;
  setLayerProperty(layer: Layer, property: AnimatableProperty, value: number, options?: LiveEditOptions): void;
  flush(): void;
  dispose(): void;
}
```

### Export

```ts
function exportFrame(
  composition: Composition,
  time: number,
  config?: FrameExportConfig,
): Promise<Blob | ArrayBuffer | string>;
```

```ts
function exportFrameSequence(
  composition: Composition,
  config?: FrameSequenceExportConfig,
): Promise<Array<ExportedFrame<Blob | ArrayBuffer | string>>>;
```

```ts
function exportVideo(
  composition: Composition,
  config: VideoExportConfig,
  adapter?: VideoExportAdapter,
): Promise<Blob>;
```

### Browser Adapter

```ts
function loadBrowserScrawlAdapter(
  options: BrowserScrawlAdapterOptions,
): Promise<BrowserScrawlAdapter>;

function createBrowserScrawlAdapter(
  scrawl: ScrawlBrowserModule,
  options: BrowserScrawlAdapterOptions,
): BrowserScrawlAdapter;
```

### Audio

```ts
function createAudioAnalyzer(
  context: AudioContext,
  source: AudioNode,
  config?: AudioAnalysisConfig,
): AudioAnalyzer;

function createEmptyAudioAnalysisFrame(): AudioAnalysisFrame;
function normalizeAmplitude(samples: Float32Array): number;
function normalizeBand(value: number, maxValue?: number): number;
function analyzeFrequencyBands(data: Uint8Array, options: FrequencyAnalysisOptions): AudioBands;
function attachAudioBridgeToLayer(layer: Layer, bridge: AudioLayerBridge): AudioLayerBridge;
```

### Errors

Most validation, capability, resource, and runtime failures throw `EngineError`.

```ts
try {
  composition.seek(-1);
} catch (error) {
  if (error instanceof EngineError) {
    console.error(error.code, error.category, error.context);
  }
}
```

## Troubleshooting

### Nothing appears on canvas

- Confirm you created the composition with `loadBrowserScrawlAdapter`.
- Confirm the canvas element exists before creating the adapter.
- Call `composition.seek(0)` or `await createTimelineSynchronizer(composition).seek(0)` after adding layers.
- Confirm your layer has visible geometry or a valid media source.

### Animation changes state but not the canvas

- Use `composition.seek(time)` or `composition.syncFrame(time)` after keyframe changes.
- For expression functions, call `animation.applyExpressions(time)` or use `createExpressionRenderHook`.
- For generic motion targets, call `composition.applyMotionTargets()` or sync a frame.

### Effects do not show

- Effects require a Scrawl runtime with `makeFilter`.
- Empty `actions` arrays are invalid.
- Only numeric action fields appear in `effect.values`.

### Layer mask does not visually composite

- Visual layer-to-layer masks need a runtime that can create Scrawl Cells.
- Same-layer masks can work directly on the entity.
- Check that the matte layer is visible before masking; the engine owns visibility after `setLayerMask`.

### Video or audio drifts

- Use `createTimelineSynchronizer`.
- Watch `onDesync`.
- Keep `frameRate` consistent between composition, preview, and export.
- Avoid manually seeking media outside the synchronizer.

### Export fails

- Frame export requires `renderer.captureFrame`.
- Video export requires `renderer.getFrameCanvas`.
- Video export needs browser encoder support required by Mediabunny.
- `outputType: 'dataurl'` requires a runtime with `btoa`.

### Type imports are missing

Import from `motionkit`, not internal paths.

```ts
import type { Composition, Layer, EffectConfig } from 'motionkit';
```

## References

- Scrawl-canvas reference: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html
- Scrawl-canvas filters: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-filter-engine.html
- Scrawl-canvas Groups and Cells: https://scrawl-v8.rikweb.org.uk/docs/reference/sc-groups-cells.html
- GSAP docs: https://gsap.com/docs/
- Mediabunny docs: https://mediabunny.dev/
