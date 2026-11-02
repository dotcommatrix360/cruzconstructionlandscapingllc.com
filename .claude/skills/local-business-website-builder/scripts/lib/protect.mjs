// Development-file protection checks for the one-folder workflow:
// the same web root is served by Cloudflare Pages (staging) and Hostinger (production),
// so private files need TWO independent protections:
//   Hostinger (Apache/LiteSpeed): .htaccess rules returning 404 — Hostinger ignores _redirects/_headers
//   Cloudflare Pages:             _redirects rules sending private paths to /404/ — Cloudflare ignores .htaccess
// plus staging-only noindex via _headers scoped to *.pages.dev (never affects the production domain).
import fs from 'node:fs';
import path from 'node:path';

const PRIVATE_FILES = new Set(['site.config.json', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'CLAUDE.md', 'README.md',
  'CHANGELOG.md', 'lighthouserc.json', 'lighthouserc.js', '.lighthouserc.json', 'wrangler.toml', 'netlify.toml', 'vercel.json', 'Thumbs.db']);
const PRIVATE_DIRS = new Set(['node_modules', 'src', 'tools', 'scripts', 'components', 'partials', 'includes']);
const PUBLIC_SPECIAL = new Set(['.well-known', '_headers', '_redirects', '.htaccess']); // .htaccess: Apache never serves .ht* files

/** Top-level private entries of a web root (dotfiles, _folders, sources, tooling, docs) + extra, minus allowPublic. */
export function detectPrivatePaths(webRoot, { extra = [], allowPublic = [], ignore = [] } = {}) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(webRoot, { withFileTypes: true }); } catch { return out; }
  // Anything the site's own .htaccess already hides is private by the owner's decision → it must be hidden on Cloudflare too.
  let htBlocked = () => false;
  try { htBlocked = htaccessBlocker(fs.readFileSync(path.join(webRoot, '.htaccess'), 'utf8'), { defaults: false }); } catch {}
  for (const e of entries) {
    const n = e.name;
    if (PUBLIC_SPECIAL.has(n) || allowPublic.includes(n) || ignore.includes(n)) continue;
    const dir = e.isDirectory();
    const isPrivate = n.startsWith('.') || n.startsWith('_') || (dir ? PRIVATE_DIRS.has(n) : PRIVATE_FILES.has(n)) || (!dir && /\.(md|log|env)$/i.test(n))
      || (dir ? htBlocked(`/${n}/x.html`) : htBlocked(`/${n}`));
    if (isPrivate) out.push({ name: n, dir });
  }
  for (const x of extra) {
    const n = String(x).replace(/^\/+|\/+$/g, '');
    if (n && !out.some((o) => o.name === n)) out.push({ name: n, dir: fs.existsSync(path.join(webRoot, n)) ? fs.statSync(path.join(webRoot, n)).isDirectory() : !/\.\w+$/.test(n) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** True when a repo-relative path lives under a private top-level entry (src/, tools/, .claude/ …). */
export function isPrivateRel(relPath, entries) {
  const top = relPath.split('/')[0];
  return entries.some((e) => e.name === top && (e.dir || relPath === top));
}

/** URL paths that must not be served for an entry. */
export const probePaths = (e) => (e.dir ? [`/${e.name}/`, `/${e.name}/probe-file.txt`] : [`/${e.name}`]);

// ---- .htaccess (Hostinger / Apache / LiteSpeed)
export function htaccessBlocker(text, { defaults = true } = {}) {
  const rules = [];
  let pendingCond = false;
  let files = null; // open <Files>/<FilesMatch> section: { re, deny }
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    let fm;
    if ((fm = /^<FilesMatch\s+"?([^">]+)"?\s*>/i.exec(t))) { try { files = { re: new RegExp(fm[1]), deny: false }; } catch { files = { re: /$^/, deny: false }; } continue; }
    if ((fm = /^<Files\s+"?([^">]+)"?\s*>/i.exec(t))) { files = { re: new RegExp('^' + fm[1].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'), deny: false }; continue; }
    if (/^<\/Files(Match)?>/i.test(t)) { if (files?.deny) rules.push({ kind: 'files', re: files.re }); files = null; continue; }
    if (files) { if (/^(Require\s+all\s+denied|Deny\s+from\s+all)\b/i.test(t)) files.deny = true; continue; }
    if (/^RewriteCond\b/i.test(t)) { pendingCond = true; continue; }
    let m;
    if ((m = /^RewriteRule\s+(\S+)\s+(\S+)(?:\s+\[([^\]]*)\])?/i.exec(t))) {
      const flags = (m[3] || '').toUpperCase();
      if (!pendingCond) {
        try { rules.push({ kind: 'rewrite', re: new RegExp(m[1].replace(/^"|"$/g, ''), flags.includes('NC') ? 'i' : ''), block: /R=(404|410|403)|\bF\b|\bG\b/.test(flags), last: /\bL\b|\bEND\b|R=/.test(flags) || /\bF\b|\bG\b/.test(flags), passthrough: m[2] === '-' }); } catch {}
      }
      pendingCond = false;
      continue;
    }
    if ((m = /^RedirectMatch\s+(404|410|403|gone)\s+(\S+)/i.exec(t))) { try { rules.push({ kind: 'alias', re: new RegExp(m[2].replace(/^"|"$/g, '')), block: true }); } catch {} continue; }
    pendingCond = false;
  }
  return (urlPath) => {
    if (defaults && /(^|\/)\.ht[^/]*$/.test(urlPath)) return true; // Apache/LiteSpeed default
    const noSlash = urlPath.replace(/^\//, '');
    const base = urlPath.split('/').pop();
    if (base && rules.some((r) => r.kind === 'files' && r.re.test(base))) return true; // <FilesMatch> + Require all denied (403)
    for (const r of rules.filter((x) => x.kind === 'alias')) if (r.re.test(urlPath)) return true;
    for (const r of rules.filter((x) => x.kind === 'rewrite')) {
      if (!r.re.test(noSlash)) continue;
      if (r.block) return true;
      if (r.last && r.passthrough) return false; // e.g. ^\.well-known/ - [L]
      if (r.last) return false;
    }
    return false;
  };
}

// ---- _redirects (Cloudflare Pages / Netlify)
export function redirectsBlocker(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const [from, to, status = '302'] = t.split(/\s+/);
    if (!from || !to || status === '200') continue;
    const re = new RegExp('^' + from.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]\w*/g, '[^/]+')).join('.*') + '$');
    rules.push({ re, to });
  }
  const covered = (urlPath) => rules.find((r) => r.re.test(urlPath));
  covered.rules = rules;
  return covered;
}

