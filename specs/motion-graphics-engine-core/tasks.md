# Implementation Plan: Motion Graphics Engine Core

## Overview

This implementation plan follows a **wrapper/adapter architecture** where we build a thin layer over Scrawl-canvas rather than reimplementing its features. The engine will be built in TypeScript, wrapping Scrawl-canvas for rendering, integrating GSAP for timeline sequencing, Mediabunny for video export, and Web Audio API for audio reactivity.

**Key Principle**: Leverage Scrawl-canvas's existing capabilities (scene graph, 40+ filters, particle physics, text layout, animation, assets, accessibility) rather than rebuilding them.

## Implementation Order

1. **Integration Module** - GSAP-Scrawl sync and entity mapping (foundation)
2. **Core Module** - Composition and Layer wrappers
3. **Animation Module** - Keyframe system and expressions
4. **Audio Module** - Audio reactivity
5. **Export Module** - Video and frame export

## Tasks

- [] 1. Project setup and foundation
  - Initialize TypeScript project with ES modules and CommonJS support
  - Configure build system (tsup/rollup) for tree-shaking
  - Set up testing framework (bun:test) with fast-check for property-based testing
  - Install dependencies: Scrawl-canvas, GSAP, Mediabunny, Web Audio API types
  - Create module structure: core, animation, export, audio, integration
  - Configure TypeScript with strict mode and type definitions
  - _Requirements: 28.3, 28.6, 33.1, 33.2, 33.3_

- [] 2. Integration Module - Entity mapping
  - [] 2.1 Create Layer-to-Entity mapping system
    - Map LayerType enum to Scrawl-canvas entity factories
    - Create bidirectional Layer <-> Entity mapping registry
    - Implement mapLayerTypeToEntityFactory() function
    - Implement mapEntityToLayer() function
    - Support entity types: Block, Wheel, Picture, Label, Emitter, Net, Tracer
    - _Requirements: 2.1, 3.1, 4.1, 6.1, 7.1, 8.1, 16.1_
  
  - [ ]* 2.2 Write unit tests for entity mapping
    - Test each LayerType maps to correct Scrawl-canvas entity factory
    - Test bidirectional mapping consistency
    - _Requirements: 2.1_

- [ ] 3. Integration Module - GSAP-Scrawl-Mediabunny synchronization
  - [ ] 3.1 Implement three-library sync system
    - Create master clock using GSAP timeline as single source of truth
    - Implement syncToGSAPTime() to update Scrawl-canvas rendering and Mediabunny media
    - Handle GSAP timeline events (play, pause, seek, complete)
    - Read interpolated values from GSAP tweens
    - Update Scrawl-canvas entity properties via entity.set() based on GSAP values
    - Update Mediabunny video/audio currentTime based on GSAP timeline.time()
    - Trigger Scrawl-canvas RenderAnimation on GSAP timeline updates
    - _Requirements: 11.1, 11.2, 11.3, 12.4, 28.1, 28.2, 28.3, 28.4, 28.5, 28.7, 28.8, 28.13_
  
  - [ ] 3.2 Implement real-time playback synchronization
    - Create RenderAnimation hook function that syncs all three libraries
    - On each frame: read GSAP time, read GSAP tween values, update Scrawl-canvas entities, update Mediabunny media
    - Trigger Scrawl-canvas display cycle (clear, compile, show) at composition frame rate
    - Handle play: start GSAP timeline, start RenderAnimation, play Mediabunny media
    - Handle pause: pause GSAP timeline, stop RenderAnimation, pause Mediabunny media
    - Handle seek: seek GSAP timeline, update Scrawl-canvas entities, seek Mediabunny media, render frame
    - _Requirements: 28.9, 28.10, 28.11_
  
  - [ ] 3.3 Implement frame-accurate synchronization
    - Ensure GSAP and Mediabunny stay within 1 frame tolerance (1/frameRate seconds)
    - Detect desynchronization by comparing GSAP time and Mediabunny currentTime
    - Implement resync mechanism if desync exceeds 1 frame
    - Log warnings when desync detected
    - _Requirements: 28.12_
  
  - [ ]* 3.4 Write property test for three-library synchronization
    - **Property: GSAP-Scrawl-Mediabunny Synchronization**
    - Test that GSAP time and Mediabunny media stay synchronized
    - Test at random time positions across composition duration
    - Verify all systems within 1 frame tolerance
    - Wait for 'seeked' events before validation
    - **Validates: Requirements 28.1, 28.2, 28.3, 28.12**
  
  - [ ]* 3.5 Write unit tests for synchronization edge cases
    - Test synchronization at time 0 (start)
    - Test synchronization at composition duration (end)
    - Test synchronization during rapid seeks (scrubbing)
    - Test synchronization with time remapping
    - Test synchronization with precompositions
    - Test awaiting 'seeked' events during seeks
    - _Requirements: 28.9, 28.10, 28.11_

