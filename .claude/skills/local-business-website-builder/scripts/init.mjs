#!/usr/bin/env node
// init.mjs — scaffold a new client site. Never overwrites existing files.
// Agency standard (v2+): every NEW website is Astro (static output). The legacy static starter exists only to
// adopt pieces into existing hand-built HTML repos that are being maintained, not migrated.
// Usage:
//   node init.mjs [--dry-run]                     Astro starter (default) — then: npm install
//   node init.mjs --only src/components,src/lib   copy selected starter paths only
//   node init.mjs --legacy-static [--only …]      v1 HTML starter, for maintaining existing static repos only
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SKILL_DIR, parseArgs, readJSON, c } from './lib/util.mjs';
import { detectProject } from './lib/project.mjs';

const args = parseArgs();
const legacy = !!(args['legacy-static'] || args.static);
const STARTER = path.join(SKILL_DIR, 'templates', legacy ? 'static' : 'astro');
const only = args.only ? String(args.only).split(',').map((s) => s.replace(/\/+$/, '')) : null;
const created = [];
const skipped = [];
const existing = detectProject();

if (legacy) console.log(c.yellow('Legacy static starter: only for maintaining existing hand-built HTML sites. New websites must use Astro (run init.mjs without --legacy-static).'));
if (!legacy && existing.type === 'static' && fs.existsSync(path.join(ROOT, 'index.html')) && !only) {
  console.log(c.yellow('This repo already contains a hand-built HTML site. Scaffolding Astro on top of it would mix two site sources.'));
  console.log('Migrate deliberately instead: see references/migrations.md ("HTML → Astro"). To adopt single pieces use --only, or --legacy-static to maintain it as-is.');
  process.exit(1);
}

function copyTree(from, to, relBase = '') {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const relPath = path.posix.join(relBase, e.name);
    if (only && !only.some((o) => relPath === o || relPath.startsWith(o + '/') || o.startsWith(relPath + '/'))) continue;
    if (['node_modules', 'dist', '.astro'].includes(e.name)) continue;
    const src = path.join(from, e.name);
    const dest = path.join(to, e.name);
    if (e.isDirectory()) { copyTree(src, dest, relPath); continue; }
    if (relPath === 'package.json') continue; // merged below
    if (fs.existsSync(dest)) { skipped.push(relPath); continue; }
    if (!args['dry-run']) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    created.push(relPath);
  }
}
copyTree(STARTER, ROOT);

// .gitignore: an existing one is kept, but the rules that keep build output and secrets out of git are merged in
// (an old repo's .gitignore usually lacks dist/ and .astro/ — committing them breaks the one-source-of-truth rule).
if (!legacy && (!only || only.includes('.gitignore'))) {
  const gi = path.join(ROOT, '.gitignore');
  if (fs.existsSync(gi) && skipped.includes('.gitignore')) {
    const have = fs.readFileSync(gi, 'utf8');
    const need = ['dist/', '.astro/', 'node_modules/', '.env', '.env.*', '!.env.example'].filter((l) => !new RegExp(`^${l.replace(/[.*!]/g, '\\$&')}\\s*$`, 'm').test(have));
    if (need.length) {
      if (!args['dry-run']) fs.appendFileSync(gi, `\n# Added by init.mjs (agency standard): build output and secrets never go in git\n${need.join('\n')}\n`);
      created.push(`.gitignore (merged ${need.join(' ')})`);
    }
  }
}

// package.json: create from the starter, or merge missing scripts/dependencies without clobbering existing ones
const pkgFile = path.join(ROOT, 'package.json');
if (!only || only.includes('package.json')) {
  const S = '.claude/skills/local-business-website-builder/scripts';
  const starterPkg = legacy
    ? { private: true, scripts: { build: `node ${S}/build.mjs`, validate: `node ${S}/validate.mjs`, serve: `node ${S}/serve.mjs`, 'check:browser': `node ${S}/browser-check.mjs`, check: `node ${S}/build.mjs && node ${S}/validate.mjs` } }
    : readJSON(path.join(STARTER, 'package.json'));
  const pkg = readJSON(pkgFile, null);
  const name = path.basename(ROOT).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'client-website';
  let out;
  let added = 0;
  if (!pkg) { out = { ...starterPkg, name }; added = 1; }
  else {
    out = { ...pkg, private: true };
    for (const key of ['scripts', 'dependencies', 'devDependencies']) {
      out[key] = { ...(pkg[key] || {}) };
      for (const [k, v] of Object.entries(starterPkg[key] || {})) if (!out[key][k]) { out[key][k] = v; added++; }
    }
    if (!legacy) { if (!out.type) { out.type = 'module'; added++; } if (!out.engines) { out.engines = starterPkg.engines; added++; } }
  }
  if (added && !args['dry-run']) fs.writeFileSync(pkgFile, JSON.stringify(out, null, 2) + '\n');
  if (added) created.push(pkg ? `package.json (merged ${added} entr${added > 1 ? 'ies' : 'y'})` : 'package.json');
}

const skillInRepo = fs.existsSync(path.join(ROOT, '.claude', 'skills', 'local-business-website-builder', 'SKILL.md'));
console.log(c.bold(`init.mjs — ${legacy ? 'legacy static' : 'Astro'} starter ${args['dry-run'] ? '(dry run)' : ''}`));
for (const f of created) console.log(c.green(`  + ${f}`));
for (const f of skipped) console.log(c.dim(`  = ${f} (exists, kept)`));
if (legacy) console.log(`\nNext:\n  1. Fill site.config.json with real client data.\n  2. node .claude/skills/local-business-website-builder/scripts/build.mjs && …/validate.mjs`);
else console.log(`\nNext:
  1. npm install   (then commit package-lock.json — the workflows use npm ci)
  2. Fill site.config.json with real, client-confirmed data (url, business, nav, cta, integrations, deploy).
  3. Replace src/styles/tokens.css with the client's brand; replace every TODO and the placeholder photo.
  4. npm run dev   (develop)   →   npm run qa   (build + validate dist/ + protection)
  5. Staging: cloudflare-pages.mjs detect → create (framework Astro, npm run build, dist).
  6. Production: configure the "Deploy production" workflow secrets (references/deployment.md). The owner runs it.`);
if (!skillInRepo) console.log(c.yellow(`\nNote: the skill is not vendored in this repo yet. Run scripts/sync-skill.sh from the agency-website-skills repo (references/distribution.md) so package.json scripts, CI and cloud sessions work.`));
