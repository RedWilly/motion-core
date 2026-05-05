# Requirements Document

## Introduction

The Motion Graphics Engine Core is a web-based JavaScript/TypeScript library for programmatic motion graphics creation and video generation. The Engine provides a **thin wrapper layer** that orchestrates three powerful libraries:

1. **Scrawl-canvas**: Handles all rendering, scene graph management, effects, particles, text layout, and canvas animation
2. **GSAP**: Provides advanced timeline sequencing and animation choreography
3. **Mediabunny**: Handles video I/O (muxing encoded frames into video files, demuxing video files, WebCodecs wrapper)

The Engine exposes a motion-graphics-focused API without reimplementing features these libraries already provide.

## Architecture Philosophy

**Wrapper, Not Reimplementation**: The Engine wraps and adapts existing libraries rather than rebuilding their features.

**Scrawl-canvas** (Rendering & Scene Management):
- Scene graph (Canvas, Cell, Group, entities)
- 40+ filters (blur, color, displacement, convolution, OKLCH)
- Particle physics engine (Emitter, Net, Tracer)
- Advanced color system (OKLCH, Display-P3, wide-gamut)
- Text layout engine (Label, EnhancedLabel)
- Animation system (Ticker, Tween, Action)
- Asset management (images, video, sprites, SVG)
- DOM integration (Stack, Element artefacts)
- Accessibility (WCAG, keyboard, screen reader)
- User interaction (hit testing, drag-drop, events)

**Mediabunny** (Video I/O):
- Video/audio muxing (writes encoded streams into MP4, WebM, MKV, AVI, MOV containers)
- WebCodecs wrapper (cleaner API for browser encoding/decoding)
- Demuxing (reads video files, extracts streams, metadata, frames)
- Format conversion (converts between container formats)
- Custom codecs (FLAC, MP3, AAC via WASM for unsupported formats)
- Streaming muxing (write-as-you-encode, chunked writing)

**GSAP** (Timeline Choreography):
- Advanced timeline sequencing (labels, callbacks, nested timelines)
- Stagger animations and complex easing
- Timeline control (play, pause, seek, reverse, repeat)

**Our Focus**: Build a simple, progressive API for motion graphics use cases, orchestrate the integration between Scrawl-canvas rendering, GSAP timeline control, and Mediabunny video export, and provide audio reactivity.

## References

- **Scrawl-canvas**: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html/
  - LLM Summary: https://github.com/KaliedaRik/Scrawl-canvas/blob/v8/LLM-summary-for-scrawl-canvas.md
- **GSAP**: https://gsap.com/docs/
- **Mediabunny**: https://mediabunny.dev/
  - LLM Docs: https://mediabunny.dev/llms.txt

## Glossary

### Engine Terms
- **Engine**: The Motion Graphics Engine Core library (thin wrapper over Scrawl-canvas)
- **Composition**: A container that holds layers, defines dimensions, duration, and frame rate (wraps Scrawl-canvas Canvas + base Cell)
- **Layer**: A visual element in the composition hierarchy (wraps Scrawl-canvas entities)
- **Timeline**: A time-based sequence that controls animation playback (integrates GSAP + Scrawl-canvas Ticker)
- **Keyframe**: A time-value pair that defines property values at specific points in time (wraps Scrawl-canvas Tween)
- **Exporter**: The video file generation system powered by Mediabunny
- **Audio_Reactive**: Property animations driven by audio frequency or amplitude data

### Scrawl-canvas Terms (What We're Wrapping)
- **Canvas**: Scrawl-canvas wrapper for HTML5 canvas element
- **Cell**: Scrawl-canvas off-screen canvas for layer isolation and effects
- **Group**: Scrawl-canvas collection of entities for batch operations and z-ordering
- **Entity**: Scrawl-canvas graphical object (Block, Wheel, Shape, Line, Bezier, Picture, Label, etc.)
- **Filter**: Scrawl-canvas visual effect (40+ built-in: blur, color, displacement, convolution, OKLCH)
- **Ticker**: Scrawl-canvas time-based animation controller
- **Tween**: Scrawl-canvas property interpolation with easing
- **Action**: Scrawl-canvas action/revert function pair
- **Emitter**: Scrawl-canvas particle emitter entity
- **Net**: Scrawl-canvas spring-particle lattice entity
- **Tracer**: Scrawl-canvas particle movement visualization entity
- **Stack**: Scrawl-canvas DOM element wrapper for canvas + DOM integration
- **Color**: Scrawl-canvas color object supporting OKLCH, Display-P3, wide-gamut

## Requirements

### Requirement 1: Composition Management (Wraps Scrawl-canvas Canvas + Cell)

**User Story:** As a developer, I want to create and configure compositions, so that I can define the canvas for my motion graphics project.

**Implementation Note:** Composition wraps Scrawl-canvas Canvas artefact + base Cell. Scrawl-canvas handles canvas element creation, responsiveness, HiDPI scaling, and color space management.

#### Acceptance Criteria

