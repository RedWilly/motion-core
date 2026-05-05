# Product: Motion Graphics Engine Core

A TypeScript/JavaScript library for programmatic motion graphics creation and video generation. It provides a thin orchestration layer that wraps three powerful libraries:

- **Scrawl-canvas**: Rendering, scene graph, filters, particles, text layout
- **GSAP**: Timeline sequencing and animation choreography
- **Mediabunny**: Video/audio I/O, encoding/decoding

The engine exposes a motion-graphics-focused API without reimplementing features these libraries already provide. It follows a "wrapper, not reimplementation" philosophy.

**Key Capabilities:**
- Composition management (canvas, layers, timeline)
- Multiple layer types (image, video, audio, SVG, shape, text, particle, precomp)
- Keyframe animation with GSAP integration
- Video/frame export via Mediabunny
- Audio reactivity via Web Audio API
