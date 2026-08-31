/**
 * Vitest configuration.
 *
 * `defineConfig` is imported from `vitest/config`, not `vite`: Vite's own
 * `UserConfig` has no `test` property, so the plain import type-errors.
 *
 * The extension itself is built by scripts/build.mjs, which needs three
 * different output formats and so drives Vite's API directly.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
  },
});
