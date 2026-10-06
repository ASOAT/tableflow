import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Original code-drawn mark: a white table flowing to the right on teal.
const crc = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const label = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([label, data])));
  return Buffer.concat([size, label, data, checksum]);
}
const rect = (x, y, left, top, right, bottom) => x >= left && x <= right && y >= top && y <= bottom;
function colorAt(x, y) {
  const edgeX = Math.max(17 - x, 0, x - 111);
  const edgeY = Math.max(17 - y, 0, y - 111);
  if (edgeX * edgeX + edgeY * edgeY > 17 * 17) return [0, 0, 0, 0];
  const frame = rect(x,y,24,27,94,33) || rect(x,y,24,27,30,99)
    || rect(x,y,88,27,94,65) || rect(x,y,24,93,68,99)
    || rect(x,y,24,49,94,55) || rect(x,y,24,71,67,77) || rect(x,y,51,30,57,96);
  const arrow = rect(x,y,70,84,101,91) || (x >= 95 && x <= 113 && Math.abs(y - 87.5) <= (113 - x));
  return frame ? [255,255,255,255] : arrow ? [255,205,105,255] : [20,123,133,255];
}
await mkdir('public/icons', { recursive: true });
await mkdir('store-assets', { recursive: true });
for (const size of [16,32,48,128,300]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sums = [0,0,0,0];
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const color = colorAt((x+(dx+.5)/4)*128/size, (y+(dy+.5)/4)*128/size);
      for (let channel = 0; channel < 4; channel++) sums[channel] += color[channel];
    }
    const offset = y*(size*4+1)+1+x*4;
    for (let channel = 0; channel < 4; channel++) pixels[offset+channel] = Math.round(sums[channel]/16);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(size===300?'store-assets/logo-300.png':`public/icons/${size}.png`,png);
}
console.log('Original TableFlow PNG icons generated: 16, 32, 48, 128; store logo rendered directly at 300px.');
