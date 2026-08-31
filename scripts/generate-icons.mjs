// Generuje ikony PWA (PNG) bez zewnętrznych zależności — używa tylko wbudowanego modułu zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "icons");

const BG = [79, 70, 229, 255]; // #4F46E5 (indigo)
const FG = [255, 255, 255, 255]; // biały

function inRoundedRect(px, py, w, h, r) {
  const cx = px + 0.5, cy = py + 0.5;
  const left = r, right = w - r, top = r, bottom = h - r;
  if (cx >= left && cx <= right) return cy >= 0 && cy <= h;
  if (cy >= top && cy <= bottom) return cx >= 0 && cx <= w;
  const nearestX = cx < left ? left : right;
  const nearestY = cy < top ? top : bottom;
  const dx = cx - nearestX, dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size, { padding = 0, cornerRatio = 0.22 } = {}) {
  const buf = new Uint8Array(size * size * 4);
  const contentSize = size - padding * 2;
  const r = contentSize * cornerRatio;

  // tło: zaokrąglony kwadrat
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const lx = x - padding, ly = y - padding;
      const inside = lx >= 0 && ly >= 0 && lx < contentSize && ly < contentSize &&
        inRoundedRect(lx, ly, contentSize, contentSize, r);
      const c = inside ? BG : [0, 0, 0, 0];
      buf[idx] = c[0]; buf[idx + 1] = c[1]; buf[idx + 2] = c[2]; buf[idx + 3] = c[3];
    }
  }

  // 3 słupki rosnącego "postępu spłaty" na środku ikony
  const barCount = 3;
  const barHeights = [0.34, 0.56, 0.78]; // proporcje wysokości kontentu
  const barWidthRatio = 0.13;
  const gapRatio = 0.07;
  const totalBarsWidth = barCount * barWidthRatio + (barCount - 1) * gapRatio;
  const startXRatio = (1 - totalBarsWidth) / 2;
  const baseYRatio = 0.74; // linia podstawy słupków
  const barCornerRatio = 0.35;

  for (let i = 0; i < barCount; i++) {
    const bx = padding + (startXRatio + i * (barWidthRatio + gapRatio)) * contentSize;
    const bw = barWidthRatio * contentSize;
    const bh = barHeights[i] * contentSize * 0.5;
    const baseY = padding + baseYRatio * contentSize;
    const by = baseY - bh;
    const br = bw * barCornerRatio;

    for (let y = Math.floor(by); y < Math.ceil(baseY); y++) {
      for (let x = Math.floor(bx); x < Math.ceil(bx + bw); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const lx = x - bx, ly = y - by;
        if (inRoundedRect(lx, ly, bw, bh, br)) {
          const idx = (y * size + x) * 4;
          buf[idx] = FG[0]; buf[idx + 1] = FG[1]; buf[idx + 2] = FG[2]; buf[idx + 3] = FG[3];
        }
      }
    }
  }

  return buf;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(rgbaBuf, size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: None
    rgbaBuf.subarray ? null : null;
    for (let x = 0; x < size * 4; x++) {
      raw[rowStart + 1 + x] = rgbaBuf[y * size * 4 + x];
    }
  }
  const idatData = deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcon(size, opts, filename) {
  const rgba = drawIcon(size, opts);
  const png = encodePNG(rgba, size);
  writeFileSync(join(outDir, filename), png);
  console.log(`OK ${filename} (${size}x${size}, ${png.length} B)`);
}

makeIcon(192, { padding: 0, cornerRatio: 0.22 }, "icon-192.png");
makeIcon(512, { padding: 0, cornerRatio: 0.22 }, "icon-512.png");
makeIcon(512, { padding: 90, cornerRatio: 0 }, "icon-maskable-512.png");
makeIcon(180, { padding: 0, cornerRatio: 0.22 }, "apple-touch-icon.png");
