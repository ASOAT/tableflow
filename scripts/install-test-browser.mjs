import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const cache = resolve('.test-artifacts', 'browsers');
await mkdir(cache, { recursive: true });
const environment = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: cache,
  PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: process.env.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT ?? '180000',
};

// Node does not automatically use the Windows proxy that the browser uses.
// Honor an existing environment proxy first; never change system settings.
if (process.platform === 'win32' && !environment.HTTPS_PROXY && !environment.https_proxy) {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  try {
    const enabled = execFileSync('reg.exe', ['query', key, '/v', 'ProxyEnable'], { encoding: 'utf8', windowsHide: true });
    if (/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(enabled)) {
      const configured = execFileSync('reg.exe', ['query', key, '/v', 'ProxyServer'], { encoding: 'utf8', windowsHide: true });
      const value = configured.match(/ProxyServer\s+REG_SZ\s+(.+)/)?.[1]?.trim();
      const proxy = value?.includes('=') ? value.match(/(?:^|;)https=([^;]+)/)?.[1] : value;
      if (proxy) {
        environment.HTTPS_PROXY = proxy.includes('://') ? proxy : `http://${proxy}`;
        console.log('Using the existing Windows proxy for the official browser download.');
      }
    }
  } catch (error) {
    console.warn(`Windows proxy lookup was unavailable; using the current network environment: ${error.message}`);
  }
}

const cli = resolve(dirname(require.resolve('playwright/package.json')), 'cli.js');
const child = spawn(process.execPath, [cli, 'install', 'chromium', '--no-shell'], {
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', (error) => { console.error(error); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
