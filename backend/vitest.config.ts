import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'test/postgres/**/*.test.ts',
      'test/production-config.test.ts',
      'test/capabilities.test.ts',
      'test/derived.test.ts',
      'test/multiclass*.test.ts',
      'test/source-choices.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
