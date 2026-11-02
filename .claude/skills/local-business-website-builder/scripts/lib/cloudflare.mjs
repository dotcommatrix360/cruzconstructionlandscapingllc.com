// Cloudflare Pages API client with built-in guardrails. Zero dependencies; Node 18+ (22.21+ behind an HTTPS proxy).
//
// Auth: CLOUDFLARE_API_TOKEN (Bearer) if set; otherwise the request goes out unauthenticated and an
// authenticating egress proxy (e.g. Claude Code cloud sessions) may inject credentials.
// Account: CLOUDFLARE_ACCOUNT_ID, --account, or the only account the token can see.
// API base: CLOUDFLARE_API_BASE (selftest points this at a local mock).
//
// Guardrails (enforced here, not just documented): the client can only make the requests in ALLOWED.
// No DELETE of anything, no custom domains, no DNS/zones, no Workers, no direct uploads, no env vars or secrets.
import { spawnSync } from 'node:child_process';

export const API_BASE = (process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');

const ACC = '/accounts/[^/]+';
const PROJ = `${ACC}/pages/projects/[^/]+`;
const ALLOWED = [
  ['GET', /^\/user\/tokens\/verify$/],
  ['GET', /^\/accounts$/],
  ['GET', new RegExp(`^${ACC}/pages/projects$`)],
  ['GET', new RegExp(`^${PROJ}$`)],
  ['GET', new RegExp(`^${PROJ}/deployments$`)],
  ['GET', new RegExp(`^${PROJ}/deployments/[^/]+$`)],
  ['GET', new RegExp(`^${PROJ}/deployments/[^/]+/history/logs$`)],
  ['GET', new RegExp(`^${PROJ}/domains$`)], // read-only: report which hosts a project serves
  ['POST', new RegExp(`^${ACC}/pages/projects$`)], // create a staging project (caller checks it doesn't exist)
  ['PATCH', new RegExp(`^${PROJ}$`)], // build settings + git branch settings only (see patchProject)
  ['POST', new RegExp(`^${PROJ}/deployments/[^/]+/retry$`)], // re-run a staging build from the same commit
];

export class GuardrailError extends Error {}
export class ApiError extends Error {
  constructor(msg, { status, errors, path } = {}) { super(msg); this.status = status; this.errors = errors || []; this.path = path; }
}

export function assertAllowed(method, apiPath) {
  const p = apiPath.split('?')[0];
  if (!ALLOWED.some(([m, re]) => m === method && re.test(p))) {
    throw new GuardrailError(`Blocked by skill guardrail: ${method} ${p}. Deleting projects, custom domains, DNS and production changes need the owner's explicit approval and are done by the owner in the dashboard.`);
  }
}

// Fields a PATCH may change. Anything else (domains, env vars, secrets, compatibility flags, bindings…) is refused.
const PATCH_FIELDS = {
  top: ['build_config', 'source', 'production_branch'],
  build_config: ['build_command', 'destination_dir', 'root_dir'],
  source: ['config'],
  'source.config': ['production_branch', 'deployments_enabled', 'production_deployments_enabled', 'preview_deployment_setting', 'preview_branch_includes', 'preview_branch_excludes', 'pr_comments_enabled'],
};
export function assertPatchBody(body) {
  const bad = [];
  for (const k of Object.keys(body)) if (!PATCH_FIELDS.top.includes(k)) bad.push(k);
  for (const k of Object.keys(body.build_config || {})) if (!PATCH_FIELDS.build_config.includes(k)) bad.push(`build_config.${k}`);
  for (const k of Object.keys(body.source || {})) if (!PATCH_FIELDS.source.includes(k)) bad.push(`source.${k}`);
  for (const k of Object.keys(body.source?.config || {})) if (!PATCH_FIELDS['source.config'].includes(k)) bad.push(`source.config.${k}`);
  if (bad.length) throw new GuardrailError(`Blocked by skill guardrail: PATCH may only change staging build/branch settings, not ${bad.join(', ')}`);
}

/** Node's built-in fetch ignores HTTPS_PROXY. Re-run this script once with NODE_USE_ENV_PROXY=1 (Node >= 22.21). */
export function ensureProxyEnv() {
  const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxied || process.env.NODE_USE_ENV_PROXY || process.env.LBWB_NO_REEXEC) return;
  const r = spawnSync(process.execPath, [...process.execArgv, '--no-warnings', ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', LBWB_NO_REEXEC: '1' },
  });
  process.exit(r.status ?? 1);
}

