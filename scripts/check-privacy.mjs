import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sources(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
  return files.flat();
}
const production = (await sources('src')).filter((file) => ['.ts', '.html'].includes(extname(file)));
for (const file of production) {
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/, `Network API in ${file}`);
  assert.doesNotMatch(text, /\beval\s*\(|\bnew\s+Function\s*\(/, `Dynamic code execution in ${file}`);
  assert.doesNotMatch(text, /(?:from\s*|import\s*\()\s*['"]https?:\/\//, `Remote code import in ${file}`);
  assert.doesNotMatch(text, /<script[^>]+src\s*=\s*['"]https?:\/\//, `Remote script in ${file}`);
  assert.doesNotMatch(text, /(?:from\s*|import\s*\()\s*['"](?:react|react-dom|vue|antd|element-plus|@mui\/|ag-grid)/, `Lab dependency in production ${file}`);
  assert.doesNotMatch(text, /localhost|01-native-table|ant-design-like|component-lab|data-lab-ready/, `Test-specific branch in production ${file}`);
}
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
assert.equal(manifest.host_permissions, undefined);
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(packageInfo.dependencies ?? {}, {});
console.log('Production privacy check passed: no network APIs, remote/dynamic code, analytics dependencies or component-lab imports.');