1. THE Engine SHALL create a Composition with specified width, height, duration, and frame rate
2. THE Engine SHALL validate that width and height are positive integers
3. THE Engine SHALL validate that duration is a positive number in seconds
4. THE Engine SHALL validate that frame rate is between 1 and 120 frames per second
5. WHEN a Composition is created, THE Engine SHALL initialize a Scrawl-canvas Canvas artefact and base Cell
6. THE Engine SHALL allow modification of Composition properties after creation
7. THE Composition SHALL maintain a background color property with default value of transparent
8. THE Engine SHALL leverage Scrawl-canvas's responsive canvas features (baseWidth, baseHeight, fit modes)

### Requirement 2: Layer Hierarchy (Wraps Scrawl-canvas Groups + Entities)

**User Story:** As a developer, I want to organize layers in a hierarchical structure, so that I can create complex compositions with parent-child relationships.

**Implementation Note:** Layers wrap Scrawl-canvas entities (Block, Wheel, Shape, Line, Bezier, Picture, Label, Emitter, Net, Tracer, etc.). Scrawl-canvas Groups handle z-ordering and batch operations. Parent-child transforms use Scrawl-canvas pivot/mimic positioning.

#### Acceptance Criteria

1. THE Engine SHALL add layers to a Composition in a specific z-order using Scrawl-canvas Groups
2. THE Engine SHALL support parent-child relationships using Scrawl-canvas pivot/mimic positioning
3. WHEN a parent layer transforms, Scrawl-canvas SHALL apply the transformation to all child layers
4. THE Engine SHALL allow reordering of layers using Scrawl-canvas Group ordering
5. THE Engine SHALL remove layers from the Composition and clean up Scrawl-canvas entities
6. THE Engine SHALL provide layer visibility control using Scrawl-canvas entity visibility
7. THE Engine SHALL provide layer locking to prevent modifications
8. WHEN a layer is removed, THE Engine SHALL remove all child layers

### Requirement 3: Image Layer Support (Wraps Scrawl-canvas Picture Entity)

**User Story:** As a developer, I want to add image layers to compositions, so that I can incorporate static visual content.

**Implementation Note:** Image layers wrap Scrawl-canvas Picture entities. Scrawl-canvas handles image loading, caching, responsive images (srcset), and rendering. Picture entities support copy methods (fill, fit, none, etc.).

#### Acceptance Criteria

1. THE Engine SHALL create image layers using Scrawl-canvas Picture entities
2. Scrawl-canvas SHALL decode images asynchronously and cache them
3. IF an image fails to load, THEN Scrawl-canvas SHALL emit an error event
4. THE Engine SHALL scale image layers using Scrawl-canvas Picture copy methods
5. THE Engine SHALL support Scrawl-canvas copy modes (fill, fit, none, etc.)
6. Scrawl-canvas SHALL render Picture entities at the specified position during the display cycle

### Requirement 4: Video Layer Support (Wraps Scrawl-canvas Picture Entity + Mediabunny)

**User Story:** As a developer, I want to add video layers to compositions, so that I can incorporate dynamic video content.

**Implementation Note:** Video layers wrap Scrawl-canvas Picture entities with video assets. Scrawl-canvas handles video element integration and rendering. Mediabunny provides video demuxing (extracting metadata like duration, frame rate, codec info) and optional decoding via WebCodecs. Timeline sync controls video currentTime.

#### Acceptance Criteria

1. THE Engine SHALL create video layers using Scrawl-canvas Picture entities with video assets
2. Mediabunny SHALL demux video files to extract duration, frame rate, and codec metadata
3. THE Engine SHALL synchronize video playback with the Timeline position by setting video.currentTime
4. THE Engine SHALL support video trimming (in-point and out-point) via time offset calculations
5. THE Engine SHALL support video playback speed adjustment (time remapping)
6. IF a video fails to load or demux, THEN Mediabunny SHALL return a descriptive error with codec information
7. WHEN the Timeline position changes, THE Engine SHALL seek the video to the corresponding frame
8. WHEN seeking video during frame-by-frame export, THE Engine SHALL await the video 'seeked' event before capturing the frame to ensure the correct frame is displayed

### Requirement 5: Audio Layer Support (Uses Mediabunny for Demuxing)

**User Story:** As a developer, I want to add audio layers to compositions, so that I can incorporate sound and music.

**Implementation Note:** Audio layers use Mediabunny for demuxing audio files (extracting metadata and streams). Web Audio API handles playback and synchronization. Timeline sync controls audio.currentTime.

#### Acceptance Criteria

1. Mediabunny SHALL demux audio files (MP3, WAV, Ogg, FLAC) to extract duration and sample rate metadata
2. Mediabunny SHALL provide decoded audio data that can be connected to Web Audio API
3. WHEN an audio file is loaded, THE Engine SHALL extract duration and sample rate metadata via Mediabunny
4. THE Engine SHALL connect decoded audio data to Web Audio API AudioContext for playback and analysis
5. THE Engine SHALL synchronize audio playback with the Timeline position using Web Audio API
6. THE Engine SHALL support audio trimming (in-point and out-point)
7. THE Engine SHALL support audio volume control from 0.0 to 1.0
8. THE Engine SHALL support audio fade-in and fade-out effects
9. THE Engine SHALL extract frequency and amplitude data for Audio_Reactive animations using Web Audio API

