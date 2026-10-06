import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('playwright/package.json')), 'cli.js');
// Fixed files from a prior attempt must not be mistaken for current-run evidence.
for (const file of ['network-results.json', 'network-requests.json', 'performance-results.json', 'component-results.json', 'component-performance-results.json', 'e2e-results.json']) {
  await rm(resolve('.test-artifacts', file), { force: true });
}
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve('.test-artifacts', 'browsers') },
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', (error) => { console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
