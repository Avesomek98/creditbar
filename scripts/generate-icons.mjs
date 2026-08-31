// Generuje ikony PWA (PNG) bez zewnętrznych zależności — używa tylko wbudowanego modułu zlib.
// Motyw: bursztyn -> pomarańcz, glif = pierścień postępu (spójny z pierścieniem w aplikacji).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "icons");

const BG1 = [245, 158, 11]; // #f59e0b amber-500
const BG2 = [194, 65, 12]; // #c2410c orange-700
const FG = [255, 255, 255, 255];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255];
}

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

function drawIcon(size, { padding = 0, cornerRatio = 0.24, progress = 0.72 } = {}) {
  const buf = new Uint8Array(size * size * 4);
  const contentSize = size - padding * 2;
  const r = contentSize * cornerRatio;
  const cx = size / 2, cy = size / 2;
  const ringR = contentSize * 0.31;
  const strokeW = contentSize * 0.155;
  const sweep = Math.PI * 2 * progress;
  const capR = strokeW / 2;
  const startCap = [cx + ringR * Math.sin(0), cy - ringR * Math.cos(0)];
  const endCap = [cx + ringR * Math.sin(sweep), cy - ringR * Math.cos(sweep)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const lx = x - padding, ly = y - padding;
      const inside = lx >= 0 && ly >= 0 && lx < contentSize && ly < contentSize &&
        inRoundedRect(lx, ly, contentSize, contentSize, r);

      if (!inside) {
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
        continue;
      }

      const t = (x + y) / (2 * size);
      const bg = lerpColor(BG1, BG2, Math.min(1, Math.max(0, t)));
      let color = bg;

      const px = x + 0.5, py = y + 0.5;
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += Math.PI * 2;

      const inTrackBand = Math.abs(dist - ringR) <= strokeW / 2;
      const inProgressBand = inTrackBand && angle <= sweep;
      const inStartCap = Math.hypot(px - startCap[0], py - startCap[1]) <= capR;
      const inEndCap = Math.hypot(px - endCap[0], py - endCap[1]) <= capR;

      if (inProgressBand || inStartCap || inEndCap) {
        color = FG;
      } else if (inTrackBand) {
        color = lerpColor(bg, FG, 0.32);
      }

      buf[idx] = color[0]; buf[idx + 1] = color[1]; buf[idx + 2] = color[2]; buf[idx + 3] = 255;
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
    raw[rowStart] = 0;
    for (let x = 0; x < size * 4; x++) {
      raw[rowStart + 1 + x] = rgbaBuf[y * size * 4 + x];
    }
  }
  const idatData = deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
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

makeIcon(192, { padding: 0, cornerRatio: 0.24 }, "icon-192.png");
makeIcon(512, { padding: 0, cornerRatio: 0.24 }, "icon-512.png");
makeIcon(512, { padding: 90, cornerRatio: 0 }, "icon-maskable-512.png");
makeIcon(180, { padding: 0, cornerRatio: 0.24 }, "apple-touch-icon.png");
