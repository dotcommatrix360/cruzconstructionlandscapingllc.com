#!/usr/bin/env node
// selftest-astro.mjs — verify the Astro standard end to end: starter scaffold, real `npm install` + `astro build`,
// validation of dist/, protection, redirects, deploy-workflow rules, migration, local hosts and staging checks.
// Usage: node selftest-astro.mjs [--keep] [--unit-only]
//   LBWB_NODE_MODULES=/path/to/node_modules  reuse an installed node_modules instead of running npm install
// Called by selftest.mjs (skip with selftest.mjs --skip-astro). Needs network for npm install unless reused.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { SKILL_DIR, parseArgs, c } from './lib/util.mjs';
import { detectProject } from './lib/project.mjs';
import { auditDist, htaccessBlocker } from './lib/protect.mjs';
import { analyzeWorkflow, workflowTriggers } from './lib/deploy.mjs';

const args = parseArgs();
let failures = 0;
let notRun = 0;
const step = async (name, fn) => {
  try {
    const r = await fn();
    if (r === 'NOT RUN') { notRun++; console.log(`${c.yellow('–')} ${name} ${c.yellow('(NOT RUN)')}`); }
    else console.log(`${c.green('✔')} ${name}`);
  } catch (e) { failures++; console.log(`${c.red('✖')} ${name}\n    ${String(e.message).split('\n').slice(0, 14).join('\n    ')}`); }
};
let tmp = null; // e2e working folder
const STARTER = path.join(SKILL_DIR, 'templates', 'astro');
const SAMPLE = path.join(SKILL_DIR, 'examples', 'astro-sample');
const mk = (files) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbwb-astro-unit-'));
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
  return d;
};

// ------------------------------------------------------------------ unit
await step('astro: project detection (astro vs legacy static, custom outDir)', () => {
  let d = mk({ 'package.json': JSON.stringify({ dependencies: { astro: '7.4.0' } }), 'astro.config.mjs': "export default { outDir: './build' }" });
  let p = detectProject(d);
  assert.equal(p.type, 'astro'); assert.equal(p.outDir, 'build'); assert.equal(p.webRoot, path.join(d, 'build'));
  fs.rmSync(d, { recursive: true });
  d = mk({ 'index.html': '<!doctype html>' });
  p = detectProject(d);
  assert.equal(p.type, 'static'); assert.equal(p.webRoot, d);
  fs.rmSync(d, { recursive: true });
});