- [ ] 4. Integration Module - Serialization wrapper
  - [ ] 4.1 Wrap Scrawl-canvas packet system
    - Implement serializeComposition() using Scrawl-canvas saveAsPacket()
    - Implement deserializeComposition() using Scrawl-canvas importPacket()
    - Add composition-level metadata (duration, frameRate, GSAP timeline state)
    - Store GSAP timeline labels and tweens in serialization
    - Handle Layer-Entity mapping during deserialization
    - _Requirements: 23.1, 23.2, 23.3, 23.4_
  
  - [ ]* 4.2 Write property test for serialization round trip
    - **Property 9: Serialization Round Trip (via Scrawl-canvas Packet System)**
    - **Validates: Requirements 23.6**

- [ ] 5. Checkpoint - Integration module validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Core Module - Composition wrapper
  - [ ] 6.1 Implement Composition data model
    - Create Composition interface wrapping Scrawl-canvas Canvas + Cell + Group
    - Initialize Scrawl-canvas Canvas artefact with makeCanvas()
    - Initialize base Cell with makeCell()
    - Initialize main Group with makeGroup()
    - Create GSAP timeline instance
    - Implement composition validation (positive dimensions, valid frame rate 1-120)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_
  
  - [ ]* 6.2 Write property test for composition validation
    - **Property 1: Composition Validation Consistency**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  
  - [ ] 6.3 Implement Composition methods
    - Implement createComposition() factory function
    - Implement play() using GSAP timeline.play()
    - Implement pause() using GSAP timeline.pause()
    - Implement seek() using GSAP timeline.seek()
    - Sync GSAP timeline with Scrawl-canvas rendering via Integration Module
    - _Requirements: 1.6, 11.1, 11.2, 11.3, 11.4_

- [ ] 7. Core Module - Layer wrapper
  - [ ] 7.1 Implement Layer data model
    - Create Layer interface wrapping Scrawl-canvas entities
    - Store reference to _scrawlEntity (Block, Wheel, Picture, Label, Emitter, etc.)
    - Map Transform properties to Scrawl-canvas entity attributes (start, offset, roll, scale, handle)
    - Map visibility properties to Scrawl-canvas entity visibility and globalAlpha
    - _Requirements: 2.1, 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ] 7.2 Implement addLayer() method
    - Use Integration Module to map LayerType to Scrawl-canvas entity factory
    - Create appropriate Scrawl-canvas entity (makePicture, makeLabel, makeEmitter, etc.)
    - Add entity to Scrawl-canvas main Group
    - Set up parent-child relationships using Scrawl-canvas pivot/mimic
    - Return Layer wrapper object
    - _Requirements: 2.1, 2.2, 3.1, 4.1, 6.1, 7.1, 8.1, 16.1_
  
  - [ ] 7.3 Implement layer hierarchy management
    - Implement removeLayer() and clean up Scrawl-canvas entity
    - Implement reorderLayer() using Scrawl-canvas Group ordering
    - Handle parent-child relationships using Scrawl-canvas pivot/mimic positioning
    - Cascade deletion of child layers
    - _Requirements: 2.3, 2.4, 2.5, 2.8_
  
  - [ ]* 7.4 Write property test for parent transform propagation
    - **Property 2: Parent Transform Propagation (via Scrawl-canvas pivot/mimic)**
    - **Validates: Requirements 2.3**
  
  - [ ]* 7.5 Write property test for layer removal cascade
    - **Property 3: Layer Removal Cascade**
    - **Validates: Requirements 2.8**

