#!/usr/bin/env node
// validate.mjs — static QA for the built site. Exit 1 when blocking errors exist.
// Astro projects: inspects the generated dist/ (what hosts serve); --build runs `npm run build` first and reports
// build errors. Legacy static repos: inspects the committed HTML at the repo root.
// Usage: node validate.mjs [--build] [--json report.json] [--only seo,links,images,a11y,content,site,security,build,deploy] [--verbose]
// Levels: ERROR (blocking) · WARN · REC (recommendation) · NOT RUN
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SKILL_DIR, parseArgs, loadConfig, walk, rel, fileToUrlPath, urlPathToFiles, c, DEFAULT_IGNORE } from './lib/util.mjs';
import { stripComments, stripScriptsStyles, findTags, findElements, textContent, headings, meta, linkRel, lineOf } from './lib/html.mjs';
import { parseFrontMatter } from './lib/markdown.mjs';
import { imageSize } from './lib/imagesize.mjs';
import { auditProtection, htaccessLines, redirectLines, deploysSomething, detectPrivatePaths, isPrivateRel } from './lib/protect.mjs';
import { slugify } from './lib/util.mjs';
import { detectProject, buildState, runBuild } from './lib/project.mjs';
import { auditDist } from './lib/protect.mjs';
import { auditWorkflows } from './lib/deploy.mjs';

const args = parseArgs();
const only = args.only ? new Set(String(args.only).split(',')) : null;
const on = (g) => !only || only.has(g);
const cfg = loadConfig() || { site: {}, business: {}, collections: [], build: { ignore: DEFAULT_IGNORE, sitemap: true } };
const SITE_URL = cfg.site.url || '';
const realUrl = /^https:\/\/[^/]+\.[a-z]{2,}$/i.test(SITE_URL) && !/^https?:\/\/(www\.)?example\.(com|org|net)$/i.test(SITE_URL);
const issues = [];
const notRun = [];
const add = (level, group, code, file, msg, line) => { if (on(group)) issues.push({ level, group, code, file, line, msg }); };

// What is published: dist/ for Astro, the repo root for legacy static sites.
const project = detectProject();
const ASTRO = project.type === 'astro';
const WEB = project.webRoot;
const wrel = (f) => rel(f, WEB);
if (ASTRO) {
  if (args.build) {
    const b = runBuild(project);
    if (!b.ok) {
      const tail = b.output.trim().split('\n').filter((l) => /error|Error|✘|failed|problem/.test(l)).slice(-8).join('\n    ') || b.output.trim().split('\n').slice(-8).join('\n    ');
      add('error', 'build', 'build-failed', '', `npm run build failed:\n    ${tail}`);
    }
  }
  const st = buildState(project);
  if (st.state === 'missing') add('error', 'build', 'build-missing', `${project.outDir}/`, `No build output — run npm run build (or validate.mjs --build)`);
  else if (st.state === 'stale') add('error', 'build', 'build-stale', `${project.outDir}/`, `${project.outDir}/ is older than the sources — run npm run build before validating`);
}

const IMG_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
const privateEntries = ASTRO ? [] : detectPrivatePaths(ROOT, { extra: cfg.deploy?.private || [], allowPublic: cfg.deploy?.public || [] });
const webIgnore = ASTRO ? ['node_modules', '.git'] : cfg.build.ignore;
const htmlFiles = fs.existsSync(WEB) ? walk(WEB, { ignore: webIgnore, ext: ['.html'] }).filter((f) => !isPrivateRel(wrel(f), privateEntries)) : []; // source templates (src/, tools/) aren't pages
const mainTexts = new Map(); // rel → visible text of <main> (duplicate/thin content check)
const h1Texts = new Map();
const pages = new Map(); // rel → info
const referencedFiles = new Set();
const titles = new Map();
const descriptions = new Map();

