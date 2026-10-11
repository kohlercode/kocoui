// Builds the small sample files shipped with the demo. Output is committed;
// run this again only if those files need to be redrawn.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'public', 'media');
mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(w, h, paint) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y, w, h);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function shore(x, y, w, h) {
  const horizon = Math.floor(h * 0.62);
  const sun = (x - w * 0.72) ** 2 + (y - h * 0.28) ** 2 < (w * 0.06) ** 2;
  if (sun && y < horizon) return [255, 214, 102];
  if (y < horizon) {
    const t = y / horizon;
    return [Math.round(120 + 80 * t), Math.round(180 + 40 * t), Math.round(220 - 20 * t)];
  }
  const t = (y - horizon) / (h - horizon);
  return [Math.round(214 - 30 * t), Math.round(186 - 20 * t), Math.round(140 - 10 * t)];
}

function cabin(x, y, w, h) {
  const hx = w * 0.5;
  const left = w * 0.34;
  const right = w * 0.66;
  const roofTop = h * 0.28;
  const roofBase = h * 0.5;
  const wallBottom = h * 0.8;
  const inRoof = y >= roofTop && y <= roofBase
    && Math.abs(x - hx) < ((y - roofTop) / (roofBase - roofTop)) * (w * 0.2);
  if (inRoof) return [122, 72, 52];
  const door = x > w * 0.46 && x < w * 0.54 && y > h * 0.62 && y < wallBottom;
  if (door) return [72, 48, 32];
  const wall = x >= left && x <= right && y >= roofBase && y <= wallBottom;
  if (wall) return [196, 154, 108];
  if (y < h * 0.62) return [186, 214, 232];
  return [96, 140, 88];
}

function wav(seconds, freq) {
  const rate = 22050;
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 300, (n - i) / 800);
    const s = Math.sin((2 * Math.PI * freq * i) / rate) * 0.25 * env;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 68 >>\nstream\nBT /F1 18 Tf 48 100 Td (KocoUI demo note) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

const files = {
  'shore.png': png(640, 400, shore),
  'cabin.png': png(640, 400, cabin),
  'note.wav': wav(0.6, 523),
  'notes.pdf': pdf(),
};
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(out, name), bytes);
  console.log(`${name} ${bytes.length}`);
}
