#!/usr/bin/env node
// deploy-settings.mjs — inspect THIS repo and recommend hosting settings. Read-only: changes nothing, needs no
// credentials or network.
//   Astro (agency standard): Cloudflare Pages staging builds main (npm run build → dist); production is the manual
//     "Deploy production" GitHub Actions workflow. --host prints what that host needs and what it can't do.
//   Legacy static: Cloudflare publishes the committed web root (exit 0); Hostinger Redeploy by the owner.
// Usage: node deploy-settings.mjs [--host hostinger|wpengine|cloudflare-pages] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, readJSON, loadConfig, c } from './lib/util.mjs';
import { auditProtection, auditDist, deploysSomething } from './lib/protect.mjs';
import { detectProject } from './lib/project.mjs';
import { auditWorkflows } from './lib/deploy.mjs';

const args = parseArgs();
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const cfg = loadConfig();
const pkg = readJSON(path.join(ROOT, 'package.json'), null);
const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
const notes = [];
const warnings = [];
const project = detectProject();
if (project.type === 'astro') astroSettings();

// Site generators whose output is NOT committed and must be built on Cloudflare.
const frameworks = [
  { name: 'Astro', test: () => deps.astro, cmd: 'npm run build', out: 'dist', static: 'public' },
  { name: 'Eleventy', test: () => deps['@11ty/eleventy'], cmd: pkg?.scripts?.build ? 'npm run build' : 'npx @11ty/eleventy', out: '_site', static: '(passthrough copy)' },
  { name: 'Next.js static export', test: () => deps.next, cmd: 'npm run build', out: 'out', static: 'public' },
  { name: 'Gatsby', test: () => deps.gatsby, cmd: 'npm run build', out: 'public', static: 'static' },
  { name: 'Vite', test: () => deps.vite, cmd: 'npm run build', out: 'dist', static: 'public' },
  { name: 'Create React App', test: () => deps['react-scripts'], cmd: 'npm run build', out: 'build', static: 'public' },
  { name: 'Hugo', test: () => exists('hugo.toml') || exists('hugo.yaml') || (exists('config.toml') && exists('content') && exists('layouts')), cmd: 'hugo', out: 'public', static: 'static' },
  { name: 'Jekyll', test: () => exists('_config.yml') && exists('Gemfile'), cmd: 'jekyll build', out: '_site', static: '(site root)' },
];
const candidates = ['.', 'public_html', 'public', 'site', 'www', 'docs'];
const committedRoot = candidates.find((d) => exists(path.join(d, 'index.html')));
const fw = frameworks.find((f) => f.test());

let rec;
if (committedRoot && !(fw && !exists(path.join(fw.out, 'index.html')) && committedRoot !== '.')) {
  // The built site is committed (Hostinger serves it as-is) → Cloudflare must publish the same files untouched.
  rec = { type: `Committed static site in ${committedRoot === '.' ? 'repo root' : committedRoot + '/'}`, buildCommand: 'exit 0', outputDir: committedRoot === '.' ? '/' : committedRoot, webRoot: committedRoot };
  if (pkg?.scripts?.build) notes.push(`package.json has a build script ("${pkg.scripts.build}"). Its output is committed, so Cloudflare should NOT rebuild — staging must show exactly what's in main.`);
} else if (fw) {
  rec = { type: `${fw.name} (built on Cloudflare)`, buildCommand: fw.cmd, outputDir: fw.out, webRoot: null };
  notes.push(`Put _headers and _redirects in the framework's static folder (${fw.static}) so they land in ${fw.out}/. Confirm any custom outDir in the framework config.`);
  notes.push('Production must serve the identical build — confirm how Hostinger receives it before relying on staging.');
} else {
  rec = { type: 'Unknown', buildCommand: '(undetermined)', outputDir: '(undetermined)', webRoot: null };
  warnings.push('No index.html in common locations and no known framework. Inspect the repo and ask before configuring.');
}

