#!/usr/bin/env node
// cloudflare-pages.mjs — set up, inspect and troubleshoot the Cloudflare Pages STAGING project for this repo.
// Uses the Cloudflare API (CLOUDFLARE_API_TOKEN, or credentials injected by the session's egress proxy).
//
//   doctor                 token, account and API access check (read-only)
//   detect                 find existing Pages projects for this repo/name before creating anything (read-only)
//   create   [--yes]       create a GitHub-connected staging project (main → staging). Dry run without --yes.
//                          Refuses if a project already exists for this repo or name.
//   configure [--yes]      align an existing project's staging build/branch settings. Dry run without --yes.
//   status   [--wait]      latest staging deployment, stages and commit vs local HEAD; --wait follows it to the end
//   logs     [id]          build log tail for a deployment + plain-language diagnosis
//   retry    [id] [--yes]  re-run a failed staging deployment (same commit)
//   verify   [--url u]     live staging: HTTPS, noindex on project + deployment hosts, security headers, domains,
//                          then staging-check.mjs and browser-check.mjs (if Playwright is available)
//
// Options: --name <project> (default: site.config.json deploy.staging.project → repo name) · --repo owner/name
//          --account <id> · --json · --timeout <s> (status --wait, default 900)
// Never: delete projects, add/remove custom domains, touch DNS, deploy to Hostinger, upload files directly.
// Those are blocked in lib/cloudflare.mjs and need the owner's explicit approval (done by the owner).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SKILL_DIR, parseArgs, loadConfig, readJSON, c } from './lib/util.mjs';
import { createClient, ensureProxyEnv, parseGitRemote, projectNameFrom, stagingProjectBody, settingsDiff, diagnose, normDir, ApiError, GuardrailError } from './lib/cloudflare.mjs';

ensureProxyEnv();
const args = parseArgs();
const cmd = args._[0] || 'help';
const S = path.join(SKILL_DIR, 'scripts');
const cfg = loadConfig();
const cf = createClient({ accountId: args.account && String(args.account) });
const out = { command: cmd };
const log = (...a) => { if (!args.json) console.log(...a); };
const finish = (code, extra = {}) => { if (args.json) console.log(JSON.stringify({ ...out, ...extra }, null, 2)); process.exit(code); };
const git = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; };
const node = (script, ...a) => spawnSync(process.execPath, [path.join(S, script), ...a], { cwd: ROOT, encoding: 'utf8', env: process.env });

function repoInfo() {
  if (args.repo) { const [owner, repo] = String(args.repo).split('/'); return { owner, repo }; }
  return parseGitRemote(git('remote', 'get-url', 'origin'));
}
function wantedName(repo) {
  return projectNameFrom(String(args.name || cfg?.deploy?.staging?.project || repo?.repo || path.basename(ROOT)));
}
function recommended() {
  const r = node('deploy-settings.mjs', '--json');
  let j; try { j = JSON.parse(r.stdout); } catch { throw new Error(`deploy-settings.mjs failed:\n${r.stdout}${r.stderr}`); }
  const cp = j.cloudflarePages;
  return { buildCommand: cp.buildCommand, outputDir: cp.buildOutputDirectory === '/' ? '.' : cp.buildOutputDirectory, rootDir: '', detected: j.detected, protection: j.protection, warnings: j.warnings };
}
const host = (p) => `https://${p.subdomain}`;
const sameRepo = (p, r) => p.source?.type === 'github' && r && p.source.config?.owner?.toLowerCase() === r.owner.toLowerCase() && p.source.config?.repo_name?.toLowerCase() === r.repo.toLowerCase();
const fmtStage = (d) => d ? `${d.latest_stage?.name}:${d.latest_stage?.status}` : '—';
const shortSha = (s) => (s || '').slice(0, 7);

