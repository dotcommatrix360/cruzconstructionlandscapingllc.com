#!/usr/bin/env node
// migration-check.mjs — confirm every old URL survives the rebuild: same path exists in the published site, or a
// 301 covers it. Astro projects: checks dist/ (run npm run build first) and redirects from site.config.json,
// dist/.htaccess and dist/_redirects. Legacy static repos: the repo root and its .htaccess.
// Usage:
//   node migration-check.mjs <https://old.com/sitemap.xml | sitemap.xml | urls.txt> [--save _migration/old-urls.txt] [--csv _migration/url-map.csv]
// Accepts sitemap indexes (fetched recursively when given a URL and network is available).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, urlPathToFiles, loadConfig, c } from './lib/util.mjs';
import { detectProject } from './lib/project.mjs';

const project = detectProject();
const WEB = project.webRoot;
if (project.type === 'astro' && !fs.existsSync(path.join(WEB, 'index.html'))) { console.log(c.red(`No ${project.outDir}/ build — run npm run build first.`)); process.exit(2); }

const args = parseArgs();
const src = args._[0];
if (!src) { console.log('Usage: node migration-check.mjs <old-sitemap-url|file> [--save file] [--csv file]'); process.exit(2); }

async function readSource(s, depth = 0) {
  let text;
  if (/^https?:\/\//.test(s)) {
    try { const r = await fetch(s, { headers: { 'user-agent': 'Mozilla/5.0 (migration inventory)' } }); text = await r.text(); }
    catch (e) { console.error(c.red(`Could not fetch ${s}: ${e.message}. Save the URL list to a file and pass that instead.`)); process.exit(3); }
  } else text = fs.readFileSync(s, 'utf8');
  if (/<sitemapindex/i.test(text) && depth < 3) {
    const subs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const all = [];
    for (const sub of subs) all.push(...(await readSource(sub, depth + 1)));
    return all;
  }
  if (/<urlset/i.test(text)) return [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const urls = [...new Set(await readSource(src))];
if (args.save) { fs.mkdirSync(path.dirname(path.resolve(String(args.save))), { recursive: true }); fs.writeFileSync(String(args.save), urls.join('\n') + '\n'); console.log(`Saved ${urls.length} URLs → ${args.save}`); }

// Parse simple redirect rules from .htaccess
const rules = [];
for (const r of loadConfig()?.redirects || []) {
  if (!r?.from || !r?.to) continue;
  if (r.from.endsWith('*')) rules.push({ type: 'prefix', from: r.from.slice(0, -1), to: r.to.replace(/\*$/, ''), fixed: !r.to.endsWith('*') });
  else rules.push({ type: 'exact', from: r.from, to: r.to });
}
const rd = path.join(WEB, '_redirects');
if (fs.existsSync(rd)) {
  for (const line of fs.readFileSync(rd, 'utf8').split(/\r?\n/)) {
    const [from, to, status = '302'] = line.trim().split(/\s+/);
    if (!from || from.startsWith('#') || !to || !/^30[1278]$/.test(status) || to === '/404/') continue;
    if (from.endsWith('*')) rules.push({ type: 'prefix', from: from.slice(0, -1), to: to.replace(':splat', ''), fixed: !to.includes(':splat') });
    else rules.push({ type: 'exact', from, to });
  }
}
const ht = path.join(WEB, '.htaccess');
if (fs.existsSync(ht)) {
  for (const line of fs.readFileSync(ht, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    let m;
    if ((m = /^Redirect(?:Permanent)?\s+(?:301\s+|permanent\s+)?(\S+)\s+(\S+)/i.exec(t))) rules.push({ type: 'prefix', from: m[1], to: m[2] });
    else if ((m = /^RedirectMatch\s+(?:301\s+|permanent\s+)?(\S+)\s+(\S+)/i.exec(t))) rules.push({ type: 'regex', re: new RegExp(m[1]), to: m[2] });
    else if ((m = /^RewriteRule\s+(\S+)\s+(\S+)\s+\[[^\]]*R=301[^\]]*\]/i.exec(t)) && !m[2].includes('%{')) rules.push({ type: 'regex', re: new RegExp(m[1].replace(/^\^\/?/, '^/?')), to: m[2] });
  }
}

const exists = (p) => urlPathToFiles(p).some((f) => { try { return fs.statSync(path.join(WEB, f)).isFile(); } catch { return false; } });
function resolve(p) {
  if (exists(p)) return { status: 'kept', target: p };
  if (!p.endsWith('/') && !/\.\w+$/.test(p) && exists(p + '/')) return { status: 'kept (trailing-slash 301)', target: p + '/' };
  for (const r of rules) {
    if (r.type === 'exact' && (p === r.from || p.replace(/\/?$/, '/') === r.from.replace(/\/?$/, '/'))) return { status: 'redirect', target: r.to };
    if (r.type === 'prefix' && (p === r.from || p.startsWith(r.from.endsWith('/') ? r.from : r.from + '/'))) {
      const to = r.fixed ? r.to : r.to + p.slice(r.from.length);
      return { status: 'redirect', target: to };
    }
    if (r.type === 'regex' && r.re.test(p)) return { status: 'redirect', target: p.replace(r.re, r.to.replace(/\$(\d)/g, '$$$1')) };
  }
  return { status: 'MISSING', target: '' };
}

const rows = [];
let missing = 0;
let badTargets = 0;
for (const u of urls) {
  let p;
  try { p = new URL(u, 'https://x').pathname; } catch { continue; }
  const r = resolve(p);
  if (r.status === 'redirect') {
    const tp = /^https?:\/\//.test(r.target) ? new URL(r.target).pathname : r.target;
    if (!exists(tp)) { r.status = 'REDIRECT→MISSING'; badTargets++; }
    if (tp === '/' && p !== '/') r.note = 'redirects to homepage — use the closest equivalent page';
  }
  if (r.status === 'MISSING') missing++;
  rows.push({ old: u, path: p, ...r });
}

for (const r of rows.filter((x) => x.status !== 'kept')) {
  const col = r.status.startsWith('MISSING') || r.status.includes('→MISSING') ? c.red : r.note ? c.yellow : c.dim;
  console.log(col(`${r.status.padEnd(26)} ${r.path}${r.target ? ' → ' + r.target : ''}${r.note ? '  (' + r.note + ')' : ''}`));
}
const kept = rows.filter((r) => r.status.startsWith('kept')).length;
console.log(c.bold(`\n${rows.length} old URLs: ${kept} kept, ${rows.length - kept - missing - badTargets} redirected, ${missing} missing, ${badTargets} redirect(s) to missing pages`));
if (args.csv) {
  fs.mkdirSync(path.dirname(path.resolve(String(args.csv))), { recursive: true });
  fs.writeFileSync(String(args.csv), 'old_url,path,status,target,note\n' + rows.map((r) => [r.old, r.path, r.status, r.target, r.note || ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n');
  console.log(`CSV → ${args.csv}`);
}
if (missing || badTargets) console.log(c.yellow(project.type === 'astro' ? 'Add 301s for missing URLs to site.config.json → redirects (closest equivalent page), npm run build, then re-run.' : 'Add 301s for missing URLs in .htaccess (closest equivalent page), then re-run.'));
process.exit(missing || badTargets ? 1 : 0);
