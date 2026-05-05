# Tech Stack

## Runtime & Build
- **Runtime**: Bun (fast JavaScript/TypeScript runtime)
- **Build**: tsup (TypeScript bundler with ESM/CJS output)
- **Language**: TypeScript 5 (strict mode enabled)

## Core Dependencies

### Scrawl-canvas
Canvas rendering, scene graph, filters, particles, text, animation, assets, DOM integration, accessibility
- Docs: https://scrawl-v8.rikweb.org.uk/docs/reference/index.html/
- LLM Summary: https://github.com/KaliedaRik/Scrawl-canvas/blob/v8/LLM-summary-for-scrawl-canvas.md

### GSAP
Timeline sequencing, animation choreography, advanced easing functions
- Docs: https://gsap.com/docs/

### Mediabunny
Video/audio I/O (reading, writing, converting), encoding/decoding, metadata extraction
- Docs: https://mediabunny.dev/
- LLM Docs: https://mediabunny.dev/llms.txt

## Testing
- **Test Runner**: Bun test
- **Property Testing**: fast-check for randomized testing

## Module Exports
The library exports multiple entry points:
- `.` - Main entry (all modules)
- `./core` - Composition and Layer API
- `./animation` - Keyframe and expression system
- `./export` - Video and frame export
- `./audio` - Audio reactivity
- `./integration` - GSAP-Scrawl-canvas synchronization

## Common Commands
```bash
bun install        # Install dependencies
bun run build      # Build library (tsup)
bun test           # Run tests
bun test --watch   # Run tests in watch mode
bun run typecheck  # Type check without emit
```

## TypeScript Configuration
- Target: ES2022
- Module: ESNext
- Strict mode enabled
- Path aliases: `@/*`, `@core/*`, `@animation/*`, `@export/*`, `@audio/*`, `@integration/*`