- [ ] 8. Core Module - Layer type implementations
  - [ ] 8.1 Implement image layer (wraps Scrawl-canvas Picture entity)
    - Create image layer using makePicture() with image asset
    - Scrawl-canvas handles image loading and caching automatically
    - Map scaleMode to Scrawl-canvas Picture copy methods (fill, fit, none)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_
  
  - [ ]* 8.2 Write property test for image loading
    - **Property 4: Image Loading Round Trip (via Scrawl-canvas Picture entity)**
    - **Validates: Requirements 3.1, 3.2**
  
  - [ ] 8.3 Implement video layer with Mediabunny synchronization
    - Create video layer using makePicture() with video asset
    - Use Mediabunny to load video and extract metadata (duration, frame rate, codec)
    - Sync video.currentTime with GSAP timeline position via Integration Module
    - Handle video trimming via time offset calculations (in-point, out-point)
    - Handle time remapping by applying remap function to timeline position
    - CRITICAL: Await 'seeked' event before considering video ready for rendering
    - Implement seek completion detection for frame-accurate export
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 28.7, 28.8_
  
  - [ ]* 8.4 Write property test for video timeline sync
    - **Property 5: Video Timeline Synchronization**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.7**

  - [ ] 8.5 Implement SVG layer (wraps Scrawl-canvas Picture entity)
    - Create SVG layer using makePicture() with SVG asset
    - Scrawl-canvas handles SVG parsing and rendering automatically
    - Scrawl-canvas preserves viewBox and aspect ratio
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_
  
  - [ ] 8.6 Implement shape layer (wraps Scrawl-canvas shape entities)
    - Create shape layers using Scrawl-canvas entity factories (makeBlock, makeWheel, makeOval, makeRectangle, makePolygon, makeStar, makeLine, makeBezier, makeQuadratic, makeShape)
    - Use Scrawl-canvas State objects for fill and stroke properties
    - Use Scrawl-canvas Gradient objects for gradient fills
    - Support multiple shapes using Scrawl-canvas Groups
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_
  
  - [ ] 8.7 Implement text layer (wraps Scrawl-canvas Label/EnhancedLabel)
    - Create text layers using makeLabel() or makeEnhancedLabel()
    - Scrawl-canvas handles font loading, text measurement, wrapping
    - Use Scrawl-canvas State objects for text stroke and shadow
    - Support character-by-character animation using Scrawl-canvas letter-by-letter layout
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  
  - [ ] 8.8 Implement particle layer (wraps Scrawl-canvas Emitter/Net/Tracer)
    - Create particle layers using makeEmitter(), makeNet(), or makeTracer()
    - Scrawl-canvas handles particle physics simulation automatically
    - Configure particle properties via Scrawl-canvas particle config
    - Scrawl-canvas ParticleWorld updates particles during display cycle
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

