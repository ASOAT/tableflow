import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

export const SCREENSHOT_FILES = Object.freeze([
  '01-detect.png', '02-preview.png', '03-excel.png', '04-integrity.png', '05-privacy.png',
]);
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, initial) => {
  let value = initial;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// Validate the actual PNG stream, rather than accepting a forged IHDR header.
export function checkScreenshotPng(input, label = 'screenshot') {
  const bytes = Buffer.from(input);
  if (!bytes.length) throw new Error(`${label}: empty file`);
  if (bytes.length > MAX_SCREENSHOT_BYTES) throw new Error(`${label}: exceeds 5 MiB`);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${label}: must be PNG`);
  let position = 8;
  let header;
  let ended = false;
  let hasPalette = false;
  const imageParts = [];
  while (position < bytes.length) {
    if (position + 12 > bytes.length) throw new Error(`${label}: truncated PNG chunk`);
    const length = bytes.readUInt32BE(position);
    const end = position + 12 + length;
    if (end > bytes.length) throw new Error(`${label}: truncated PNG data`);
    const type = bytes.toString('ascii', position + 4, position + 8);
    const data = bytes.subarray(position + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(position + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
      throw new Error(`${label}: invalid PNG chunk or CRC`);
    }
    if (!header && type !== 'IHDR') throw new Error(`${label}: IHDR must be first`);
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error(`${label}: invalid PNG header`);
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      if (width !== 1280 || height !== 800) throw new Error(`${label}: expected 1280x800, received ${width}x${height}`);
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      const depth = data[8];
      const color = data[9];
      if (!depths[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) {
        throw new Error(`${label}: unsupported or invalid PNG encoding`);
      }
      header = { width, height, depth, color, interlace: data[12] };
    } else if (type === 'IDAT') {
      imageParts.push(data);
    } else if (type === 'PLTE') {
      if (!length || length % 3 || length > 768) throw new Error(`${label}: invalid PNG palette`);
      hasPalette = true;
    } else if (type === 'IEND') {
      if (length || end !== bytes.length) throw new Error(`${label}: invalid PNG end or trailing content`);
      ended = true;
    } else if (type[0] === type[0].toUpperCase()) {
      throw new Error(`${label}: unknown critical PNG chunk`);
    }
    position = end;
  }
  if (!header || !ended || !imageParts.length || (header.color === 3 && !hasPalette)) throw new Error(`${label}: incomplete PNG`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.color];
  const passes = header.interlace ? [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ] : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const width = Math.max(0, Math.ceil((header.width - x) / dx));
    const height = Math.max(0, Math.ceil((header.height - y) / dy));
    return { height: width ? height : 0, rowBytes: Math.ceil(width * channels * header.depth / 8) };
  });
  const expectedSize = rows.reduce((sum, row) => sum + row.height * (row.rowBytes + 1), 0);
  let pixels;
  try { pixels = inflateSync(Buffer.concat(imageParts), { maxOutputLength: expectedSize }); }
  catch { throw new Error(`${label}: invalid PNG compressed image data`); }
  if (pixels.length !== expectedSize) throw new Error(`${label}: incomplete PNG pixels`);
  let offset = 0;
  for (const row of rows) {
    for (let y = 0; y < row.height; y++) {
      if (pixels[offset] > 4) throw new Error(`${label}: invalid PNG row filter`);
      offset += row.rowBytes + 1;
    }
  }
  return { width: header.width, height: header.height, bytes: bytes.length };
}

export async function checkScreenshots(root = resolve('store-assets/screenshots'), { allowPending = false } = {}) {
  const config = JSON.parse(await readFile(resolve(root, 'assets.json'), 'utf8'));
  if (config.schemaVersion !== 1 || !config.languages || Object.keys(config.languages).sort().join(',') !== 'en,zh-CN') {
    throw new Error('Screenshot configuration must declare exactly zh-CN and en');
  }
  const checkedDirectories = new Map();
  const results = [];
  const missing = [];
  for (const language of ['zh-CN', 'en']) {
    const entry = config.languages[language];
    const directory = entry?.reuse === 'zh-CN' && language === 'en' ? 'zh-CN' : entry?.directory;
    if (directory !== language && !(language === 'en' && entry?.reuse === 'zh-CN' && !entry.directory)) {
      throw new Error(`Invalid screenshot directory/reuse configuration for ${language}`);
    }
    if (entry.directory && entry.reuse) throw new Error(`Choose directory or reuse for ${language}`);
    const folder = resolve(root, directory);
    if (!checkedDirectories.has(directory)) {
      let entries;
      try { entries = await readdir(folder, { withFileTypes: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; entries = []; }
      for (const item of entries) {
        if (item.name === '.gitkeep' && item.isFile() && (await lstat(resolve(folder, item.name))).size === 0) continue;
        if (!item.isFile() || !SCREENSHOT_FILES.includes(item.name)) {
          throw new Error(`Unexpected/debug material in formal screenshot directory: ${directory}/${item.name}`);
        }
      }
      const found = [];
      for (const name of SCREENSHOT_FILES) {
        const path = resolve(folder, name);
        try {
          const info = await lstat(path);
          if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${directory}/${name}: must be a regular file`);
          const png = checkScreenshotPng(await readFile(path), `${directory}/${name}`);
          found.push({ file: `${directory}/${name}`, ...png });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          missing.push(`${directory}/${name}`);
        }
      }
      checkedDirectories.set(directory, found);
    }
    results.push({ language, reuse: entry.reuse ?? null, files: checkedDirectories.get(directory) });
  }
  if (missing.length && !allowPending) throw new Error(`Formal screenshots are missing: ${missing.join(', ')}`);
  return { status: missing.length ? 'PENDING' : 'PASS', missing, languages: results, visualReview: 'MANUAL REVIEW REQUIRED' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some(flag => flag !== '--allow-pending')) throw new Error('Usage: node scripts/check-screenshots.mjs [--allow-pending]');
    const result = await checkScreenshots(undefined, { allowPending: flags.includes('--allow-pending') });
    await mkdir('.test-artifacts', { recursive: true });
    await writeFile('.test-artifacts/screenshots-check.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
