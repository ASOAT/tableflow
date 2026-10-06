import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function checkProductionText(text, filename) {
  const reject = (pattern, reason) => assert.doesNotMatch(text, pattern, `${filename}: ${reason}`);
  reject(/\b(?:localhost|127\.0\.0\.1)\b/i, 'local test URL');
  reject(/sk-[A-Za-z0-9_-]{20,}/, 'API credential');
  reject(/Bearer\s+[A-Za-z0-9._-]{12,}/i, 'authorization credential');
  reject(/["']?\b(?:api_key|apikey|secret|password)\b["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/i, 'credential assignment');
  reject(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key');
  reject(/sourceMappingURL|sourcesContent/, 'production source map');
  if (/\.js$/.test(filename)) {
    reject(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/, 'network API');
    reject(/\beval\s*\(|\bnew\s+Function\s*\(/, 'remote/dynamic code');
    reject(/TableFlowDeveloperTools|benchmarkTables|generateStructuralSnapshot|serializeRows/, 'development API');
    reject(/data-lab-ready|component-lab|01-native-table|react-dom|node_modules\/(?:react|vue|antd|@mui|ag-grid)/, 'test/framework module');
  }
  if (/\.html$/.test(filename)) {
    reject(/<script[^>]*src\s*=\s*["']https?:\/\//i, 'remote script');
    reject(/<(?:img|iframe|link)[^>]*(?:src|href)\s*=\s*["']https?:\/\//i, 'external resource');
    reject(/\son\w+\s*=|javascript:/i, 'inline executable content');
  }
}

async function paths(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...await paths(resolve(directory, entry.name)));
    else files.push(resolve(directory, entry.name));
  }
  return files;
}

export async function checkRelease(directory = 'dist') {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageInfo.version, manifest.version);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.default_locale, 'zh_CN');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.equal(manifest.version_name, undefined);
  const files = await paths(root);
  const hashes = {};
  for (const absolute of files) {
    const name = relative(root, absolute).split(sep).join('/');
    assert.match(name, /^(?:manifest\.json|popup\.html|privacy\.html|content\.js|auto-icons\.js|background\.js|assets\/[\w-]+\.(?:js|css)|icons\/(?:16|32|48|128)\.png|_locales\/(?:zh_CN|en)\/messages\.json)$/, `Unexpected release file: ${name}`);
    const bytes = await readFile(absolute);
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
    if (/\.(?:js|css|json|html)$/.test(name)) checkProductionText(bytes.toString('utf8'), name);
  }
  const references = [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const reference of references) {
    const target = resolve(root, reference);
    assert.ok(target.startsWith(root + sep), 'Manifest reference must remain inside package.');
    await readFile(target);
  }
  for (const size of [16,32,48,128]) {
    const bytes = await readFile(resolve(root, `icons/${size}.png`));
    assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    assert.equal(bytes.readUInt32BE(16),size); assert.equal(bytes.readUInt32BE(20),size);
  }
  for (const locale of ['zh_CN','en']) {
    const messages = JSON.parse(await readFile(resolve(root, `_locales/${locale}/messages.json`),'utf8'));
    for (const field of [manifest.name,manifest.description,manifest.action.default_title]) {
      const key = field.match(/^__MSG_(\w+)__$/)?.[1];
      assert.ok(key && messages[key]?.message, `${locale} lacks manifest translation ${field}`);
    }
    assert.ok(messages.extensionName.message.length <=75);
    assert.ok(messages.extensionDescription.message.length <=132);
  }
  const popup = await readFile(resolve(root, manifest.action.default_popup),'utf8');
  for (const [, reference] of popup.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
    assert.ok(!reference.includes('..'), 'Root popup asset reference cannot escape the package.');
    await readFile(resolve(root, reference));
  }
  assert.ok(files.some((name)=>name.endsWith(`${sep}privacy.html`)));
  return { version: manifest.version, files: files.length, permissions: manifest.permissions,
    requiredHosts: [], productionNetworkApis: 0, developmentApis: 0, sourceMaps: 0, hashes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkRelease(process.argv[2] ?? 'dist');
  await mkdir('.test-artifacts', { recursive:true });
  await writeFile('.test-artifacts/release-check.json',`${JSON.stringify({passed:true,...result,checkedAt:new Date().toISOString()},null,2)}\n`);
  console.log(`Release check PASS: v${result.version}, ${result.files} files, frozen permissions, no development APIs/source maps/network APIs/secrets.`);
}
