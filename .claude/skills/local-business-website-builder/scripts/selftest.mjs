#!/usr/bin/env node
// selftest.mjs — verify the skill's scripts end to end.
//   1. legacy static sites (v1 HTML repos stay maintainable) on the bundled fictional sample-site
//   2. the Astro standard (selftest-astro.mjs): starter, npm install, astro build, dist/ QA, protection, deploy rules
// Usage: node selftest.mjs [--keep] [--skip-astro]   (--keep leaves the temp sites in place and prints their paths)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { SKILL_DIR, parseArgs, c } from './lib/util.mjs';
import { render } from './lib/template.mjs';
import { parseFrontMatter, convert } from './lib/markdown.mjs';

const args = parseArgs();
let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`${c.green('✔')} ${name}`); }
  catch (e) { failures++; console.log(`${c.red('✖')} ${name}\n    ${String(e.message).split('\n').slice(0, 12).join('\n    ')}`); }
};

// ---- unit checks
await step('template engine: vars, escaping, each, if/else, unless, scopes', () => {
  const out = render('{{a}}|{{{b}}}|{{#each list}}[{{name}}{{#if @last}}!{{/if}}]{{/each}}|{{#if no}}x{{else}}y{{/if}}|{{#unless no}}u{{/unless}}|{{#each list}}{{top}}{{/each}}',
    { a: '<i>', b: '<b>', list: [{ name: 'p' }, { name: 'q' }], top: 'T', no: [] });
  assert.equal(out, '&lt;i&gt;|<b>|[p][q!]|y|u|TT');
});
await step('front matter parser', () => {
  const { data, body } = parseFrontMatter('---\ntitle: "Hi: there"\ntags: [a, b]\nlist:\n  - x\n  - y\ndraft: false\nn: 3\n---\nBody');
  assert.deepEqual(data, { title: 'Hi: there', tags: ['a', 'b'], list: ['x', 'y'], draft: false, n: 3 });
  assert.equal(body, 'Body');
});
await step('built-in markdown converter', async () => {
  const html = convert('## Title *x*\n\nPara with [link](/a/) and `code` & stuff.\n\n- one\n- two\n  - nested\n\n1. a\n2. b\n\n> quote\n\n| A | B |\n|---|--:|\n| 1 | 2 |\n\n<div class="x">raw</div>\n\n```js\nlet a = 1 < 2;\n```');
  for (const frag of ['<h2 id="title-x">Title <em>x</em></h2>', '<a href="/a/">link</a>', '<code>code</code>', '&amp; stuff', '<li>two<ul>', '<li>nested</li>', '<ol>', '<blockquote>', '<th scope="col">A</th>', 'text-align:right', '<div class="x">raw</div>', 'let a = 1 &lt; 2;']) {
    assert.ok(html.includes(frag), `missing ${frag}\n${html}`);
  }
});

// ---- end-to-end on the sample site
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbwb-selftest-'));
const skillDest = path.join(tmp, '.claude', 'skills', 'local-business-website-builder');
fs.mkdirSync(path.dirname(skillDest), { recursive: true });
fs.cpSync(SKILL_DIR, skillDest, { recursive: true, filter: (s) => !/node_modules|\.git$/.test(s) });
const S = path.join(skillDest, 'scripts');
const run = (script, ...a) => spawnSync(process.execPath, [path.join(S, script), ...a], { cwd: tmp, encoding: 'utf8' });
const show = (r) => `exit ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`;

// ---- legacy static sites (v1 repos stay maintainable)
await step('init.mjs --legacy-static scaffolds the v1 HTML starter', () => {
  const r = run('init.mjs', '--legacy-static');
  assert.equal(r.status, 0, show(r));
  for (const f of ['index.html', '_partials/header.html', '_templates/article.html', 'site.config.json', '.htaccess', 'package.json']) assert.ok(fs.existsSync(path.join(tmp, f)), `missing ${f}`);
  const again = run('init.mjs', '--legacy-static');
  assert.match(again.stdout, /exists, kept/, 'second init must not overwrite');
});

await step('starter fails validation with TODO + site.url errors (by design)', () => {
  run('build.mjs');
  const r = run('validate.mjs');
  assert.equal(r.status, 1, show(r));
  assert.match(r.stdout, /\[todo\]/);
  assert.match(r.stdout, /\[site-url\]/);
});

const sample = path.join(SKILL_DIR, 'examples', 'sample-site');
fs.cpSync(sample, tmp, { recursive: true, filter: (s) => !/(README\.md|old-urls\.txt|\.htaccess\.redirects|_raw-images)$/.test(s) });
fs.appendFileSync(path.join(tmp, '.htaccess'), '\n' + fs.readFileSync(path.join(sample, '.htaccess.redirects'), 'utf8'));