const fileExists = (r) => { try { return fs.statSync(path.join(WEB, r)).isFile(); } catch { return false; } };
const isLocal = (u) => u && !/^([a-z][a-z0-9+.-]*:|\/\/|#|data:|\{\{)/i.test(u);
function resolveLocal(u, fromRel) {
  const clean = u.split('#')[0].split('?')[0];
  if (!clean) return { files: [], clean };
  const urlPath = clean.startsWith('/') ? clean : path.posix.join(path.posix.dirname('/' + fromRel), clean);
  return { files: urlPathToFiles(urlPath), clean: urlPath };
}

// ---------------------------------------------------------------- per page
if (!htmlFiles.length) add('error', 'site', 'no-html', '', ASTRO ? `No HTML in ${project.outDir}/ — run npm run build.` : 'No HTML files found. Run from the site root.');

for (const file of htmlFiles) {
  const r = wrel(file);
  const raw = fs.readFileSync(file, 'utf8');
  const html = stripComments(raw);
  const body = stripScriptsStyles(html);
  const urlPath = fileToUrlPath(r);
  const is404 = /(^|\/)404\.html$/.test(r);
  const verification = /^(google[\w-]*|bing[\w-]*|yandex_[\w-]*)\.html$/i.test(path.basename(r));
  if (verification) continue;
  const robots = (meta(html, 'robots') || '').toLowerCase();
  const noindex = robots.includes('noindex');
  const indexable = !noindex && !is404;
  const L = (idx) => lineOf(raw, raw.indexOf(html.slice(idx, idx + 40)) >= 0 ? raw.indexOf(html.slice(idx, idx + 40)) : 0);
  pages.set(r, { urlPath, noindex, is404 });
  if (indexable) {
    const mainEl = findElements(body, 'main')[0];
    mainTexts.set(r, textContent((mainEl ? mainEl.inner : body).replace(/<(nav|script|style|form)\b[\s\S]*?<\/\1>/gi, ' ')));
    const h1El = findElements(body, 'h1')[0];
    const titleEl0 = findElements(html, 'title')[0];
    h1Texts.set(r, `${h1El ? textContent(h1El.inner) : ''} ${titleEl0 ? textContent(titleEl0.inner) : ''}`);
  }

  // Document basics
  if (!/^﻿?\s*<!doctype html>/i.test(raw)) add('error', 'content', 'doctype', r, 'Missing <!doctype html> at the top');
  const htmlTag = findTags(html, ['html'])[0];
  if (!htmlTag?.attrs.lang) add('error', 'a11y', 'lang', r, '<html> has no lang attribute');
  if (!findTags(html, ['meta']).some((m) => 'charset' in m.attrs)) add('error', 'content', 'charset', r, 'Missing <meta charset>');
  if (!meta(html, 'viewport')) add('error', 'content', 'viewport', r, 'Missing viewport meta');
  if ((html.match(/<main\b/gi) || []).length !== 1) add('warn', 'a11y', 'main', r, `Expected exactly one <main> landmark, found ${(html.match(/<main\b/gi) || []).length}`);

  // Title / description
  const titleEl = findElements(html, 'title')[0];
  const title = titleEl ? textContent(titleEl.inner) : '';
  if (!title) add('error', 'seo', 'title-missing', r, 'Missing or empty <title>');
  else {
    if (indexable) { if (!titles.has(title)) titles.set(title, []); titles.get(title).push(r); }
    if (indexable && title.length > 65) add('rec', 'seo', 'title-length', r, `Title is ${title.length} chars (aim ≤ 60): "${title}"`);
    if (indexable && title.length < 15) add('rec', 'seo', 'title-length', r, `Title is very short: "${title}"`);
  }
  const desc = meta(html, 'description');
  if (!desc) add(indexable ? 'error' : 'warn', 'seo', 'description-missing', r, 'Missing meta description');
  else {
    if (indexable) { if (!descriptions.has(desc)) descriptions.set(desc, []); descriptions.get(desc).push(r); }
    if (indexable && (desc.length > 165 || desc.length < 50)) add('rec', 'seo', 'description-length', r, `Meta description is ${desc.length} chars (aim 70–160)`);
  }

  // Canonical
  const canons = linkRel(html, 'canonical');
  if (indexable) {
    if (!canons.length) add('error', 'seo', 'canonical-missing', r, 'Missing canonical link');
    else if (canons.length > 1) add('error', 'seo', 'canonical-multiple', r, 'Multiple canonical links');
    else {
      const href = canons[0].attrs.href || '';
      if (!/^https:\/\//.test(href)) add('error', 'seo', 'canonical-absolute', r, `Canonical must be an absolute https URL: "${href}"`);
      else if (realUrl && href !== SITE_URL + urlPath) add('error', 'seo', 'canonical-mismatch', r, `Canonical "${href}" ≠ expected "${SITE_URL + urlPath}"`);
    }
  }
  if (noindex && !is404 && !cfg.site.noindex) add('warn', 'seo', 'noindex', r, 'Page is noindex — intended?');

  // Open Graph
  if (indexable) {
    for (const p of ['og:title', 'og:description', 'og:image', 'og:url']) if (!meta(html, p, 'property')) add('warn', 'seo', 'og-missing', r, `Missing ${p}`);
    const ogImg = meta(html, 'og:image', 'property');
    if (ogImg && realUrl && ogImg.startsWith(SITE_URL)) {
      const local = ogImg.slice(SITE_URL.length);
      referencedFiles.add(local.replace(/^\//, ''));
      if (!urlPathToFiles(local).some(fileExists)) add('warn', 'seo', 'og-image-missing', r, `og:image file not found: ${local}`);
    }
  }

  // Headings
  const hs = headings(body);
  const h1s = hs.filter((h) => h.level === 1);
  if (!h1s.length) add('error', 'seo', 'h1-missing', r, 'No <h1>');
  if (h1s.length > 1) add('warn', 'seo', 'h1-multiple', r, `${h1s.length} <h1> elements (prefer one)`);
  let prev = 0;
  for (const h of hs) {
    if (!h.text) add('error', 'a11y', 'heading-empty', r, `Empty <h${h.level}>`, L(h.index));
    if (prev && h.level > prev + 1) add('warn', 'a11y', 'heading-skip', r, `Heading jumps h${prev} → h${h.level} ("${h.text.slice(0, 50)}")`, L(h.index));
    prev = h.level;
  }

  // IDs
  const ids = findTags(body, ['[a-zA-Z][a-zA-Z0-9-]*']).map((t) => t.attrs.id).filter(Boolean);
  const idSet = new Set();
  for (const id of ids) { if (idSet.has(id)) add('error', 'a11y', 'duplicate-id', r, `Duplicate id="${id}"`); idSet.add(id); }

  // Images
  const imgs = findTags(body, ['img']);
  const mainIdx = body.search(/<main\b/i);
  const firstImg = imgs.find((i) => i.index > mainIdx) || imgs[0];
  for (const img of imgs) {
    const a = img.attrs;
    const line = L(img.index);
    if (!('alt' in a)) add('error', 'images', 'img-alt', r, `<img src="${a.src}"> has no alt attribute (use alt="" if decorative)`, line);
    else if (/^(image|photo|picture|img|graphic)( of)?\b/i.test(a.alt)) add('rec', 'images', 'img-alt-quality', r, `Alt text starts with "${a.alt.split(' ')[0]}": "${a.alt}"`, line);
    if (!(a.width && a.height) && !/aspect-ratio/.test(a.style || '')) add('warn', 'images', 'img-dimensions', r, `<img src="${a.src}"> missing width/height (CLS risk)`, line);
    if (img === firstImg && a.loading === 'lazy') add('warn', 'images', 'lcp-lazy', r, `First image "${a.src}" is lazy-loaded — if above the fold it delays LCP`, line);
    const srcs = [a.src, ...(a.srcset || '').split(',').map((s) => s.trim().split(/\s+/)[0])].filter(Boolean);
    if (srcs.some((s) => /placeholder|replace-with|stock-photo|lorem/i.test(s))) add('error', 'images', 'img-placeholder', r, `Placeholder image still used: ${a.src} — replace with a real client photo`, line);
    for (const s of srcs) {
      if (!isLocal(s)) continue;
      const { files } = resolveLocal(s, r);
      const hit = files.find(fileExists);
      if (!hit) { add('error', 'images', 'img-missing', r, `Image not found: ${s}`, line); continue; }
      referencedFiles.add(hit);
      if (s === a.src && a.width && a.height) {
        const dim = imageSize(path.join(WEB, hit));
        if (dim?.width && dim?.height) {
          const ratioA = Number(a.width) / Number(a.height);
          const ratioF = dim.width / dim.height;
          if (Math.abs(ratioA - ratioF) / ratioF > 0.03) add('warn', 'images', 'img-ratio', r, `${s}: width/height ${a.width}×${a.height} doesn't match file ratio ${dim.width}×${dim.height}`, line);
        }
      }
    }
  }
  for (const src of findTags(body, ['source'])) {
    for (const s of (src.attrs.srcset || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(isLocal)) {
      const hit = resolveLocal(s, r).files.find(fileExists);
      if (!hit) add('error', 'images', 'img-missing', r, `<source> image not found: ${s}`);
      else referencedFiles.add(hit);
    }
  }

  // Links
  for (const a of findElements(body, 'a')) {
    const href = a.attrs.href;
    const line = L(a.index);
    const label = textContent(a.inner) || a.attrs['aria-label'] || a.attrs.title || (findTags(a.inner, ['img']).map((i) => i.attrs.alt).join(' ').trim());
    if (!label) add('error', 'a11y', 'link-empty', r, `Link with no accessible text (href="${href}")`, line);
    if (href === undefined) continue;
    if (href === '#' || href === '') add('warn', 'links', 'link-placeholder', r, `Placeholder link href="${href}" ("${label.slice(0, 40)}")`, line);
    if (a.attrs.target === '_blank' && !/noopener|noreferrer/.test(a.attrs.rel || '')) add('warn', 'security', 'blank-noopener', r, `target="_blank" without rel="noopener": ${href}`, line);
    if (/^(click here|read more|here|learn more|more)$/i.test(label.trim())) add('rec', 'seo', 'anchor-text', r, `Non-descriptive link text "${label}" → ${href}`, line);
    if (href.startsWith('#') && href.length > 1 && !idSet.has(decodeURIComponent(href.slice(1)))) add('warn', 'links', 'anchor-missing', r, `In-page anchor not found: ${href}`, line);
    if (realUrl && href.startsWith(SITE_URL)) add('rec', 'links', 'absolute-internal', r, `Internal link uses absolute URL (prefer root-relative): ${href}`, line);
    if (!isLocal(href)) continue;
    const { files, clean } = resolveLocal(href, r);
    const hit = files.find(fileExists);
    if (!hit) { add('error', 'links', 'link-broken', r, `Broken internal link: ${href}`, line); continue; }
    referencedFiles.add(hit);
    if (!clean.endsWith('/') && hit.endsWith('index.html') && !clean.endsWith('.html')) add('rec', 'links', 'trailing-slash', r, `Link "${href}" will 301 to "${clean}/" — link the final URL`, line);
    const hashPart = href.split('#')[1];
    if (hashPart && hit.endsWith('.html')) {
      const target = fs.readFileSync(path.join(WEB, hit), 'utf8');
      if (!new RegExp(`id=["']${hashPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(target)) add('warn', 'links', 'anchor-missing', r, `Anchor #${hashPart} not found in ${hit}`, line);
    }
  }

  // Assets: stylesheets, icons, preloads, scripts, iframes
  for (const l of findTags(html, ['link'])) {
    const relv = (l.attrs.rel || '').toLowerCase();
    if (!/stylesheet|icon|preload|manifest|apple-touch-icon/.test(relv) || !isLocal(l.attrs.href)) continue;
    const hit = resolveLocal(l.attrs.href, r).files.find(fileExists);
    if (!hit) add('error', 'links', 'asset-missing', r, `<link rel="${relv}"> file not found: ${l.attrs.href}`);
    else referencedFiles.add(hit);
  }
  for (const s of findTags(html, ['script'])) {
    if (!s.attrs.src || !isLocal(s.attrs.src)) continue;
    const hit = resolveLocal(s.attrs.src, r).files.find(fileExists);
    if (!hit) add('error', 'links', 'asset-missing', r, `<script> file not found: ${s.attrs.src}`);
    else referencedFiles.add(hit);
  }
  for (const f of findTags(body, ['iframe'])) {
    if (!f.attrs.title) add('warn', 'a11y', 'iframe-title', r, `<iframe src="${f.attrs.src}"> missing title`);
    if (f.attrs.loading !== 'lazy' && !/googletagmanager/.test(f.attrs.src || '')) add('rec', 'images', 'iframe-lazy', r, `<iframe src="${f.attrs.src}"> not lazy-loaded`);
  }

  // JSON-LD
  for (const s of findElements(html, 'script').filter((x) => (x.attrs.type || '') === 'application/ld+json')) {
    try {
      const data = JSON.parse(s.inner);
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const it of items) if (!it['@type']) add('error', 'seo', 'jsonld-type', r, 'JSON-LD object without @type');
      if (!Array.isArray(data) && !data['@context']) add('error', 'seo', 'jsonld-context', r, 'JSON-LD missing @context');
    } catch (e) { add('error', 'seo', 'jsonld-invalid', r, `Invalid JSON-LD: ${e.message}`); }
  }

  // Forms
  const labelsFor = new Set(findTags(body, ['label']).map((l) => l.attrs.for).filter(Boolean));
  const labelBlocks = findElements(body, 'label').map((l) => l.inner);
  for (const inp of findTags(body, ['input', 'select', 'textarea'])) {
    const t = (inp.attrs.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(t)) continue;
    const labelled = (inp.attrs.id && labelsFor.has(inp.attrs.id)) || inp.attrs['aria-label'] || inp.attrs['aria-labelledby'] || labelBlocks.some((b) => b.includes(inp.raw));
    if (!labelled) add('error', 'a11y', 'form-label', r, `<${inp.tag}${inp.attrs.name ? ` name="${inp.attrs.name}"` : ''}> has no label`, L(inp.index));
  }
  for (const b of findElements(body, 'button')) {
    if (!textContent(b.inner) && !b.attrs['aria-label'] && !/visually-hidden/.test(b.inner)) add('error', 'a11y', 'button-empty', r, 'Button with no accessible name', L(b.index));
  }

  // Leftovers
  const visible = textContent(body.replace(/<(script|style)[^>]*><\/\1>/gi, ''));
  const attrText = (body.match(/\s(?:alt|title|content|href|action|placeholder|aria-label)="[^"]*"/g) || []).join(' ');
  const todo = (visible + ' ' + attrText).match(/TODO:?\s?[^.<"|]{0,40}/);
  if (todo) add('error', 'content', 'todo', r, `Unfinished content: "${todo[0].trim()}"${(visible + attrText).split('TODO').length > 2 ? ` (+${(visible + attrText).split('TODO').length - 2} more)` : ''}`);
  if (/\{\{[^}]*\}\}/.test(body)) add('error', 'content', 'template-leftover', r, `Unrendered template tag: ${body.match(/\{\{[^}]*\}\}/)[0]}`);
  if (/lorem ipsum/i.test(visible)) add('error', 'content', 'lorem', r, 'Lorem ipsum placeholder text');
  if (/<!--\s*@include\s+[\w:./-]+\s*-->(?![\s\S]*?<!--\s*@endinclude)/.test(raw)) add('warn', 'build', 'include-unclosed', r, 'Include marker without @endinclude — run build.mjs');
}

// Near-duplicate and thin pages (e.g. service-area pages with only the town name swapped)
if (on('content')) {
  const words = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const shingleSet = (w) => { const set = new Set(); for (let i = 0; i + 4 < w.length; i++) set.add(w.slice(i, i + 5).join(' ')); return set; };
  const docs = [...mainTexts].map(([r, t]) => { const w = words(t); return { r, w, set: shingleSet(w), words: w.length, h1: new Set(words(h1Texts.get(r) || '')) }; });
  // "Swap words": words in one page's H1/title but not the other's (e.g. Boise ↔ Nampa). Masking them reveals
  // pages that are the same text with only the place or service name replaced.
  const masked = (a, b) => {
    const swap = new Set([...a.h1].filter((x) => !b.h1.has(x)).concat([...b.h1].filter((x) => !a.h1.has(x))));
    if (!swap.size) return [a.set, b.set];
    const m = (d) => shingleSet(d.w.map((x) => (swap.has(x) ? '◊' : x)));
    return [m(a), m(b)];
  };
  for (const d of docs) {
    const url = pages.get(d.r)?.urlPath || '';
    if (d.words < 150 && !/^\/(contact|blog|thank|privacy|terms|search|404)/.test(url) && url !== '/' && !/\/page\/\d+\/$|^\/blog\/\d+\/$/.test(url)) add('warn', 'content', 'thin-content', d.r, `Only ${d.words} words of main content — thin pages rank poorly; add genuinely useful, specific information`);
  }
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j];
      if (a.set.size < 40 || b.set.size < 40) continue;
      const [sa, sb] = masked(a, b);
      const small = sa.size < sb.size ? sa : sb, big = small === sa ? sb : sa;
      let inter = 0; for (const x of small) if (big.has(x)) inter++;
      const sim = inter / (sa.size + sb.size - inter);
      // Blocking for Astro sites (agency standard); a warning for legacy static repos so a skill update never
      // blocks an existing site that was built before this rule existed.
      const approved = (x) => (cfg.seo?.approvedDuplicates || []).some((u) => u === pages.get(x.r)?.urlPath);
      const exempt = approved(a) && approved(b); // owner-approved exception (site.config.json → seo.approvedDuplicates), still reported
      if (sim >= 0.8) add(ASTRO && !exempt ? 'error' : 'warn', 'content', 'duplicate-content', `${a.r}, ${b.r}`, `Pages are ${Math.round(sim * 100)}% identical — near-duplicate content (e.g. location pages with the name swapped). Make each page genuinely specific or merge them with a 301${exempt ? ' [owner-approved exception]' : ''}`);
      else if (sim >= 0.6) add('warn', 'content', 'similar-content', `${a.r}, ${b.r}`, `Pages are ${Math.round(sim * 100)}% similar — add more page-specific content`);
    }
  }
}

// Duplicates
for (const [t, files] of titles) if (files.length > 1) add('warn', 'seo', 'title-duplicate', files.join(', '), `Duplicate title "${t}"`);
for (const [d, files] of descriptions) if (files.length > 1) add('warn', 'seo', 'description-duplicate', files.join(', '), `Duplicate meta description "${d.slice(0, 60)}…"`);

// ---------------------------------------------------------------- site level
if (on('site')) {
  if (!realUrl) add('error', 'site', 'site-url', 'site.config.json', `site.url is "${SITE_URL || '(empty)'}" — set the real https domain`);
  const stagingCfg = cfg.deploy?.staging;
  if (cfg.site.noindex) {
    if (stagingCfg) add('error', 'site', 'site-noindex', 'site.config.json', 'site.noindex is true, but main is also what production serves — this would de-index the live site. Set it to false; staging is noindexed by the host-scoped X-Robots-Tag in _headers.');
    else add('warn', 'site', 'site-noindex', 'site.config.json', 'site.noindex is true — whole site hidden from search (OK for a staging-only repo)');
  }
  if (!fileExists('404.html')) add(stagingCfg?.provider === 'cloudflare-pages' || ASTRO ? 'error' : 'warn', 'site', '404-missing', '', stagingCfg?.provider === 'cloudflare-pages' || ASTRO ? 'No /404.html — Cloudflare Pages would serve the homepage with HTTP 200 for every missing URL' : 'No /404.html');
  if (!fileExists('.htaccess') && !ASTRO) add('rec', 'site', 'htaccess-missing', '', 'No .htaccess (fine if the host is not Apache/LiteSpeed — document the equivalent)');

  // robots.txt
  if (!fileExists('robots.txt')) add('warn', 'site', 'robots-missing', '', 'No robots.txt');
  else {
    const robots = fs.readFileSync(path.join(WEB, 'robots.txt'), 'utf8');
    if (/^\s*disallow:\s*\/\s*$/im.test(robots) && !cfg.site.noindex) add('error', 'site', 'robots-disallow-all', 'robots.txt', '"Disallow: /" blocks the whole site');
    const sm = robots.match(/^\s*sitemap:\s*(\S+)/im);
    if (!sm) add('warn', 'site', 'robots-sitemap', 'robots.txt', 'No Sitemap: line');
    else if (realUrl && sm[1] !== `${SITE_URL}/sitemap.xml`) add('warn', 'site', 'robots-sitemap', 'robots.txt', `Sitemap line "${sm[1]}" ≠ ${SITE_URL}/sitemap.xml`);
  }

  // sitemap
  if (cfg.build.sitemap !== false) {
    if (!fileExists('sitemap.xml')) add('error', 'site', 'sitemap-missing', '', 'No sitemap.xml — run build.mjs');
    else {
      const xml = fs.readFileSync(path.join(WEB, 'sitemap.xml'), 'utf8');
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      const inSitemap = new Set();
      for (const loc of locs) {
        if (SITE_URL && !loc.startsWith(SITE_URL)) { add('error', 'site', 'sitemap-host', 'sitemap.xml', `URL not on site host: ${loc}`); continue; }
        const p = loc.slice(SITE_URL.length) || '/';
        const hit = urlPathToFiles(p).find(fileExists);
        if (!hit) add('error', 'site', 'sitemap-broken', 'sitemap.xml', `Sitemap URL has no page: ${loc}`);
        else { inSitemap.add(hit); if (pages.get(hit)?.noindex) add('error', 'site', 'sitemap-noindex', 'sitemap.xml', `Sitemap lists a noindex page: ${loc}`); }
      }
      for (const [r, info] of pages) if (!info.noindex && !info.is404 && !inSitemap.has(r)) add('warn', 'site', 'sitemap-missing-page', r, 'Indexable page not in sitemap.xml (canonicalized elsewhere? else run build.mjs)');
    }
  }
}

// Astro: only dist/ is published → audit the build output and the production workflows
if (on('deploy') && ASTRO && fs.existsSync(path.join(WEB, 'index.html'))) {
  const host = (cfg.deploy?.production?.host || 'hostinger').toLowerCase();
  const st = cfg.deploy?.staging;
  if (st && st.noindex === false) add('error', 'deploy', 'staging-indexable', 'site.config.json', 'deploy.staging.noindex is false — staging would be indexable (duplicate content)');
  if (st?.url && SITE_URL && st.url.replace(/\/+$/, '') === SITE_URL) add('error', 'deploy', 'staging-is-production', 'site.config.json', 'deploy.staging.url equals site.url');
  const r = auditDist(WEB, { staging: !!st, apache: /hostinger|apache|litespeed|cpanel|siteground/.test(host) });
  for (const e of r.errors) add('error', 'deploy', 'dist-protection', `${project.outDir}/`, e);
  for (const w of r.warnings) add('warn', 'deploy', 'dist-protection', `${project.outDir}/`, w);
  for (const w of auditWorkflows(ROOT, { project: 'astro' })) {
    for (const e of w.errors) add('error', 'deploy', 'deploy-workflow', w.file, e);
    for (const x of w.warnings) add('warn', 'deploy', 'deploy-workflow', w.file, x);
  }
}

// Legacy static: development files hidden on BOTH hosts, staging noindexed, no deploying workflows
if (on('deploy') && cfg.deploy && !ASTRO) {
  const st = cfg.deploy.staging;
  const host = (cfg.deploy.production?.host || '').toLowerCase();
  const apache = /hostinger|apache|litespeed|cpanel|siteground/.test(host);
  if (st && st.noindex === false) add('error', 'deploy', 'staging-indexable', 'site.config.json', 'deploy.staging.noindex is false — staging would be indexable (duplicate content)');
  if (st?.url && SITE_URL && st.url.replace(/\/+$/, '') === SITE_URL) add('error', 'deploy', 'staging-is-production', 'site.config.json', 'deploy.staging.url equals site.url');
  if (st || apache) {
    const r = auditProtection(ROOT, { extra: cfg.deploy.private, allowPublic: cfg.deploy.public, staging: !!st, apache });
    if (apache && !r.files.htaccess) add('error', 'deploy', 'htaccess-missing', '', 'Production is Hostinger but there is no .htaccess — every development file would be public');
    for (const h of r.hostinger.filter((x) => !x.ok)) add('error', 'deploy', 'hostinger-exposed', '.htaccess', `/${h.entry.name}${h.entry.dir ? '/' : ''} is not blocked on Hostinger — add: ${htaccessLines([h.entry])[0]}`);
    if (st) {
      if (!r.files.redirects) add('error', 'deploy', 'cloudflare-exposed', '_redirects', 'No _redirects — Cloudflare staging serves every development file (it ignores .htaccess)');
      else for (const x of r.cloudflare.filter((y) => !y.ok)) add('error', 'deploy', 'cloudflare-exposed', '_redirects', `/${x.entry.name}${x.entry.dir ? '/' : ''} is served on Cloudflare staging — add: ${redirectLines([x.entry]).join(' | ')}`);
      if (!r.noindex) add('error', 'deploy', 'staging-noindex', '_headers', 'No _headers — staging (*.pages.dev) can be indexed');
      else if (!r.noindex.pagesDev || !r.noindex.pagesDevVersioned) add('error', 'deploy', 'staging-noindex', '_headers', 'X-Robots-Tag noindex must cover https://:project.pages.dev/* and https://:version.:project.pages.dev/*');
      if (r.noindex?.global) add('warn', 'deploy', 'noindex-global', '_headers', 'noindex on "/*" applies to every host served by Cloudflare — use the *.pages.dev patterns');
    }
  }
  if (fs.existsSync(path.join(ROOT, '.github', 'workflows'))) {
    for (const f of fs.readdirSync(path.join(ROOT, '.github', 'workflows')).filter((x) => /\.ya?ml$/.test(x))) {
      if (deploysSomething(fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8'))) add('error', 'deploy', 'auto-deploy-workflow', `.github/workflows/${f}`, 'Workflow appears to deploy — production must only deploy via the owner\'s manual Hostinger Redeploy');
    }
  }
}

// Collections (legacy build.mjs collections; Astro validates content with zod schemas at build time)
if (on('content') && !ASTRO) {
  for (const col of cfg.collections || []) {
    const srcDir = path.join(ROOT, col.source || `_content/${col.name}`);
    if (!fs.existsSync(srcDir)) continue;
    const output = (col.output ?? col.name).replace(/^\/+|\/+$/g, '');
    const slugs = new Map();
    for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
      const srcRel = rel(path.join(srcDir, f));
      const { data } = parseFrontMatter(fs.readFileSync(path.join(srcDir, f), 'utf8'));
      if (data.draft === true) continue;
      for (const req of ['title', 'description', 'date']) if (!data[req]) add('error', 'content', 'frontmatter', srcRel, `Missing front matter "${req}"`);
      if (data.image && !data.imageAlt && data.imageAlt !== '') add('error', 'content', 'frontmatter', srcRel, 'Has image but no imageAlt');
      const slug = data.slug ? slugify(data.slug) : slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
      if (slugs.has(slug)) add('error', 'content', 'slug-duplicate', srcRel, `Duplicate slug "${slug}" (also ${slugs.get(slug)})`);
      slugs.set(slug, srcRel);
      const date = String(data.date || '');
      const url = col.permalink
        ? col.permalink.replace('{slug}', slug).replace('{yyyy}', date.slice(0, 4)).replace('{mm}', date.slice(5, 7)).replace('{dd}', date.slice(8, 10)).replace('{category}', slugify(data.category || 'general'))
        : `/${output ? output + '/' : ''}${slug}/`;
      if (!urlPathToFiles(url).some(fileExists)) add('error', 'content', 'item-not-built', srcRel, `No generated page at ${url} — run build.mjs`);
    }
  }
}

// Build freshness (legacy build.mjs; Astro freshness is checked above)
if (on('build') && !ASTRO && cfg.collections && fs.existsSync(path.join(ROOT, 'site.config.json'))) {
  const res = spawnSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'build.mjs'), '--check', '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  if (res.status === 1) {
    const files = (res.stdout.match(/would change: (\d+)/) || [])[1];
    add('error', 'build', 'build-stale', '', `Build output is not current (${files || '?'} file(s) would change) — run build.mjs and commit`);
  } else if (res.status !== 0) add('error', 'build', 'build-failed', '', `build.mjs --check failed: ${(res.stderr || res.stdout).trim().split('\n').pop()}`);
}

// Image files on disk
if (on('images')) {
  const cssRefs = new Set();
  for (const css of fs.existsSync(WEB) ? walk(WEB, { ignore: webIgnore, ext: ['.css'] }) : []) {
    for (const m of fs.readFileSync(css, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      if (!isLocal(m[1])) continue;
      const p = m[1].startsWith('/') ? m[1].slice(1) : path.posix.join(path.posix.dirname(wrel(css)), m[1]);
      cssRefs.add(path.posix.normalize(p));
      if (!fileExists(path.posix.normalize(p))) add('error', 'images', 'css-asset-missing', wrel(css), `url(${m[1]}) not found`);
    }
  }
  const unreferenced = [];
  for (const img of fs.existsSync(WEB) ? walk(WEB, { ignore: webIgnore, skipUnderscore: !ASTRO, ext: IMG_EXT }) : []) {
    const r = wrel(img);
    const size = fs.statSync(img).size;
    if (size > 400 * 1024 && !r.endsWith('.svg')) add('warn', 'images', 'img-heavy', r, `${Math.round(size / 1024)} KB — compress/resize (optimize-images.mjs)`);
    const dim = imageSize(img);
    if (dim?.width > 2560) add('warn', 'images', 'img-huge', r, `${dim.width}×${dim.height}px — larger than any layout needs`);
    if (/^(img|dsc|dscn|pxl|screenshot|screen shot|image|photo|untitled|whatsapp)[\s_-]?\d*([._]|$)/i.test(path.basename(r))) add('warn', 'images', 'img-filename', r, 'Generic filename — rename descriptively');
    if (/\.(jpe?g|png)$/i.test(r) && size > 150 * 1024) add('rec', 'images', 'img-format', r, 'Consider WebP/AVIF');
    if (!ASTRO && !referencedFiles.has(r) && !cssRefs.has(r) && !/favicon|apple-touch|og-|logo/i.test(r)) unreferenced.push(r);
  }
  if (unreferenced.length) add('rec', 'images', 'img-unreferenced', '', `${unreferenced.length} image(s) not referenced by any page or CSS: ${unreferenced.slice(0, 8).join(', ')}${unreferenced.length > 8 ? ' …' : ''}`);
}

// Secrets
if (on('security')) {
  const patterns = [
    [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
    [/sk_live_[0-9a-zA-Z]{16,}/, 'Stripe secret key'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'Private key'],
    [/xox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
    [/ghp_[0-9A-Za-z]{30,}/, 'GitHub token'],
    [/AIza[0-9A-Za-z_-]{35}/, 'Google API key (check it is restricted; browser keys for Maps are OK if referrer-restricted)'],
    [/(?:api[_-]?key|secret|password|passwd|token)["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i, 'Hard-coded credential'],
  ];
  const textFiles = walk(ROOT, { ignore: cfg.build.ignore, skipUnderscore: false, ext: ['.html', '.js', '.mjs', '.css', '.json', '.md', '.txt', '.xml', '.env', '.yml', '.yaml', '.php'] });
  for (const f of textFiles) {
    if (f.endsWith('package-lock.json')) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const [re, name] of patterns) if (re.test(s)) add(name.startsWith('Google') ? 'warn' : 'error', 'security', 'secret', rel(f), `Possible ${name}`);
  }
  if (fs.existsSync(path.join(ROOT, '.env'))) add('error', 'security', 'env-file', '.env', '.env file in the web root/repo');
}

// Optional full HTML validation
const hv = path.join(ROOT, 'node_modules', '.bin', 'html-validate');
if (on('content')) {
  if (fs.existsSync(hv)) {
    const res = spawnSync(hv, ['--formatter', 'text', ...htmlFiles.map((f) => wrel(f))], { cwd: WEB, encoding: 'utf8' });
    const lines = (res.stdout || '').trim().split('\n').filter((l) => /error/.test(l));
    if (res.status !== 0) add('warn', 'content', 'html-validate', '', `html-validate reported ${lines.length} problem(s). Run: npx html-validate "**/*.html"`);
  } else notRun.push('Full HTML validation (install html-validate: npm i -D html-validate)');
}
notRun.push('Browser rendering, overflow, console errors, axe → browser-check.mjs', 'Lighthouse performance → see references/performance.md', 'Rich Results Test (needs public URL)', 'Visual fidelity, content accuracy, keyboard/screen reader pass → manual (references/qa.md)');

// ---------------------------------------------------------------- report
const order = { error: 0, warn: 1, rec: 2 };
issues.sort((a, b) => order[a.level] - order[b.level] || a.code.localeCompare(b.code) || (a.file || '').localeCompare(b.file || ''));
const counts = { error: 0, warn: 0, rec: 0 };
for (const i of issues) counts[i.level]++;

if (args.json) {
  const out = { site: SITE_URL, pages: htmlFiles.length, counts, issues, notRun, generatedAt: new Date().toISOString() };
  if (args.json === true) console.log(JSON.stringify(out, null, 2));
  else fs.writeFileSync(path.resolve(String(args.json)), JSON.stringify(out, null, 2));
}
if (args.json !== true) {
  const label = { error: c.red('ERROR'), warn: c.yellow('WARN '), rec: c.dim('REC  ') };
  console.log(c.bold(`validate.mjs — ${htmlFiles.length} page(s) checked`));
  const byCode = new Map();
  for (const i of issues) { const k = `${i.level}|${i.code}`; if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(i); }
  const limit = args.verbose ? Infinity : 12;
  for (const [, list] of byCode) {
    for (const i of list.slice(0, limit)) console.log(`${label[i.level]} ${c.dim(`[${i.code}]`)} ${i.file ? i.file + (i.line ? `:${i.line}` : '') + ' — ' : ''}${i.msg}`);
    if (list.length > limit) console.log(c.dim(`      … ${list.length - limit} more [${list[0].code}] (use --verbose)`));
  }
  console.log(c.dim('NOT RUN:'));
  for (const n of notRun) console.log(c.dim(`  · ${n}`));
  const summary = `${counts.error} error(s), ${counts.warn} warning(s), ${counts.rec} recommendation(s)`;
  console.log(counts.error ? c.red(`✖ ${summary} — not deployable`) : c.green(`✔ ${summary} — no blocking errors`));
}
process.exit(counts.error ? 1 : 0);
