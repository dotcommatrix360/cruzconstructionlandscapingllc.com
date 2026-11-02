#!/usr/bin/env node
// optimize-images.mjs — image intake with sharp.
// Astro projects (default there): writes ONE clean master per photo to src/assets/images/<name>.<jpg|png> —
//   renamed, auto-rotated, metadata stripped, capped at 2400px — and prints the <ResponsiveImage> import snippet.
//   Astro generates the AVIF/WebP size variants at build time, so no variants are committed.
//   --variants forces the legacy behaviour below.
// Legacy static sites: resize + convert to committed variants; prints <img> snippets with srcset and intrinsic size.
// Usage:
//   node optimize-images.mjs <file|dir>... [--out assets/images] [--widths 480,960,1600] [--formats webp]
//        [--quality 78] [--fallback] [--rename map.json] [--keep-originals _originals] [--dry-run]
//   --rename map.json   {"IMG_1234.jpg": "roof-replacement-boise"} — descriptive base names (decide after LOOKING at each image)
//   --fallback          also write a compressed JPEG/PNG at the largest width (for <picture> fallbacks)
//   --public-path p     URL prefix for snippets when --out is outside the repo (default /assets/images)
//   --keep-originals d  move source files to folder d (blocked from web by .htaccess when it starts with _)
// Never upscales. Strips metadata (keeps orientation applied). Skips SVG/GIF (copy SVGs as-is; optimize SVGs with svgo if available).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, tryImport, slugify, rel, c } from './lib/util.mjs';
import { detectProject } from './lib/project.mjs';

const publicUrl = (dest) => { const r = rel(dest); return r.startsWith('..') ? `${String(args['public-path'] || '/assets/images').replace(/\/$/, '')}/${path.basename(dest)}` : '/' + r; };

const args = parseArgs();
const inputs = args._;
if (!inputs.length) { console.log('Usage: node optimize-images.mjs <file|dir>... [--out assets/images] [--widths 480,960,1600] [--formats webp]'); process.exit(2); }

const sharpMod = await tryImport('sharp');
if (!sharpMod) {
  console.error(c.red('sharp is not installed. Install it as a dev dependency in this repo:  npm i -D sharp'));
  console.error('NOT RUN: image optimization. Do not report images as optimized.');
  process.exit(3);
}
const sharp = sharpMod.default || sharpMod;

const MASTER = detectProject().type === 'astro' && !args.variants;
const OUT = path.resolve(String(args.out || (MASTER ? 'src/assets/images' : 'assets/images')));
const widths = String(args.widths || '480,960,1600').split(',').map(Number).filter(Boolean).sort((a, b) => a - b);
const formats = String(args.formats || 'webp').split(',');
const quality = Number(args.quality || 78);
const renameMap = args.rename ? JSON.parse(fs.readFileSync(String(args.rename), 'utf8')) : {};
const RASTER = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;

const files = [];
for (const inp of inputs) {
  const p = path.resolve(inp);
  if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) { if (RASTER.test(f)) files.push(path.join(p, f)); }
  else files.push(p);
}

let before = 0;
let after = 0;
const snippets = [];
fs.mkdirSync(OUT, { recursive: true });

