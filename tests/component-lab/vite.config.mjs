import { defineConfig } from 'vite';

export default defineConfig({
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: {
    // The lab is entirely client-side; server-component directives are inert.
    rolldownOptions: { onLog(level, log, handler) {
      if (log.code === 'MODULE_LEVEL_DIRECTIVE' && log.message.includes('use client')) return;
      handler(level, log);
    } },
  },
});
