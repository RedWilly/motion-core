import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core/index.ts',
    animation: 'src/animation/index.ts',
    export: 'src/export/index.ts',
    audio: 'src/audio/index.ts',
    integration: 'src/integration/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['scrawl-canvas', 'gsap', 'mediabunny'],
});
