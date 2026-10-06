import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Worker threads share filesystem access under Windows sandboxing.
    pool: 'threads',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
  },
});