// Protection summary for the web root both hosts serve
let protection = null;
if (rec.webRoot) {
  const wr = path.join(ROOT, rec.webRoot);
  const r = auditProtection(wr, { extra: cfg?.deploy?.private || [], allowPublic: cfg?.deploy?.public || [] });
  protection = {
    hostinger: r.files.htaccess && r.hostinger.every((x) => x.ok) ? 'ok' : 'gaps',
    cloudflare: r.files.redirects && r.cloudflare.every((x) => x.ok) ? 'ok' : 'gaps',
    noindex: r.noindex?.pagesDev && r.noindex?.pagesDevVersioned ? 'ok' : 'missing',
  };
  if (Object.values(protection).some((v) => v !== 'ok')) warnings.push('Development files are not protected on both hosts and/or staging is not noindexed — run check-protection.mjs for the exact lines to add.');
  if (!exists(path.join(rec.webRoot, '404.html'))) warnings.push(`No ${rec.webRoot === '.' ? '' : rec.webRoot + '/'}404.html — Cloudflare Pages would answer every missing URL with the homepage (HTTP 200).`);
}
if (exists('wrangler.toml')) notes.push('wrangler.toml present — check it does not set another output dir or deploy target. Never run wrangler deploy.');
if (exists('.github/workflows')) {
  for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((x) => /\.ya?ml$/.test(x))) {
    if (deploysSomething(fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'))) warnings.push(`.github/workflows/${f} appears to deploy — production must only deploy via the owner's manual Hostinger Redeploy.`);
  }
}

const result = {
  cloudflarePages: { productionBranch: 'main', frameworkPreset: fw && !rec.webRoot ? fw.name : 'None', buildCommand: rec.buildCommand, buildOutputDirectory: rec.outputDir, rootDirectory: '(blank — repo root)' },
  production: { host: cfg?.deploy?.production?.host || 'hostinger', serves: rec.webRoot ? (rec.webRoot === '.' ? 'repo root' : rec.webRoot + '/') : '(confirm)', autoDeploy: 'OFF — owner clicks Redeploy after approving staging' },
  detected: rec.type, protection, notes, warnings,
};
{
  if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
  const cp = result.cloudflarePages;
  console.log(c.bold('deploy-settings.mjs') + c.dim(` — ${rec.type}`));
  console.log(c.bold('\nCloudflare Pages (staging) — the owner enters these in the dashboard:'));
  console.log(`  Production branch     ${cp.productionBranch}`);
  console.log(`  Framework preset      ${cp.frameworkPreset}`);
  console.log(`  Build command         ${cp.buildCommand}`);
  console.log(`  Build output dir      ${cp.buildOutputDirectory}`);
  console.log(`  Root directory        ${cp.rootDirectory}`);
  console.log(c.bold('\nProduction (Hostinger):'));
  console.log(`  Serves                ${result.production.serves} from main`);
  console.log('  Auto deployment       OFF (manual Redeploy after staging approval)');
  if (protection) console.log(`\nProtection: Hostinger .htaccess ${protection.hostinger} · Cloudflare _redirects ${protection.cloudflare} · staging noindex ${protection.noindex}`);
  for (const n of notes) console.log(c.dim(`  note: ${n}`));
  for (const w of warnings) console.log(c.yellow(`  warn: ${w}`));
}

function astroSettings() {
  const host = String(args.host || cfg?.deploy?.production?.host || 'hostinger').toLowerCase();
  const nodeVersion = (() => { try { return fs.readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim(); } catch { return ''; } })();
  if (!nodeVersion) warnings.push('No .node-version — Cloudflare Pages may build with an older Node than Astro needs (add .node-version with 22.22.0 or newer).');
  if (!pkg?.scripts?.build) warnings.push('package.json has no "build" script — add "build": "astro build".');
  const built = fs.existsSync(path.join(project.webRoot, 'index.html'));
  let protection = null;
  if (built) {
    const r = auditDist(project.webRoot, { staging: !!cfg?.deploy?.staging, apache: /hostinger|apache|litespeed|cpanel|siteground/.test(host) });
    protection = { hostinger: r.errors.some((e) => /htaccess|_astro/.test(e)) ? 'gaps' : 'ok', cloudflare: r.errors.some((e) => /must not be published|dotfile|source/.test(e)) ? 'gaps' : 'ok', noindex: r.noindex?.pagesDev && r.noindex?.pagesDevVersioned ? 'ok' : 'missing' };
    if (r.errors.length) warnings.push(`Build output has ${r.errors.length} protection problem(s) — run check-protection.mjs.`);
  } else notes.push(`No ${project.outDir}/ yet — run npm run build for the protection summary.`);
  const wf = auditWorkflows(ROOT, { project: 'astro' });
  const deployer = wf.find((w) => w.deploys);
  if (!deployer) warnings.push('No production deploy workflow — copy .github/workflows/deploy-production.yml from the Astro starter.');
  for (const w of wf) for (const e of w.errors) warnings.push(`${w.file}: ${e}`);

  const hosts = {
    hostinger: {
      method: 'Deploy production workflow → SSH (rsync) → public_html, after a tar backup of the current site',
      needs: ['SSH access on the Hostinger plan — confirm in hPanel → Advanced → SSH Access (entry-level plans may not include it)', 'hPanel → Advanced → SSH Access: enable, note host, port (65002) and user; add the deploy public key', 'Secrets: HOSTINGER_SSH_HOST, HOSTINGER_SSH_PORT, HOSTINGER_SSH_USER, HOSTINGER_SSH_KEY, HOSTINGER_KNOWN_HOSTS; variable HOSTINGER_PATH (…/public_html)', 'Turn OFF any Hostinger Git auto-deployment for this site (the workflow replaces it)'],
      limits: ['Without SSH on the plan the workflow cannot deploy — report it; do not fall back to committing dist/ or FTP passwords in the repo', '.htaccess (from public/.htaccess) handles HTTPS, 404s, headers and the site.config.json redirects'],
    },
    wpengine: {
      method: 'Deploy production workflow → WP Engine SSH Gateway (rsync) into sites/<install>/, after a tar backup; never deletes WordPress files',
      needs: ['WP Engine User Portal → SSH Gateway: add the deploy public key', 'Secrets: WPENGINE_SSH_KEY, WPENGINE_KNOWN_HOSTS; variables WPENGINE_INSTALL, WPENGINE_ALLOW_ROOT=true only after approval', 'Verify on the install\'s STAGING/DEVELOPMENT environment first (set WPENGINE_INSTALL to that environment)', 'A WP Engine backup point before the first production upload'],
      limits: ['WP Engine is a managed WordPress host (Nginx): .htaccess is ignored — add every redirect below in User Portal → Redirect rules', 'WordPress\'s index.php can keep answering "/" — the workflow\'s verify step fails if the homepage is not the Astro build; removing WordPress is the owner\'s/WP Engine support\'s decision', 'Custom headers (security, caching) need WP Engine support/portal settings', 'Consider whether a static site belongs on WP Engine at all (Cloudflare Pages or Hostinger are simpler)'],
    },
    'cloudflare-pages': {
      method: 'Deploy production workflow → wrangler pages deploy dist to a SEPARATE production Pages project (direct upload)',
      needs: ['A production Pages project different from the staging project', 'A production API token scoped to Cloudflare Pages:Edit (separate from any staging token)', 'Secrets: CLOUDFLARE_PRODUCTION_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; variables CLOUDFLARE_PRODUCTION_PROJECT, CLOUDFLARE_STAGING_PROJECT', 'Custom domain attached to the production project by the owner (domain change = owner approval)'],
      limits: ['_headers noindex only matches *.pages.dev, so the production custom domain stays indexable', 'Never point the production domain at the staging project'],
    },
  };
  const h = hosts[host] || { method: '(unknown host — inspect and ask)', needs: [], limits: [`Unknown production host "${host}". Supported: hostinger, wpengine, cloudflare-pages.`] };
  const redirects = (cfg?.redirects || []).filter((r) => r?.from && r?.to);
  const result = {
    project: 'astro',
    cloudflarePages: { productionBranch: 'main', frameworkPreset: 'Astro', buildCommand: 'npm run build', buildOutputDirectory: project.outDir, rootDirectory: '(blank — repo root)', nodeVersion: nodeVersion || '(add .node-version)', previewDeployments: 'off' },
    production: { host, method: h.method, needs: h.needs, limits: h.limits, workflow: deployer?.file || null, manualOnly: deployer ? deployer.manualOnly : null, redirects: host === 'wpengine' ? redirects : undefined },
    detected: `Astro (${project.astroVersion || 'version ?'})`, protection, notes, warnings,
  };
  if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
  const cp = result.cloudflarePages;
  console.log(c.bold('deploy-settings.mjs') + c.dim(` — ${result.detected}`));
  console.log(c.bold('\nCloudflare Pages (staging, automatic from main):'));
  for (const [k, v] of [['Production branch', cp.productionBranch], ['Framework preset', cp.frameworkPreset], ['Build command', cp.buildCommand], ['Build output dir', cp.buildOutputDirectory], ['Root directory', cp.rootDirectory], ['Node version', cp.nodeVersion], ['Preview deployments', cp.previewDeployments]]) console.log(`  ${k.padEnd(21)} ${v}`);
  console.log(c.bold(`\nProduction (${host}) — manual, owner-approved:`));
  console.log(`  ${h.method}`);
  console.log(`  Workflow: ${deployer ? `${deployer.file} (${deployer.manualOnly ? 'manual only' : c.red('RUNS AUTOMATICALLY')})` : c.yellow('missing')}`);
  for (const n of h.needs) console.log(`  needs: ${n}`);
  for (const l of h.limits) console.log(c.yellow(`  limit: ${l}`));
  if (host === 'wpengine') { console.log(c.bold('\nRedirects to add in the WP Engine User Portal:')); for (const r of redirects) console.log(`  ${r.from} → ${r.to} (${r.status || 301})`); if (!redirects.length) console.log(c.dim('  (none in site.config.json)')); }
  if (protection) console.log(`\nProtection (dist/): Hostinger rules ${protection.hostinger} · published files ${protection.cloudflare} · staging noindex ${protection.noindex}`);
  for (const n of notes) console.log(c.dim(`  note: ${n}`));
  for (const w of warnings) console.log(c.yellow(`  warn: ${w}`));
  process.exit(0);
}
