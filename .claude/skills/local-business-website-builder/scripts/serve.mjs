#!/usr/bin/env node
// serve.mjs — local preview that behaves like the real hosts:
//   default       Hostinger/Apache: directory index, /path → /path/ 301, real 404 with /404.html, and the site's own
//                 .htaccess 404 rules (falls back to blocking dotfiles/_folders/config when there is no .htaccess).
//                 _headers/_redirects are ignored (Apache doesn't read them).
//   --cloudflare  Cloudflare Pages: applies _headers and _redirects, ignores .htaccess (serves files it would expose),
//                 and falls back to the homepage with HTTP 200 when there is no top-level 404.html (SPA mode).
//   --raw         no blocking at all (a naive host)
// Usage: node serve.mjs [--port 8080] [--root .] [--cloudflare | --raw] [--spa-fallback]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib/util.mjs';
import { htaccessBlocker } from './lib/protect.mjs';
import { detectProject } from './lib/project.mjs';

const args = parseArgs();
const PORT = Number(args.port || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const FALLBACK_BLOCKED = /(^|\/)(\.(?!well-known)|_)|^\/?(site\.config\.json|package(-lock)?\.json|CLAUDE\.md|README\.md|node_modules)/;
const toRe = (pat) => new RegExp('^' + pat.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]\w*/g, '[^/]+')).join('.*') + '$');

function headerRules(ROOT) {
  const f = path.join(ROOT, '_headers');
  if (!fs.existsSync(f)) return [];
  const rules = [];
  let cur = null;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line) && cur) { const i = line.indexOf(':'); if (i > 0) cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); continue; }
    // Host patterns (https://:project.pages.dev/*) are treated as matching the local host.
    cur = { re: toRe(line.trim().replace(/^https:\/\/[^/]+/, '')), headers: [] };
    rules.push(cur);
  }
  return rules;
}
function redirectRules(ROOT) {
  const f = path.join(ROOT, '_redirects');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [from, to, status = '302'] = l.split(/\s+/);
    return { re: toRe(from), from, to, status: Number(status) };
  }).filter((r) => r.to && r.status !== 200);
}

// Default root = what the hosts publish: dist/ for Astro projects (run npm run build first), else the repo root.
export function createServer(root = args.root || detectProject(process.cwd()).webRoot, opts = { raw: !!args.raw, cloudflare: !!args.cloudflare, spaFallback: !!args['spa-fallback'] }) {
  const ROOT = path.resolve(String(root));
  const astroOutput = fs.existsSync(path.join(ROOT, '_astro'));
  const cf = !!opts.cloudflare;
  const hdrs = cf ? headerRules(ROOT) : [];
  const redirects = cf ? redirectRules(ROOT) : [];
  const ht = fs.existsSync(path.join(ROOT, '.htaccess')) ? htaccessBlocker(fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8')) : null;
  const apacheRedirects = cf || opts.raw || !ht ? [] : fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8').split(/\r?\n/).map((l) => l.trim()).flatMap((l) => {
    let m;
    if ((m = /^RedirectMatch\s+(30[1278])\s+(\S+)\s+(\S+)/i.exec(l))) { try { return [{ re: new RegExp(m[2]), to: m[3], status: Number(m[1]) }]; } catch { return []; } }
    if ((m = /^Redirect(?:Permanent)?\s+(?:(30[1278])\s+)?(\/\S*)\s+(\S+)/i.exec(l))) return [{ prefix: m[2], to: m[3], status: Number(m[1] || 301) }];
    return [];
  });
  const apacheBlocked = (p) => (ht ? ht(p) : (astroOutput ? /(^|\/)\.(?!well-known)|^\/_(headers|redirects)$/.test(p) : FALLBACK_BLOCKED.test(p.slice(1))));
  const spa = opts.spaFallback || cf;

  const send404 = (res) => {
    const f = path.join(ROOT, '404.html');
    if (spa && !fs.existsSync(f) && fs.existsSync(path.join(ROOT, 'index.html'))) {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      return res.end(fs.readFileSync(path.join(ROOT, 'index.html')));
    }
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(fs.existsSync(f) ? fs.readFileSync(f) : 'Not found');
  };

  return http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    for (const r of hdrs) if (r.re.test(urlPath)) for (const [k, v] of r.headers) {
      const prev = res.getHeader(k);
      res.setHeader(k, prev ? `${prev}, ${v}` : v);
    }
    if (urlPath.includes('..')) return send404(res);
    if (cf) {
      const r = redirects.find((x) => x.re.test(urlPath));
      if (r) {
        const splat = r.from.includes('*') ? urlPath.slice(r.from.indexOf('*')) : '';
        res.writeHead(r.status, { location: r.to.replace(':splat', splat) });
        return res.end();
      }
      if (/^\/_(headers|redirects)$/.test(urlPath)) return send404(res); // Cloudflare never serves these
    } else if (!opts.raw && apacheBlocked(urlPath)) return send404(res);
    else {
      for (const r of apacheRedirects) {
        const target = r.re ? (r.re.test(urlPath) ? urlPath.replace(r.re, r.to) : null) : (urlPath === r.prefix || urlPath.startsWith(r.prefix.replace(/\/?$/, '/')) ? r.to + urlPath.slice(r.prefix.length) : null);
        if (target != null) { res.writeHead(r.status, { location: target }); return res.end(); }
      }
    }
    let file = path.join(ROOT, urlPath);
    let stat;
    try { stat = fs.statSync(file); } catch { return send404(res); }
    if (stat.isDirectory()) {
      if (!urlPath.endsWith('/')) { res.writeHead(301, { location: urlPath + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }); return res.end(); }
      file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return send404(res);
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('serve.mjs')) {
  const srv = createServer();
  if (!fs.existsSync(path.join(path.resolve(String(args.root || detectProject().webRoot)), 'index.html'))) console.log('No index.html to serve — Astro projects: run npm run build first.');
  srv.listen(PORT, () => console.log(`Serving ${path.resolve(String(args.root || detectProject().webRoot))} at http://localhost:${PORT}/ (${args.cloudflare ? 'Cloudflare Pages mode' : args.raw ? 'raw' : 'Hostinger/Apache mode'})  Ctrl+C to stop`));
}