await step('build.mjs renders sample site', () => {
  const r = run('build.mjs');
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /collection blog: 3 items/);
  const post = fs.readFileSync(path.join(tmp, 'blog/how-to-spot-hail-damage/index.html'), 'utf8');
  assert.match(post, /<h1>How to Spot Hail Damage/);
  assert.match(post, /"@type": "BlogPosting"/);
  assert.match(post, /<a href="\/blog\/" aria-current="page">|<a href="\/blog\/">Blog<\/a>/);
  assert.ok(fs.existsSync(path.join(tmp, 'blog/page/2/index.html')), 'pagination page 2');
  assert.ok(fs.existsSync(path.join(tmp, 'blog/category/roof-repair/index.html')), 'category archive (2 items)');
  assert.ok(!fs.existsSync(path.join(tmp, 'blog/category/roof-replacement/index.html')), 'thin category (1 item) must not get an archive');
  const home = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  assert.match(home, /"@type": "RoofingContractor"/);
  assert.match(home, /main\.css\?v=[0-9a-f]{8}/);
  assert.match(home, /<a href="\/" aria-current="page">Home<\/a>/);
  const sm = fs.readFileSync(path.join(tmp, 'sitemap.xml'), 'utf8');
  assert.ok(sm.includes('https://www.summitpeakroofing-example.com/services/roof-repair/'));
  assert.ok(!sm.includes('404'), '404 must not be in sitemap');
});

await step('build.mjs is idempotent (--check passes right after build)', () => {
  const r = run('build.mjs', '--check');
  assert.equal(r.status, 0, show(r));
});

await step('validate.mjs: sample site has zero blocking errors', () => {
  const r = run('validate.mjs', '--json', 'qa.json');
  const report = JSON.parse(fs.readFileSync(path.join(tmp, 'qa.json'), 'utf8'));
  assert.equal(report.counts.error, 0, JSON.stringify(report.issues.filter((i) => i.level === 'error'), null, 2));
  assert.equal(r.status, 0);
  fs.rmSync(path.join(tmp, 'qa.json'));
});

await step('validate.mjs catches injected defects', () => {
  const f = path.join(tmp, 'services/index.html');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('<h1>Roofing services</h1>', '<h1>Roofing services</h1><h1>Two</h1><img src="/assets/images/nope.webp"><a href="/missing-page/">x</a><h4>skip</h4>'));
  const r = run('validate.mjs');
  fs.writeFileSync(f, orig);
  assert.equal(r.status, 1);
  for (const code of ['img-alt', 'img-missing', 'link-broken', 'h1-multiple', 'heading-skip']) assert.match(r.stdout, new RegExp(`\\[${code}\\]`), `expected ${code}\n${r.stdout}`);
});

await step('validate.mjs flags stale build output when content changed without a build', () => {
  const src = path.join(tmp, '_content/blog/2026-08-15-roof-leak-first-steps.md');
  const orig = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(src, orig.replace('Five Things', '5 Things'));
  const r = run('validate.mjs', '--only', 'build');
  fs.writeFileSync(src, orig);
  assert.equal(r.status, 1, show(r));
  assert.match(r.stdout, /\[build-stale\]/);
});

await step('stale generated pages are removed when a post is deleted', () => {
  const src = path.join(tmp, '_content/blog/2026-07-01-choosing-shingle-colors.md');
  const keep = fs.readFileSync(src);
  fs.rmSync(src);
  run('build.mjs');
  assert.ok(!fs.existsSync(path.join(tmp, 'blog/choosing-shingle-colors/index.html')));
  fs.writeFileSync(src, keep);
  run('build.mjs');
  assert.ok(fs.existsSync(path.join(tmp, 'blog/choosing-shingle-colors/index.html')));
});

await step('migration-check.mjs: all old URLs kept or redirected', () => {
  const r = run('migration-check.mjs', path.join(sample, 'old-urls.txt'));
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /6 old URLs: 4 kept, 2 redirected|old URLs: \d+ kept, \d+ redirected, 0 missing/);
});

await step('serve.mjs: clean URLs, 301 to trailing slash, real 404, private files blocked', async () => {
  const { createServer } = await import(path.join(S, 'serve.mjs'));
  const cwd = process.cwd();
  process.chdir(tmp);
  const srv = createServer();
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  try {
    assert.equal((await fetch(base + '/services/')).status, 200);
    assert.equal((await fetch(base + '/services', { redirect: 'manual' })).status, 301);
    assert.equal((await fetch(base + '/nope/')).status, 404);
    assert.equal((await fetch(base + '/site.config.json')).status, 404);
    assert.equal((await fetch(base + '/_partials/header.html')).status, 404);
  } finally { srv.close(); process.chdir(cwd); }
});

