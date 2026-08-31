/**
 * Vitest configuration. The extension itself is built by scripts/build.mjs,
 * which needs three different output formats and so drives Vite's API directly.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
  },
});
