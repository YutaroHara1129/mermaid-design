import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    environment: 'node',
    // The browser regressions publish artifacts into one shared output directory.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
