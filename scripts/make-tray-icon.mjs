// Generates the menu-bar icon (a mortarboard) as macOS template images:
// black pixels + alpha, 22px and 44px(@2x), written to electron/assets/.
// The "Template" filename suffix makes macOS recolor it for light/dark menu
// bars automatically. Run: node scripts/make-tray-icon.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZE = 22;
const rows = [];
for (let y = 0; y < SIZE; y++) rows.push(new Array(SIZE).fill(0));

// Flat diamond (the cap), widest at y=8, centered on x=10/11.
const diamond = [
  [4, 10, 11],
  [5, 8, 13],
  [6, 6, 15],
  [7, 4, 17],
  [8, 2, 19],
  [9, 4, 17],
  [10, 6, 15],
  [11, 8, 13],
  [12, 10, 11],
];
for (const [y, x0, x1] of diamond) for (let x = x0; x <= x1; x++) rows[y][x] = 1;
// Tassel: hangs from the right tip, ends in a blob.
for (let y = 9; y <= 13; y++) rows[y][19] = 1;
for (let y = 14; y <= 15; y++) for (let x = 18; x <= 20; x++) rows[y][x] = 1;

function png(scale) {
  const n = SIZE * scale;
  const raw = Buffer.alloc(n * (1 + n * 4));
  for (let y = 0; y < n; y++) {
    const off = y * (1 + n * 4);
    raw[off] = 0; // filter: none
    for (let x = 0; x < n; x++) {
      const on = rows[Math.floor(y / scale)][Math.floor(x / scale)];
      raw.writeUInt32BE(on ? 0x000000ff : 0x00000000, off + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "electron", "assets");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "trayTemplate.png"), png(1));
fs.writeFileSync(path.join(outDir, "trayTemplate@2x.png"), png(2));
console.log(`wrote ${outDir}/trayTemplate.png (+@2x)`);
