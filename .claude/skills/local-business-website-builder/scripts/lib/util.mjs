// Shared helpers. Zero dependencies; Node 18+.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT = process.cwd();

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (fallback !== undefined && e.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${path.relative(ROOT, file)}: ${e.message}`);
  }
}

export const DEFAULT_IGNORE = ['node_modules', '.git', '.claude', '_originals', '_migration', '.qa', '.lighthouse'];

export function loadConfig(root = ROOT) {
  const file = path.join(root, 'site.config.json');
  const cfg = readJSON(file, null);
  if (!cfg) return null;
  cfg.site = cfg.site || {};
  cfg.site.url = (cfg.site.url || '').replace(/\/+$/, '');
  cfg.business = cfg.business || {};
  cfg.collections = cfg.collections || [];
  cfg.integrations = cfg.integrations || {};
  cfg.build = { assetVersioning: true, sitemap: true, ...(cfg.build || {}) };
  // Deployment (optional). production = the live host; staging = optional preview host (e.g. Cloudflare Pages).
  cfg.deploy = cfg.deploy || {};
  cfg.deploy.production = { host: '', ...(cfg.deploy.production || {}) };
  cfg.deploy.staging = cfg.deploy.staging && cfg.deploy.staging.provider ? { noindex: true, ...cfg.deploy.staging } : null;
  cfg.deploy.private = cfg.deploy.private || [];
  cfg.deploy.public = cfg.deploy.public || [];
  cfg.build.ignore = Array.from(new Set([...DEFAULT_IGNORE, ...(cfg.build.ignore || [])]));
  // Derived helpers for templates
  for (const h of cfg.business.hours || []) h.daysLabel = daysLabel(h.days || []);
  return cfg;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function daysLabel(days) {
  if (!days.length) return '';
  const idx = days.map((d) => DAY_ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const short = (i) => DAY_ORDER[i].slice(0, 3);
  if (idx.length > 2 && contiguous) return `${short(idx[0])}–${short(idx[idx.length - 1])}`;
  return idx.map(short).join(', ');
}

/** Recursively list files under dir, skipping ignored top-level/any-level names and underscore-prefixed dirs if skipUnderscore. */
export function walk(dir, { ignore = DEFAULT_IGNORE, skipUnderscore = true, ext } = {}) {
  const out = [];
  const visit = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (ignore.includes(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (skipUnderscore && e.name.startsWith('_')) continue;
        if (e.name.startsWith('.') && e.name !== '.well-known') continue;
        visit(full);
      } else if (!ext || ext.some((x) => e.name.toLowerCase().endsWith(x))) out.push(full);
    }
  };
  visit(dir);
  return out.sort();
}

export const rel = (p, root = ROOT) => path.relative(root, p).split(path.sep).join('/');

/** File path (relative to root) → public URL path. index.html → directory URL. */
export function fileToUrlPath(relPath) {
  let p = '/' + relPath.split(path.sep).join('/');
  if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
  return p;
}

/** Public URL path → candidate file paths (relative). Mimics Apache DirectoryIndex. */
export function urlPathToFiles(urlPath) {
  let p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  if (!p.startsWith('/')) p = '/' + p;
  const clean = p.replace(/^\/+/, '');
  if (p.endsWith('/')) return [path.join(clean, 'index.html')];
  return [clean, path.join(clean, 'index.html')];
}

export function hashFile(file, len = 8) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, len);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function writeIfChanged(file, content) {
  try { if (fs.readFileSync(file, 'utf8') === content) return false; } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

export function formatDate(iso, locale = 'en-US') {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export async function tryImport(name) {
  // Resolve from the client repo first (devDependencies), then globally.
  const { createRequire } = await import('node:module');
  for (const base of [path.join(ROOT, 'package.json'), path.join(SKILL_DIR, 'package.json')]) {
    try {
      const req = createRequire(base);
      const resolved = req.resolve(name);
      return await import(resolved.startsWith('/') ? 'file://' + resolved : resolved);
    } catch {}
  }
  try { return await import(name); } catch { return null; }
}

export const c = {
  red: (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  dim: (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};
