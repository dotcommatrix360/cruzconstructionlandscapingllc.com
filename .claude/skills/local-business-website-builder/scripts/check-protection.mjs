#!/usr/bin/env node
// check-protection.mjs — offline check that nothing private can be published and that staging is noindexed.
// Works in any repo (site.config.json optional). Exit 1 when anything is exposed.
//
// Astro projects (agency standard) — only dist/ is published:
//   dist/ contents     no source, config, docs, dotfiles, env files, archives (source maps warned)
//   dist/.htaccess     Apache/Hostinger: dotfiles + _headers/_redirects hidden, /_astro/ NOT blocked
//   dist/_headers      staging noindex scoped to *.pages.dev; dist/_redirects hides /.htaccess on Cloudflare
//   repository         dist/, node_modules/, .env not committed; .gitignore covers them
//   workflows          deploying workflows are manual-only, upload dist/ only, credentials from secrets
// Legacy static repos (web root = repo root): .htaccess (Hostinger) AND _redirects (Cloudflare) must each hide
//   every development file, and _headers noindexes *.pages.dev.
//
// Usage: node check-protection.mjs [--root .] [--extra a,b] [--allow-public c,d] [--no-staging] [--no-apache]
//                                  [--production hostinger|wpengine|cloudflare-pages] [--json]
//   site.config.json → deploy.private (extra private names), deploy.public (names that look private but are served)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, loadConfig, c } from './lib/util.mjs';
import { auditProtection, auditDist, htaccessLines, STAGING_HEADERS } from './lib/protect.mjs';
import { detectProject, gitTracked } from './lib/project.mjs';
import { auditWorkflows } from './lib/deploy.mjs';

const args = parseArgs();
const cfg = loadConfig();
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const project = detectProject();
if (project.type === 'astro' && !args.root) await astroMode();
const webRoot = path.resolve(ROOT, String(args.root || '.'));
const stagingOn = !args['no-staging'] && (cfg ? !!cfg.deploy?.staging || args.staging : true);
const host = (cfg?.deploy?.production?.host || 'hostinger').toLowerCase();
const apacheOn = !args['no-apache'] && /hostinger|apache|litespeed|cpanel|siteground/.test(host);
const res = auditProtection(webRoot, {
  extra: [...list(args.extra), ...(cfg?.deploy?.private || [])],
  allowPublic: [...list(args['allow-public']), ...(cfg?.deploy?.public || [])],
  staging: stagingOn, apache: apacheOn,
});

const errors = [];
if (apacheOn && !res.files.htaccess) errors.push('No .htaccess in the web root — Hostinger would serve every development file.');
for (const h of res.hostinger.filter((x) => !x.ok)) errors.push(`Hostinger: /${h.entry.name}${h.entry.dir ? '/' : ''} is not blocked by .htaccess (${h.failing.join(', ')})`);
if (stagingOn) {
  if (!res.files.redirects) errors.push('No _redirects in the web root — Cloudflare staging would serve every development file.');
  for (const x of res.cloudflare.filter((y) => !y.ok)) if (res.files.redirects) errors.push(`Cloudflare: /${x.entry.name}${x.entry.dir ? '/' : ''} is not covered by _redirects (${x.failing.join(', ')})`);
  if (!res.noindex) errors.push('No _headers in the web root — the staging site can be indexed by search engines.');
  else {
    if (!res.noindex.pagesDev) errors.push('_headers has no X-Robots-Tag noindex for https://:project.pages.dev/*');
    if (!res.noindex.pagesDevVersioned) errors.push('_headers has no X-Robots-Tag noindex for https://:version.:project.pages.dev/* (deployment preview URLs)');
  }
}
const warnings = [];
if (res.noindex?.global) warnings.push('_headers applies noindex to "/*" (all hosts). Safe only while production is NOT on Cloudflare; prefer the *.pages.dev patterns.');

if (args.json) { console.log(JSON.stringify({ webRoot, staging: stagingOn, apache: apacheOn, private: res.entries.map((e) => e.name + (e.dir ? '/' : '')), errors, warnings, suggest: { redirects: res.missingRedirects, htaccess: htaccessLines(res.missingHtaccess) } }, null, 2)); process.exit(errors.length ? 1 : 0); }

console.log(c.bold('check-protection.mjs') + c.dim(` — web root ${path.relative(ROOT, webRoot) || '.'}`));
console.log(c.dim(`  private entries: ${res.entries.map((e) => e.name + (e.dir ? '/' : '')).join(', ') || 'none'}`));
console.log(`  Hostinger (.htaccess): ${apacheOn ? (res.hostinger.every((x) => x.ok) && res.files.htaccess ? c.green('all blocked') : c.red('gaps')) : c.dim('not checked (production host is not Apache)')}`);
console.log(`  Cloudflare (_redirects): ${stagingOn ? (res.files.redirects && res.cloudflare.every((x) => x.ok) ? c.green('all blocked') : c.red('gaps')) : c.dim('not checked (no staging)')}`);
console.log(`  Staging noindex (_headers): ${stagingOn ? (res.noindex?.pagesDev && res.noindex?.pagesDevVersioned ? c.green('*.pages.dev noindexed') : c.red('missing')) : c.dim('not checked')}`);
for (const e of errors) console.log(c.red(`ERROR ${e}`));
for (const w of warnings) console.log(c.yellow(`WARN  ${w}`));
if (res.missingRedirects.length && res.files.redirects !== undefined) console.log(c.dim(`\nAdd to _redirects:\n  ${res.missingRedirects.join('\n  ')}`));
if (res.missingHtaccess.length) console.log(c.dim(`\nAdd to .htaccess (near the top):\n  ${htaccessLines(res.missingHtaccess).join('\n  ')}`));
if (stagingOn && (!res.noindex?.pagesDev || !res.noindex?.pagesDevVersioned)) console.log(c.dim(`\n_headers should contain:\n${STAGING_HEADERS.replace(/^/gm, '  ')}`));
console.log(c.dim('\nThis is a static check of the rules. Confirm on the hosts: staging-check.mjs <staging-url> (Cloudflare) and, after each Hostinger Redeploy, the production probe in references/deployment.md.'));
console.log(errors.length ? c.red(`✖ ${errors.length} protection problem(s)`) : c.green('✔ development files protected on both hosts; staging noindexed'));
process.exit(errors.length ? 1 : 0);

