// Read intrinsic image dimensions from file headers: PNG, GIF, JPEG, WebP, SVG, AVIF (basic ispe).
import fs from 'node:fs';

export function imageSize(file) {
  let buf;
  try {
    const fd = fs.openSync(file, 'r');
    buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 512 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
  } catch { return null; }
  const lower = file.toLowerCase();
  try {
    if (lower.endsWith('.svg')) return svgSize(buf.toString('utf8'));
    if (buf.slice(1, 4).toString() === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
    if (buf.slice(0, 3).toString() === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
    if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return webpSize(buf);
    if (buf.slice(4, 8).toString() === 'ftyp') return avifSize(buf);
  } catch {}
  return null;
}

function jpegSize(buf) {
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7), type: 'jpeg' };
    }
    off += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const chunk = buf.slice(12, 16).toString();
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), type: 'webp' };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: 'webp' };
  }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: 'webp' };
  return null;
}

function avifSize(buf) {
  const i = buf.indexOf('ispe');
  if (i < 0) return null;
  return { width: buf.readUInt32BE(i + 8), height: buf.readUInt32BE(i + 12), type: 'avif' };
}

function svgSize(s) {
  const tag = /<svg\b[^>]*>/i.exec(s)?.[0] || '';
  const num = (a) => { const m = new RegExp(`\\b${a}="([\\d.]+)(px)?"`).exec(tag); return m ? Number(m[1]) : null; };
  let width = num('width');
  let height = num('height');
  const vb = /viewBox="([^"]+)"/i.exec(tag);
  if ((!width || !height) && vb) {
    const [, , w, h] = vb[1].split(/[\s,]+/).map(Number);
    width = width || w;
    height = height || h;
  }
  return width && height ? { width, height, type: 'svg' } : { width: null, height: null, type: 'svg' };
}
