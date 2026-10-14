import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['.scratch-review/**/*.test.ts'], testTimeout: 60000, hookTimeout: 120000 } });
