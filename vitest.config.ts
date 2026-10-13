import { defineConfig } from 'vitest/config';

// Engines only — prototypes/nilesys keeps its own node:test suite.
export default defineConfig({
  test: {
    include: ['engines/**/*.test.ts'],
  },
});
