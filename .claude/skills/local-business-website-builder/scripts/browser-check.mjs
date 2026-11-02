#!/usr/bin/env node
// browser-check.mjs — real-browser QA with Playwright (optional dependency).
// Checks each page across a range of widths for: horizontal overflow, console errors, failed requests,
// images without decoded size, and (if axe-core is installed) automated accessibility violations.
// Usage: node browser-check.mjs [--pages /,/contact/] [--browsers chromium,firefox,webkit] [--widths 320,375,414,768,1024,1280,1440,1920]
//        [--screenshots .qa/after] [--compare .qa/before] [--log-requests] [--max-pages 30] [--executable /path/to/chrome]
//        [--base-url https://client.pages.dev]   check a live staging deployment instead of a local server
//   --executable (or env CHROMIUM_PATH) uses an existing Chromium/Chrome instead of Playwright's downloaded build.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, loadConfig, walk, rel, fileToUrlPath, tryImport, c, DEFAULT_IGNORE } from './lib/util.mjs';
import { createServer } from './serve.mjs';
import { detectPrivatePaths, isPrivateRel } from './lib/protect.mjs';
import { detectProject } from './lib/project.mjs';

const args = parseArgs();
const pw = await tryImport('playwright') || await tryImport('@playwright/test') || await tryImport('playwright-core');
if (!pw) {
  console.log(c.yellow('NOT RUN: Playwright is not installed. Install with: npm i -D playwright && npx playwright install chromium'));
  process.exit(3);
}
const cfg = loadConfig() || { build: { ignore: DEFAULT_IGNORE } };
const widths = String(args.widths || '320,375,414,768,1024,1280,1440,1920').split(',').map(Number);
const browsers = String(args.browsers || 'chromium').split(',');
const maxPages = Number(args['max-pages'] || 30);
let pagePaths = args.pages
  ? String(args.pages).split(',')
  : (() => {
      const project = detectProject();
      if (project.type === 'astro') {
        if (!fs.existsSync(path.join(project.webRoot, 'index.html'))) { console.log(c.yellow(`NOT RUN: no ${project.outDir}/ build — run npm run build first`)); process.exit(3); }
        return walk(project.webRoot, { ignore: [], ext: ['.html'] }).map((f) => rel(f, project.webRoot)).map(fileToUrlPath).filter((p) => !/\/page\/\d+\/$|^\/blog\/\d+\/$/.test(p) && p !== '/404.html');
      }
      const priv = detectPrivatePaths(ROOT, { extra: cfg.deploy?.private || [], allowPublic: cfg.deploy?.public || [] });
      return walk(ROOT, { ignore: cfg.build.ignore, ext: ['.html'] }).map((f) => rel(f)).filter((r) => !isPrivateRel(r, priv)).map(fileToUrlPath).filter((p) => !/\/page\/\d+\/$/.test(p)); })();
if (pagePaths.length > maxPages) {
  console.log(c.dim(`${pagePaths.length} pages found; checking ${maxPages} (one per template first). Use --pages or --max-pages to change.`));
  const seen = new Set();
  const pick = [];
  for (const p of pagePaths) { const key = p.split('/').slice(0, 2).join('/'); if (!seen.has(key)) { seen.add(key); pick.push(p); } }
  for (const p of pagePaths) if (pick.length < maxPages && !pick.includes(p)) pick.push(p);
  pagePaths = pick.slice(0, maxPages);
}

const axeMod = await tryImport('axe-core');
const axeSource = axeMod ? fs.readFileSync((await import('node:module')).createRequire(path.join(ROOT, 'package.json')).resolve('axe-core/axe.min.js'), 'utf8') : null;
if (!axeSource) console.log(c.dim('axe-core not installed — accessibility rules NOT RUN (npm i -D axe-core)'));

const remote = args['base-url'] ? String(args['base-url']).replace(/\/+$/, '') : '';
const server = remote ? null : createServer();
if (server) await new Promise((r) => server.listen(0, r));
const base = remote || `http://localhost:${server.address().port}`;
if (remote) console.log(c.dim(`Checking live deployment ${remote}`));
const problems = [];
let checks = 0;
const shotsDir = args.screenshots ? path.resolve(String(args.screenshots)) : null;

