import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  // PNG filter byte (0 = None) per scanline
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0; // Filter None
    buffer.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines);

  // PNG Header
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(crcData);
  chunk.writeInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) | 0;
}

// SafaiSeva SS Monogram drawing function:
// Background: #050505 or deep emerald #07170E
// Foreground mark: #10B981 or #FFFFFF with masked dual S-ribbons
function drawSafaiSeva(x, y, w, h, isMaskable = false) {
  const bgR = 5, bgG = 5, bgB = 5;
  const fgR = 16, fgG = 185, fgB = 129; // Emerald #10b981
  const whiteR = 255, whiteG = 255, whiteB = 255;

  // Normalized coordinates from -50 to 50 centered
  const scale = isMaskable ? 0.65 : 0.82;
  const px = ((x / w) - 0.5) / scale * 100 + 50;
  const py = ((y / h) - 0.5) / scale * 100 + 50;

  // Check if inside rounded square (rx = 22)
  const isInsideRoundedRect = (cx, cy, rw, rh, rad) => {
    if (cx < 0 || cx > 100 || cy < 0 || cy > 100) return false;
    const dx = Math.max(Math.abs(cx - 50) - (50 - rad), 0);
    const dy = Math.max(Math.abs(cy - 50) - (50 - rad), 0);
    return (dx * dx + dy * dy) <= (rad * rad);
  };

  if (!isInsideRoundedRect(px, py, 100, 100, 22)) {
    return [bgR, bgG, bgB, 255];
  }

  // Check if in white/empty cutout tracks
  // Track 1: from (33,0)->(43,0) down to y=32, diagonal down-right to (64,76)->(74,76), down to (64,100)->(74,100)
  let inCutout = false;

  // Top vertical slots
  if (py <= 32 && px >= 33 && px <= 43) inCutout = true;
  if (py >= 68 && px >= 57 && px <= 67) inCutout = true;

  // Diagonal spine 1
  if (py > 28 && py < 72) {
    // Centerline from (38, 30) to (62, 70)
    const t = (py - 30) / 40;
    const centerX = 38 + t * 24;
    if (Math.abs(px - centerX) <= 5.5) inCutout = true;
  }

  // Top right slot / diagonal 2
  if (py <= 26 && px >= 58 && px <= 68) inCutout = true;
  if (py > 26 && py < 65) {
    const t = (py - 26) / 38;
    const centerX = 63 + t * 22;
    if (Math.abs(px - centerX) <= 5.5 && px <= 100) inCutout = true;
  }

  // Bottom left slot / diagonal 3
  if (py >= 74 && px >= 32 && px <= 42) inCutout = true;
  if (py > 35 && py < 74) {
    const t = (py - 35) / 39;
    const centerX = 13 + t * 24;
    if (Math.abs(px - centerX) <= 5.5 && px >= 0) inCutout = true;
  }

  if (inCutout) {
    return [bgR, bgG, bgB, 255];
  }

  return [fgR, fgG, fgB, 255];
}

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Generate PNGs
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createPng(192, 192, (x, y, w, h) => drawSafaiSeva(x, y, w, h, false)));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createPng(512, 512, (x, y, w, h) => drawSafaiSeva(x, y, w, h, false)));
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), createPng(512, 512, (x, y, w, h) => drawSafaiSeva(x, y, w, h, true)));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createPng(180, 180, (x, y, w, h) => drawSafaiSeva(x, y, w, h, false)));

// Generate Favicon SVG with SafaiSeva SS Emblem
const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <mask id="ss-mask">
      <rect width="100" height="100" rx="22" fill="#FFFFFF"/>
      <path d="M 33 0 L 43 0 L 43 32 C 43 36 46 40 50 44 L 68 62 C 72 66 74 70 74 76 L 74 100 L 64 100 L 64 76 C 64 72 62 68 58 64 L 40 46 C 35 41 33 37 33 32 Z" fill="#000000"/>
      <path d="M 58 0 L 68 0 L 68 32 C 68 36 71 40 75 44 L 92 61 C 97 66 100 71 100 78 L 100 88 C 100 88 95 78 88 71 L 78 61 C 75 58 73 54 73 50 L 73 32 C 73 24 67 18 58 0 Z" fill="#000000"/>
      <path d="M 0 22 C 0 22 5 32 12 39 L 22 49 C 25 52 27 56 27 60 L 27 76 C 27 84 33 90 42 100 L 32 100 L 32 76 C 32 72 29 68 25 64 L 8 47 C 3 42 0 37 0 30 Z" fill="#000000"/>
    </mask>
  </defs>
  <rect width="100" height="100" rx="22" fill="#10B981" mask="url(#ss-mask)"/>
</svg>`;
fs.writeFileSync(path.join(outDir, 'favicon.svg'), svgFavicon);

console.log('SafaiSeva app icons and favicon generated successfully.');