- [ ] 9. Checkpoint - Core module validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Animation Module - Keyframe system
  - [ ] 10.1 Implement keyframe system using GSAP tweens
    - Create Keyframe interface with GSAP tween reference
    - Implement addKeyframe() using GSAP timeline.to() or timeline.fromTo()
    - Map property paths to target objects that GSAP will animate
    - Use GSAP's native easing functions
    - On each frame, read interpolated values from GSAP tweens
    - Update Scrawl-canvas entity properties via entity.set() with interpolated values
    - Do NOT create Scrawl-canvas Tween objects (avoid dual animation systems)
    - Store reference to GSAP tween in Keyframe object
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.10, 28.13_
  
  - [ ] 10.2 Implement keyframe management
    - Implement removeKeyframe() by killing GSAP tweens
    - Implement updateKeyframe() by updating GSAP tween definitions
    - Handle hold keyframes using GSAP duration:0 tweens (no interpolation)
    - Validate keyframe times within composition duration
    - _Requirements: 10.5, 10.6, 10.8, 10.9_
  
  - [ ]* 10.3 Write property test for keyframe interpolation
    - **Property 7: Keyframe Interpolation Correctness (via GSAP Tween)**
    - Test that GSAP interpolates values correctly
    - Test that Scrawl-canvas entities receive interpolated values
    - **Validates: Requirements 10.2, 10.3, 10.4**

- [ ] 11. Animation Module - GSAP integration
  - [ ] 11.1 Implement GSAP tween creation
    - Create GSAP tweens that animate target objects
    - On each frame, GSAP automatically updates target object properties
    - Read updated properties and sync to Scrawl-canvas entities via entity.set()
    - Use GSAP's native easing functions (no mapping needed)
    - Support GSAP timeline features (labels, callbacks, nested timelines)
    - Support GSAP stagger animations natively
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_
  
  - [ ] 11.2 Implement animate() helper method
    - Create fluent API for simple animations
    - Generate GSAP tweens internally
    - Support duration, delay, easing, repeat, yoyo, callbacks
    - Automatically sync animated values to Scrawl-canvas entities
    - _Requirements: 28.2_

- [ ] 12. Animation Module - Expression system
  - [ ] 12.1 Implement expression evaluation
    - Create expression parser and evaluator (JavaScript function evaluation)
    - Provide expression context (time, frame, layer properties, audio data)
    - Implement expression helper functions (wiggle, random, clamp, lerp, etc.)
    - Update expression-driven properties before each Scrawl-canvas display cycle
    - Handle expression errors with descriptive messages
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_
  
  - [ ]* 12.2 Write property test for expression evaluation
    - **Property 12: Expression Evaluation Context**
    - **Validates: Requirements 18.2, 18.4**
  
  - [ ]* 12.3 Write unit tests for expression error handling
    - Test expression errors with descriptive messages
    - Test fallback to last valid value
    - _Requirements: 18.5_

- [ ] 13. Checkpoint - Animation module validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Audio Module - Audio layer management with Mediabunny synchronization
  - [ ] 14.1 Implement audio layer using Mediabunny
    - Use Mediabunny to demux and decode audio files (MP3, WAV, Ogg, FLAC, AAC, Opus, etc.)
    - Extract duration and sample rate metadata via Mediabunny
    - Connect decoded audio data to Web Audio API AudioContext
    - Sync audio.currentTime with GSAP timeline position via Integration Module
    - Handle audio trimming (in-point, out-point) via time offset calculations
    - Apply volume and fade curves
    - Await 'seeked' event before considering audio ready for playback
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 28.8_

- [ ] 15. Audio Module - Audio reactivity (uses Web Audio API for FFT only)
  - [ ] 15.1 Implement Web Audio API integration for FFT analysis
    - Create AudioContext and AnalyserNode
    - Connect Mediabunny decoded audio to AnalyserNode
    - Implement FFT analysis with configurable size (512, 1024, 2048, 4096)
    - _Requirements: 25.1, 25.6_
  
  - [ ] 15.2 Implement frequency and amplitude extraction
    - Extract frequency band values (bass: 20-250Hz, mid: 250-4000Hz, treble: 4000-20000Hz)
    - Calculate overall audio amplitude
    - Normalize values to range [0.0, 1.0]
    - Update audio analysis data before each Scrawl-canvas display cycle
    - Provide audio data to expression context
    - _Requirements: 25.2, 25.3, 25.4, 25.5, 5.7_
  
  - [ ]* 15.3 Write property test for audio frequency normalization
    - **Property 11: Audio Frequency Analysis Normalization**
    - **Validates: Requirements 25.2, 25.3**

