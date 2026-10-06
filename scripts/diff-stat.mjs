import { mkdir, readdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const workspace = resolve('.');
const artifacts = resolve('.test-artifacts');
const before = resolve(artifacts, 'phase3-baseline');
const after = resolve(artifacts, 'phase3-after');
await stat(before); // Do not manufacture a baseline after development.
if (!after.startsWith(artifacts + sep)) throw new Error('Unsafe snapshot cleanup');
await rm(after, { recursive: true, force: true });
await mkdir(after, { recursive: true });
const excluded = new Set(['node_modules', 'dist', '.test-artifacts', '.npm-cache', 'test-results', 'release', '.git', '.agents', '.codex', '.aws']);
async function capture(relative = '') {
  const target = join(after, relative);
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(join(workspace, relative), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const child = join(relative, entry.name);
    if (entry.isDirectory()) await capture(child);
    else if (entry.isFile()) await writeFile(join(after, child), await readFile(join(workspace, child)));
  }
}
await capture();
let output;
try {
  output = execFileSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--stat', before, after], { encoding: 'utf8', windowsHide: true });
} catch (error) {
  if (error.status !== 1) throw error;
  output = error.stdout;
}
await writeFile(join(artifacts, 'phase3-diff-stat.txt'), output, 'utf8');
console.log('No Git repository: git diff --no-index --stat against the source snapshot captured before v0.5 development.');
console.log(output);