await step('astro: starter template is complete, pinned and safe by default', () => {
  for (const f of ['astro.config.mjs', 'package.json', 'tsconfig.json', '.node-version', '.gitignore', 'site.config.json', 'CLAUDE.md', 'integrations/hosting-files.mjs',
    'public/.htaccess', 'public/_headers', 'src/content.config.ts', 'src/layouts/BaseLayout.astro', 'src/components/Seo.astro', 'src/components/Header.astro', 'src/components/Footer.astro',
    'src/components/Hero.astro', 'src/components/FaqList.astro', 'src/components/CtaBand.astro', 'src/components/Testimonials.astro', 'src/components/ServiceCards.astro', 'src/components/ContactForm.astro', 'src/components/ResponsiveImage.astro',
    'src/pages/index.astro', 'src/pages/404.astro', 'src/pages/services/[slug].astro', 'src/pages/service-areas/[slug].astro', 'src/pages/blog/[slug].astro', 'src/pages/blog/[...page].astro', 'src/pages/[...permalink].astro',
    'src/content/blog/example-post.md', 'src/content/services/example-service.md', 'src/content/locations/example-location.md', 'src/styles/tokens.css',
    '.github/workflows/deploy-production.yml', '.github/workflows/quality.yml']) assert.ok(fs.existsSync(path.join(STARTER, f)), `starter missing ${f}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(STARTER, 'package.json'), 'utf8'));
  for (const [k, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, `${k} must be pinned to an exact version (got ${v})`);
  assert.equal(pkg.scripts.build, 'astro build');
  const gi = fs.readFileSync(path.join(STARTER, '.gitignore'), 'utf8');
  for (const x of ['dist/', 'node_modules/', '.env']) assert.match(gi, new RegExp(`^${x.replace('.', '\\.')}`, 'm'), `.gitignore must list ${x}`);
  const ht = htaccessBlocker(fs.readFileSync(path.join(STARTER, 'public/.htaccess'), 'utf8'));
  assert.ok(!ht('/_astro/index.abc123.css'), 'starter .htaccess must NOT block /_astro/');
  assert.ok(ht('/_headers') && ht('/_redirects') && ht('/.env') && ht('/.git/config'), 'starter .htaccess must hide dotfiles and Cloudflare files');
  assert.ok(!ht('/.well-known/security.txt'), '.well-known stays reachable');
  const cfg = JSON.parse(fs.readFileSync(path.join(STARTER, 'site.config.json'), 'utf8'));
  assert.match(cfg.business.name, /^TODO/, 'starter facts must be TODO placeholders, never sample business data');
});

await step('astro: redirect map — one source → _redirects + .htaccess; chains, self-loops, missing targets rejected', async () => {
  const m = await import(path.join(STARTER, 'integrations', 'hosting-files.mjs'));
  const list = m.normalizeRedirects([{ from: '/old/', to: '/new/' }, { from: '/cat/*', to: '/blog/' }, { from: '/legacy/*', to: '/archive/*', status: 301 }, { $comment: 'x', from: '', to: '' }]);
  assert.equal(list.length, 3);
  const exists = (p) => ['/new/', '/blog/', '/archive/', '/live/'].includes(p);
  assert.deepEqual(m.checkRedirects(list, exists), []);
  const rd = m.redirectsFile(list);
  assert.match(rd, /^\/old\/ \/new\/ 301$/m); assert.match(rd, /^\/cat\/\* \/blog\/ 301$/m); assert.match(rd, /^\/legacy\/\* \/archive\/:splat 301$/m); assert.match(rd, /^\/\.htaccess \/404\/ 302$/m);
  const ht = m.htaccessRedirects(list);
  const rules = [...ht.matchAll(/^RedirectMatch (\d+) (\S+) (\S+)$/gm)].map((x) => ({ re: new RegExp(x[2]), to: x[3] }));
  const apply = (p) => { const r = rules.find((x) => x.re.test(p)); return r ? p.replace(r.re, r.to) : null; };
  assert.equal(apply('/old/'), '/new/'); assert.equal(apply('/old'), '/new/'); assert.equal(apply('/oldish/'), null, 'exact match only');
  assert.equal(apply('/cat/news/post/'), '/blog/'); assert.equal(apply('/legacy/a/b/'), '/archive/a/b/');
  const bad = m.normalizeRedirects([{ from: '/a/', to: '/b/' }, { from: '/b/', to: '/c/' }, { from: '/x/', to: '/x/' }, { from: '/y/', to: '/missing/' }, { from: '/live/', to: '/c/' }]);
  const problems = m.checkRedirects(bad, (p) => ['/c/', '/live/'].includes(p)).join('\n');
  assert.match(problems, /\/a\/ → \/b\/: chain/); assert.match(problems, /\/x\/: redirects to itself/); assert.match(problems, /\/y\/ → \/missing\/: target page does not exist/); assert.match(problems, /\/live\/: a built page still exists/);
});

await step('astro: dist audit — private files, /_astro/ blocking, noindex and .htaccess exposure caught', () => {
  const good = {
    'index.html': '<!doctype html>', '404.html': 'x', '_astro/a.css': 'x',
    '.htaccess': fs.readFileSync(path.join(STARTER, 'public/.htaccess'), 'utf8').replace('# @redirects', ''),
    '_headers': fs.readFileSync(path.join(STARTER, 'public/_headers'), 'utf8'), '_redirects': '/.htaccess /404/ 302\n',
  };
  let d = mk(good);
  assert.deepEqual(auditDist(d).errors, []);
  fs.rmSync(d, { recursive: true });
  d = mk({ ...good, 'src/pages/index.astro': 'x', 'package.json': '{}', '.env': 'A=1', 'blog/post.md': 'x', '_astro/a.js.map': '{}' });
  let r = auditDist(d);
  for (const re of [/src\/ must not be published/, /package\.json must not be published/, /\.env must not be published/, /blog\/post\.md: source/]) assert.ok(r.errors.some((e) => re.test(e)), `expected ${re}\n${r.errors.join('\n')}`);
  assert.ok(r.warnings.some((w) => /source map/.test(w)));
  fs.rmSync(d, { recursive: true });
  d = mk({ ...good, '.htaccess': good['.htaccess'].replace('RewriteRule ^_(headers|redirects)$ - [R=404,L]', 'RewriteRule (^|/)_ - [R=404,L]'), '_headers': '/*\n  X-Frame-Options: DENY\n', '_redirects': '' });
  r = auditDist(d);
  assert.ok(r.errors.some((e) => /blocks \/_astro\//.test(e)), 'v1-style "_" rule must be caught');
  assert.ok(r.errors.some((e) => /noindex must cover/.test(e)));
  assert.ok(r.errors.some((e) => /does not hide \/\.htaccess on Cloudflare/.test(e)));
  fs.rmSync(d, { recursive: true });
  r = auditDist(path.join(os.tmpdir(), 'lbwb-does-not-exist'));
  assert.ok(r.errors.some((e) => /run npm run build/.test(e)));
});

await step('astro: deploy workflows — starter is manual-only & dist-only; automatic, non-dist or inline-credential deploys rejected', () => {
  const wf = fs.readFileSync(path.join(STARTER, '.github/workflows/deploy-production.yml'), 'utf8');
  let a = analyzeWorkflow(wf);
  assert.ok(a.deploys); assert.deepEqual(a.triggers, ['workflow_dispatch']); assert.deepEqual(a.errors, []); assert.deepEqual(a.warnings, []);
  assert.match(wf, /environment: production/); assert.match(wf, /refs\/heads\/main/); assert.match(wf, /confirm_domain/);
  assert.doesNotMatch(wf, /^\s*push:/m);
  a = analyzeWorkflow(fs.readFileSync(path.join(STARTER, '.github/workflows/quality.yml'), 'utf8'));
  assert.equal(a.deploys, false, 'quality workflow must not deploy');
  assert.deepEqual(workflowTriggers('on: [push, workflow_dispatch]\n'), ['push', 'workflow_dispatch']);
  assert.deepEqual(workflowTriggers('on:\n  schedule:\n    - cron: "0 0 * * *"\n  workflow_dispatch:\njobs:\n'), ['schedule', 'workflow_dispatch']);
  a = analyzeWorkflow('on:\n  push:\n    branches: [main]\njobs:\n  d:\n    steps:\n      - run: rsync -az ./ u@h:public_html/\n        env:\n          password: hunter2hunter2\n');
  for (const re of [/runs automatically on "push"/, /no workflow_dispatch/, /does not upload dist/, /credential written/]) assert.ok(a.errors.some((e) => re.test(e)), `expected ${re}\n${a.errors.join('\n')}`);
  a = analyzeWorkflow('on: workflow_dispatch\njobs:\n  d:\n    environment: production\n    steps:\n      - run: npx wrangler@4 pages deploy . --project-name x\n');
  assert.ok(a.errors.some((e) => /must publish dist/.test(e)));
  a = analyzeWorkflow(wf, { project: 'static' });
  assert.ok(a.errors.some((e) => /legacy static repo/.test(e)), 'legacy repos keep the v1 rule (no deploy workflows)');
});

// ------------------------------------------------------------------ end to end
if (args['unit-only']) finish();

tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbwb-astro-e2e-'));
const skillDest = path.join(tmp, '.claude', 'skills', 'local-business-website-builder');
fs.mkdirSync(path.dirname(skillDest), { recursive: true });
fs.cpSync(SKILL_DIR, skillDest, { recursive: true, filter: (s) => !/node_modules|\.git$/.test(s) });
const S = path.join(skillDest, 'scripts');
const run = (script, ...a) => spawnSync(process.execPath, [path.join(S, script), ...a], { cwd: tmp, encoding: 'utf8' });
const sh = (cmd, a) => spawnSync(cmd, a, { cwd: tmp, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
const show = (r) => `exit ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`.slice(-4000);
const read = (f) => fs.readFileSync(path.join(tmp, f), 'utf8');
let installed = false;
sh('git', ['init', '-q']);

await step('astro e2e: init.mjs scaffolds the Astro starter and never overwrites', () => {
  const r = run('init.mjs');
  assert.equal(r.status, 0, show(r));
  for (const f of ['astro.config.mjs', 'src/pages/index.astro', 'public/.htaccess', '.github/workflows/deploy-production.yml', 'package.json', 'CLAUDE.md']) assert.ok(fs.existsSync(path.join(tmp, f)), `missing ${f}`);
  assert.equal(JSON.parse(read('package.json')).dependencies.astro, '7.4.0');
  assert.match(run('init.mjs').stdout, /exists, kept/);
  const legacy = mk({ 'index.html': '<!doctype html><title>x</title>' });
  const r2 = spawnSync(process.execPath, [path.join(S, 'init.mjs')], { cwd: legacy, encoding: 'utf8' });
  assert.equal(r2.status, 1, 'must refuse to scaffold Astro over an existing hand-built HTML site');
  fs.rmSync(legacy, { recursive: true });
});

await step('astro e2e: npm install (exact pinned versions)', () => {
  if (process.env.LBWB_NODE_MODULES) {
    fs.symlinkSync(path.resolve(process.env.LBWB_NODE_MODULES), path.join(tmp, 'node_modules'), 'dir');
    const lock = sh('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', '--loglevel=error']); // lockfile only; real repos commit one
    if (lock.status !== 0) return 'NOT RUN';
    installed = true; return;
  }
  const r = sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
  if (r.status !== 0 && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network|403|407/i.test(r.stderr)) return 'NOT RUN';
  assert.equal(r.status, 0, show(r));
  installed = true;
});

const needInstall = () => { if (!installed) return 'NOT RUN'; };

await step('astro e2e: starter builds, and validate blocks it (TODOs, placeholder photo, example domain)', () => {
  if (needInstall()) return 'NOT RUN';
  const b = run('build.mjs', '--quiet');
  assert.equal(b.status, 0, show(b));
  const r = run('validate.mjs');
  assert.equal(r.status, 1, show(r));
  for (const code of ['todo', 'site-url', 'img-placeholder']) assert.match(r.stdout, new RegExp(`\\[${code}\\]`), `expected [${code}]`);
  assert.equal(run('check-protection.mjs').status, 0, show(run('check-protection.mjs')));
});

await step('astro e2e: fictional sample — photo intake, build, validate dist/ with zero errors and warnings', () => {
  if (needInstall()) return 'NOT RUN';
  for (const dir of ['blog', 'services', 'locations']) for (const f of fs.readdirSync(path.join(tmp, 'src/content', dir))) if (f.startsWith('example-')) fs.rmSync(path.join(tmp, 'src/content', dir, f));
  fs.cpSync(SAMPLE, tmp, { recursive: true, filter: (s) => !/(README\.md|old-urls\.txt)$/.test(s) || fs.statSync(s).isDirectory() });
  fs.writeFileSync(path.join(tmp, 'rename.json'), JSON.stringify({ 'IMG_2041.jpg': 'asphalt-shingle-roof-at-sunset' }));
  const o = run('optimize-images.mjs', path.join(SKILL_DIR, 'examples/sample-site/_raw-images/IMG_2041.jpg'), '--rename', 'rename.json');
  assert.equal(o.status, 0, show(o));
  assert.ok(fs.existsSync(path.join(tmp, 'src/assets/images/asphalt-shingle-roof-at-sunset.jpg')), 'master image written to src/assets/images');
  fs.rmSync(path.join(tmp, 'rename.json'));
  fs.rmSync(path.join(tmp, 'src/assets/images/placeholder-replace-with-client-photo.jpg'));
  const r = run('validate.mjs', '--build');
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /0 error\(s\), 0 warning\(s\)/, show(r));
});

await step('astro e2e: dist/ has static HTML, sitemap (indexable only), robots, redirects for both hosts, kept permalinks', () => {
  if (needInstall()) return 'NOT RUN';
  const sm = read('dist/sitemap.xml');
  assert.match(sm, /<loc>https:\/\/www\.summitpeakroofing-example\.com\/how-to-spot-hail-damage\/<\/loc>/, 'old root-level post URL kept');
  assert.doesNotMatch(sm, /404/); assert.doesNotMatch(sm, /\/blog\/how-to-spot-hail-damage\//, 'permalink posts are not duplicated under /blog/');
  assert.match(sm, /\/service-areas\/boise-id\//); assert.match(sm, /\/blog\/2\//);
  assert.match(read('dist/robots.txt'), /Sitemap: https:\/\/www\.summitpeakroofing-example\.com\/sitemap\.xml/);
  assert.match(read('dist/_redirects'), /^\/roof-repair-boise\/ \/services\/roof-repair\/ 301$/m);
  assert.match(read('dist/.htaccess'), /RedirectMatch 301 \^\/roof-repair-boise\/\?\$ \/services\/roof-repair\//);
  const home = read('dist/index.html');
  for (const re of [/<link rel="canonical" href="https:\/\/www\.summitpeakroofing-example\.com\/">/, /"@type":"RoofingContractor"/, /<meta name="generator" content="Astro v/, /fetchpriority="high"/, /type="image\/avif"/]) assert.match(home, re);
  assert.match(read('dist/services/roof-repair/index.html'), /"@type":"FAQPage"/);
  assert.match(read('dist/services/roof-repair/index.html'), /"@type":"BreadcrumbList"/);
  assert.ok(!fs.existsSync(path.join(tmp, 'dist/blog/choosing-shingle-colors/index.html')), 'redirected URL must not also exist as a page');
});

await step('astro e2e: build fails on an unsafe redirect map (chain)', () => {
  if (needInstall()) return 'NOT RUN';
  const orig = read('site.config.json');
  const cfg = JSON.parse(orig);
  cfg.redirects.push({ from: '/very-old/', to: '/roof-repair-boise/', status: 301 });
  fs.writeFileSync(path.join(tmp, 'site.config.json'), JSON.stringify(cfg, null, 2));
  const b = run('build.mjs', '--quiet');
  fs.writeFileSync(path.join(tmp, 'site.config.json'), orig);
  assert.notEqual(b.status, 0, 'build must fail');
  assert.match(b.stdout + b.stderr, /chain/);
  assert.equal(run('build.mjs', '--quiet').status, 0);
});

await step('astro e2e: validate flags stale dist/, near-duplicate location pages and build errors', () => {
  if (needInstall()) return 'NOT RUN';
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(tmp, 'src/pages/index.astro'), later, later);
  let r = run('validate.mjs', '--only', 'build');
  assert.match(r.stdout, /\[build-stale\]/, show(r));
  const boise = read('src/content/locations/boise-id.md');
  fs.writeFileSync(path.join(tmp, 'src/content/locations/nampa-id.md'), boise.replaceAll('Boise', 'Nampa'));
  r = run('validate.mjs', '--build', '--only', 'content');
  fs.rmSync(path.join(tmp, 'src/content/locations/nampa-id.md'));
  assert.match(r.stdout, /\[duplicate-content\].*(boise-id|nampa-id)/, show(r));
  fs.writeFileSync(path.join(tmp, 'src/content/locations/thin.md'), '---\nname: Thin\ntitle: Thin\ndescription: short\nlocalDetails: []\n---\nx\n');
  r = run('validate.mjs', '--build', '--only', 'build');
  fs.rmSync(path.join(tmp, 'src/content/locations/thin.md'));
  assert.match(r.stdout, /\[build-failed\]/, 'schema violations (thin location, short description) must fail the build');
  assert.equal(run('build.mjs', '--quiet').status, 0);
});

await step('astro e2e: check-protection — dist/ clean; leaked files, committed dist/ and auto-deploys caught', () => {
  if (needInstall()) return 'NOT RUN';
  let r = run('check-protection.mjs');
  assert.equal(r.status, 0, show(r));
  fs.writeFileSync(path.join(tmp, 'public/notes.md'), '# private');
  run('build.mjs', '--quiet');
  r = run('check-protection.mjs');
  fs.rmSync(path.join(tmp, 'public/notes.md'));
  assert.equal(r.status, 1); assert.match(r.stdout, /notes\.md: source/);
  run('build.mjs', '--quiet');
  sh('git', ['add', '-f', 'dist/index.html']);
  r = run('check-protection.mjs');
  sh('git', ['rm', '-q', '--cached', 'dist/index.html']);
  assert.match(r.stdout, /dist\/ is committed/);
  const wf = path.join(tmp, '.github/workflows/deploy-production.yml');
  const orig = fs.readFileSync(wf, 'utf8');
  fs.writeFileSync(wf, orig.replace('on:\n  workflow_dispatch:', 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:'));
  r = run('check-protection.mjs');
  fs.writeFileSync(wf, orig);
  assert.match(r.stdout, /runs automatically on "push"/);
  assert.equal(run('check-protection.mjs').status, 0);
});

await step('astro e2e: migration-check — every old URL kept or 301ed from dist/ and site.config.json', () => {
  if (needInstall()) return 'NOT RUN';
  const r = run('migration-check.mjs', path.join(SAMPLE, 'old-urls.txt'));
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /0 missing, 0 redirect\(s\) to missing pages/);
});

await step('astro e2e: local hosts — Hostinger mode serves /_astro/, hides _headers, applies 301s; Cloudflare mode + staging-check pass', async () => {
  if (needInstall()) return 'NOT RUN';
  const { createServer } = await import(path.join(S, 'serve.mjs'));
  const css = fs.readdirSync(path.join(tmp, 'dist/_astro')).find((f) => f.endsWith('.css'));
  for (const cf of [false, true]) {
    const srv = createServer(path.join(tmp, 'dist'), { cloudflare: cf });
    await new Promise((res) => srv.listen(0, res));
    const base = `http://localhost:${srv.address().port}`;
    try {
      const st = async (p, o) => (await fetch(base + p, { redirect: 'manual', ...o })).status;
      assert.equal(await st('/'), 200); assert.equal(await st('/services/roof-repair/'), 200); assert.equal(await st(`/_astro/${css}`), 200, `${cf ? 'cloudflare' : 'hostinger'}: /_astro/ must be served`);
      assert.equal(await st('/roof-repair-boise/'), 301); assert.equal(await st('/nope/'), 404);
      assert.notEqual(await st('/.htaccess'), 200); assert.notEqual(await st('/_headers'), 200);
      if (cf) {
        const r = await new Promise((resolve) => {
          const p = spawn(process.execPath, [path.join(S, 'staging-check.mjs'), base], { cwd: tmp });
          let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
          p.on('close', (status) => resolve({ status, stdout: out }));
        });
        assert.equal(r.status, 0, show(r));
      }
    } finally { srv.close(); }
  }
});