// ---- v1.1: staging / deployment workflow
const runAsync = (script, ...a) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(S, script), ...a], { cwd: tmp });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => resolve({ status, stdout: out }));
});
async function withServer(root, opts, fn) {
  const { createServer } = await import(path.join(S, 'serve.mjs'));
  const srv = createServer(root, opts);
  await new Promise((r) => srv.listen(0, r));
  try { return await fn(`http://localhost:${srv.address().port}`); } finally { srv.close(); }
}

await step('deploy-settings.mjs: Cloudflare publishes the existing web root (no copies)', () => {
  const r = run('deploy-settings.mjs', '--json');
  assert.equal(r.status, 0, show(r));
  const j = JSON.parse(r.stdout);
  assert.equal(j.cloudflarePages.buildCommand, 'exit 0');
  assert.equal(j.cloudflarePages.buildOutputDirectory, '/');
  assert.equal(j.cloudflarePages.productionBranch, 'main');
  assert.deepEqual(j.protection, { hostinger: 'ok', cloudflare: 'ok', noindex: 'ok' });
});

await step('deploy-settings.mjs adapts to other project structures', () => {
  const cases = [
    { files: { 'index.html': '<!doctype html>', '404.html': 'x' }, cmd: /^exit 0$/, out: '/' },
    { files: { 'public_html/index.html': '<!doctype html>', 'public_html/404.html': 'x' }, cmd: /^exit 0$/, out: 'public_html' },
    { files: { 'index.html': 'x', 'src/pages/index.html': 'x', 'package.json': JSON.stringify({ scripts: { build: 'node tools/build.mjs' } }) }, cmd: /^exit 0$/, out: '/' },
    { files: { 'package.json': JSON.stringify({ scripts: { build: 'astro build' }, devDependencies: { astro: '^5' } }) }, cmd: /^npm run build$/, out: 'dist' },
    { files: { 'package.json': JSON.stringify({ devDependencies: { '@11ty/eleventy': '^3' } }) }, cmd: /eleventy/, out: '_site' },
  ];
  for (const k of cases) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbwb-ds-'));
    for (const [f, body] of Object.entries(k.files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), body); }
    const r = spawnSync(process.execPath, [path.join(S, 'deploy-settings.mjs'), '--json'], { cwd: d, encoding: 'utf8' });
    const j = JSON.parse(r.stdout);
    assert.match(j.cloudflarePages.buildCommand, k.cmd, `${Object.keys(k.files)} → ${j.cloudflarePages.buildCommand}`);
    assert.equal(j.cloudflarePages.buildOutputDirectory, k.out, `${Object.keys(k.files)} → ${j.cloudflarePages.buildOutputDirectory}`);
    fs.rmSync(d, { recursive: true, force: true });
  }
});

await step('check-protection.mjs: starter protects dev files on Hostinger AND Cloudflare, noindexes staging', () => {
  const r = run('check-protection.mjs', '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(r.status, 0, show(r));
  for (const n of ['.claude/', '_partials/', '_content/', '_templates/', 'site.config.json', 'package.json', 'CLAUDE.md']) assert.ok(j.private.includes(n), `${n} should be detected as private`);
});

await step('check-protection.mjs: a Cloudflare-only gap fails and names the missing _redirects line', () => {
  const f = path.join(tmp, '_redirects');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('/site.config.json /404/ 302\n', ''));
  const r = run('check-protection.mjs');
  fs.writeFileSync(f, orig);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Cloudflare: \/site\.config\.json is not covered/);
  assert.match(r.stdout, /\/site\.config\.json \/404\/ 302/);
});

await step('check-protection.mjs: a Hostinger-only gap fails even when Cloudflare is protected', () => {
  const f = path.join(tmp, '.htaccess');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace(/^\s*RewriteRule \^\(site.*$/m, ''));
  const r = run('check-protection.mjs');
  fs.writeFileSync(f, orig);
  assert.equal(r.status, 1, show(r));
  assert.match(r.stdout, /Hostinger: \/site\.config\.json is not blocked/);
  assert.match(r.stdout, /RedirectMatch 404/);
});

await step('check-protection.mjs: missing or global-only noindex is reported', () => {
  const f = path.join(tmp, '_headers');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, '/*\n  X-Robots-Tag: noindex\n');
  const r = run('check-protection.mjs');
  fs.writeFileSync(f, orig);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /pages\.dev/);
  assert.match(r.stdout, /WARN .*"\/\*"/);
});

await step('Hostinger mode (serve.mjs): .htaccess hides dev files; pages, assets, sitemap served; _headers ignored', async () => {
  await withServer(tmp, {}, async (url) => {
    for (const p of ['/.claude/skills/local-business-website-builder/SKILL.md', '/site.config.json', '/_partials/header.html', '/_content/blog/2026-08-15-roof-leak-first-steps.md', '/package.json', '/CLAUDE.md', '/_redirects', '/_headers', '/.htaccess', '/.lbwb-manifest.json'])
      assert.equal((await fetch(url + p, { redirect: 'manual' })).status, 404, `${p} must be 404 on Hostinger`);
    for (const p of ['/', '/services/roof-repair/', '/blog/', '/assets/css/main.css', '/sitemap.xml', '/robots.txt']) assert.equal((await fetch(url + p)).status, 200, p);
    assert.equal((await fetch(url + '/')).headers.get('x-robots-tag'), null, 'production must stay indexable');
  });
});

