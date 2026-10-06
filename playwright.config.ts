import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: '.test-artifacts/e2e-results.json' }]],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [{
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://localhost:4173/tests/fixtures/index.html',
    reuseExistingServer: false,
    timeout: 30_000,
  }, {
    command: 'npm --prefix tests/component-lab run dev',
    url: 'http://localhost:4175',
    reuseExistingServer: false,
    timeout: 60_000,
  }],
});