await step('astro e2e: deploy-settings — Astro preset, npm run build → dist, manual workflow, WP Engine limits + redirects', () => {
  if (needInstall()) return 'NOT RUN';
  let j = JSON.parse(run('deploy-settings.mjs', '--json').stdout);
  assert.equal(j.cloudflarePages.frameworkPreset, 'Astro'); assert.equal(j.cloudflarePages.buildCommand, 'npm run build'); assert.equal(j.cloudflarePages.buildOutputDirectory, 'dist');
  assert.equal(j.production.manualOnly, true); assert.deepEqual(j.protection, { hostinger: 'ok', cloudflare: 'ok', noindex: 'ok' });
  j = JSON.parse(run('deploy-settings.mjs', '--json', '--host', 'wpengine').stdout);
  assert.ok(j.production.limits.some((l) => /\.htaccess is ignored/.test(l)));
  assert.ok(j.production.redirects.some((r) => r.from === '/roof-repair-boise/'));
});

finish();

function finish() {
  if (tmp) { if (args.keep) console.log(c.dim(`Astro sample kept at ${tmp}`)); else fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(failures ? c.red(`\n${failures} Astro selftest step(s) failed`) : notRun ? c.yellow(`\nAstro selftest: passed, ${notRun} step(s) NOT RUN`) : c.green('\nAll Astro selftest steps passed'));
  process.exit(failures ? 1 : notRun ? 3 : 0);
}