### Requirement 6: SVG Layer Support (Wraps Scrawl-canvas Picture Entity)

**User Story:** As a developer, I want to add SVG layers to compositions, so that I can incorporate vector graphics.

**Implementation Note:** SVG layers wrap Scrawl-canvas Picture entities with SVG assets. Scrawl-canvas handles SVG parsing, rendering, and scaling. SVG elements are automatically ingested from the DOM or loaded as assets.

#### Acceptance Criteria

1. THE Engine SHALL create SVG layers using Scrawl-canvas Picture entities with SVG assets
2. Scrawl-canvas SHALL parse SVG data and render it to canvas
3. Scrawl-canvas SHALL preserve SVG viewBox and aspect ratio settings
4. Scrawl-canvas SHALL support SVG scaling without quality loss (vector rendering)
5. IF an SVG contains invalid markup, THEN Scrawl-canvas SHALL emit a parsing error
6. THE Engine SHALL animate SVG-based entities using Scrawl-canvas Tween objects

### Requirement 7: Shape Layer Support (Wraps Scrawl-canvas Shape Entities)

**User Story:** As a developer, I want to create shape layers programmatically, so that I can generate vector graphics without external files.

**Implementation Note:** Shape layers wrap Scrawl-canvas shape entities (Block, Wheel, Oval, Rectangle, Polygon, Star, Spiral, Tetragon, Line, Bezier, Quadratic, Shape, etc.). Scrawl-canvas handles shape rendering, fills, strokes, and gradients. Multiple shapes use Scrawl-canvas Groups.

#### Acceptance Criteria

1. THE Engine SHALL create shape layers using Scrawl-canvas shape entities (Block, Wheel, Oval, Rectangle, Polygon, Star, Line, Bezier, Quadratic, Shape, etc.)
2. Scrawl-canvas SHALL support fill color with RGBA, OKLCH, and Display-P3 color spaces
3. Scrawl-canvas SHALL support stroke color, width, and line cap/join properties via State objects
4. Scrawl-canvas SHALL support gradient fills (linear, radial, conic) via Gradient objects
5. THE Engine SHALL animate shape properties using Scrawl-canvas Tween objects
6. THE Engine SHALL support multiple shapes within a single layer using Scrawl-canvas Groups
7. Scrawl-canvas SHALL render shapes during the display cycle compile and show operations

### Requirement 8: Text Layer Support (Wraps Scrawl-canvas Label + EnhancedLabel)

**User Story:** As a developer, I want to create text layers with typography controls, so that I can add animated text to compositions.

**Implementation Note:** Text layers wrap Scrawl-canvas Label and EnhancedLabel entities. Label provides basic text with DOM reflection for accessibility. EnhancedLabel provides advanced layout shaping, RTL/non-Western languages, path-following, and interactive highlighting. Scrawl-canvas handles font loading, text measurement, wrapping, and rendering.

#### Acceptance Criteria

1. THE Engine SHALL create text layers using Scrawl-canvas Label or EnhancedLabel entities
2. Scrawl-canvas SHALL support font weight, style (italic, normal), and text alignment via State objects
3. Scrawl-canvas SHALL support line height and letter spacing adjustments
4. Scrawl-canvas SHALL support text stroke (outline) with color and width via State objects
5. Scrawl-canvas SHALL support text shadows with offset, blur, and color via State objects
6. Scrawl-canvas EnhancedLabel SHALL wrap text within specified bounds with custom line/word breaking
7. THE Engine SHALL support character-by-character animation using Scrawl-canvas letter-by-letter layout
8. Scrawl-canvas SHALL fall back to system fonts when specified fonts are unavailable

### Requirement 9: Transform Properties (Wraps Scrawl-canvas Entity Positioning)

**User Story:** As a developer, I want to control layer position, rotation, and scale, so that I can animate layer transformations.

**Implementation Note:** Transform properties wrap Scrawl-canvas entity positioning attributes (start, offset, position, handle, roll, scale). Scrawl-canvas handles transform matrix calculations, pivot/mimic positioning, and 3D rotation via CSS transforms on Canvas artefacts.

#### Acceptance Criteria

1. THE Engine SHALL provide position property mapping to Scrawl-canvas start/offset attributes
2. THE Engine SHALL provide rotation property mapping to Scrawl-canvas roll attribute (degrees)
3. THE Engine SHALL provide scale property mapping to Scrawl-canvas scale attribute
4. THE Engine SHALL provide anchor point property mapping to Scrawl-canvas handle attribute
5. THE Engine SHALL provide opacity property mapping to Scrawl-canvas globalAlpha
6. Scrawl-canvas SHALL update entity rendering during the display cycle when properties change
7. Scrawl-canvas SHALL apply transformations in the correct order during stamp operations
8. THE Engine SHALL support 3D transforms using Scrawl-canvas Canvas artefact pitch, yaw, roll attributes

### Requirement 10: Keyframe Animation (Wraps Scrawl-canvas Tween + GSAP)

