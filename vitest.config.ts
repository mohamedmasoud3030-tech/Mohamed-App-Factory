import { defineConfig } from 'vitest/config';

// Engines + apps — prototypes/nilesys keeps its own node:test suite.
export default defineConfig({
  test: {
    include: ['engines/**/*.test.ts', 'apps/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000, // PGlite WASM boot can be slow on a loaded CI box
  },
});
