import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/frontend/**/*.test.ts', 'tests/frontend/**/*.test.tsx'],
    exclude: ['server/**', 'node_modules/**', 'dist/**'],
    environment: 'jsdom',
    setupFiles: ['./tests/frontend/setup.ts'],
  },
});
