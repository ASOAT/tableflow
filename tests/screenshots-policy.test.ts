import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { checkScreenshotPng, checkScreenshots, MAX_SCREENSHOT_BYTES, SCREENSHOT_FILES } from '../scripts/check-screenshots.mjs';

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let checksum = 0xffffffff;
  for (const byte of body) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = checksum & 1 ? (checksum >>> 1) ^ 0xedb88320 : checksum >>> 1;
  }
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function realPng(width = 1280, height = 800, pixels?: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanlines = pixels ?? Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const completePng = realPng();
const fixtureBase = resolve('.test-artifacts/screenshot-policy-tests');
const created = new Set<string>();
async function fixture(complete = true): Promise<string> {
  await mkdir(fixtureBase, { recursive: true });
  const root = await mkdtemp(resolve(fixtureBase, 'case-'));
  created.add(root);
  await writeFile(resolve(root, 'assets.json'), JSON.stringify({ schemaVersion: 1, languages: { 'zh-CN': { directory: 'zh-CN' }, en: { directory: 'en' } } }));
  for (const language of ['zh-CN', 'en']) {
    await mkdir(resolve(root, language));
    await writeFile(resolve(root, language, '.gitkeep'), '');
    if (complete) for (const name of SCREENSHOT_FILES) await writeFile(resolve(root, language, name), completePng);
  }
  return root;
}

afterEach(async () => {
  for (const path of created) {
    const absolute = resolve(path);
    if (!absolute.startsWith(fixtureBase + sep)) throw new Error('Unsafe screenshot fixture cleanup');
    await rm(absolute, { recursive: true, force: true });
  }
  created.clear();
});

describe('formal screenshot PNG policy', () => {
  it('accepts a complete 1280x800 PNG stream', () => {
    expect(checkScreenshotPng(completePng)).toEqual({ width: 1280, height: 800, bytes: completePng.length });
  });
  it.each([
    ['empty', Buffer.alloc(0)],
    ['JPEG instead of PNG', Buffer.from([255, 216, 255, 224])],
    ['wrong width', realPng(1279, 800)],
    ['wrong height', realPng(1280, 799)],
    ['truncated header', completePng.subarray(0, 29)],
    ['missing end', completePng.subarray(0, completePng.length - 12)],
    ['trailing content', Buffer.concat([completePng, Buffer.from('debug')])],
    ['oversized file', Buffer.alloc(MAX_SCREENSHOT_BYTES + 1)],
    ['forged image pixels', realPng(1280, 800, Buffer.alloc(10))],
  ])('rejects %s', (_, bytes) => {
    expect(() => checkScreenshotPng(bytes)).toThrow();
  });
  it('rejects corrupted chunk CRC even with correct dimensions', () => {
    const corrupt = Buffer.from(completePng);
    corrupt.writeUInt8(corrupt.readUInt8(29) ^ 255, 29);
    expect(() => checkScreenshotPng(corrupt)).toThrow(/CRC/);
  });
  it('rejects invalid scanline filters in otherwise valid compressed data', () => {
    const pixels = Buffer.alloc((1280 * 3 + 1) * 800);
    pixels[0] = 255;
    expect(() => checkScreenshotPng(realPng(1280, 800, pixels))).toThrow(/filter/);
  });
});

describe('formal screenshot set policy', () => {
  it('requires all five scenes in both languages and still requires visual review', async () => {
    const result = await checkScreenshots(await fixture());
    expect(result.status).toBe('PASS');
    expect(result.missing).toEqual([]);
    expect(result.languages.map(entry => entry.files.length)).toEqual([5, 5]);
    expect(result.visualReview).toBe('MANUAL REVIEW REQUIRED');
  });
  it('rejects missing formal screenshots by default', async () => {
    await expect(checkScreenshots(await fixture(false))).rejects.toThrow(/missing/);
  });
  it('reports pending without manufacturing files or a review pass', async () => {
    const result = await checkScreenshots(await fixture(false), { allowPending: true });
    expect(result.status).toBe('PENDING');
    expect(result.missing).toHaveLength(10);
    expect(result.languages.every(entry => entry.files.length === 0)).toBe(true);
    expect(result.visualReview).toBe('MANUAL REVIEW REQUIRED');
  });
  it.each(['debug.png', '01-detect-raw.png', 'fixture.png', 'capture-info.json', 'unexpected.jpg'])('rejects %s mixed into the formal directory', async name => {
    const root = await fixture();
    await writeFile(resolve(root, 'zh-CN', name), completePng);
    await expect(checkScreenshots(root)).rejects.toThrow(/Unexpected\/debug/);
  });
  it('rejects debug subdirectories', async () => {
    const root = await fixture();
    await mkdir(resolve(root, 'en', 'debug'));
    await expect(checkScreenshots(root)).rejects.toThrow(/Unexpected\/debug/);
  });
  it('does not hide an invalid existing PNG behind pending mode', async () => {
    const root = await fixture(false);
    await writeFile(resolve(root, 'zh-CN', '01-detect.png'), 'not a png');
    await expect(checkScreenshots(root, { allowPending: true })).rejects.toThrow(/PNG/);
  });
  it('supports explicit reuse without pretending a second screenshot set exists', async () => {
    const root = await fixture();
    await writeFile(resolve(root, 'assets.json'), JSON.stringify({ schemaVersion: 1, languages: { 'zh-CN': { directory: 'zh-CN' }, en: { reuse: 'zh-CN' } } }));
    const result = await checkScreenshots(root);
    expect(result.status).toBe('PASS');
    expect(result.languages[1]?.reuse).toBe('zh-CN');
    expect(result.languages[1]?.files.every(file => file.file.startsWith('zh-CN/'))).toBe(true);
  });
  it('rejects traversal in screenshot configuration', async () => {
    const root = await fixture(false);
    await writeFile(resolve(root, 'assets.json'), JSON.stringify({ schemaVersion: 1, languages: { 'zh-CN': { directory: '../debug' }, en: { directory: 'en' } } }));
    await expect(checkScreenshots(root)).rejects.toThrow(/Invalid screenshot directory/);
  });
});

describe('store search term limits', () => {
  it.each(['zh-CN', 'en'])('keeps %s terms within the published Microsoft limits', async language => {
    const content = await readFile(resolve(`store-assets/search-terms-${language}.txt`), 'utf8');
    const terms = content.trim().split(/\r?\n/);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.length).toBeLessThanOrEqual(7);
    expect(terms.every(term => [...term].length <= 30)).toBe(true);
    expect(terms.join(' ').split(/\s+/).length).toBeLessThanOrEqual(21);
    expect(new Set(terms).size).toBe(terms.length);
  });
});