**User Story:** As a developer, I want to set keyframes on layer properties, so that I can create time-based animations.

**Implementation Note:** Keyframes wrap Scrawl-canvas Tween objects. Scrawl-canvas Tweens handle property interpolation with easing functions. GSAP timeline integration provides advanced choreography. Scrawl-canvas Ticker objects control time-based animation.

#### Acceptance Criteria

1. THE Engine SHALL create keyframes using GSAP tweens at specific time positions
2. GSAP tweens SHALL interpolate property values between keyframes
3. GSAP SHALL support easing functions (linear, power1, power2, power3, power4, elastic, back, bounce, etc.)
4. THE Engine SHALL update Scrawl-canvas entity properties directly from GSAP tween interpolated values on each frame
5. THE Engine SHALL allow keyframe modification by updating GSAP tween definitions
6. THE Engine SHALL remove keyframes by killing GSAP tweens
7. GSAP timeline SHALL calculate interpolated values based on current time position
8. THE Engine SHALL support hold keyframes using GSAP's immediateRender and duration:0 tweens (no interpolation)
9. THE Engine SHALL validate that keyframe times are within Composition duration
10. THE Engine SHALL NOT create independent Scrawl-canvas Tween objects to avoid dual animation system conflicts

### Requirement 11: Timeline Control (Integrates GSAP + Scrawl-canvas Ticker)

**User Story:** As a developer, I want to control timeline playback, so that I can preview and render animations.

**Implementation Note:** Timeline uses GSAP timeline as the master clock. GSAP provides advanced choreography (labels, callbacks, nested timelines). Scrawl-canvas RenderAnimation triggers the display cycle. The Engine synchronizes GSAP timeline position with Scrawl-canvas rendering and Mediabunny media playback.

#### Acceptance Criteria

1. THE Engine SHALL play the Timeline using GSAP timeline.play() and Scrawl-canvas RenderAnimation
2. THE Engine SHALL pause the Timeline using GSAP timeline.pause()
3. THE Engine SHALL seek the Timeline using GSAP timeline.seek() and update Scrawl-canvas rendering
4. THE Engine SHALL provide the current Timeline position from GSAP timeline.time()
5. THE Engine SHALL loop the Timeline using GSAP timeline repeat configuration
6. THE Engine SHALL play the Timeline in reverse using GSAP timeline.reverse()
7. Scrawl-canvas RenderAnimation SHALL trigger display cycle on each frame
8. THE Engine SHALL emit events for play, pause, seek, and complete actions

### Requirement 12: GSAP Integration

**User Story:** As a developer, I want to use GSAP for animation sequencing, so that I can leverage advanced timeline choreography.

**Implementation Note:** GSAP timeline is the primary animation controller and handles all property interpolation. The Engine reads interpolated values from GSAP tweens and updates Scrawl-canvas entity properties directly via entity.set(). This avoids dual animation systems and keeps GSAP as the single source of truth for animation timing.

#### Acceptance Criteria

1. THE Engine SHALL integrate GSAP timeline as the primary animation controller
2. THE Engine SHALL use GSAP's native easing functions for all animations
3. THE Engine SHALL support GSAP timeline features (labels, callbacks, nested timelines, stagger)
4. THE Engine SHALL synchronize GSAP timeline.time() with Scrawl-canvas rendering
5. THE Engine SHALL read interpolated values from GSAP tweens and update Scrawl-canvas entity properties via entity.set()
6. THE Engine SHALL support GSAP stagger animations natively without creating separate animation objects

### Requirement 13: Effect System (Uses Scrawl-canvas Filters)

**User Story:** As a developer, I want to apply effects to layers, so that I can create visual transformations.

**Implementation Note:** Effects wrap Scrawl-canvas Filter objects. Scrawl-canvas provides 40+ built-in filters including blur, gaussian-blur, color adjustments, displacement, convolution, and OKLCH color space filters. Filters can be stacked, chained, animated, and applied to Cells, Groups, or individual entities.

#### Acceptance Criteria

1. THE Engine SHALL apply effects to layers using Scrawl-canvas Filter objects in a specified order
2. Scrawl-canvas SHALL provide blur and gaussian-blur filters with radius parameter
3. Scrawl-canvas SHALL provide brightness, contrast, saturation, and hue rotation filters
4. Scrawl-canvas SHALL provide color adjustments (grayscale, sepia, tint, invert, threshold)
5. Scrawl-canvas SHALL provide shadow effects via State object shadow properties
6. Scrawl-canvas SHALL provide glow effects using blur filters with composition
7. THE Engine SHALL animate effect parameters using Scrawl-canvas Tween objects
8. Scrawl-canvas SHALL process stacked filters sequentially during the display cycle
9. THE Engine SHALL leverage Scrawl-canvas's 40+ built-in filters without reimplementation

### Requirement 14: Masking (Uses Scrawl-canvas Entity Clipping)

**User Story:** As a developer, I want to apply masks to layers, so that I can control layer visibility with shapes.