await step('staging-check.mjs passes on the site served in Cloudflare mode (same files, no copy)', async () => {
  const r = await withServer(tmp, { cloudflare: true }, (url) => runAsync('staging-check.mjs', url));
  assert.equal(r.status, 0, show(r));
  assert.match(r.stdout, /10 pages/);
});

await step('staging-check.mjs catches indexable pages, exposed files and SPA soft-404s', async () => {
  const keep = {};
  for (const f of ['404.html', '_redirects', '_headers']) { keep[f] = fs.readFileSync(path.join(tmp, f)); fs.rmSync(path.join(tmp, f)); }
  const r = await withServer(tmp, { cloudflare: true }, (url) => runAsync('staging-check.mjs', url));
  for (const [f, b] of Object.entries(keep)) fs.writeFileSync(path.join(tmp, f), b);
  assert.equal(r.status, 1);
  for (const code of ['indexable', 'exposed', 'soft-404']) assert.match(r.stdout, new RegExp(`\\[${code}\\]`), `expected ${code}\n${r.stdout}`);
  assert.match(r.stdout, /\/site\.config\.json/);
  assert.match(r.stdout, /\/\.htaccess/);
});

await step('staging-check.mjs catches broken images and placeholder form actions', async () => {
  const img = path.join(tmp, 'assets/images/asphalt-shingle-roof-at-sunset-960.webp');
  const imgKeep = fs.readFileSync(img);
  fs.rmSync(img);
  const contact = path.join(tmp, 'contact/index.html');
  const cKeep = fs.readFileSync(contact, 'utf8');
  fs.writeFileSync(contact, cKeep.replace(/action="[^"]*"/, 'action="TODO:form-endpoint"'));
  const r = await withServer(tmp, { cloudflare: true }, (url) => runAsync('staging-check.mjs', url));
  fs.writeFileSync(img, imgKeep);
  fs.writeFileSync(contact, cKeep);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[asset-broken\]/);
  assert.match(r.stdout, /\[form-placeholder\]/);
});

await step('validate.mjs blocks site.noindex when main also feeds production', () => {
  const f = path.join(tmp, 'site.config.json');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('"noindex": false', '"noindex": true'));
  const r = run('validate.mjs', '--only', 'site');
  fs.writeFileSync(f, orig);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[site-noindex\].*de-index the live site/);
});