for (const file of files) {
  if (!RASTER.test(file)) { console.log(c.dim(`skip ${rel(file)} (not a raster image)`)); continue; }
  const baseName = renameMap[path.basename(file)] || slugify(path.basename(file).replace(/\.[^.]+$/, ''));
  if (MASTER) {
    if (/^(img|dsc|pxl|image|photo|screenshot)-?\d*$/i.test(baseName)) console.log(c.yellow(`warn: "${baseName}" is a generic name — add it to --rename with a descriptive name`));
    const metaData = await sharp(file, { failOn: 'none' }).metadata();
    const alpha = !!metaData.hasAlpha;
    const dest = path.join(OUT, `${baseName}.${alpha ? 'png' : 'jpg'}`);
    const maxW = Number(args['max-width'] || 2400);
    before += fs.statSync(file).size;
    if (!args['dry-run']) {
      const pipe = sharp(file, { failOn: 'none' }).rotate().resize({ width: maxW, withoutEnlargement: true });
      await (alpha ? pipe.png({ compressionLevel: 9 }) : pipe.jpeg({ quality: Number(args.quality || 85), mozjpeg: true })).toFile(dest);
      after += fs.statSync(dest).size;
    }
    const outMeta = args['dry-run'] ? metaData : await sharp(dest).metadata();
    const varName = baseName.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase()).replace(/^(\d)/, '_$1');
    snippets.push(`// ${path.basename(file)} → ${rel(dest)} (${outMeta.width}×${outMeta.height})\nimport ${varName} from '${path.posix.relative('src/pages', rel(dest)).replace(/^(?!\.)/, './')}';\n<ResponsiveImage src={${varName}} alt="TODO: describe what is shown" sizes="(min-width: 60rem) 50vw, 100vw" />`);
    if (args['keep-originals'] && !args['dry-run']) { const keep = path.resolve(String(args['keep-originals'])); fs.mkdirSync(keep, { recursive: true }); fs.renameSync(file, path.join(keep, path.basename(file))); }
    console.log(`${c.green('✔')} ${rel(file)} → ${rel(dest)}`);
    continue;
  }
  if (/^(img|dsc|pxl|image|photo|screenshot)-?\d*$/i.test(baseName)) console.log(c.yellow(`warn: "${baseName}" is a generic name — add it to --rename with a descriptive name`));
  const img = sharp(file, { failOn: 'none' }).rotate();
  const metaData = await img.metadata();
  const srcW = metaData.autoOrient?.width || metaData.width;
  const srcH = metaData.autoOrient?.height || metaData.height;
  const size = fs.statSync(file).size;
  before += size;
  const useWidths = [...new Set(widths.filter((w) => w < srcW).concat(widths.some((w) => w >= srcW) || !widths.length ? [srcW] : []))];
  const outputs = {};
  for (const fmt of formats) {
    outputs[fmt] = [];
    for (const w of useWidths) {
      const name = `${baseName}-${w}.${fmt}`;
      const dest = path.join(OUT, name);
      if (!args['dry-run']) {
        let pipe = sharp(file, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true });
        pipe = fmt === 'avif' ? pipe.avif({ quality: Math.max(30, quality - 28), effort: 4 }) : fmt === 'webp' ? pipe.webp({ quality, effort: 5 }) : fmt === 'png' ? pipe.png({ compressionLevel: 9, palette: true }) : pipe.jpeg({ quality, mozjpeg: true });
        await pipe.toFile(dest);
        after += fs.statSync(dest).size;
      }
      outputs[fmt].push({ w, url: publicUrl(dest) });
    }
  }
  let fallback = null;
  if (args.fallback) {
    const isPng = /\.png$/i.test(file) || metaData.hasAlpha;
    const w = useWidths[useWidths.length - 1];
    const name = `${baseName}-${w}.${isPng ? 'png' : 'jpg'}`;
    const dest = path.join(OUT, name);
    if (!args['dry-run']) {
      const pipe = sharp(file, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true });
      await (isPng ? pipe.png({ compressionLevel: 9, palette: true }) : pipe.jpeg({ quality, mozjpeg: true })).toFile(dest);
      after += fs.statSync(dest).size;
    }
    fallback = publicUrl(dest);
  }
  if (args['keep-originals'] && !args['dry-run']) {
    const keep = path.resolve(String(args['keep-originals']));
    fs.mkdirSync(keep, { recursive: true });
    fs.renameSync(file, path.join(keep, path.basename(file)));
  }
  const primary = outputs[formats[0]];
  const largest = primary[primary.length - 1];
  const h = Math.round((srcH / srcW) * largest.w);
  const srcset = primary.map((o) => `${o.url} ${o.w}w`).join(', ');
  const fallbackSrc = primary.find((o) => o.w >= 960)?.url || largest.url;
  snippets.push(`<!-- ${path.basename(file)} → ${baseName} (${srcW}×${srcH}) -->\n<img src="${fallbackSrc}"\n     srcset="${srcset}"\n     sizes="(min-width: 60rem) 50vw, 100vw" width="${largest.w}" height="${h}"\n     alt="TODO: describe what is shown" loading="lazy" decoding="async">`);
  console.log(`${c.green('✔')} ${rel(file)} → ${formats.map((f) => `${outputs[f].length}×${f}`).join(', ')}${fallback ? ` + ${path.basename(fallback)}` : ''}`);
}

console.log('\n' + snippets.join('\n\n'));
if (MASTER) {
  if (!args['dry-run']) console.log(c.bold(`\nOriginals ${(before / 1024).toFixed(0)} KB → masters ${(after / 1024).toFixed(0)} KB. Astro builds AVIF/WebP variants from these. Import paths above are relative to src/pages/ — adjust for other folders, set real sizes="" and alt text.`));
  process.exit(0);
}
if (!args['dry-run']) console.log(c.bold(`\nSource total ${(before / 1024).toFixed(0)} KB → generated total ${(after / 1024).toFixed(0)} KB (all variants). Edit sizes="" to match the layout and write real alt text.`));
