// Production-deployment workflow rules (GitHub Actions). A workflow that publishes somewhere is allowed only when:
//   - it can run ONLY by hand (workflow_dispatch) — never on push, schedule, PRs or other workflows
//   - it uploads ONLY the build output (dist/) — never the repo, source files or node_modules
//   - credentials come from ${{ secrets.* }} — never written in the file
//   - (recommended) it uses a GitHub environment named "production" with a required reviewer
// Legacy static repos keep the v1 rule: no deploying workflows at all (the owner clicks Redeploy in Hostinger).
import fs from 'node:fs';
import path from 'node:path';
import { deploysSomething } from './protect.mjs';

const AUTO_TRIGGERS = ['push', 'pull_request', 'pull_request_target', 'schedule', 'workflow_run', 'release', 'repository_dispatch', 'deployment', 'deployment_status', 'create', 'merge_group', 'check_run', 'check_suite', 'registry_package', 'page_build'];

const code = (yaml) => yaml.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#(?![^"']*["'][^"']*$).*$/, '')).join('\n')
  .replace(/\\\n\s*/g, ' '); // join shell line continuations so one command = one line

/** Trigger names from the top-level `on:` key (map, list or scalar form). */
export function workflowTriggers(yaml) {
  const lines = code(yaml).split('\n');
  const i = lines.findIndex((l) => /^(on|"on"|'on'|true)\s*:/.test(l));
  if (i < 0) return [];
  const inline = lines[i].replace(/^[^:]+:\s*/, '').trim();
  if (inline) return inline.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  const block = [];
  for (const l of lines.slice(i + 1)) { if (/^\S/.test(l)) break; if (l.trim()) block.push(l); }
  if (!block.length) return [];
  const indent = block[0].search(/\S/);
  const out = [];
  for (const l of block) {
    if (l.search(/\S/) !== indent) continue;
    const m = /^\s*-\s*([a-z_]+)\s*$/.exec(l) || /^\s*([a-z_]+)\s*:/.exec(l);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

export function analyzeWorkflow(yaml, { project = 'astro' } = {}) {
  const src = code(yaml);
  const deploys = deploysSomething(yaml);
  const triggers = workflowTriggers(yaml);
  const errors = [];
  const warnings = [];
  if (!deploys) return { deploys, triggers, errors, warnings, manualOnly: !triggers.some((t) => AUTO_TRIGGERS.includes(t)) };

  if (project === 'static') {
    errors.push('Workflow deploys, but this is a legacy static repo: production deploys only through the owner\'s manual Hostinger Redeploy (or migrate the site to the Astro standard)');
    return { deploys, triggers, errors, warnings, manualOnly: false };
  }
  const auto = triggers.filter((t) => AUTO_TRIGGERS.includes(t));
  if (auto.length) errors.push(`Deploying workflow runs automatically on "${auto.join(', ')}" — production must only deploy by hand (on: workflow_dispatch) after the owner approves staging`);
  if (!triggers.includes('workflow_dispatch')) errors.push('Deploying workflow has no workflow_dispatch trigger — production deploys must be started manually');
  if (!/^\s*environment\s*:\s*(production|['"]production['"])\s*$/m.test(src) && !/^\s*environment\s*:\s*\n\s*name\s*:\s*['"]?production/m.test(src)) warnings.push('Deploying job has no `environment: production` — add it and a required reviewer in GitHub → Settings → Environments for a second approval gate');

  // Uploads only the build output
  for (const line of src.split('\n')) {
    if (/\brsync\b/.test(line) && !/\bdist\/(\s|"|'|$)/.test(line)) errors.push(`rsync step does not upload dist/ — only the build output may be published: ${line.trim().slice(0, 120)}`);
    if (/\b(scp|lftp\b.*mirror)\b/.test(line) && !/\bdist\b/.test(line)) errors.push(`Upload step does not use dist/: ${line.trim().slice(0, 120)}`);
    if (/wrangler(@[\w.-]+)?\s+pages\s+deploy\b/.test(line) && !/pages\s+deploy\s+\.?\/?dist\b/.test(line)) errors.push(`wrangler pages deploy must publish dist: ${line.trim().slice(0, 120)}`);
    if (/local-dir\s*:/.test(line) && !/dist\/?['"]?\s*$/.test(line)) errors.push(`FTP/SFTP action local-dir must be ./dist/: ${line.trim()}`);
  }
  // Credentials only from secrets
  const inline = /\b(password|passwd|pass|token|api[_-]?key|private[_-]?key|ssh[_-]?key|secret)\b\s*[:=]\s*['"]?(?!\$\{\{\s*secrets\.)(?!\$\{?[A-Z_]+\}?)[^\s'"$]{8,}/i;
  for (const line of src.split('\n')) if (inline.test(line)) errors.push(`Possible credential written in the workflow — use \${{ secrets.NAME }}: ${line.trim().slice(0, 80)}`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(yaml)) errors.push('Private key in the workflow file — store it as a GitHub Actions secret');
  if (/^\s*set\s+-[a-z]*x/m.test(src)) warnings.push('`set -x` prints every command — secrets passed as arguments could reach the log');
  for (const line of src.split('\n')) if (/\brsync\b/.test(line) && /--delete/.test(line) && /wpengine/i.test(line)) warnings.push('rsync --delete on WP Engine can remove WordPress files — never delete at the install root');
  return { deploys, triggers, errors, warnings, manualOnly: !auto.length };
}

/** Analyze every workflow in a repo. */
export function auditWorkflows(root, opts = {}) {
  const dir = path.join(root, '.github', 'workflows');
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    results.push({ file: `.github/workflows/${f}`, ...analyzeWorkflow(fs.readFileSync(path.join(dir, f), 'utf8'), opts) });
  }
  return results;
}