export function createClient({ accountId = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN, base = API_BASE } = {}) {
  let account = accountId || null;

  async function request(method, apiPath, body) {
    assertAllowed(method, apiPath);
    if (method === 'PATCH') assertPatchBody(body || {});
    const headers = { 'content-type': 'application/json', 'user-agent': 'local-business-website-builder' };
    if (token) headers.authorization = `Bearer ${token}`;
    let res;
    try { res = await fetch(base + apiPath, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) {
      const code = e.cause?.code || e.message;
      const hint = code === 'ENOTFOUND' && (process.env.HTTPS_PROXY || process.env.https_proxy) ? ' (behind a proxy: needs Node >= 22.21 with NODE_USE_ENV_PROXY=1)' : '';
      throw new ApiError(`Cannot reach the Cloudflare API: ${code}${hint}`, { status: 0, path: apiPath });
    }
    let json;
    try { json = await res.json(); } catch { json = { success: false, errors: [{ code: res.status, message: `Non-JSON response (HTTP ${res.status})` }] }; }
    if (!res.ok || json.success === false) {
      const errs = json.errors || [];
      throw new ApiError(`${method} ${apiPath.split('?')[0]} → HTTP ${res.status}: ${errs.map((x) => `[${x.code}] ${x.message}`).join('; ') || 'request failed'}`, { status: res.status, errors: errs, path: apiPath });
    }
    return json;
  }

  async function accountId_() {
    if (account) return account;
    const { result } = await request('GET', '/accounts');
    if (!result?.length) throw new ApiError('The API token cannot see any Cloudflare account (needs Account → Cloudflare Pages permission).');
    if (result.length > 1) throw new ApiError(`The token can see ${result.length} accounts — pass --account <id> or set CLOUDFLARE_ACCOUNT_ID: ${result.map((a) => `${a.id} (${a.name})`).join(', ')}`);
    account = result[0].id;
    return account;
  }
  const acc = async () => `/accounts/${await accountId_()}`;
  const enc = encodeURIComponent;

  return {
    request,
    accountId: accountId_,
    verifyToken: () => request('GET', '/user/tokens/verify').then((j) => j.result),
    accounts: () => request('GET', '/accounts').then((j) => j.result),
    async listProjects() {
      const out = [];
      for (let page = 1; page < 50; page++) {
        const j = await request('GET', `${await acc()}/pages/projects?page=${page}&per_page=10`);
        out.push(...(j.result || []));
        const info = j.result_info;
        if (!info || !j.result?.length || (info.total_pages ? page >= info.total_pages : j.result.length < 10)) break;
      }
      return out;
    },
    async getProject(name) {
      try { return (await request('GET', `${await acc()}/pages/projects/${enc(name)}`)).result; }
      catch (e) { if (e.status === 404) return null; throw e; }
    },
    createProject: async (body) => (await request('POST', `${await acc()}/pages/projects`, body)).result,
    patchProject: async (name, body) => (await request('PATCH', `${await acc()}/pages/projects/${enc(name)}`, body)).result,
    listDeployments: async (name, perPage = 10) => (await request('GET', `${await acc()}/pages/projects/${enc(name)}/deployments?per_page=${perPage}&sort_by=created_on&sort_order=desc`)).result || [],
    getDeployment: async (name, id) => (await request('GET', `${await acc()}/pages/projects/${enc(name)}/deployments/${enc(id)}`)).result,
    getLogs: async (name, id) => (await request('GET', `${await acc()}/pages/projects/${enc(name)}/deployments/${enc(id)}/history/logs`)).result,
    listDomains: async (name) => (await request('GET', `${await acc()}/pages/projects/${enc(name)}/domains`)).result || [],
    retryDeployment: async (name, id) => (await request('POST', `${await acc()}/pages/projects/${enc(name)}/deployments/${enc(id)}/retry`)).result,
  };
}

/** owner/repo from a git remote URL (https, ssh, or local git proxies ending in /owner/repo). */
export function parseGitRemote(url) {
  const m = String(url || '').trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** Cloudflare Pages project names: lowercase a-z 0-9 and dashes, max 58 chars, no leading/trailing dash. */
export function projectNameFrom(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 58).replace(/-$/, '');
}

/** Recommended staging project body for a GitHub-connected Pages project. */
export function stagingProjectBody({ name, owner, repo, buildCommand, outputDir, rootDir = '' }) {
  return {
    name,
    production_branch: 'main',
    build_config: { build_command: buildCommand, destination_dir: outputDir, root_dir: rootDir },
    source: {
      type: 'github',
      config: {
        owner, repo_name: repo, production_branch: 'main',
        deployments_enabled: true, production_deployments_enabled: true,
        preview_deployment_setting: 'none', pr_comments_enabled: false,
      },
    },
  };
}

/** Normalise Cloudflare's "/" vs "." vs "" output-directory spellings. */
export const normDir = (d) => { const x = String(d ?? '').trim().replace(/^\.?\/+|\/+$/g, ''); return x === '' || x === '.' ? '.' : x; };

/** Compare a live project with the recommended staging settings → list of { field, current, wanted }. */
export function settingsDiff(project, want) {
  const out = [];
  const cur = project.build_config || {};
  const src = project.source?.config || {};
  const cmp = (field, current, wanted, eq = (a, b) => a === b) => { if (!eq(current, wanted)) out.push({ field, current, wanted }); };
  cmp('production_branch', project.production_branch, 'main');
  cmp('build_config.build_command', cur.build_command || '', want.buildCommand);
  cmp('build_config.destination_dir', cur.destination_dir ?? '', want.outputDir, (a, b) => normDir(a) === normDir(b));
  cmp('build_config.root_dir', cur.root_dir || '', want.rootDir || '', (a, b) => normDir(a) === normDir(b));
  if (project.source?.type === 'github') {
    cmp('source.config.production_branch', src.production_branch, 'main');
    cmp('source.config.production_deployments_enabled', src.production_deployments_enabled !== false, true);
    cmp('source.config.deployments_enabled', src.deployments_enabled !== false, true);
    cmp('source.config.preview_deployment_setting', src.preview_deployment_setting || 'all', 'none');
  }
  return out;
}

// Known build-log / API failure patterns → plain-language cause and fix.
export const DIAGNOSES = [
  { re: /Output directory "([^"]*)" not found|Failed: build output directory not found|no such file or directory.*(dist|_site|public|out|build)/i, cause: 'The build output directory does not exist after the build.', fix: 'Run deploy-settings.mjs. Astro sites: build command "npm run build", output "dist". Legacy committed static sites: "exit 0" and "/" (or the subfolder Hostinger serves). Fix with: cloudflare-pages.mjs configure --yes' },
  { re: /InvalidContentEntryDataError|does not match collection schema|\[content\].*(invalid|error)/i, cause: 'A content file (src/content/…) fails its collection schema — e.g. description length, missing imageAlt, fewer than 3 localDetails.', fix: 'Run npm run build locally, fix the named file\'s front matter, commit, push.' },
  { re: /Redirect map in site\.config\.json has/i, cause: 'The redirect map is unsafe (chain, loop, missing target, or redirecting a page that still exists).', fix: 'Fix site.config.json → redirects as listed in the log; npm run build locally; commit.' },
  { re: /Failed: build command exited with code: (\d+)|Command failed with exit code (\d+)|npm ERR!|ERR_PNPM|error Command failed/i, cause: 'The build command failed.', fix: 'Reproduce locally with the same command. Committed static sites should not build on Cloudflare at all: build command "exit 0".' },
  { re: /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i, cause: 'A dependency or file needed by the build is missing in the Cloudflare build image.', fix: 'Commit the lockfile, pin devDependencies, or avoid building on Cloudflare (exit 0) when the output is committed.' },
  { re: /node(js)?[ -]version|engine "node" is incompatible|Unsupported engine|requires node/i, cause: 'Node version mismatch in the Cloudflare build image.', fix: 'Add a .node-version file (Astro 7 needs 22.22.0 or newer; the Astro starter ships one). The owner may also set NODE_VERSION in the dashboard.' },
  { re: /Failed: an internal error occurred|internal error/i, cause: 'Cloudflare internal error (transient).', fix: 'Retry: cloudflare-pages.mjs retry --yes' },
  { re: /Failed to publish your Function|Error[^\n]*_worker\.js|Error compiling (Pages )?Functions/i, cause: 'A functions/ folder or _worker.js was found and failed to compile.', fix: 'Static sites should not have functions/ or _worker.js at the output root; remove or rename them.' },
  { re: /Invalid _redirects|_redirects.*(invalid|error|line \d+)/i, cause: '_redirects has invalid lines (Cloudflare skips them, which can expose dev files).', fix: 'Fix the reported line(s); run check-protection.mjs.' },
  { re: /Invalid _headers|_headers.*(invalid|error)/i, cause: '_headers has invalid rules (noindex may not apply).', fix: 'Fix the reported rule(s); run check-protection.mjs.' },
  { re: /exceeds? .*(25 ?MiB|25 MB)|file size limit|too large/i, cause: 'A file over 25 MiB is in the output (Pages limit).', fix: 'Remove or compress the file (videos → external host), or exclude it from the web root.' },
  { re: /exceeds? .*20,?000 files|too many files/i, cause: 'Over 20,000 files in the output (Pages limit).', fix: 'Exclude node_modules/large folders from the output directory.' },
  { re: /repository (could not be found|not found|access)|GitHub App|installation|not authorized to access the repository/i, cause: 'Cloudflare cannot access the GitHub repository.', fix: 'Owner: GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure → give it access to this repo. Then re-run create.' },
  { re: /already exists|project name.*taken/i, cause: 'A Pages project with this name already exists (in this or another account — pages.dev names are global).', fix: 'Run detect; reuse the existing project, or choose another --name.' },
  { re: /Authentication error|\[(10000|9109)\]|HTTP 40[13]\b/i, cause: 'The API token is missing a permission.', fix: 'Token needs Account → Cloudflare Pages → Edit (read-only commands need Read).' },
];
export function diagnose(text) {
  const t = String(text || '');
  return DIAGNOSES.filter((d) => d.re.test(t)).map(({ cause, fix }) => ({ cause, fix }));
}