- [ ] 16. Core Module - Effects and masks (wraps Scrawl-canvas Filters)
  - [ ] 16.1 Implement effect wrapper
    - Create Effect interface wrapping Scrawl-canvas Filter objects
    - Implement addEffect() using makeFilter()
    - Map effect types to Scrawl-canvas filter actions (blur, gaussian-blur, brightness, contrast, saturation, hue-rotate, etc.)
    - Support Scrawl-canvas's 40+ built-in filters
    - Apply filters to Scrawl-canvas entities, Groups, or Cells
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.9_
  
  - [ ] 16.2 Implement effect animation
    - Animate effect parameters using Scrawl-canvas Tween objects
    - Support filter stacking (sequential processing)
    - _Requirements: 13.7, 13.8_
  
  - [ ]* 16.3 Write property test for effect stack processing
    - **Property 8: Effect Stack Sequential Processing (via Scrawl-canvas Filters)**
    - **Validates: Requirements 13.8**
  
  - [ ] 16.4 Implement mask wrapper
    - Create masks using Scrawl-canvas shape entities as clip paths
    - Support mask modes using Scrawl-canvas globalCompositeOperation
    - Support mask feathering using Scrawl-canvas blur filters
    - Support mask opacity using Scrawl-canvas entity globalAlpha
    - Animate mask paths using Scrawl-canvas Tween objects
    - Support multiple masks using Scrawl-canvas Cells and composition
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_
  
  - [ ] 16.5 Implement blend modes
    - Map blend modes to Scrawl-canvas globalCompositeOperation
    - Validate blend mode support
    - Default to 'source-over' (normal) blend mode
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [ ] 17. Core Module - Precomposition (wraps Scrawl-canvas Cell)
  - [ ] 17.1 Implement precomposition support
    - Create precomposition layer using Scrawl-canvas Cell (off-screen canvas)
    - Render Cell as Picture entity in parent composition
    - Support time remapping by controlling Cell's animation Ticker
    - Apply transforms and filters to Picture entity
    - Detect and prevent circular references
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [ ] 18. Checkpoint - Effects and precomposition validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Export Module - Video export
  - [ ] 19.1 Implement Mediabunny integration
    - Integrate Mediabunny for WebCodecs API access
    - Set up video encoder with configurable bitrate and quality
    - Support MP4 and WebM output formats
    - _Requirements: 21.2, 21.3, 21.6_
  
  - [ ] 19.2 Implement frame-by-frame video rendering with synchronization
    - Implement exportVideo() with frame-by-frame loop
    - For each frame:
      1. Seek GSAP timeline to exact frame time
      2. Read interpolated values from all active GSAP tweens
      3. Update Scrawl-canvas entity properties via entity.set() with interpolated values
      4. Seek Mediabunny video/audio to match timeline position
      5. **CRITICAL: Await 'seeked' event on ALL media elements before proceeding**
      6. Trigger Scrawl-canvas display cycle (clear, compile, show)
      7. Capture canvas data using canvas.toBlob()
      8. Send frame data to Mediabunny encoder
    - Support custom output frame rate
    - Encode audio tracks via Mediabunny
    - Provide export progress events
    - Handle export failures with descriptive errors
    - Implement retry mechanism for failed frames (up to 3 retries, including media seeks)
    - _Requirements: 21.1, 21.4, 21.5, 21.7, 21.8, 28.7, 28.14_
  
  - [ ]* 19.3 Write property test for video export frame accuracy
    - **Property 10: Video Export Frame Accuracy**
    - Test that each exported frame corresponds to correct GSAP timeline position
    - Test that media seeks complete before frame capture
    - **Validates: Requirements 21.1, 28.7, 28.14**