async function detect() {
  const repo = repoInfo();
  const name = wantedName(repo);
  const projects = await cf.listProjects();
  const stagingHost = (() => { try { return new URL(cfg?.deploy?.staging?.url).host; } catch { return ''; } })();
  const matches = [];
  for (const p of projects) {
    const why = [];
    if (sameRepo(p, repo)) why.push('connected to this repo');
    if (p.name === name) why.push('same name');
    if (stagingHost && (p.subdomain === stagingHost || (p.domains || []).includes(stagingHost))) why.push('serves deploy.staging.url');
    if (why.length) matches.push({ name: p.name, url: host(p), why, repo: p.source?.type === 'github' ? `${p.source.config.owner}/${p.source.config.repo_name}` : (p.source?.type || 'direct upload'), productionBranch: p.production_branch, buildCommand: p.build_config?.build_command, outputDir: p.build_config?.destination_dir, latest: fmtStage(p.latest_deployment), domains: p.domains || [] });
  }
  const connected = matches.find((m) => m.why.includes('connected to this repo'));
  const state = connected ? 'exists' : matches.length ? 'conflict' : 'none';
  return { repo, name, total: projects.length, matches, state, project: connected || matches[0] || null };
}

async function requireProject() {
  const d = await detect();
  if (!d.project) { log(c.red(`No Cloudflare Pages project found for ${d.repo ? `${d.repo.owner}/${d.repo.repo}` : d.name}. Run: cloudflare-pages.mjs detect / create`)); finish(1, { detect: d }); }
  if (d.state === 'conflict' && !args.name) { log(c.yellow(`Project "${d.project.name}" matches by ${d.project.why.join(', ')} but is connected to ${d.project.repo}, not this repo. Pass --name to confirm.`)); finish(1, { detect: d }); }
  return d.project.name;
}

async function deploymentForCommit(name, sha) {
  const list = await cf.listDeployments(name, 15);
  const prod = list.filter((d) => d.environment === 'production');
  return { latest: prod[0] || list[0] || null, match: sha ? prod.find((d) => (d.deployment_trigger?.metadata?.commit_hash || '').startsWith(sha)) : null, list: prod };
}

async function showLogs(name, dep, lines = 60) {
  let text = '';
  try { const l = await cf.getLogs(name, dep.id); text = (l?.data || []).map((x) => x.line).join('\n'); }
  catch (e) { text = ''; log(c.yellow(`  (logs unavailable: ${e.message})`)); }
  const tail = text.split('\n').slice(-lines).join('\n');
  const dx = diagnose(text + '\n' + JSON.stringify(dep.latest_stage || {}));
  if (text) log(c.dim(tail.replace(/^/gm, '  │ ')));
  if (dx.length) { log(c.bold('Diagnosis:')); for (const d of dx) log(`  ${c.yellow('•')} ${d.cause}\n    ${c.dim('fix:')} ${d.fix}`); }
  else if (dep.latest_stage?.status === 'failure') log(c.yellow('  No known pattern matched. Read the log above; compare the build settings with deploy-settings.mjs.'));
  return { tail, diagnosis: dx };
}

