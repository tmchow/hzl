// packages/hzl-cli/vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
  },
  resolve: {
    alias: {
      'hzl-core': path.resolve(__dirname, '../hzl-core/dist'),
    },
  },
});