// ---- _headers noindex for staging hosts
export function headersNoindex(text) {
  const blocks = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw) && cur) { if (/^\s*x-robots-tag\s*:\s*.*noindex/i.test(raw)) cur.noindex = true; continue; }
    cur = { pattern: raw.trim(), noindex: false };
    blocks.push(cur);
  }
  const noindexPatterns = blocks.filter((b) => b.noindex).map((b) => b.pattern);
  const pagesDev = noindexPatterns.some((p) => /^https:\/\/:[a-z]\w*\.pages\.dev\/\*$/i.test(p) || /^https:\/\/[\w-]+\.pages\.dev\/\*$/i.test(p));
  const pagesDevVersioned = noindexPatterns.some((p) => /^https:\/\/:[a-z]\w*\.:[a-z]\w*\.pages\.dev\/\*$/i.test(p));
  const global = noindexPatterns.some((p) => p === '/*');
  return { noindexPatterns, pagesDev, pagesDevVersioned, global };
}

export const STAGING_HEADERS = `# Cloudflare Pages staging only. Hostinger ignores this file (and .htaccess hides it).
# Host-scoped so it can never noindex the production domain.
https://:project.pages.dev/*
  X-Robots-Tag: noindex, nofollow, noarchive

https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex, nofollow, noarchive
`;

export const redirectLines = (entries) => entries.flatMap((e) => (e.dir ? [`/${e.name}/* /404/ 302`, `/${e.name} /404/ 302`] : [`/${e.name} /404/ 302`]));

