import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { productionIsolation } from './scripts/production-isolation.ts';

// executeScript({ files }) needs a standalone classic script, not an ES module.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  plugins: [productionIsolation()],
  build: {
    target: 'es2022',
    outDir: mode === 'developer-tools' ? '.test-artifacts/development' : 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL(mode === 'developer-tools' ? './src/content/development.ts' : mode === 'background'
        ? './src/background/main.ts'
        : mode === 'auto-icons' ? './src/content/auto-icons.ts' : './src/content/entry.ts', import.meta.url)),
      name: mode === 'developer-tools' ? 'TableFlowDeveloperTools' : mode === 'auto-icons' ? 'TableFlowAutoIcons' : 'TableFlowScanner',
      formats: mode === 'background' ? ['es'] : ['iife'],
      fileName: () => mode === 'developer-tools' ? 'dev-tools.js' : mode === 'background' ? 'background.js'
        : mode === 'auto-icons' ? 'auto-icons.js' : 'content.js',
    },
  },
}));
