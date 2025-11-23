import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 60000, // 60s for container startup
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/**/*.d.ts',
        'src/typings/**',
      ],
    },
  },
  resolve: {
    alias: {
      'sapatos/schema': path.resolve(__dirname, 'src/typings/sapatos/schema.ts'),
    },
  },
});