/** Full protection audit of a web root. */
export function auditProtection(webRoot, { extra = [], allowPublic = [], ignore = [], staging = true, apache = true } = {}) {
  const entries = detectPrivatePaths(webRoot, { extra, allowPublic, ignore });
  const read = (f) => { try { return fs.readFileSync(path.join(webRoot, f), 'utf8'); } catch { return null; } };
  const ht = read('.htaccess');
  const rd = read('_redirects');
  const hd = read('_headers');
  const htBlocked = ht != null ? htaccessBlocker(ht) : () => false;
  const cfCovered = rd != null ? redirectsBlocker(rd) : () => null;
  const result = { entries, files: { htaccess: ht != null, redirects: rd != null, headers: hd != null }, hostinger: [], cloudflare: [], noindex: hd != null ? headersNoindex(hd) : null };
  // Cloudflare doesn't know .htaccess, so the file itself must be hidden there too.
  const cfEntries = ht != null && !entries.some((e) => e.name === '.htaccess') ? [...entries, { name: '.htaccess', dir: false, cloudflareOnly: true }] : entries;
  for (const e of cfEntries) {
    const paths = probePaths(e);
    if (apache && !e.cloudflareOnly) result.hostinger.push({ entry: e, ok: paths.every((p) => htBlocked(p)), failing: paths.filter((p) => !htBlocked(p)) });
    if (staging) result.cloudflare.push({ entry: e, ok: paths.every((p) => cfCovered(p)), failing: paths.filter((p) => !cfCovered(p)) });
  }
  // the protection files themselves must not be served by Apache
  if (apache) for (const f of ['_redirects', '_headers']) if (read(f) != null) result.hostinger.push({ entry: { name: f, dir: false }, ok: htBlocked('/' + f), failing: htBlocked('/' + f) ? [] : ['/' + f] });
  result.missingRedirects = redirectLines(result.cloudflare.filter((x) => !x.ok).map((x) => x.entry));
  result.missingHtaccess = result.hostinger.filter((x) => !x.ok).map((x) => x.entry);
  return result;
}

/** Suggested .htaccess lines (mod_alias, works on Hostinger without mod_rewrite ordering concerns). */
export function htaccessLines(entries) {
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const dirs = entries.filter((e) => e.dir).map((e) => esc(e.name));
  const files = entries.filter((e) => !e.dir).map((e) => esc(e.name));
  const lines = [];
  if (dirs.length) lines.push(`RedirectMatch 404 ^/(${dirs.join('|')})(/|$)`);
  if (files.length) lines.push(`RedirectMatch 404 ^/(${files.join('|')})$`);
  return lines;
}

/** True when a workflow has a step that publishes somewhere (comments ignored). */
export function deploysSomething(yaml) {
  const code = yaml.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s#.*$/, '')).join('\n');
  return /uses:\s*\S*(ftp-deploy|sftp|ssh-deploy|rsync|scp-action|deploy-to|cloudflare\/(pages|wrangler)-action|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy)/i.test(code)
    || /\b(wrangler(@[\w.^~-]+)?\s+(pages\s+)?(deploy|publish)|lftp|rsync\s|scp\s|sshpass|curl\b[^\n]*hostinger|hpanel\.hostinger)/i.test(code);
}

// ---------------------------------------------------------------- Astro: the built site (dist/)
// In Astro projects only dist/ is published, so "protection" means: nothing private ever lands in dist/,
// the host files in dist/ are right (Apache must still serve /_astro/), and staging is noindexed.
const DIST_PUBLIC_SPECIAL = new Set(['_astro', '_headers', '_redirects', '.htaccess', '.well-known']);
const DIST_FORBIDDEN_FILE = /^(site\.config\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|astro\.config\.\w+|tsconfig\.json|CLAUDE\.md|README\.md|CHANGELOG\.md|\.env.*|\.npmrc|\.gitignore|\.DS_Store|Thumbs\.db|wrangler\.toml)$/i;
const DIST_FORBIDDEN_DIR = /^(src|node_modules|\.git|\.github|\.claude|\.astro|\.vscode|integrations|_migration|_originals|\.qa|\.lighthouse)$/;