**Implementation Note:** Masking uses Scrawl-canvas entity clipping and filter stencils. Scrawl-canvas supports using entities as clip paths and filter stencils. Complex mask modes use Scrawl-canvas composition operations and Cells.

#### Acceptance Criteria

1. THE Engine SHALL create masks using Scrawl-canvas shape entities as clip paths
2. THE Engine SHALL support mask modes using Scrawl-canvas globalCompositeOperation
3. THE Engine SHALL support mask feathering using Scrawl-canvas blur filters on mask entities
4. THE Engine SHALL support mask opacity using Scrawl-canvas entity globalAlpha
5. THE Engine SHALL animate mask paths using Scrawl-canvas Tween objects
6. THE Engine SHALL support multiple masks per layer using Scrawl-canvas Cells and composition
7. Scrawl-canvas SHALL clip layer content to the mask shape during rendering

### Requirement 15: Blend Modes (Uses Scrawl-canvas Composition)

**User Story:** As a developer, I want to set blend modes on layers, so that I can control how layers composite together.

**Implementation Note:** Blend modes map directly to Scrawl-canvas globalCompositeOperation. Scrawl-canvas supports all standard canvas composite operations.

#### Acceptance Criteria

1. THE Engine SHALL support blend modes by setting Scrawl-canvas entity globalCompositeOperation
2. Scrawl-canvas SHALL apply the compositing algorithm during the display cycle show operation
3. THE Engine SHALL validate that the specified blend mode is supported by Scrawl-canvas
4. THE Engine SHALL default to 'source-over' (normal) blend mode for new layers

### Requirement 16: Particle System (Uses Scrawl-canvas Particle Engine)

**User Story:** As a developer, I want to create particle systems, so that I can generate dynamic particle effects.

**Implementation Note:** Particle systems wrap Scrawl-canvas particle entities (Emitter, Net, Tracer). Scrawl-canvas provides a complete 2D particle physics engine with Particle, ParticleWorld, Force, and Spring objects. Physics calculations (Euler, Enhanced-euler, Runge-Kutter) are built into Scrawl-canvas.

#### Acceptance Criteria

1. THE Engine SHALL create particle systems using Scrawl-canvas Emitter entities
2. Scrawl-canvas Emitter SHALL support particle properties (lifetime, size, color, velocity, acceleration)
3. Scrawl-canvas SHALL support particle randomization ranges via Emitter configuration
4. Scrawl-canvas ParticleWorld SHALL update particle positions based on physics simulation
5. Scrawl-canvas SHALL remove particles when their lifetime expires
6. Scrawl-canvas SHALL support particle textures using Picture entities or shape entities
7. THE Engine SHALL leverage Scrawl-canvas's built-in particle physics engine
8. Scrawl-canvas Ticker SHALL emit and update particles during the display cycle

### Requirement 17: Precomposition (Uses Scrawl-canvas Cells)

**User Story:** As a developer, I want to nest compositions within other compositions, so that I can create modular and reusable animation components.

**Implementation Note:** Precompositions use Scrawl-canvas Cells. A Cell is an off-screen canvas that can be rendered as a Picture entity in another Canvas. Scrawl-canvas handles Cell rendering and caching. Time remapping controls Cell animation playback.

#### Acceptance Criteria

1. THE Engine SHALL create a precomposition layer using a Scrawl-canvas Cell rendered as a Picture entity
2. Scrawl-canvas SHALL render the Cell's contents when the Picture entity is stamped
3. THE Engine SHALL support time remapping by controlling the Cell's animation Ticker
4. THE Engine SHALL apply transforms and filters to the Picture entity representing the precomp
5. THE Engine SHALL prevent circular references by tracking Cell dependencies
6. IF a circular reference is detected, THEN THE Engine SHALL return a descriptive error

### Requirement 18: Expression System (Custom Implementation)

**User Story:** As a developer, I want to use expressions to drive property values, so that I can create procedural animations.

**Implementation Note:** Expression system is a custom implementation. Expressions are JavaScript functions evaluated on each frame. The Engine provides expression context (time, frame, layer properties, audio data). Expressions update Scrawl-canvas entity properties before the display cycle.

#### Acceptance Criteria

1. THE Engine SHALL evaluate JavaScript expressions to compute property values
2. THE Engine SHALL provide expression context with time, frame, and layer properties
3. THE Engine SHALL provide expression helper functions (wiggle, random, clamp, lerp, etc.)
4. THE Engine SHALL update expression-driven properties before each Scrawl-canvas display cycle
5. IF an expression throws an error, THEN THE Engine SHALL return a descriptive error with the expression code
6. THE Engine SHALL support expressions on all animatable Scrawl-canvas entity properties

### Requirement 19: Media Asset Management (Uses Scrawl-canvas Asset System)

**User Story:** As a developer, I want to manage media assets efficiently, so that I can reuse resources and optimize memory.

**Implementation Note:** Asset management wraps Scrawl-canvas's built-in asset system. Scrawl-canvas automatically ingests DOM images, sprites, and videos. It provides asset caching, progressive rendering, and responsive image support (srcset).

#### Acceptance Criteria