await step('validate.mjs flags deploying workflows and exposed dev files, not check-only workflows', () => {
  const wfDir = path.join(tmp, '.github/workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(path.join(wfDir, 'validate.yml'), '# Only checks. Deployment stays manual: click Redeploy in Hostinger.\non: push\njobs:\n  check:\n    steps:\n      - run: npm run check\n');
  let r = run('validate.mjs', '--only', 'deploy');
  assert.equal(r.status, 0, `check-only workflow (comment mentions Hostinger) must pass\n${r.stdout}`);
  fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tools/helper.mjs'), '// dev tool');
  r = run('validate.mjs', '--only', 'deploy');
  fs.rmSync(path.join(tmp, 'tools'), { recursive: true });
  assert.equal(r.status, 1, 'a new tools/ folder must be flagged on both hosts');
  assert.match(r.stdout, /\[cloudflare-exposed\].*\/tools\//);
  assert.match(r.stdout, /\[hostinger-exposed\].*\/tools\//);
  fs.writeFileSync(path.join(wfDir, 'deploy.yml'), 'jobs:\n  deploy:\n    steps:\n      - uses: SamKirkland/FTP-Deploy-Action@v4\n');
  r = run('validate.mjs', '--only', 'deploy');
  fs.rmSync(path.join(tmp, '.github'), { recursive: true });
  assert.match(r.stdout, /\[auto-deploy-workflow\]/);
});

await step('page discovery skips private source folders (src/ templates are not pages)', () => {
  fs.mkdirSync(path.join(tmp, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src/pages/index.html'), '<p>template without head</p>');
  const r = run('validate.mjs', '--only', 'seo');
  fs.rmSync(path.join(tmp, 'src'), { recursive: true });
  assert.doesNotMatch(r.stdout, /src\/pages/, r.stdout);
});

await step('validate.mjs still passes the sample site with staging configured', () => {
  const r = run('validate.mjs');
  assert.equal(r.status, 0, show(r));
});

await step('tracking only loads on the production hostname', () => {
  const f = path.join(tmp, 'site.config.json');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('"gtmId": ""', '"gtmId": "GTM-TEST123"'));
  run('build.mjs');
  const home = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  fs.writeFileSync(f, orig);
  run('build.mjs');
  assert.match(home, /location\.hostname\.replace\(\/\^www\\\.\/,''\)==='summitpeakroofing-example\.com'/);
});

// ---- v1.2.2: Cloudflare Pages API (against a local mock — never the real account)
const cfLib = await import(path.join(S, 'lib/cloudflare.mjs'));

await step('cloudflare guardrails: no deletes, domains, DNS, uploads or non-staging PATCH fields', () => {
  const A = '/accounts/acc1';
  for (const [m, p] of [['DELETE', `${A}/pages/projects/x`], ['DELETE', `${A}/pages/projects/x/deployments/d1`], ['POST', `${A}/pages/projects/x/domains`],
    ['DELETE', `${A}/pages/projects/x/domains/www.example.com`], ['POST', '/zones/z1/dns_records'], ['PUT', `${A}/workers/scripts/s`], ['POST', `${A}/pages/projects/x/deployments`], ['PATCH', `${A}/pages/projects/x/domains/a.com`]])
    assert.throws(() => cfLib.assertAllowed(m, p), cfLib.GuardrailError, `${m} ${p} must be blocked`);
  for (const [m, p] of [['GET', `${A}/pages/projects`], ['POST', `${A}/pages/projects`], ['PATCH', `${A}/pages/projects/x`], ['POST', `${A}/pages/projects/x/deployments/d1/retry`], ['GET', `${A}/pages/projects/x/deployments/d1/history/logs`]])
    cfLib.assertAllowed(m, p);
  assert.throws(() => cfLib.assertPatchBody({ deployment_configs: { production: { env_vars: {} } } }), cfLib.GuardrailError);
  assert.throws(() => cfLib.assertPatchBody({ build_config: { web_analytics_token: 'x' } }), cfLib.GuardrailError);
  cfLib.assertPatchBody({ production_branch: 'main', build_config: { build_command: 'exit 0', destination_dir: '.', root_dir: '' }, source: { config: { preview_deployment_setting: 'none' } } });
  const src = fs.readFileSync(path.join(S, 'cloudflare-pages.mjs'), 'utf8') + fs.readFileSync(path.join(S, 'lib/cloudflare.mjs'), 'utf8');
  assert.doesNotMatch(src, /['"]DELETE['"]\s*,\s*new RegExp|method:\s*['"]DELETE/, 'no DELETE route may be allowed');
  assert.doesNotMatch(src, /spawn[^\n]*wrangler/, 'never shells out to wrangler');
});

await step('cloudflare helpers: git remotes, project names, settings diff, error diagnosis', () => {
  for (const u of ['https://github.com/acme/roof-site.git', 'git@github.com:acme/roof-site.git', 'http://local_proxy@127.0.0.1:1234/git/acme/roof-site'])
    assert.deepEqual(cfLib.parseGitRemote(u), { owner: 'acme', repo: 'roof-site' }, u);
  assert.equal(cfLib.projectNameFrom('Summit_Peak Roofing!!'), 'summit-peak-roofing');
  const want = { buildCommand: 'exit 0', outputDir: '.', rootDir: '' };
  const okProj = { production_branch: 'main', build_config: { build_command: 'exit 0', destination_dir: '/', root_dir: '' }, source: { type: 'github', config: { production_branch: 'main', preview_deployment_setting: 'none' } } };
  assert.deepEqual(cfLib.settingsDiff(okProj, want), []);
  const bad = cfLib.settingsDiff({ ...okProj, build_config: { build_command: 'npm run build', destination_dir: 'dist' }, source: { type: 'github', config: { production_branch: 'main', preview_deployment_setting: 'all' } } }, want).map((x) => x.field);
  assert.deepEqual(bad.sort(), ['build_config.build_command', 'build_config.destination_dir', 'source.config.preview_deployment_setting']);
  assert.match(cfLib.diagnose('Error: Output directory "dist" not found.')[0].fix, /exit 0/);
  assert.match(cfLib.diagnose('Failed: an internal error occurred')[0].fix, /retry/);
  assert.equal(cfLib.diagnose('Success: Finished cloning repository files').length, 0);
});

function mockCloudflare(seed = []) {
  const projects = new Map(seed.map((p) => [p.name, p]));
  const calls = [];
  const deployments = {};
  const send = (res, code, result, errors = []) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: code < 400, errors, messages: [], result })); };
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const ch of req) body += ch;
    const u = new URL(req.url, 'http://x');
    calls.push({ method: req.method, path: u.pathname, body: body ? JSON.parse(body) : null });
    const m = u.pathname.match(/^\/accounts\/acc1\/pages\/projects(?:\/([^/]+))?(?:\/(deployments|domains))?(?:\/([^/]+))?(?:\/(retry|history\/logs))?$/);
    if (u.pathname === '/accounts') return send(res, 200, [{ id: 'acc1', name: 'Agency' }]);
    if (u.pathname === '/user/tokens/verify') return send(res, 200, { status: 'active' });
    if (!m) return send(res, 404, null, [{ code: 7003, message: 'No route' }]);
    const [, name, sub, id, act] = m;
    if (!name && req.method === 'GET') return send(res, 200, [...projects.values()]);
    if (!name && req.method === 'POST') {
      const b = JSON.parse(body);
      if (projects.has(b.name)) return send(res, 409, null, [{ code: 8000002, message: 'A project with this name already exists.' }]);
      const p = { ...b, subdomain: `${b.name}.pages.dev`, domains: [`${b.name}.pages.dev`] };
      projects.set(b.name, p); return send(res, 200, p);
    }
    const p = projects.get(name);
    if (!p) return send(res, 404, null, [{ code: 8000007, message: 'Project not found' }]);
    if (!sub && req.method === 'GET') return send(res, 200, p);
    if (!sub && req.method === 'PATCH') {
      const b = JSON.parse(body);
      Object.assign(p.build_config, b.build_config || {}); if (b.production_branch) p.production_branch = b.production_branch;
      if (b.source?.config) Object.assign(p.source.config, b.source.config);
      return send(res, 200, p);
    }
    if (sub === 'domains') return send(res, 200, (p.customDomains || []).map((n) => ({ name: n })));
    if (sub === 'deployments' && !id) return send(res, 200, deployments[name] || []);
    const d = (deployments[name] || []).find((x) => x.id === id);
    if (act === 'history/logs') return send(res, 200, { data: (d?.logLines || []).map((line) => ({ line })) });
    if (act === 'retry') { const n = { ...d, id: 'retry-1', latest_stage: { name: 'queued', status: 'active' } }; deployments[name].unshift(n); return send(res, 200, n); }
    return send(res, d ? 200 : 404, d || null);
  });
  return { srv, projects, calls, deployments };
}
const runCf = (env, ...a) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(S, 'cloudflare-pages.mjs'), ...a], { cwd: tmp, env: { ...process.env, ...env, CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '' } });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => resolve({ status, stdout: out }));
});
async function withMock(seed, fn) {
  const mock = mockCloudflare(seed);
  await new Promise((r) => mock.srv.listen(0, r));
  try { return await fn(mock, { CLOUDFLARE_API_BASE: `http://localhost:${mock.srv.address().port}` }); } finally { mock.srv.close(); }
}
const gh = (owner, repo, extra = {}) => ({ type: 'github', config: { owner, repo_name: repo, production_branch: 'main', deployments_enabled: true, production_deployments_enabled: true, preview_deployment_setting: 'all', ...extra } });