- [ ] 20. Export Module - Frame export
  - [ ] 20.1 Implement frame export
    - Implement exportFrame() to render single frame at time position
    - Seek GSAP timeline to specified time
    - Read interpolated values from GSAP tweens
    - Update Scrawl-canvas entity properties via entity.set()
    - Trigger Scrawl-canvas display cycle
    - Export canvas data using canvas.toBlob() or canvas.toDataURL()
    - Support PNG, JPG, WebP formats
    - Support configurable image quality for lossy formats
    - Return frame data as Blob, ArrayBuffer, or Data URL
    - _Requirements: 22.1, 22.2, 22.3, 22.4_
  
  - [ ] 20.2 Implement frame sequence export
    - Implement exportFrameSequence() for batch export
    - Support frame number padding
    - Support frame step (export every Nth frame)
    - _Requirements: 22.5_

- [ ] 21. Checkpoint - Export module validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Error handling and validation
  - [ ] 22.1 Implement error system
    - Create EngineError interface with code, message, category, context, suggestion
    - Implement error categories (validation, resource, runtime, capability)
    - Add validation error handling (fail fast with descriptive errors)
    - Add resource error handling (async errors with retry suggestions)
    - Add runtime error handling (graceful degradation with warnings)
    - Add capability error handling (feature detection with clear messaging)
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5_
  
  - [ ]* 22.2 Write unit tests for all error categories
    - Test validation errors with context
    - Test resource errors with file paths
    - Test runtime errors with graceful degradation
    - Test capability errors with feature detection
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [ ] 23. Browser compatibility and feature detection
  - [ ] 23.1 Implement browser compatibility checks
    - Leverage Scrawl-canvas's built-in browser compatibility
    - Detect WebCodecs API support for video export
    - Detect Web Audio API support for audio reactivity
    - Return capability errors when features unavailable
    - Provide feature detection methods
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

- [ ] 24. API design and progressive complexity
  - [ ] 24.1 Implement progressive complexity API layers
    - Create beginner API with simple defaults
    - Create intermediate API with common customization
    - Create advanced API with full control + direct Scrawl-canvas access
    - Ensure method chaining for fluent API style
    - Provide TypeScript type definitions
    - Document API levels with examples
    - _Requirements: 28.1, 28.2, 28.3, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7_
  
  - [ ] 24.2 Enforce interface simplicity constraints
    - Validate that public module interfaces have ≤10 methods
    - Validate that public methods have ≤4 parameters
    - Use configuration objects for methods with >4 parameters
    - Provide sensible defaults for all optional parameters
    - _Requirements: 30.4, 34.1, 34.2, 34.3, 34.4, 34.5_

- [ ] 25. Module architecture validation
  - [ ] 25.1 Validate module dependencies
    - Ensure maximum 3 dependencies per module
    - Prevent circular dependencies
    - Use dependency injection to decouple modules
    - Define well-defined interfaces between modules
    - _Requirements: 32.1, 32.2, 32.3, 32.4_
  
  - [ ]* 25.2 Write unit tests for module isolation
    - Test that modules can be imported independently
    - Test tree-shaking support
    - Test no circular dependencies
    - _Requirements: 32.2, 33.4, 33.6_

- [ ] 26. Documentation and examples
  - [ ] 26.1 Create API documentation
    - Document all public interfaces with JSDoc comments
    - Create beginner, intermediate, and advanced examples
    - Document module hierarchy and dependencies
    - Create architectural diagram showing wrapper architecture
    - Document Scrawl-canvas integration points
    - Document browser compatibility requirements
    - _Requirements: 30.7, 31.5, 32.7_
  
  - [ ] 26.2 Create usage examples
    - Create beginner example (simple composition with animation)
    - Create intermediate example (custom effects and keyframes using Scrawl-canvas filters)
    - Create advanced example (expressions, precomps, audio reactivity, direct Scrawl-canvas access)
    - _Requirements: 31.5_