/** Scan a built site for files that must never be published. */
export function scanDist(distDir) {
  const problems = [];
  const warnings = [];
  const visit = (dir, relBase = '') => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      const top = !relBase;
      if (e.isDirectory()) {
        if (DIST_FORBIDDEN_DIR.test(e.name)) { problems.push(`dist/${rel}/ must not be published`); continue; }
        if (top && e.name.startsWith('_') && !DIST_PUBLIC_SPECIAL.has(e.name)) warnings.push(`dist/${rel}/ starts with "_" — make sure it is meant to be public`);
        visit(path.join(dir, e.name), rel);
        continue;
      }
      if (DIST_FORBIDDEN_FILE.test(e.name)) problems.push(`dist/${rel} must not be published`);
      else if (/\.(md|mdx|ts|tsx|astro|env|log|sql|bak|zip|tar|gz)$/i.test(e.name)) problems.push(`dist/${rel}: source/backup/archive file in the build output`);
      else if (/\.map$/i.test(e.name)) warnings.push(`dist/${rel}: source map published (exposes source code) — disable vite.build.sourcemap for production`);
      else if (top && e.name.startsWith('.') && !DIST_PUBLIC_SPECIAL.has(e.name)) problems.push(`dist/${rel}: dotfile in the build output`);
    }
  };
  visit(distDir);
  return { problems, warnings };
}

/** Full audit of an Astro build for the configured hosts. */
export function auditDist(distDir, { staging = true, apache = true } = {}) {
  const read = (f) => { try { return fs.readFileSync(path.join(distDir, f), 'utf8'); } catch { return null; } };
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    errors.push(`No build output in ${path.basename(distDir)}/ — run npm run build first`);
    return { errors, warnings, noindex: null, built: false };
  }
  const scan = scanDist(distDir);
  errors.push(...scan.problems);
  warnings.push(...scan.warnings);
  if (!fs.existsSync(path.join(distDir, '404.html'))) errors.push('dist/404.html missing — Cloudflare Pages would answer every unknown URL with the homepage (soft 404s); add src/pages/404.astro');

  const ht = read('.htaccess');
  if (apache) {
    if (ht == null) errors.push('dist/.htaccess missing — Apache/LiteSpeed (Hostinger) needs it for HTTPS, 404s, redirects and hiding _headers/_redirects (keep public/.htaccess from the starter)');
    else {
      const blocked = htaccessBlocker(ht);
      if (blocked('/_astro/app.css') || blocked('/_astro/img.webp')) errors.push('dist/.htaccess blocks /_astro/ — every stylesheet, script and image would 404 on Hostinger. Remove the generic "(^|/)_" rule; block only ^_(headers|redirects)$');
      for (const f of ['_headers', '_redirects']) if (read(f) != null && !blocked('/' + f)) errors.push(`dist/.htaccess does not hide /${f} on Hostinger — add: RewriteRule ^_(headers|redirects)$ - [R=404,L]`);
      if (!blocked('/.env') || !blocked('/.git/config')) errors.push('dist/.htaccess does not block dotfiles — add: RewriteRule (^|/)\\. - [R=404,L] (after the .well-known rule)');
      if (/#\s*@redirects\b/.test(ht)) errors.push('dist/.htaccess still contains the "# @redirects" marker — the hosting-files integration did not run (check astro.config.mjs integrations)');
    }
  }
  let noindex = null;
  if (staging) {
    const hd = read('_headers');
    const rd = read('_redirects');
    noindex = hd != null ? headersNoindex(hd) : null;
    if (!noindex) errors.push('dist/_headers missing — staging (*.pages.dev) could be indexed (keep public/_headers from the starter)');
    else if (!noindex.pagesDev || !noindex.pagesDevVersioned) errors.push('dist/_headers: X-Robots-Tag noindex must cover https://:project.pages.dev/* and https://:version.:project.pages.dev/*');
    if (noindex?.global) warnings.push('dist/_headers applies noindex to "/*" (every host) — use only the *.pages.dev patterns');
    if (ht != null && !(rd != null && redirectsBlocker(rd)('/.htaccess'))) errors.push('dist/_redirects does not hide /.htaccess on Cloudflare (it ignores .htaccess and would serve it) — add: /.htaccess /404/ 302');
  }
  return { errors, warnings, noindex, built: true };
}
