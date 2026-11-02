#!/usr/bin/env node
// staging-check.mjs — QA a LIVE staging deployment (e.g. https://client.pages.dev) before production approval.
// Read-only HTTP checks; needs network, no credentials.
//   indexing   every page sends X-Robots-Tag: noindex (or meta robots noindex); canonicals point to production
//   exposure   private/dev files return 404 (config, partials, content sources, skill, dotfiles)
//   pages      every sitemap URL returns 200; unknown URLs return a real 404 (not SPA fallback)
//   nav/links  internal links (incl. header/footer nav) resolve
//   images     every local <img>/<source> loads as an image
//   forms      action present, https, not a placeholder; embeds listed for a manual test submission
//   security   https, X-Content-Type-Options / Referrer-Policy / framing headers, no mixed (http://) content
// Usage: node staging-check.mjs <staging-url> [--max 60] [--json report.json]
// Responsive/mobile rendering: node browser-check.mjs --base-url <staging-url>
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, loadConfig, c } from './lib/util.mjs';
import { findTags, findElements, linkRel, meta, stripComments } from './lib/html.mjs';
import { detectPrivatePaths } from './lib/protect.mjs';
import { ensureProxyEnv } from './lib/cloudflare.mjs';
import { detectProject } from './lib/project.mjs';

ensureProxyEnv();

const args = parseArgs();
const cfg = loadConfig() || { site: {}, deploy: {} };
const base = String(args._[0] || cfg.deploy?.staging?.url || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) { console.log('Usage: node staging-check.mjs <staging-url>   (or set deploy.staging.url in site.config.json)'); process.exit(2); }
const PROD = cfg.site.url || '';
const MAX = Number(args.max || 60);
const issues = [];
const add = (level, code, where, msg) => issues.push({ level, code, where, msg });

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { redirect: opts.redirect || 'follow', headers: { 'user-agent': 'Mozilla/5.0 (staging-check; local-business-website-builder)' } });
    const type = r.headers.get('content-type') || '';
    const body = opts.body === false || !/text|xml|json/.test(type) ? '' : await r.text();
    if (opts.body === false && r.body) r.body.cancel?.().catch(() => {});
    return { status: r.status, headers: r.headers, type, body, url: r.url, redirected: r.redirected };
  } catch (e) { return { status: 0, error: e.message, headers: new Headers(), type: '', body: '' }; }
}

// Reachability
const home = await get(base + '/');
if (!home.status) { console.log(c.yellow(`NOT RUN: cannot reach ${base} (${home.error}). Check the URL or network access.`)); process.exit(3); }

