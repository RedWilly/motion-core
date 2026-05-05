# Project Structure

```
src/
├── index.ts           # Main entry, exports all modules
├── core/              # Composition and Layer API
│   ├── index.ts       # Module exports
│   ├── types.ts       # TypeScript interfaces (Composition, Layer, Transform, etc.)
│   └── composition.ts # Composition factory and implementation
├── animation/         # Keyframe and expression system
│   └── index.ts
├── export/            # Video and frame export (Mediabunny integration)
│   └── index.ts
├── audio/             # Audio reactivity (Web Audio API)
│   └── index.ts
└── integration/       # GSAP-Scrawl-canvas synchronization
    └── index.ts
```

## Module Responsibilities

**Core Module**: Wraps Scrawl-canvas Canvas + Cell as Composition, wraps entities as Layers, integrates GSAP timeline with Scrawl-canvas Ticker.

**Animation Module**: GSAP timeline integration, keyframe system, expression evaluation.

**Export Module**: Frame-by-frame rendering with Scrawl-canvas, video encoding via Mediabunny/WebCodecs.

**Audio Module**: Audio layer management (Mediabunny demuxing), FFT analysis via Web Audio API for reactivity.

**Integration Module**: GSAP-Scrawl-canvas sync, serialization (wraps Scrawl-canvas packet system).

## Architecture Principles

### Deep Modules (Progressive Disclosure of Complexity)
Each module should have a simple interface but handle significant complexity internally. This reduces cognitive load by limiting the number of top-level concepts developers must understand.

**Goal**: Keep the mental map of the codebase small and navigable. Avoid shallow modules that fragment responsibilities.

- Maximum 5 top-level modules (7±2 cognitive limit)
- Each module exposes ≤10 public methods
- Simple interface → Complex implementation
- Beginner: Simple defaults for 80% of use cases
- Advanced: Full control through direct library access (e.g., `layer._scrawlEntity`)

### Think About Modules When Coding
Before making changes, consider:
1. Which module does this belong to?
2. Does this change simplify or complicate the interface?
3. Are you creating new concepts that increase cognitive load?
4. Can this be achieved through existing library features (Scrawl-canvas/GSAP/Mediabunny) instead of new code?

### No Unnecessary Comments
Comments should explain **why**, not **what**. Code should be self-documenting through clear naming and structure.

❌ Avoid:
```typescript
// Composition
// Types
// Return true if valid
// Initialize counter
let count = 0;
```

✅ Use comments only when they add context you can't get from the code itself:
- Explain **why** a decision was made
- Document non-obvious constraints or edge cases
- Reference external documentation or specifications

If the comment just repeats what the code says, delete it. Write expressive code instead.

## Key Design Patterns

- **Thin wrapper layer**: Don't reimplement Scrawl-canvas/GSAP/Mediabunny features
- **GSAP as master clock**: GSAP timeline controls all animation timing
- **Direct entity access**: Layers expose `_scrawlEntity` for advanced Scrawl-canvas features
- **Progressive complexity**: Simple defaults for beginners, full control for advanced users
