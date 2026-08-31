/**
 * Builds the three artefacts an MV3 extension needs, each with different
 * requirements, which is why this is a script rather than one Vite config:
 *
 *   sidepanel.html  an HTML page with module scripts
 *   background.js   an ES module service worker
 *   content.js      a classic script — chrome.scripting.executeScript cannot
 *                   inject a module, so this one must be IIFE with no imports
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { cp, rename, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist');

const watch = process.argv.includes('--watch');
const mode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'production';

const common = {
  mode,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: mode === 'development',
    ...(watch ? { watch: {} } : {}),
  },
};

async function buildSidePanel() {
  await build({
    ...common,
    root: resolve(root, 'src/sidepanel'),
    plugins: [react()],
    build: {
      ...common.build,
      rollupOptions: {
        input: resolve(root, 'src/sidepanel/index.html'),
        output: { entryFileNames: 'sidepanel.js', assetFileNames: 'assets/[name][extname]' },
      },
    },
  });

  // Vite names the HTML after its input; the manifest expects sidepanel.html.
  if (existsSync(resolve(outDir, 'index.html'))) {
    await rename(resolve(outDir, 'index.html'), resolve(outDir, 'sidepanel.html'));
  }
}

function buildWorker() {
  return build({
    ...common,
    build: {
      ...common.build,
      lib: {
        entry: resolve(root, 'src/background/index.ts'),
        formats: ['es'],
        fileName: () => 'background.js',
      },
    },
  });
}

function buildContentScript() {
  return build({
    ...common,
    build: {
      ...common.build,
      lib: {
        entry: resolve(root, 'src/content/index.ts'),
        formats: ['iife'],
        name: 'NutchContent',
        fileName: () => 'content.js',
      },
    },
  });
}

async function main() {
  if (!watch) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Sequential: the three builds share an output directory and emptyOutDir is
  // off, so running them concurrently races on the same files.
  await buildSidePanel();
  await buildWorker();
  await buildContentScript();

  await cp(resolve(root, 'public'), outDir, { recursive: true });

  console.log(`built -> ${outDir}${watch ? ' (watching)' : ''}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