// Page list: local sitemap (production URLs → staging), else crawl from home
let pagePaths = [];
const project = detectProject();
const sm = path.join(project.webRoot, 'sitemap.xml');
if (fs.existsSync(sm) && PROD) {
  pagePaths = [...fs.readFileSync(sm, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => u.startsWith(PROD)).map((u) => u.slice(PROD.length) || '/');
} else {
  const live = await get(base + '/sitemap.xml');
  if (live.status === 200) pagePaths = [...live.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => { try { return new URL(m[1]).pathname; } catch { return null; } }).filter(Boolean);
}
if (!pagePaths.includes('/')) pagePaths.unshift('/');
if (pagePaths.length > MAX) { add('rec', 'sample', '', `Checked ${MAX} of ${pagePaths.length} sitemap pages (use --max)`); pagePaths = pagePaths.slice(0, MAX); }

const sameSite = (u) => { try { const x = new URL(u, base + '/'); return x.origin === new URL(base).origin ? x : null; } catch { return null; } };
const linkTargets = new Map(); // path → first page that links to it
const assetTargets = new Map();
const forms = [];
const embeds = new Set();

for (const p of pagePaths) {
  const r = await get(base + p);
  if (r.status !== 200) { add('error', 'page-status', p, `HTTP ${r.status}${r.redirected ? ` (redirected to ${r.url})` : ''}`); continue; }
  const html = stripComments(r.body);
  // indexing
  const xrt = (r.headers.get('x-robots-tag') || '').toLowerCase();
  const metaRobots = (meta(html, 'robots') || '').toLowerCase();
  if (!xrt.includes('noindex') && !metaRobots.includes('noindex')) add('error', 'indexable', p, 'Staging page is indexable — no X-Robots-Tag/meta noindex');
  if (p === '/') {
    if (!/nosniff/i.test(r.headers.get('x-content-type-options') || '')) add('warn', 'header-nosniff', p, 'Missing X-Content-Type-Options: nosniff');
    if (!r.headers.get('referrer-policy')) add('warn', 'header-referrer', p, 'Missing Referrer-Policy');
    if (!r.headers.get('x-frame-options') && !/frame-ancestors/i.test(r.headers.get('content-security-policy') || '')) add('rec', 'header-framing', p, 'No X-Frame-Options or CSP frame-ancestors (clickjacking protection)');
  }
  if (base.startsWith('https:')) for (const t of findTags(html, ['img', 'source', 'script', 'link', 'iframe'])) {
    const s = t.attrs.src || (t.tag === 'link' && /stylesheet|preload|icon/.test(t.attrs.rel || '') ? t.attrs.href : '') || '';
    if (/^http:\/\//i.test(s)) add('error', 'mixed-content', p, `Insecure http:// resource on an https page: ${s}`);
  }
  const canon = linkRel(html, 'canonical')[0]?.attrs.href;
  if (canon && canon.startsWith(base)) add('error', 'canonical-staging', p, `Canonical points at the staging host: ${canon}`);
  else if (canon && PROD && !canon.startsWith(PROD)) add('warn', 'canonical-host', p, `Canonical not on production host ${PROD}: ${canon}`);
  // links (nav first)
  const navHtml = findElements(html, 'nav').map((n) => n.inner).join('\n');
  for (const a of findTags(navHtml + html, ['a'])) {
    const href = a.attrs.href;
    if (!href || /^(#|mailto:|tel:|sms:|javascript:)/i.test(href)) continue;
    const u = sameSite(href) || (PROD && href.startsWith(PROD) ? new URL(href.slice(PROD.length) || '/', base + '/') : null);
    if (u && !linkTargets.has(u.pathname)) linkTargets.set(u.pathname, p);
  }
  // images
  for (const t of findTags(html, ['img', 'source'])) {
    for (const s of [t.attrs.src, ...(t.attrs.srcset || '').split(',').map((x) => x.trim().split(/\s+/)[0])]) {
      const u = s && sameSite(s);
      if (u && !assetTargets.has(u.pathname)) assetTargets.set(u.pathname, p);
    }
  }
  for (const t of findTags(html, ['link', 'script'])) {
    const s = t.tag === 'link' ? (/stylesheet|icon|preload/.test(t.attrs.rel || '') ? t.attrs.href : '') : t.attrs.src;
    const u = s && sameSite(s);
    if (u && !assetTargets.has(u.pathname)) assetTargets.set(u.pathname, p);
  }
  // forms & embeds
  for (const f of findTags(html, ['form'])) forms.push({ page: p, action: f.attrs.action || '', method: (f.attrs.method || 'get').toLowerCase() });
  for (const f of findTags(html, ['iframe', 'script'])) { const s = f.attrs.src || ''; if (/leadconnectorhq|msgsndr|gohighlevel|calendly|jotform|typeform|hsforms|google\.com\/maps|youtube/i.test(s)) embeds.add(`${s.split('?')[0]} (${p})`); }
}

// Links
for (const [p, from] of linkTargets) {
  if (pagePaths.includes(p)) continue;
  const r = await get(base + p, { body: false });
  if (r.status >= 400 || !r.status) add('error', 'link-broken', from, `Link to ${p} → HTTP ${r.status}`);
}
// Assets / images
for (const [p, from] of assetTargets) {
  const r = await get(base + p, { body: false });
  if (r.status !== 200) add('error', 'asset-broken', from, `${p} → HTTP ${r.status}`);
  else if (/\.(webp|avif|jpe?g|png|gif|svg)$/i.test(p) && !/^image\//.test(r.type)) add('error', 'image-type', from, `${p} served as "${r.type}" (not an image)`);
}
// Forms
for (const f of forms) {
  if (!f.action) add('warn', 'form-action', f.page, 'Form has no action (OK only if JavaScript or an embed handles it) — test-submit manually');
  else if (/todo|(^|[/.])example\.(invalid|com|org|net)\b|^#$/i.test(f.action)) add('error', 'form-placeholder', f.page, `Form action is a placeholder: ${f.action}`);
  else if (/^http:/i.test(f.action)) add('error', 'form-insecure', f.page, `Form posts over http: ${f.action}`);
}
// Missing pages: real 404, not SPA fallback
const probe = `/lbwb-missing-${Date.now().toString(36)}/`;
const nf = await get(base + probe);
if (nf.status === 200) add('error', 'soft-404', probe, 'Unknown URL returns 200 — 404.html missing from the deployment (host is in SPA fallback mode)');
else if (nf.status !== 404) add('warn', '404-status', probe, `Unknown URL returns HTTP ${nf.status} (expected 404)`);
else if (!/not found|404/i.test(nf.body)) add('warn', '404-page', probe, 'Returns 404 but not the custom 404 page');
// Private / development files must not be public
const privatePaths = ['/site.config.json', '/CLAUDE.md', '/README.md', '/package.json', '/.htaccess', '/.gitignore', '/.git/config', '/.lbwb-manifest.json',
  '/_partials/header.html', '/_templates/article.html', '/.claude/skills/local-business-website-builder/SKILL.md', '/.env', '/node_modules/.package-lock.json'];
if (project.type === 'astro') privatePaths.push('/src/pages/index.astro', '/src/content.config.ts', '/astro.config.mjs', '/tsconfig.json', '/package-lock.json',
  '/.github/workflows/deploy-production.yml', '/integrations/hosting-files.mjs', '/_redirects', '/_headers', '/dist/index.html');
for (const e of detectPrivatePaths(ROOT, { extra: cfg.deploy?.private || [], allowPublic: cfg.deploy?.public || [] })) {
  if (!e.dir) { privatePaths.push('/' + e.name); continue; }
  // probe a real file inside each private folder (first one found)
  const first = (() => { try { return fs.readdirSync(path.join(ROOT, e.name), { withFileTypes: true }).find((x) => x.isFile())?.name; } catch { return null; } })();
  privatePaths.push(first ? `/${e.name}/${first}` : `/${e.name}/`);
}
for (const cDir of (cfg.collections || []).map((col) => col.source).filter(Boolean)) {
  const dir = path.join(ROOT, cDir);
  const first = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith('.md'));
  if (first) privatePaths.push(`/${cDir.replace(/^\/+|\/+$/g, '')}/${first}`);
}
for (const p of [...new Set(privatePaths)]) {
  const r = await get(base + p, { redirect: 'manual', body: false });
  if (r.status === 200) add('error', 'exposed', p, 'Development/private file is publicly accessible on staging');
}
// robots/sitemap reachable (informational — indexing is controlled by the header)
for (const p of ['/robots.txt', '/sitemap.xml']) { const r = await get(base + p, { body: false }); if (r.status !== 200) add('warn', 'missing-file', p, `HTTP ${r.status}`); }

// Report
const order = { error: 0, warn: 1, rec: 2 };
issues.sort((a, b) => order[a.level] - order[b.level] || a.code.localeCompare(b.code));
const counts = { error: 0, warn: 0, rec: 0 };
for (const i of issues) counts[i.level]++;
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ staging: base, production: PROD, pages: pagePaths.length, links: linkTargets.size, assets: assetTargets.size, forms, embeds: [...embeds], counts, issues }, null, 2));
const label = { error: c.red('ERROR'), warn: c.yellow('WARN '), rec: c.dim('REC  ') };
console.log(c.bold(`staging-check.mjs — ${base}`) + c.dim(` (production ${PROD || 'unknown'})`));
console.log(c.dim(`  ${pagePaths.length} pages, ${linkTargets.size} link targets, ${assetTargets.size} assets, ${forms.length} forms checked`));
for (const i of issues) console.log(`${label[i.level]} ${c.dim(`[${i.code}]`)} ${i.where ? i.where + ' — ' : ''}${i.msg}`);
if (forms.length || embeds.size) {
  console.log(c.dim('MANUAL: submit each form once on staging with "TEST" in the name, confirm it arrives in the CRM/inbox, then delete it:'));
  for (const f of forms) console.log(c.dim(`  · form on ${f.page} → ${f.action || '(JS/embed)'}`));
  for (const e of embeds) console.log(c.dim(`  · embed ${e}`));
}
console.log(c.dim('NOT RUN here: mobile/responsive rendering → node browser-check.mjs --base-url ' + base));
const sum = `${counts.error} error(s), ${counts.warn} warning(s), ${counts.rec} recommendation(s)`;
console.log(counts.error ? c.red(`✖ ${sum} — do not approve for production`) : c.green(`✔ ${sum} — staging ready for owner review`));
process.exit(counts.error ? 1 : 0);