await step('cloudflare-pages.mjs create: detects first, dry-runs, then creates one GitHub-connected staging project', async () => {
  const cfgFile = path.join(tmp, 'site.config.json');
  const cfgKeep = fs.readFileSync(cfgFile, 'utf8');
  await withMock([{ name: 'other-client', subdomain: 'other-client.pages.dev', production_branch: 'main', build_config: {}, source: gh('acme', 'other-client') }], async (mock, env) => {
    let r = await runCf(env, 'detect', '--repo', 'acme/summit-peak', '--name', 'summit-peak');
    assert.equal(r.status, 0, show(r));
    assert.match(r.stdout, /safe to create/);
    r = await runCf(env, 'create', '--repo', 'acme/summit-peak', '--name', 'summit-peak');
    assert.equal(r.status, 0, show(r));
    assert.match(r.stdout, /Dry run/);
    assert.equal(mock.calls.filter((x) => x.method === 'POST').length, 0, 'dry run must not POST');
    r = await runCf(env, 'create', '--repo', 'acme/summit-peak', '--name', 'summit-peak', '--yes');
    assert.equal(r.status, 0, show(r));
    const post = mock.calls.find((x) => x.method === 'POST');
    assert.equal(post.body.name, 'summit-peak');
    assert.deepEqual(post.body.build_config, { build_command: 'exit 0', destination_dir: '.', root_dir: '' });
    assert.equal(post.body.source.config.production_branch, 'main');
    assert.equal(post.body.source.config.preview_deployment_setting, 'none');
    assert.equal(post.body.source.config.repo_name, 'summit-peak');
    const saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8')).deploy.staging;
    assert.equal(saved.url, 'https://summit-peak.pages.dev');
    assert.equal(saved.project, 'summit-peak');
    r = await runCf(env, 'create', '--repo', 'acme/summit-peak', '--yes');
    assert.equal(r.status, 0, show(r));
    assert.match(r.stdout, /Already exists/);
    assert.equal(mock.calls.filter((x) => x.method === 'POST').length, 1, 'existing project must not be created twice');
    r = await runCf(env, 'create', '--repo', 'acme/new-site', '--name', 'other-client', '--yes');
    assert.equal(r.status, 1, 'name owned by another repo must be refused');
    assert.match(r.stdout, /taken by a project for acme\/other-client/);
    assert.ok(!mock.calls.some((x) => x.method === 'DELETE'), 'no DELETE ever');
  });
  fs.writeFileSync(cfgFile, cfgKeep);
});