1. Scrawl-canvas SHALL load media assets asynchronously and cache them automatically
2. Scrawl-canvas SHALL reuse cached assets when the same file is referenced multiple times
3. Scrawl-canvas SHALL manage asset lifecycle and memory cleanup
4. THE Engine SHALL provide asset loading progress events by monitoring Scrawl-canvas asset loading
5. THE Engine SHALL support asset preloading using Scrawl-canvas asset loading functions
6. Scrawl-canvas SHALL validate media asset file formats during loading
7. IF a media asset file format is unsupported, THEN Scrawl-canvas SHALL emit an error event

### Requirement 20: Rendering Pipeline (Uses Scrawl-canvas Display Cycle)

**User Story:** As a developer, I want a high-performance rendering pipeline, so that I can achieve 60fps playback.

**Implementation Note:** Rendering uses Scrawl-canvas's display cycle (clear, compile, show operations). Scrawl-canvas handles requestAnimationFrame loop, z-ordering, transform calculations, and canvas rendering. The Engine provides a thin wrapper to trigger the display cycle.

#### Acceptance Criteria

1. Scrawl-canvas SHALL render the Composition at the specified frame rate using requestAnimationFrame
2. Scrawl-canvas SHALL render entities in z-order during the compile operation
3. Scrawl-canvas SHALL apply transforms, effects, masks, and blend modes during stamp operations
4. THE Engine SHALL use Scrawl-canvas display cycle for all canvas rendering operations
5. Scrawl-canvas SHALL skip rendering of hidden entities (visibility: false)
6. Scrawl-canvas SHALL use requestAnimationFrame for smooth playback via RenderAnimation objects
7. WHEN rendering performance drops, THE Engine SHALL emit a performance warning event

### Requirement 21: Video Export (Uses Mediabunny + Scrawl-canvas Rendering)

**User Story:** As a developer, I want to export compositions to video files, so that I can generate final video output.

