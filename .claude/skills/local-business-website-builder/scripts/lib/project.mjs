// Project detection. Every script asks this first, so the same commands work on both kinds of repo:
//   astro   (agency standard since v2) — sources in src/, public/; `npm run build` → dist/ is what hosts serve.
//           Public-site checks inspect dist/. dist/ is never committed.
//   static  (legacy v1 repos) — committed HTML at the repo root (optionally built in place by build.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJSON } from './util.mjs';

const ASTRO_CONFIGS = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts', 'astro.config.cjs'];

export function detectProject(root = ROOT) {
  const pkg = readJSON(path.join(root, 'package.json'), null);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const configFile = ASTRO_CONFIGS.find((f) => fs.existsSync(path.join(root, f)));
  if (deps.astro || configFile) {
    let outDir = 'dist';
    if (configFile) {
      const m = /outDir\s*:\s*['"`]\.?\/?([^'"`]+?)\/?['"`]/.exec(fs.readFileSync(path.join(root, configFile), 'utf8'));
      if (m) outDir = m[1];
    }
    return {
      type: 'astro',
      root,
      configFile,
      outDir,
      webRoot: path.join(root, outDir),
      astroVersion: deps.astro || '',
      sourceDirs: ['src', 'public', 'integrations'].filter((d) => fs.existsSync(path.join(root, d))),
    };
  }
  return { type: 'static', root, webRoot: root, outDir: '.', sourceDirs: [] };
}

/** Newest modification time among Astro sources (src/, public/, integrations/, configs). */
export function newestSourceMtime(project) {
  let newest = 0;
  const visit = (p) => {
    let st;
    try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (e !== 'node_modules' && !e.startsWith('.astro')) visit(path.join(p, e)); }
    else if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  for (const d of project.sourceDirs) visit(path.join(project.root, d));
  for (const f of [project.configFile, 'site.config.json', 'package.json', 'tsconfig.json'].filter(Boolean)) visit(path.join(project.root, f));
  return newest;
}

/** dist/ freshness: missing | stale | fresh. Uses dist/index.html (written on every build). */
export function buildState(project) {
  const marker = path.join(project.webRoot, 'index.html');
  if (!fs.existsSync(marker)) return { state: 'missing' };
  const built = fs.statSync(marker).mtimeMs;
  const src = newestSourceMtime(project);
  return { state: src > built + 1000 ? 'stale' : 'fresh', built, src };
}

/** Run the project's build (npm run build). Returns { ok, output }. */
export function runBuild(project, { inherit = false } = {}) {
  const res = spawnSync('npm', ['run', 'build'], { cwd: project.root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', env: { ...process.env, FORCE_COLOR: '0' } });
  return { ok: res.status === 0, status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}

/** Files tracked by git under a path (used to catch committed build output). */
export function gitTracked(root, rel) {
  const res = spawnSync('git', ['ls-files', '--', rel], { cwd: root, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.split('\n').filter(Boolean) : [];
}