async function astroMode() {
  const target = String(args.production || cfg?.deploy?.production?.host || 'hostinger').toLowerCase();
  const stagingOn = !args['no-staging'] && (cfg ? !!cfg.deploy?.staging : true);
  const apacheOn = !args['no-apache'] && /hostinger|apache|litespeed|cpanel|siteground/.test(target);
  const r = auditDist(project.webRoot, { staging: stagingOn, apache: apacheOn });
  const errors = [...r.errors];
  const warnings = [...r.warnings];
  // Repository hygiene: build output and secrets are never committed
  for (const p of [project.outDir, 'node_modules', '.astro']) { const t = gitTracked(ROOT, p); if (t.length) errors.push(`${p}/ is committed (${t.length} file(s)) — remove it from git (git rm -r --cached ${p}) and keep it in .gitignore`); }
  const envTracked = gitTracked(ROOT, '.env*').filter((f) => !/\.example$/.test(f));
  if (envTracked.length) errors.push(`Environment file committed: ${envTracked.join(', ')} — rotate those secrets, remove the file, use GitHub Actions secrets`);
  const gi = (() => { try { return fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'); } catch { return ''; } })();
  for (const need of [project.outDir, 'node_modules', '.env']) if (!new RegExp(`^/?${need.replace('.', '\\.')}/?\\*?$`, 'm').test(gi)) errors.push(`.gitignore does not list ${need}/ — add it so build output / dependencies / secrets can't be committed`);
  if (!fs.existsSync(path.join(ROOT, 'package-lock.json'))) errors.push('No package-lock.json — run npm install and commit the lockfile: the quality/deploy workflows use npm ci, and staging and production must install identical versions');
  else if (!gitTracked(ROOT, 'package-lock.json').length && fs.existsSync(path.join(ROOT, '.git'))) warnings.push('package-lock.json is not committed yet — commit it so Cloudflare and GitHub Actions install identical versions');
  // Production deployment workflows
  const wf = auditWorkflows(ROOT, { project: 'astro' });
  for (const w of wf) { for (const e of w.errors) errors.push(`${w.file}: ${e}`); for (const x of w.warnings) warnings.push(`${w.file}: ${x}`); }
  const deployers = wf.filter((w) => w.deploys);
  if (target === 'wpengine') warnings.push('WP Engine ignores .htaccess: add the site.config.json redirects in the WP Engine User Portal (deploy-settings.mjs --host wpengine lists them), and verify on a WP Engine staging/development environment first.');

  if (args.json) { console.log(JSON.stringify({ project: 'astro', webRoot: path.relative(ROOT, project.webRoot), production: target, staging: stagingOn, apache: apacheOn, errors, warnings, workflows: wf }, null, 2)); process.exit(errors.length ? 1 : 0); }
  console.log(c.bold('check-protection.mjs') + c.dim(` — Astro project, published folder ${project.outDir}/ · production: ${target}`));
  console.log(`  Build output (${project.outDir}/): ${r.built ? (r.errors.length ? c.red('problems') : c.green('only public files')) : c.red('not built')}`);
  console.log(`  Apache/Hostinger rules (.htaccess): ${apacheOn ? (r.errors.some((e) => /\.htaccess/.test(e)) ? c.red('gaps') : c.green('ok — dotfiles hidden, /_astro/ served')) : c.dim('not checked (production is not Apache)')}`);
  console.log(`  Staging noindex (_headers): ${stagingOn ? (r.noindex?.pagesDev && r.noindex?.pagesDevVersioned ? c.green('*.pages.dev noindexed') : c.red('missing')) : c.dim('not checked (no staging)')}`);
  console.log(`  Deploy workflows: ${deployers.length ? deployers.map((w) => `${w.file} (${w.manualOnly ? 'manual' : 'AUTOMATIC'})`).join(', ') : c.dim('none')}`);
  for (const e of errors) console.log(c.red(`ERROR ${e}`));
  for (const w of warnings) console.log(c.yellow(`WARN  ${w}`));
  if (stagingOn && !(r.noindex?.pagesDev && r.noindex?.pagesDevVersioned) && r.built) console.log(c.dim(`\npublic/_headers should contain:\n${STAGING_HEADERS.replace(/^/gm, '  ')}`));
  console.log(c.dim('\nStatic check of the build and rules. Confirm live: cloudflare-pages.mjs verify (staging) and the read-only probe in the Deploy production workflow (production).'));
  console.log(errors.length ? c.red(`✖ ${errors.length} protection problem(s)`) : c.green('✔ only build output is published; staging noindexed; deploys manual'));
  process.exit(errors.length ? 1 : 0);
}