await step('cloudflare-pages.mjs configure: fixes staging build/branch settings only, dry run first', async () => {
  await withMock([{ name: 'summit-peak', subdomain: 'summit-peak.pages.dev', production_branch: 'main', build_config: { build_command: 'npm run build', destination_dir: 'dist', root_dir: '' }, source: gh('acme', 'summit-peak') }], async (mock, env) => {
    let r = await runCf(env, 'configure', '--repo', 'acme/summit-peak');
    assert.equal(r.status, 0, show(r));
    assert.match(r.stdout, /build_config\.build_command/);
    assert.equal(mock.calls.filter((x) => x.method === 'PATCH').length, 0);
    r = await runCf(env, 'configure', '--repo', 'acme/summit-peak', '--yes');
    assert.equal(r.status, 0, show(r));
    const patch = mock.calls.find((x) => x.method === 'PATCH');
    assert.deepEqual(Object.keys(patch.body).sort(), ['build_config', 'production_branch', 'source']);
    assert.equal(mock.projects.get('summit-peak').build_config.build_command, 'exit 0');
    assert.equal(mock.projects.get('summit-peak').source.config.preview_deployment_setting, 'none');
    r = await runCf(env, 'configure', '--repo', 'acme/summit-peak');
    assert.match(r.stdout, /already match/);
    r = await runCf(env, 'configure', '--repo', 'acme/someone-else', '--name', 'summit-peak', '--yes');
    assert.equal(r.status, 1, 'must refuse a project connected to another repo');
  });
});

await step('cloudflare-pages.mjs status/logs/retry: failed build diagnosed, retry gated by --yes', async () => {
  const proj = { name: 'summit-peak', subdomain: 'summit-peak.pages.dev', production_branch: 'main', build_config: { build_command: 'npm run build', destination_dir: 'dist' }, source: gh('acme', 'summit-peak') };
  await withMock([proj], async (mock, env) => {
    const stage = (status) => ({ name: status === 'success' ? 'deploy' : 'build', status });
    mock.deployments['summit-peak'] = [
      { id: 'dep-fail-1', url: 'https://dep-fail.summit-peak.pages.dev', environment: 'production', latest_stage: stage('failure'), stages: [{ name: 'build', status: 'failure' }], deployment_trigger: { metadata: { branch: 'main', commit_hash: 'bbbbbbb222', commit_message: 'Change' } }, logLines: ['Cloning repository...', 'Executing user command: npm run build', 'Error: Output directory "dist" not found.', 'Failed: build output directory not found'] },
      { id: 'dep-ok-0', url: 'https://dep-ok.summit-peak.pages.dev', environment: 'production', latest_stage: stage('success'), stages: [{ name: 'deploy', status: 'success' }], deployment_trigger: { metadata: { branch: 'main', commit_hash: 'aaaaaaa111', commit_message: 'Old' } } },
    ];
    let r = await runCf(env, 'status', '--repo', 'acme/summit-peak', '--commit', 'bbbbbbb');
    assert.equal(r.status, 1, show(r));
    assert.match(r.stdout, /Output directory "dist" not found/);
    assert.match(r.stdout, /Diagnosis:[\s\S]*exit 0/);
    r = await runCf(env, 'status', '--repo', 'acme/summit-peak', '--commit', 'aaaaaaa');
    assert.equal(r.status, 0, show(r));
    assert.match(r.stdout, /Staging is live: https:\/\/summit-peak\.pages\.dev/);
    r = await runCf(env, 'status', '--repo', 'acme/summit-peak', '--commit', 'ccccccc');
    assert.equal(r.status, 2, 'unknown commit → pending/not deployed');
    r = await runCf(env, 'logs', '--repo', 'acme/summit-peak');
    assert.equal(r.status, 1);
    r = await runCf(env, 'retry', '--repo', 'acme/summit-peak');
    assert.match(r.stdout, /Dry run/);
    assert.ok(!mock.calls.some((x) => x.path.endsWith('/retry')));
    r = await runCf(env, 'retry', '--repo', 'acme/summit-peak', '--yes');
    assert.equal(r.status, 0, show(r));
    assert.ok(mock.calls.some((x) => x.method === 'POST' && x.path.endsWith('/dep-fail-1/retry')));
  });
});