**Implementation Note:** Video export orchestrates Scrawl-canvas rendering with Mediabunny muxing. The Engine:
1. Seeks the GSAP timeline frame-by-frame
2. Triggers Scrawl-canvas display cycle to render each frame
3. Captures canvas data (canvas.toBlob())
4. Encodes frames using WebCodecs (via Mediabunny's wrapper)
5. Sends encoded frames to Mediabunny for muxing into MP4/WebM container

Mediabunny handles the video container format (MP4 boxes, WebM clusters) and writes the final video file.

#### Acceptance Criteria

1. THE Exporter SHALL render the Composition frame-by-frame using Scrawl-canvas display cycle
2. Mediabunny SHALL encode frames to MP4 and WebM output formats via WebCodecs API
3. THE Exporter SHALL support configurable video bitrate and quality settings
4. Mediabunny SHALL encode audio tracks into the output video
5. THE Exporter SHALL provide export progress events (percentage complete)
6. Mediabunny SHALL use WebCodecs API for hardware-accelerated encoding
7. IF export fails, THEN THE Exporter SHALL return a descriptive error with the failure reason
8. THE Exporter SHALL support custom frame rate for output video (independent of Composition frame rate)

### Requirement 22: Frame Export (Uses Scrawl-canvas Canvas Data)

**User Story:** As a developer, I want to export individual frames as images, so that I can generate image sequences or thumbnails.

**Implementation Note:** Frame export uses Scrawl-canvas canvas element data. The Engine seeks to the specified time, triggers Scrawl-canvas display cycle, and exports canvas data using canvas.toBlob() or canvas.toDataURL().

#### Acceptance Criteria

1. THE Exporter SHALL render a single frame at a specified time using Scrawl-canvas display cycle
2. THE Exporter SHALL export frames as PNG, JPG, or WebP using canvas.toBlob()
3. THE Exporter SHALL support configurable image quality for lossy formats
4. THE Exporter SHALL return frame data as Blob, ArrayBuffer, or Data URL
5. THE Exporter SHALL support batch export of frame sequences with frame number padding

### Requirement 23: Serialization and Deserialization (Uses Scrawl-canvas Packet System)

**User Story:** As a developer, I want to serialize compositions to JSON, so that I can save and load projects.

**Implementation Note:** Serialization wraps Scrawl-canvas's packet system. Scrawl-canvas objects support saveAsPacket() and clone() methods. The Engine adds composition-level metadata and GSAP timeline state.

#### Acceptance Criteria

1. THE Engine SHALL serialize a Composition to JSON using Scrawl-canvas packet system
2. THE Engine SHALL deserialize JSON data using Scrawl-canvas packet import
3. Scrawl-canvas SHALL preserve entity properties, tweens, filters, and state during serialization
4. THE Engine SHALL handle media asset references with file paths or URLs
5. IF deserialization encounters invalid JSON, THEN THE Engine SHALL return a descriptive parsing error
6. FOR ALL valid Compositions, serializing then deserializing SHALL produce an equivalent Composition

### Requirement 24: Parser for Project Files

**User Story:** As a developer, I want to parse project files, so that I can load compositions from saved data.

#### Acceptance Criteria

1. WHEN a valid JSON project file is provided, THE Parser SHALL parse it into a Composition object
2. WHEN an invalid JSON project file is provided, THE Parser SHALL return a descriptive error
3. THE Pretty_Printer SHALL format Composition objects back into valid JSON project files
4. FOR ALL valid Composition objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 25: Audio Reactivity (Uses Web Audio API for FFT Analysis)

**User Story:** As a developer, I want to drive animations with audio data, so that I can create audio-reactive motion graphics.

**Implementation Note:** Audio reactivity uses Web Audio API's AnalyserNode for FFT analysis. Mediabunny handles audio file loading and decoding, then the decoded audio is connected to Web Audio API's AnalyserNode for frequency and amplitude analysis. This data is made available to expressions for driving animations.

#### Acceptance Criteria

1. THE Engine SHALL analyze audio frequency data using Web Audio API AnalyserNode with FFT
2. THE Engine SHALL provide frequency band values (bass, mid, treble) normalized from 0.0 to 1.0
3. THE Engine SHALL provide overall audio amplitude normalized from 0.0 to 1.0
4. THE Engine SHALL update audio analysis data before each Scrawl-canvas display cycle
5. THE Engine SHALL allow property expressions to access audio analysis data via expression context
6. THE Engine SHALL support configurable FFT size (512, 1024, 2048, 4096)

### Requirement 26: Performance Monitoring (Uses Scrawl-canvas + Custom Metrics)

**User Story:** As a developer, I want to monitor rendering performance, so that I can optimize my compositions.

**Implementation Note:** Performance monitoring wraps Scrawl-canvas performance tracking and adds custom metrics. Scrawl-canvas provides frame timing via RenderAnimation. The Engine adds memory tracking and dropped frame detection.

#### Acceptance Criteria

1. THE Engine SHALL measure and report current frame rate (FPS) using Scrawl-canvas RenderAnimation
2. THE Engine SHALL measure and report frame render time in milliseconds
3. THE Engine SHALL measure and report memory usage for media assets
4. THE Engine SHALL emit performance metrics via events
5. WHERE performance monitoring is enabled, THE Engine SHALL track dropped frames

### Requirement 27: Error Handling

**User Story:** As a developer, I want descriptive error messages, so that I can debug issues quickly.

#### Acceptance Criteria

1. WHEN an error occurs, THE Engine SHALL return an error object with message and error code
2. THE Engine SHALL include context information in errors (file path, layer name, property name)
3. THE Engine SHALL validate API inputs and return validation errors before processing
4. THE Engine SHALL log warnings for non-critical issues (performance degradation, missing fonts)
5. THE Engine SHALL provide error recovery suggestions where applicable

### Requirement 28: Three-Library Synchronization

**User Story:** As a developer, I want Scrawl-canvas, GSAP, and Mediabunny to work together seamlessly, so that animations, rendering, and media playback stay perfectly synchronized.

**Implementation Note:** This is the core integration challenge. GSAP controls the timeline (master clock), Scrawl-canvas handles rendering (display cycle), and Mediabunny handles media playback (video/audio). All three must stay in sync.

#### Acceptance Criteria

1. GSAP timeline SHALL be the master clock controlling current time position
2. WHEN GSAP timeline position changes, THE Engine SHALL update Scrawl-canvas rendering to match
3. WHEN GSAP timeline position changes, THE Engine SHALL update Mediabunny video/audio playback position to match
4. Scrawl-canvas RenderAnimation SHALL trigger on GSAP timeline updates to render frames
5. Scrawl-canvas display cycle (clear, compile, show) SHALL execute at the composition frame rate
6. Mediabunny video elements SHALL seek to currentTime matching GSAP timeline position
7. WHEN seeking Mediabunny video elements, THE Engine SHALL await the 'seeked' event before proceeding with frame capture
8. Mediabunny audio elements SHALL seek to currentTime matching GSAP timeline position
9. WHEN GSAP timeline plays, Scrawl-canvas RenderAnimation SHALL start and Mediabunny media SHALL play
10. WHEN GSAP timeline pauses, Scrawl-canvas RenderAnimation SHALL stop and Mediabunny media SHALL pause
11. WHEN GSAP timeline seeks, Scrawl-canvas SHALL render the frame at that time and Mediabunny media SHALL seek to that time
12. THE Engine SHALL maintain frame-accurate synchronization within 1 frame tolerance (1/frameRate seconds)
13. THE Engine SHALL update Scrawl-canvas entity properties via entity.set() based on GSAP tween interpolation, rather than relying on Scrawl-canvas's independent Tween system
14. FOR export, THE Engine SHALL step through frames sequentially, ensuring Scrawl-canvas renders and Mediabunny media are at correct positions before capturing each frame

### Requirement 29: API Design

**User Story:** As a developer, I want a clean and intuitive API, so that I can build motion graphics efficiently.

#### Acceptance Criteria

1. THE Engine SHALL provide both imperative (method-based) and declarative (config-based) APIs
2. THE Engine SHALL use method chaining for fluent API style
3. THE Engine SHALL provide TypeScript type definitions for all public APIs
4. THE Engine SHALL follow semantic versioning for releases
5. THE Engine SHALL maintain zero UI dependencies (core library only)
6. THE Engine SHALL support tree-shaking for optimal bundle size

### Requirement 30: Browser Compatibility (Leverages Scrawl-canvas Compatibility)

**User Story:** As a developer, I want the engine to work across modern browsers, so that I can reach a wide audience.

**Implementation Note:** Browser compatibility leverages Scrawl-canvas's built-in compatibility features. Scrawl-canvas handles canvas API differences, color space fallbacks, and responsive canvas. The Engine adds WebCodecs and Web Audio API detection.

#### Acceptance Criteria

1. Scrawl-canvas SHALL support Chrome, Firefox, Safari, and Edge (latest 2 versions)
2. Scrawl-canvas SHALL provide fallbacks for unsupported color spaces (Display-P3 → sRGB)
3. THE Engine SHALL require WebCodecs API support for video export (Chrome, Edge)
4. IF a required browser API is unavailable, THEN THE Engine SHALL return a descriptive capability error
5. THE Engine SHALL provide feature detection methods for WebCodecs and Web Audio API

### Requirement 31: Deep Modules Architecture

**User Story:** As a developer maintaining the codebase, I want deep modules with simple interfaces and complex implementations, so that I can navigate the codebase easily and avoid cognitive burnout.

#### Acceptance Criteria

1. THE Engine SHALL organize code into deep modules where each module has a simple interface but handles significant complexity internally
2. THE Engine SHALL minimize the number of top-level modules to reduce the mental map of the codebase
3. THE Engine SHALL avoid shallow modules (simple interface, simple implementation) that add navigation overhead
4. WHEN a module's public API surface exceeds 10 methods, THE Engine SHALL refactor it into a deep module with a simpler interface
5. THE Engine SHALL hide implementation details behind module boundaries
6. THE Engine SHALL provide a single entry point per major feature domain (composition, animation, effects, export)
7. THE Engine SHALL document the module hierarchy with a clear architectural diagram showing no more than 7±2 top-level modules

### Requirement 32: Progressive Complexity Disclosure

**User Story:** As a developer using the engine, I want to start with simple APIs and progressively access advanced features, so that I can learn the system incrementally without being overwhelmed.

#### Acceptance Criteria

1. THE Engine SHALL provide a simple default API for common use cases (80% of usage)
2. THE Engine SHALL expose advanced configuration options through optional parameters or separate methods
3. WHEN a developer uses the basic API, THE Engine SHALL hide internal complexity completely
4. THE Engine SHALL provide three levels of API complexity: beginner (simple defaults), intermediate (common customization), advanced (full control)
5. THE Engine SHALL document API levels clearly with examples for each complexity tier
6. THE Engine SHALL allow developers to opt-in to complexity rather than opt-out
7. WHEN advanced features are needed, THE Engine SHALL provide clear upgrade paths from simple to complex APIs

### Requirement 33: Cognitive Load Management

**User Story:** As a developer maintaining the codebase, I want clear module boundaries and minimal inter-module dependencies, so that I can understand and modify code without context rot.

#### Acceptance Criteria

1. THE Engine SHALL limit module dependencies to a maximum of 3 direct dependencies per module
2. THE Engine SHALL prevent circular dependencies between modules
3. THE Engine SHALL use dependency injection to decouple modules
4. WHEN a module needs to communicate with another, THE Engine SHALL use well-defined interfaces or events
5. THE Engine SHALL group related functionality into cohesive modules (high cohesion)
6. THE Engine SHALL minimize coupling between unrelated modules (low coupling)
7. THE Engine SHALL provide a dependency graph visualization showing module relationships
8. IF a module has more than 5 dependencies, THEN THE Engine SHALL refactor it into smaller, more focused modules

### Requirement 34: Module System and Tree-Shaking

**User Story:** As a developer, I want a modular architecture with tree-shaking support, so that I can import only the features I need.

#### Acceptance Criteria

1. THE Engine SHALL provide separate modules for core, effects, particles, and export functionality
2. THE Engine SHALL support ES modules (ESM) format
3. THE Engine SHALL support CommonJS format for Node.js compatibility
4. THE Engine SHALL allow importing individual modules without loading the entire library
5. THE Engine SHALL document module dependencies clearly
6. THE Engine SHALL ensure all modules are tree-shakable (no side effects in module initialization)

### Requirement 35: Interface Simplicity Enforcement

**User Story:** As a developer maintaining the codebase, I want enforced interface simplicity rules, so that modules remain deep and maintainable over time.

#### Acceptance Criteria

1. THE Engine SHALL enforce that public module interfaces have no more than 10 public methods
2. THE Engine SHALL enforce that public methods have no more than 4 parameters
3. WHEN a method requires more than 4 parameters, THE Engine SHALL use a configuration object
4. THE Engine SHALL provide sensible defaults for all optional parameters
5. THE Engine SHALL use method overloading or builder patterns to simplify complex object creation
6. THE Engine SHALL validate interface complexity during code review with automated linting rules
7. IF a module interface grows beyond complexity limits, THEN THE Engine SHALL split it into multiple focused modules
