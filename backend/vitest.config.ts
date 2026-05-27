import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/tests/**/*.test.ts',
      'src/classifier-v2/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'src/tests/integration/pipeline-notes-integration.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