async function fetchHead(url) {
  try { const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (cloudflare-pages verify; local-business-website-builder)' } }); r.body?.cancel?.().catch(() => {}); return r; }
  catch (e) { return { status: 0, error: e.message, cause: e.cause?.code || e.cause?.message || '', headers: new Headers() }; }
}

const commands = {
  async help() {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  },

  async doctor() {
    const t = await cf.verifyToken().catch((e) => ({ error: e.message }));
    log(t.error ? c.yellow(`token verify: ${t.error} (normal for account-scoped tokens; continuing)`) : `token: ${t.status}`);
    const accounts = await cf.accounts();
    log(`accounts: ${accounts.map((a) => `${a.name} (${a.id})`).join(', ') || 'none'}`);
    const projects = await cf.listProjects();
    log(`Pages read access: ok — ${projects.length} project(s): ${projects.map((p) => p.name).join(', ') || 'none'}`);
    log(c.dim('Write access (create/configure/retry) is only proven by a real write; a 403 there means the token needs Cloudflare Pages: Edit.'));
    Object.assign(out, { token: t, accounts: accounts.map((a) => ({ id: a.id, name: a.name })), projects: projects.map((p) => p.name) });
    finish(0);
  },

  async detect() {
    const d = await detect();
    Object.assign(out, d);
    log(c.bold(`detect — repo ${d.repo ? `${d.repo.owner}/${d.repo.repo}` : '(no git remote)'} · wanted name "${d.name}" · ${d.total} project(s) in account`));
    if (!d.matches.length) log(c.green('No existing Pages project for this repo or name → safe to create (cloudflare-pages.mjs create).'));
    for (const m of d.matches) log(`  ${m.why.includes('connected to this repo') ? c.green('✔') : c.yellow('!')} ${m.name}  ${m.url}  [${m.why.join(', ')}]\n     repo ${m.repo} · branch ${m.productionBranch} · build "${m.buildCommand}" → ${m.outputDir} · latest ${m.latest}`);
    if (d.state === 'exists') log(c.dim('Reuse it: cloudflare-pages.mjs configure (settings) / status (deployments). Do not create another.'));
    if (d.state === 'conflict') log(c.yellow('A project with this name exists but is not connected to this repo. Do not reuse or delete it — pick another --name, or ask the owner.'));
    finish(0);
  },

  async create() {
    const d = await detect();
    out.detect = d;
    if (d.state === 'exists') { log(c.green(`Already exists: ${d.project.name} (${d.project.url}) — connected to this repo. Not creating another. Use configure/status.`)); finish(0, { created: false }); }
    if (d.state === 'conflict') { log(c.red(`Name "${d.name}" is taken by a project for ${d.project.repo}. Pass a different --name.`)); finish(1, { created: false }); }
    if (!d.repo) { log(c.red('No GitHub remote (origin) found — pass --repo owner/name.')); finish(1); }
    const want = recommended();
    out.recommended = want;
    if (/undetermined/.test(want.buildCommand)) { log(c.red('deploy-settings.mjs could not determine the build settings. Inspect the repo first.')); finish(1); }
    if (want.protection && Object.values(want.protection).some((v) => v !== 'ok') && !args['allow-unprotected']) {
      log(c.red('Staging would expose development files or be indexable. Fix first: node check-protection.mjs (then commit), then re-run create.'));
      finish(1, { created: false, protection: want.protection });
    }
    const body = stagingProjectBody({ name: d.name, owner: d.repo.owner, repo: d.repo.repo, ...want });
    out.body = body;
    log(c.bold(`create — ${d.name} ← github ${d.repo.owner}/${d.repo.repo} (main)`));
    log(`  build command "${want.buildCommand}" · output "${want.outputDir}" · preview deployments off · ${want.detected}`);
    if (!args.yes) { log(c.dim('Dry run. Re-run with --yes to create the project.')); finish(0, { created: false, dryRun: true }); }
    let p;
    try { p = await cf.createProject(body); }
    catch (e) {
      log(c.red(e.message));
      for (const x of diagnose(e.message)) log(`  ${c.yellow('•')} ${x.cause}\n    ${c.dim('fix:')} ${x.fix}`);
      log(c.dim('Fallback: the owner creates it in the dashboard (Workers & Pages → Create → Pages → Connect to Git) with the settings above.'));
      finish(1, { created: false, error: e.message });
    }
    const url = host(p);
    out.project = { name: p.name, url };
    log(c.green(`✔ Created ${p.name} → ${url}`));
    if (p.subdomain !== `${d.name}.pages.dev`) log(c.yellow(`  Note: pages.dev name was taken globally; Cloudflare assigned ${p.subdomain}.`));
    // Record staging in site.config.json (skill layout) — the caller commits it.
    const cfgFile = path.join(ROOT, 'site.config.json');
    if (fs.existsSync(cfgFile)) {
      const raw = readJSON(cfgFile);
      raw.deploy = raw.deploy || {};
      raw.deploy.staging = { provider: 'cloudflare-pages', ...(raw.deploy.staging || {}), url, project: p.name, noindex: true };
      fs.writeFileSync(cfgFile, JSON.stringify(raw, null, 2) + '\n');
      log(c.dim(`  site.config.json → deploy.staging.url = ${url}, project = ${p.name} (commit this)`));
    }
    log(c.dim('  Record the staging URL in CLAUDE.md. The first build starts on the next commit to main; then: cloudflare-pages.mjs status --wait'));
    finish(0, { created: true });
  },

  async configure() {
    const name = await requireProject();
    const p = await cf.getProject(name);
    const repo = repoInfo();
    if (p.source?.type !== 'github') log(c.yellow(`${name} is not connected to GitHub (${p.source?.type || 'direct upload'}) — automatic staging needs a Git-connected project. The owner must create one via Connect to Git (Cloudflare can't convert it).`));
    else if (!sameRepo(p, repo)) { log(c.red(`${name} is connected to ${p.source.config.owner}/${p.source.config.repo_name}, not this repo. Refusing.`)); finish(1); }
    const want = recommended();
    const diff = settingsDiff(p, want);
    Object.assign(out, { project: name, recommended: want, diff });
    log(c.bold(`configure — ${name} (${host(p)})`));
    if (!diff.length) { log(c.green('✔ Staging settings already match: main → automatic, build "' + want.buildCommand + '" → ' + normDir(want.outputDir) + ', preview deployments off.')); finish(0, { changed: false }); }
    for (const x of diff) log(`  ${x.field}: ${c.red(JSON.stringify(x.current))} → ${c.green(JSON.stringify(x.wanted))}`);
    if (!args.yes) { log(c.dim('Dry run. Re-run with --yes to apply (staging only; domains/DNS/production untouched).')); finish(0, { changed: false, dryRun: true }); }
    const body = { production_branch: 'main', build_config: { build_command: want.buildCommand, destination_dir: want.outputDir, root_dir: want.rootDir } };
    if (p.source?.type === 'github') body.source = { config: { production_branch: 'main', deployments_enabled: true, production_deployments_enabled: true, preview_deployment_setting: 'none' } };
    await cf.patchProject(name, body);
    const after = settingsDiff(await cf.getProject(name), want);
    if (after.length) { log(c.red(`Applied, but still different: ${after.map((x) => x.field).join(', ')}`)); finish(1, { changed: true, remaining: after }); }
    log(c.green('✔ Updated. Takes effect on the next deployment (next commit to main, or: retry --yes).'));
    finish(0, { changed: true });
  },

  async status() {
    const name = await requireProject();
    const sha = String(args.commit || git('rev-parse', 'HEAD') || '');
    const originSha = git('rev-parse', 'origin/main');
    const timeout = Number(args.timeout || 900) * 1000;
    const t0 = Date.now();
    let r, dep;
    for (;;) {
      r = await deploymentForCommit(name, sha);
      dep = r.match || (args.commit ? null : r.latest);
      const done = dep && ['success', 'failure', 'canceled', 'skipped'].includes(dep.latest_stage?.status) && (!args.wait || r.match);
      if (!args.wait || done || Date.now() - t0 > timeout) break;
      log(c.dim(`  waiting… ${r.match ? fmtStage(r.match) : `no deployment for ${shortSha(sha)} yet (latest ${shortSha(r.latest?.deployment_trigger?.metadata?.commit_hash)} ${fmtStage(r.latest)})`}`));
      await new Promise((res) => setTimeout(res, 15000));
    }
    if (!dep) {
      log(c.yellow(`No staging deployment for ${shortSha(sha)}${originSha && originSha !== sha ? ` (local HEAD differs from origin/main ${shortSha(originSha)} — pushed?)` : ''}. Latest: ${shortSha(r.latest?.deployment_trigger?.metadata?.commit_hash)} ${fmtStage(r.latest)}`));
      log(c.dim('  If commits reach GitHub but no deployment appears: check the project is Git-connected with automatic deployments on (configure), and that the Cloudflare GitHub app still has access to the repo.'));
      finish(2, { project: name, commit: sha, latest: r.latest?.id || null });
    }
    const meta = dep.deployment_trigger?.metadata || {};
    const st = dep.latest_stage?.status;
    Object.assign(out, { project: name, deployment: { id: dep.id, url: dep.url, commit: meta.commit_hash, branch: meta.branch, stage: dep.latest_stage, stages: dep.stages?.map((s) => `${s.name}:${s.status}`) }, upToDate: !!sha && (meta.commit_hash || '').startsWith(sha) });
    log(c.bold(`status — ${name}`));
    log(`  deployment ${dep.id.slice(0, 8)}  ${dep.url}\n  commit ${shortSha(meta.commit_hash)} (${meta.branch}) "${(meta.commit_message || '').split('\n')[0].slice(0, 70)}"`);
    log(`  stages ${(dep.stages || []).map((s) => (s.status === 'success' ? c.green : s.status === 'failure' ? c.red : c.dim)(`${s.name}:${s.status}`)).join(' → ')}`);
    log(sha && (meta.commit_hash || '').startsWith(sha) ? c.green(`  matches local HEAD ${shortSha(sha)}`) : c.yellow(`  local HEAD is ${shortSha(sha)} — staging is not on the latest commit yet`));
    if (st === 'failure') { out.logs = await showLogs(name, dep); finish(1); }
    if (st !== 'success') { log(c.yellow(`  ${dep.latest_stage?.name} is ${st}${args.wait ? ' (timed out)' : ' — use --wait to follow it'}`)); finish(2); }
    log(c.green(`✔ Staging is live: https://${new URL(dep.url).host.split('.').slice(1).join('.')}  → next: cloudflare-pages.mjs verify`));
    finish(0);
  },

  async logs() {
    const name = await requireProject();
    const dep = args._[1] ? await cf.getDeployment(name, args._[1]) : (await deploymentForCommit(name, '')).latest;
    if (!dep) { log('No deployments yet.'); finish(2); }
    log(c.bold(`logs — ${name} ${dep.id.slice(0, 8)} ${fmtStage(dep)}`));
    out.logs = await showLogs(name, dep, Number(args.lines || 80));
    finish(dep.latest_stage?.status === 'failure' ? 1 : 0);
  },

  async retry() {
    const name = await requireProject();
    const list = (await deploymentForCommit(name, '')).list;
    const dep = args._[1] ? await cf.getDeployment(name, args._[1]) : list.find((d) => d.latest_stage?.status === 'failure') || null;
    if (!dep) { log('No failed staging deployment to retry.'); finish(0); }
    if (list[0] && list[0].id !== dep.id && list[0].latest_stage?.status === 'success') { log(c.yellow(`A newer deployment (${list[0].id.slice(0, 8)}) already succeeded — nothing to retry.`)); finish(0); }
    log(`retry — ${name} ${dep.id.slice(0, 8)} (${fmtStage(dep)}, commit ${shortSha(dep.deployment_trigger?.metadata?.commit_hash)})`);
    if (!args.yes) { log(c.dim('Dry run. Re-run with --yes to retry this staging build.')); finish(0, { dryRun: true }); }
    const n = await cf.retryDeployment(name, dep.id);
    log(c.green(`✔ Retry started: ${n.id.slice(0, 8)} → cloudflare-pages.mjs status --wait`));
    finish(0, { retried: n.id });
  },

  async verify() {
    let base = args.url ? String(args.url).replace(/\/+$/, '') : '';
    const issues = [];
    const add = (level, code, msg) => issues.push({ level, code, msg });
    let depUrl = '';
    let name = '';
    if (!args.url) {
      name = await requireProject();
      const p = await cf.getProject(name);
      base = base || host(p);
      depUrl = p.latest_deployment?.url || p.canonical_deployment?.url || '';
      if (p.latest_deployment?.latest_stage?.status !== 'success') add('error', 'deployment', `Latest deployment is ${fmtStage(p.latest_deployment)} — run status/logs`);
      // Domains: read-only. A production domain attached to staging is reported, never changed.
      const prodHost = (() => { try { return new URL(cfg?.site?.url).host.replace(/^www\./, ''); } catch { return ''; } })();
      const domains = await cf.listDomains(name).catch(() => []);
      for (const dmn of domains) {
        if (prodHost && dmn.name.replace(/^www\./, '') === prodHost) add('error', 'production-domain', `${dmn.name} (production) is attached to the staging project — report to the owner; do not change it without approval`);
        else add('warn', 'custom-domain', `${dmn.name} is attached — _headers noindex must include an https://${dmn.name}/* block`);
      }
      if (p.source?.type !== 'github') add('warn', 'not-git', 'Project is not Git-connected — staging will not update automatically from main');
      else if (p.source.config?.preview_deployment_setting && p.source.config.preview_deployment_setting !== 'none') add('rec', 'previews', `Preview deployments are "${p.source.config.preview_deployment_setting}" — only main exists; configure --yes turns them off`);
    }
    log(c.bold(`verify — ${base}${depUrl ? ` (+ ${depUrl})` : ''}`));
    const home = await fetchHead(base + '/');
    if (!home.status) { log(c.yellow(`NOT RUN: cannot reach ${base} (${home.error}${home.cause ? ': ' + home.cause : ''}). This network may block *.pages.dev — run verify where it is reachable, or ask the owner to open staging.`)); finish(3, { issues }); }
    // HTTPS
    const http = base.startsWith('https:') ? await fetchHead(base.replace(/^https:/, 'http:') + '/') : { status: 0 };
    if (http.status && !(http.status >= 301 && http.status <= 308 && /^https:/.test(http.headers.get('location') || ''))) add('warn', 'https-redirect', `http:// returns ${http.status} instead of redirecting to https`);
    // Noindex + security headers on both the stable and the per-deployment host
    for (const u of [base, depUrl].filter(Boolean)) {
      const r = u === base ? home : await fetchHead(u + '/');
      if (r.status !== 200) { add('error', 'home-status', `${u}/ → HTTP ${r.status}`); continue; }
      if (!/noindex/i.test(r.headers.get('x-robots-tag') || '')) add('error', 'indexable', `${u}/ has no X-Robots-Tag: noindex`);
      if (!/nosniff/i.test(r.headers.get('x-content-type-options') || '')) add('warn', 'header-nosniff', `${u}/ missing X-Content-Type-Options: nosniff`);
      if (!r.headers.get('referrer-policy')) add('warn', 'header-referrer', `${u}/ missing Referrer-Policy`);
      if (!r.headers.get('x-frame-options') && !/frame-ancestors/i.test(r.headers.get('content-security-policy') || '')) add('rec', 'header-framing', `${u}/ has no X-Frame-Options or CSP frame-ancestors`);
      for (const pth of ['/.claude/skills/local-business-website-builder/SKILL.md', '/.htaccess', '/package.json', '/CLAUDE.md']) {
        const x = await fetchHead(u + pth);
        if (x.status === 200) add('error', 'exposed', `${u}${pth} is public`);
      }
    }
    const level = { error: c.red('ERROR'), warn: c.yellow('WARN '), rec: c.dim('REC  ') };
    for (const i of issues) log(`${level[i.level]} ${c.dim(`[${i.code}]`)} ${i.msg}`);
    // Full functional QA
    log(c.bold('\n→ staging-check.mjs'));
    const sc = spawnSync(process.execPath, [path.join(S, 'staging-check.mjs'), base], { cwd: ROOT, stdio: args.json ? 'pipe' : 'inherit', env: process.env });
    log(c.bold('\n→ browser-check.mjs --base-url'));
    const bc = spawnSync(process.execPath, [path.join(S, 'browser-check.mjs'), '--base-url', base], { cwd: ROOT, encoding: 'utf8', env: process.env });
    const bOut = (bc.stdout || '') + (bc.stderr || '');
    const browserRan = bc.status !== 3; // 3 = NOT RUN (no Playwright/browser)
    if (!args.json) process.stdout.write(bOut.replace(/^/gm, '  '));
    const errs = issues.filter((i) => i.level === 'error').length;
    Object.assign(out, { base, deploymentUrl: depUrl, issues, stagingCheck: sc.status, browserCheck: browserRan ? bc.status : 'not run' });
    const ok = !errs && sc.status === 0 && (!browserRan || bc.status === 0);
    log(ok ? c.green(`\n✔ Staging verified${browserRan ? '' : ' (browser-check NOT RUN — Playwright unavailable)'}. Manual: TEST form submission, owner review.`) : c.red(`\n✖ Staging has problems — header checks ${errs} error(s), staging-check exit ${sc.status}, browser-check ${browserRan ? `exit ${bc.status}` : 'not run'}`));
    finish(ok ? 0 : 1);
  },
};

if (!commands[cmd]) { console.log(`Unknown command "${cmd}". Run: node cloudflare-pages.mjs help`); process.exit(2); }
try { await commands[cmd](); }
catch (e) {
  if (e instanceof GuardrailError) { console.error(c.red(e.message)); process.exit(4); }
  console.error(c.red(e instanceof ApiError ? e.message : e.stack || e.message));
  for (const d of diagnose(e.message)) console.error(`  ${c.yellow('•')} ${d.cause}\n    fix: ${d.fix}`);
  process.exit(1);
}