for (const name of browsers) {
  const type = pw[name] || pw.default?.[name];
  if (!type) { console.log(c.yellow(`NOT RUN: browser "${name}" unknown`)); continue; }
  let browser;
  const exe = name === 'chromium' ? (args.executable || process.env.CHROMIUM_PATH) : undefined;
  try { browser = await type.launch(exe ? { executablePath: String(exe) } : {}); } catch (e) { console.log(c.yellow(`NOT RUN: ${name} not available (${e.message.split('\n')[0]}). Try: npx playwright install ${name}`)); continue; }
  for (const p of pagePaths) {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, hasTouch: w < 768 });
      const page = await ctx.newPage();
      const consoleErrors = [];
      const failed = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(e.message));
      page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base) && !r.url().endsWith(p)) failed.push(`${r.url()} → ${r.status()}`); if (args['log-requests'] && !r.url().startsWith(base)) console.log(c.dim(`  ↗ ${r.status()} ${r.url()}`)); });
      const resp = await page.goto(base + p, { waitUntil: 'load' }).catch((e) => ({ status: () => 0, err: e }));
      checks++;
      const tag = `${name} ${w}px ${p}`;
      if (!resp || resp.status() >= 400) { problems.push({ level: 'error', tag, msg: `HTTP ${resp?.status?.()}` }); await ctx.close(); continue; }
      await page.waitForTimeout(150);
      const res = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - doc.clientWidth;
        const offenders = [];
        if (overflow > 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.right > doc.clientWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
              offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`);
              if (offenders.length >= 3) break;
            }
          }
        }
        const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.getAttribute('src'));
        const smallTargets = [...document.querySelectorAll('a[href], button, input, select, textarea')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(el).display !== 'inline';
        }).length;
        return { overflow, offenders, brokenImgs, smallTargets };
      });
      if (res.overflow > 1) problems.push({ level: 'error', tag, msg: `Horizontal overflow ${res.overflow}px (${res.offenders.join(', ')})` });
      for (const b of res.brokenImgs) problems.push({ level: 'error', tag, msg: `Image failed to load: ${b}` });
      if (res.smallTargets && w < 768) problems.push({ level: 'warn', tag, msg: `${res.smallTargets} interactive element(s) smaller than 24×24px` });
      for (const e of new Set(consoleErrors)) problems.push({ level: 'error', tag, msg: `Console error: ${e.slice(0, 200)}` });
      for (const f of new Set(failed)) problems.push({ level: 'warn', tag, msg: `Request failed: ${f}` });
      if (axeSource && (w === widths[0] || w === widths[widths.length - 1])) {
        await page.addScriptTag({ content: axeSource });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, help: x.help, target: x.nodes[0]?.target?.join(' ') })));
        for (const x of v) problems.push({ level: ['critical', 'serious'].includes(x.impact) ? 'error' : 'warn', tag, msg: `axe ${x.id} (${x.impact}, ${x.n} node${x.n > 1 ? 's' : ''}): ${x.help} — e.g. ${x.target}` });
      }
      if (shotsDir) {
        const f = path.join(shotsDir, name, `${(p.replace(/^\/|\/$/g, '') || 'home').replace(/\//g, '__')}-${w}.png`);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        await page.screenshot({ path: f, fullPage: true });
      }
      // Mobile menu smoke test
      if (w < 768) {
        const toggle = await page.$('[aria-controls][aria-expanded]');
        if (toggle && await toggle.isVisible()) {
          await toggle.click();
          const expanded = await toggle.getAttribute('aria-expanded');
          if (expanded !== 'true') problems.push({ level: 'error', tag, msg: 'Menu toggle did not set aria-expanded="true"' });
          await page.keyboard.press('Escape');
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
}
server?.close();

// Visual comparison (optional)
if (args.compare && shotsDir) {
  const pngjs = await tryImport('pngjs');
  const pixelmatch = await tryImport('pixelmatch');
  if (!pngjs || !pixelmatch) console.log(c.yellow('NOT RUN: visual diff (npm i -D pngjs pixelmatch). Screenshots saved for manual comparison.'));
  else {
    const PNG = (pngjs.PNG || pngjs.default.PNG);
    const pm = pixelmatch.default || pixelmatch;
    const baseDir = path.resolve(String(args.compare));
    for (const f of walk(shotsDir, { ignore: [], skipUnderscore: false, ext: ['.png'] })) {
      const r = path.relative(shotsDir, f);
      const bf = path.join(baseDir, r);
      if (!fs.existsSync(bf)) { problems.push({ level: 'warn', tag: r, msg: 'No baseline screenshot' }); continue; }
      const a = PNG.sync.read(fs.readFileSync(bf));
      const b = PNG.sync.read(fs.readFileSync(f));
      if (a.width !== b.width || a.height !== b.height) { problems.push({ level: 'warn', tag: r, msg: `Size changed ${a.width}×${a.height} → ${b.width}×${b.height}` }); continue; }
      const diff = pm(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
      const pct = (diff / (a.width * a.height)) * 100;
      if (pct > 0.5) problems.push({ level: 'warn', tag: r, msg: `Visual change ${pct.toFixed(2)}% of pixels` });
    }
  }
}

const errors = problems.filter((p) => p.level === 'error');
for (const p of problems) console.log(`${p.level === 'error' ? c.red('ERROR') : c.yellow('WARN ')} ${c.dim(p.tag)} — ${p.msg}`);
console.log(`${checks} page×width×browser checks. ${errors.length} error(s), ${problems.length - errors.length} warning(s).`);
console.log(c.dim('Still manual: visual judgment, real iOS Safari, keyboard + screen reader pass.'));
if (!checks) { console.log(c.yellow('NOT RUN: no browser could be launched.')); process.exit(3); }
process.exit(errors.length ? 1 : 0);
