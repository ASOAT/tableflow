import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) { await check(file); continue; }
    if (!/\.(?:test|spec)\.ts$/.test(file)) continue;
    const code = await readFile(file, 'utf8');
    assert.doesNotMatch(code, /\b(?:test|it|describe)\s*\.\s*(?:skip|only|todo)\s*\(/, `Forbidden disabled/focused test: ${file}`);
  }
}
await check('tests');
console.log('Test policy passed: no skipped, focused or todo tests.');
