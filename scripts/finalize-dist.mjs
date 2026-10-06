import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Vite keeps the source HTML input path. Package only a root-level popup entry.
const dist = resolve('dist');
const source = resolve(dist, 'src');
if (!source.startsWith(dist + sep)) throw new Error('Invalid build cleanup target.');
const html = await readFile(resolve(source, 'popup/index.html'), 'utf8');
await writeFile(resolve(dist, 'popup.html'), html.replaceAll('../../assets/', './assets/'), 'utf8');
await rm(source, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'privacy.html'), await readFile('docs/privacy.html'));
console.log('Release HTML and local privacy page prepared without source folders.');