await step('cloudflare-pages.mjs verify --url: noindex + security headers + staging-check on the Cloudflare-mode site', async () => {
  const r = await withServer(tmp, { cloudflare: true }, (url) => runCf({}, 'verify', '--url', url));
  assert.match(r.stdout, /→ staging-check\.mjs/);
  assert.doesNotMatch(r.stdout, /\[indexable\]|\[exposed\]/, r.stdout);
  assert.doesNotMatch(r.stdout, /\[header-nosniff\]|\[header-referrer\]/, 'starter _headers must send security headers on staging');
  assert.ok(r.status === 0, show(r));
});

await step('cloudflare-pages.mjs verify fails on an indexable/unprotected staging site', async () => {
  const keep = {};
  for (const f of ['_headers', '_redirects']) { keep[f] = fs.readFileSync(path.join(tmp, f)); fs.rmSync(path.join(tmp, f)); }
  const r = await withServer(tmp, { cloudflare: true }, (url) => runCf({}, 'verify', '--url', url));
  for (const [f, b] of Object.entries(keep)) fs.writeFileSync(path.join(tmp, f), b);
  assert.equal(r.status, 1, show(r));
  assert.match(r.stdout, /\[indexable\]/);
  assert.match(r.stdout, /\[exposed\]/);
  assert.match(r.stdout, /\[header-nosniff\]/);
});

await step('staging-check.mjs flags mixed (http://) content on https staging', async () => {
  const { createServer } = await import(path.join(S, 'serve.mjs'));
  const f = path.join(tmp, 'services/index.html');
  const orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('</main>', '<img src="http://insecure.example.com/x.jpg" alt="x" width="1" height="1"></main>'));
  // https base is simulated by checking the rule directly: run against http base must NOT flag it
  const r = await withServer(tmp, { cloudflare: true }, (url) => runAsync('staging-check.mjs', url));
  fs.writeFileSync(f, orig);
  assert.doesNotMatch(r.stdout, /\[mixed-content\]/, 'http staging base cannot have mixed content');
  const src = fs.readFileSync(path.join(S, 'staging-check.mjs'), 'utf8');
  assert.match(src, /base\.startsWith\('https:'\)[\s\S]{0,300}mixed-content/);
});

// ---- v1.2.3: hand-built repos (own header/footer sync, <FilesMatch> rules)
await step('protection: components/ and .htaccess-hidden folders are private; <FilesMatch> deny counts on Hostinger', async () => {
  const { auditProtection, detectPrivatePaths, htaccessBlocker } = await import(path.join(S, 'lib/protect.mjs'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbwb-hand-'));
  const files = { 'index.html': '<!doctype html><title>x</title>', '404.html': 'x', 'README.md': 'notes', 'components/header.html': '<header></header>', 'drafts/a.html': 'x',
    '.htaccess': '<FilesMatch "^(README\\.md|_headers)$">\n  Require all denied\n</FilesMatch>\nRedirectMatch 404 ^/(components|drafts)(/|$)\n', '_headers': 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex\n' };
  for (const [f, b] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), b); }
  const names = detectPrivatePaths(d).map((e) => e.name);
  for (const n of ['components', 'drafts', 'README.md']) assert.ok(names.includes(n), `${n} should be private: ${names}`);
  const ht = htaccessBlocker(files['.htaccess']);
  assert.ok(ht('/README.md') && ht('/_headers') && !ht('/index.html'));
  const r = auditProtection(d);
  assert.ok(r.hostinger.every((x) => x.ok), JSON.stringify(r.hostinger.filter((x) => !x.ok)));
  assert.deepEqual(r.cloudflare.filter((x) => !x.ok).map((x) => x.entry.name).sort(), ['.htaccess', 'README.md', 'components', 'drafts']);
  const v = spawnSync(process.execPath, [path.join(S, 'validate.mjs'), '--only', 'seo'], { cwd: d, encoding: 'utf8' });
  assert.doesNotMatch(v.stdout, /components\/header\.html/, 'partials in components/ are not pages');
  fs.rmSync(d, { recursive: true, force: true });
});

if (args.keep) console.log(c.dim(`Sample site kept at ${tmp}`));
else fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? c.red(`\n${failures} legacy selftest step(s) failed`) : c.green('\nAll legacy (static) selftest steps passed'));

let astroStatus = 0;
if (!args['skip-astro']) {
  console.log(c.bold('\n— Astro standard —'));
  astroStatus = spawnSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'selftest-astro.mjs'), ...(args.keep ? ['--keep'] : [])], { stdio: 'inherit' }).status;
} else console.log(c.yellow('Astro selftest skipped (--skip-astro) — NOT RUN'));
process.exit(failures || astroStatus === 1 ? 1 : astroStatus === 3 || args['skip-astro'] ? 3 : 0);
