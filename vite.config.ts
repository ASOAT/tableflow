import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { productionIsolation } from './scripts/production-isolation.ts';

export default defineConfig({
  base: './',
  plugins: [productionIsolation()],
  build: {
    modulePreload: false,
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/popup/index.html', import.meta.url)),
    },
  },
});
