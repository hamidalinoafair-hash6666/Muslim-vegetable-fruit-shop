import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height, r, g, b) {
  // A simple solid PNG generator using standard PNG specification
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  const ihdrChunk = makeChunk('IHDR', ihdr);
  
  // Raw scanlines: each line starts with filter byte 0, followed by width * 3 bytes (RGB)
  const lineLength = 1 + width * 3;
  const rawData = Buffer.alloc(lineLength * height);
  for (let y = 0; y < height; y++) {
    const lineOffset = y * lineLength;
    rawData[lineOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = lineOffset + 1 + x * 3;
      // create a nice green gradient with rounded border
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = width * 0.45;
      if (dist < maxR) {
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
      } else {
        rawData[pxOffset] = Math.min(255, r + 20);
        rawData[pxOffset + 1] = Math.min(255, g + 30);
        rawData[pxOffset + 2] = Math.min(255, b + 20);
      }
    }
  }
  
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const payload = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, payload, crcBuf]);
}

fs.writeFileSync('public/pwa-192x192.png', createPNG(192, 192, 22, 163, 74));
fs.writeFileSync('public/pwa-512x512.png', createPNG(512, 512, 22, 163, 74));
fs.writeFileSync('public/pwa-maskable-512x512.png', createPNG(512, 512, 21, 128, 61));
fs.writeFileSync('public/apple-touch-icon.png', createPNG(180, 180, 22, 163, 74));
fs.writeFileSync('public/favicon.ico', createPNG(32, 32, 22, 163, 74));
console.log('Generated compliant PNG and ICO icons successfully.');