- [ ] 27. Final integration and validation
  - [ ] 27.1 Integration testing
    - Test Core + Animation integration (keyframes with GSAP timeline + Scrawl-canvas Tweens)
    - Test Core + Effects integration (Scrawl-canvas filters during rendering)
    - Test Export + Rendering integration (frame-by-frame export with Scrawl-canvas display cycle)
    - Test Audio + Animation integration (audio-reactive expressions)
    - Test GSAP-Scrawl timeline synchronization under load
  
  - [ ] 27.2 Performance benchmarks
    - Benchmark rendering performance (60fps target with Scrawl-canvas)
    - Benchmark export performance (Mediabunny encoding)
    - Benchmark memory usage (Scrawl-canvas asset caching)
    - Benchmark startup time
  
  - [ ] 27.3 Browser compatibility testing
    - Test on Chrome, Firefox, Safari, Edge (latest 2 versions)
    - Test Scrawl-canvas color space fallbacks
    - Test WebCodecs availability for export (Chrome, Edge)
    - Test Web Audio API for audio reactivity

- [ ] 28. Final checkpoint - Complete validation
  - Ensure all tests pass, ask the user if questions arise.

## Resources

- **Scrawl-canvas Docs**: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html
- **Scrawl-canvas LLM Summary**: https://github.com/KaliedaRik/Scrawl-canvas/blob/v8/LLM-summary-for-scrawl-canvas.md
- **GSAP Documentation**: https://gsap.com/docs/
- **Mediabunny Documentation**: https://mediabunny.dev/
- **Mediabunny LLM Docs**: https://mediabunny.dev/llms.txt

## Notes

- Tasks marked with `*` are property tests validating universal correctness properties
- **Wrapper Architecture**: Most tasks involve wrapping Scrawl-canvas rather than reimplementing
- **Scrawl-canvas Handles**: Scene graph, rendering, 40+ filters, particle physics, text layout, assets, accessibility
- **Mediabunny Handles**: All video/audio file I/O, demuxing, decoding, encoding, metadata extraction
- **Web Audio API Handles**: Audio playback and FFT analysis for audio reactivity only
- **GSAP Handles**: Timeline control (master clock), property interpolation, animation choreography
- **We Build**: Thin wrapper API, three-library synchronization (GSAP + Scrawl-canvas + Mediabunny), expressions, export orchestration
- **Critical Animation Architecture**: GSAP handles interpolation, Scrawl-canvas handles rendering. Do NOT use Scrawl-canvas Tweens to avoid dual animation systems.
- **Critical Synchronization**: GSAP timeline is master clock. Read GSAP tween values, update Scrawl-canvas entities via entity.set(). Await 'seeked' events for media during export.
- Implementation follows module dependency order: Integration → Core → Animation → Audio → Export
- Deep modules architecture: simple interfaces (≤10 methods) with complex implementations (wrapping + synchronization)
- Progressive complexity: beginner/intermediate/advanced API tiers
- Maximum 3 dependencies per module
- All 12 correctness properties from design document have corresponding property tests

## Task Count Comparison

- **Old approach (reimplementation)**: 28 major tasks with 100+ subtasks
- **New approach (wrapper)**: 28 major tasks with ~65 subtasks
- **Reduction**: ~35% fewer tasks by leveraging Scrawl-canvas and Mediabunny instead of reimplementing
- **Focus**: Synchronization between three libraries is the core technical challenge
- **Key Architecture Decision**: GSAP handles interpolation, Scrawl-canvas handles rendering (no Scrawl-canvas Tweens)
- **Critical Implementation Detail**: Always await 'seeked' events for media during export to ensure frame accuracy
