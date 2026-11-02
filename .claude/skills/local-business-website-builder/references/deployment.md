# Deployment: Staging & Production

## The workflow (agency standard)

```
Claude ── commit ──► GitHub main ──(automatic)──► Cloudflare Pages = STAGING  (npm run build → dist/, noindexed)
                          │                                │  owner reviews staging
                          └── owner: Actions → "Deploy production" → Run workflow (types the domain;
                              `production` environment reviewer approves) ──► builds main → checks → backup →
                              uploads ONLY dist/ ──► PRODUCTION (Hostinger · WP Engine · Cloudflare Pages)
```

- **One repo per site. One branch: `main`. One source of truth.** No staging/production branches, no copies of the site, no committed build output. `dist/` exists only temporarily inside a build (Cloudflare's build image, the GitHub Actions runner, or locally for QA).
- Staging and production build the **same commit with the same pinned dependencies**, so staging shows exactly what production will get.
- **Production never deploys automatically.** The deploy workflow has only a `workflow_dispatch` trigger, refuses any branch but `main`, requires typing the production domain, and runs in the `production` GitHub environment (add the owner as required reviewer = second approval). `check-protection.mjs` and `validate.mjs` fail if any deploying workflow could run automatically.

### Claude does / needs approval / never does

| Claude does | Only with the owner's explicit approval (this conversation, this action) | Claude never does |
|---|---|---|
| Edit sources, build, validate, commit and push `main` | Run or trigger "Deploy production" (`gh workflow run`) — the environment reviewer still approves in GitHub | Commit `dist/`, secrets or credentials; create branches |
| `cloudflare-pages.mjs detect/create/configure/status/logs/retry/verify` on the **staging** project | Delete any Cloudflare project or deployment | `wrangler` deploys from the session, direct uploads, automatic deploy workflows |
| `check-protection.mjs`, `staging-check.mjs`, `browser-check.mjs --base-url`, `deploy-settings.mjs` | Change DNS; add/remove/edit custom or live domains | Treat a passing check as production approval |
| Prepare/maintain the deploy workflow file and list the secrets the owner must add | Change Hostinger / WP Engine / Cloudflare production settings; overwrite or remove a WordPress site | Read, print or store credentials |
| Report "Ready for production approval" with evidence | Set `WPENGINE_ALLOW_ROOT=true` or any variable that unlocks a destructive step | Work around a host limitation silently |

A site's `CLAUDE.md` that says "never change Cloudflare settings" overrides the first column: ask before `create`/`configure`/`retry`. `lib/cloudflare.mjs` has no delete, domain-write or DNS calls at all.

## Staging — Cloudflare Pages (automatic)

| Setting | Astro (standard) | Legacy static |
|---|---|---|
| Production branch | `main` | `main` |
| Framework preset | Astro | None |
| Build command | `npm run build` | `exit 0` |
| Build output directory | `dist` | `/` (or the committed subfolder) |
| Node | `.node-version` (22.22.0+) | — |
| Preview deployments | off | off |

`deploy-settings.mjs` prints these from the repo; `cloudflare-pages.mjs create/configure` applies them.

**Noindex & security headers:** `public/_headers` → `dist/_headers` sends `X-Robots-Tag: noindex` only on `https://:project.pages.dev/*` and `https://:version.:project.pages.dev/*` (so it can never affect a production domain) plus the same security headers Hostinger sends. Never noindex through `<meta name="robots">`, `Disallow: /` or config flags — `main` is also what production builds.

**Private files:** nothing private is in `dist/`. `dist/_redirects` (generated) also hides `/.htaccess`, which Cloudflare would otherwise serve. `check-protection.mjs` verifies the build; `cloudflare-pages.mjs verify` probes live.

## Cloudflare Pages staging via the API (Claude)

`cloudflare-pages.mjs` talks to the Cloudflare API with `CLOUDFLARE_API_TOKEN` (or credentials the session's proxy injects). Account: `CLOUDFLARE_ACCOUNT_ID`, `--account`, or the token's only account. Token permission: **Account → Cloudflare Pages → Edit** (Read is enough for `doctor`/`detect`/`status`/`logs`/`verify`).

### New site — create staging

```bash
npm run build && node $S/check-protection.mjs   # must pass
node $S/cloudflare-pages.mjs doctor          # token + account + Pages access
node $S/cloudflare-pages.mjs detect          # existing project for this repo or name? → reuse it, never create a second
node $S/cloudflare-pages.mjs create          # dry run: prints name, repo, build settings
node $S/cloudflare-pages.mjs create --yes    # creates it; writes deploy.staging.url + project to site.config.json
git commit -am "Record Cloudflare Pages staging URL" && git push   # first build starts on this push
node $S/cloudflare-pages.mjs status --wait   # follows the build; prints log tail + diagnosis on failure
node $S/cloudflare-pages.mjs verify          # live QA (below)
```

What `create` sets (from `deploy-settings.mjs`): Git source = this repo's GitHub `origin`, production branch **`main`**, automatic deployments **on**, preview deployments **off**, PR comments off. Astro: build command **`npm run build`**, output **`dist`** (Node from `.node-version`). Legacy static: build command **`exit 0`**, output **`.`**. Project name: `--name`, else `deploy.staging.project`, else the repo name (pages.dev names are global; if taken, Cloudflare adds a suffix and the script reports the real URL).

**Detect before create** — `detect` matches every project in the account by connected repo, by name, and by `deploy.staging.url` host:

| `detect` says | Do |
|---|---|
| none | `create` |
| exists (connected to this repo) | reuse: `configure` / `status`. `create` refuses to make a second one. |
| conflict (same name, other repo or direct upload) | leave it alone; choose another `--name` or ask the owner. Never delete or repoint it. |

**GitHub connection.** Creating a Git-connected project needs the Cloudflare Workers and Pages GitHub app to have access to the repo. If `create` fails with a repository-access error, the owner opens GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure and adds the repo (or runs the dashboard flow once: Workers & Pages → Create → Pages → Connect to Git with the same settings). A project made by direct upload can't be converted to Git; automatic staging needs a Git-connected project.

### Existing site — check and align settings

`configure` compares the live project with the recommendation and prints the differences; `--yes` applies them. It can change only: production branch, build command, output dir, root dir, automatic/preview deployment settings. It refuses projects connected to another repo. Environment variables, domains, access policies and anything else are out of its reach.

### Deployment status and troubleshooting

| Command | Use |
|---|---|
| `status` | latest `main` deployment: stages, commit, whether it matches local `HEAD` |
| `status --wait [--commit sha] [--timeout 900]` | after a push: waits for that commit's deployment; exit 0 success, 1 failed (log tail + diagnosis), 2 pending/not found |
| `logs [deployment-id] [--lines 80]` | build log tail + diagnosis |
| `retry [deployment-id] --yes` | re-run a failed staging build (same commit) — for transient errors, or after `configure` |

| Symptom | Likely cause → fix |
|---|---|
| No deployment for the pushed commit | not Git-connected, automatic deployments off, or GitHub app lost repo access → `configure`, owner re-grants app access |
| Output directory not found | build settings don't match the repo → `configure --yes`, `retry --yes` |
| Build command failed / module not found | Astro: `npm ci` failed or a dependency is missing from package.json → fix locally, commit lockfile. Legacy: Cloudflare is building a committed site → build command `exit 0` |
| Content schema error (`InvalidContentEntryDataError`) | A `src/content/` entry fails its schema → fix the named file |
| "Redirect map … has N problem(s)" | Unsafe `site.config.json` redirects (chain, loop, missing target) → fix and rebuild |
| Node version errors | `.node-version` missing or too old — Astro 7 needs 22.22.0+ |
| Internal error | transient → `retry --yes` |
| Deploy succeeded but pages 404 / homepage for every URL | wrong output dir, or `404.html` missing |
| `_redirects`/`_headers` warnings in the log | invalid lines are skipped — dev files may be exposed → `check-protection.mjs` |

### Verify staging

`cloudflare-pages.mjs verify` (or `--url <staging-url>` for any host):

1. Latest deployment succeeded; project is Git-connected; preview deployments off.
2. Domains (read-only): reports custom domains; **error** if the production domain is attached to the staging project (report it — do not change it).
3. HTTPS redirect; `X-Robots-Tag: noindex` on **both** `<project>.pages.dev` and the per-deployment `<hash>.<project>.pages.dev`; `X-Content-Type-Options`, `Referrer-Policy`, framing headers; dev files 404.
4. `staging-check.mjs` (every page noindexed, exposed files, real 404, nav/links, images, mixed content, forms) and `browser-check.mjs --base-url` (layout, menu, console, axe) if Playwright is installed.

Exit 3 = could not reach staging (some networks block `*.pages.dev`): report "not run", never "passed".

### Dashboard fallback (owner)

Workers & Pages → Create → Pages → Connect to Git → repo → production branch `main`, framework preset **Astro**, build command `npm run build`, output `dist`, root blank (legacy static: framework None, `exit 0`, `/`). Then Claude runs `detect` / `configure` / `status` as above.


## Production — the manual "Deploy production" workflow

`.github/workflows/deploy-production.yml` (from the Astro starter). One-time setup is done by the owner in GitHub:

1. **Settings → Environments → New environment `production`** → add yourself as **required reviewer**; restrict to the `main` branch.
2. **Settings → Secrets and variables → Actions**: variables `DEPLOY_TARGET` (`hostinger` | `wpengine` | `cloudflare-pages`) and `PRODUCTION_DOMAIN`; plus the host's secrets below. Put secrets in the `production` environment when possible so only the approved job can read them.
3. Run it: **Actions → Deploy production → Run workflow** → type the domain → (optional) dry run first → reviewer approves.

What every run does: guard (main only, domain typed, known target) → `npm ci` → `npm run build` → `validate.mjs` + `check-protection.mjs --production <target>` → host-specific backup + upload of **`dist/` only** → read-only verification (homepage 200 and is the Astro build, real 404, private paths not 200, no `X-Robots-Tag: noindex`). Credentials come only from `${{ secrets.* }}`; the workflow never echoes them and uses pinned `known_hosts` (no blind host-key trust).

`node $S/deploy-settings.mjs --host <target>` prints what that host needs and cannot do for this repo.

### Hostinger (SSH + rsync)

- **Needs:** SSH access on the plan (hPanel → Advanced → SSH Access; entry-level plans may not include it — if not, report it and stop; never fall back to committing `dist/` or FTP passwords). Secrets `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT` (usually 65002), `HOSTINGER_SSH_USER`, `HOSTINGER_SSH_KEY` (a deploy key generated for this site), `HOSTINGER_KNOWN_HOSTS` (`ssh-keyscan -p 65002 <host>` output, verified once); variable `HOSTINGER_PATH` (e.g. `domains/client.com/public_html`).
- **Does:** tars the current `public_html` to `~/deploy-backups/` (keeps the last 10), then `rsync --delete` of `dist/` into `public_html` (protecting `.well-known/`).
- **Turn off** any Hostinger Git auto-deployment for this site — the workflow replaces it (otherwise Hostinger would publish the raw repo).
- `.htaccess` (from `public/.htaccess` + generated redirects) handles HTTPS, 404, security/caching headers and hides `_headers`/`_redirects` and dotfiles. It must **not** block `/_astro/` — `check-protection.mjs` fails if it does (the v1 rule `(^|/)_ → 404` would break every asset).
- Rollback: restore the newest tarball from `~/deploy-backups/` over `public_html` (owner, via SSH or File Manager).

### WP Engine (SSH Gateway + rsync)

WP Engine is a managed **WordPress** host. Static files are served when they exist, but:

- `.htaccess` is ignored (Nginx). Add every `site.config.json` redirect in **User Portal → Redirect rules** (`deploy-settings.mjs --host wpengine` lists them). Custom headers need WP Engine support/portal settings.
- WordPress's `index.php` can keep answering `/` — the verify step fails if the homepage isn't the Astro build. Removing or disabling WordPress is the owner's decision (and often WP Engine support's).
- **Never overwrite a WordPress site without a backup and explicit approval.** The workflow refuses unless the owner set `WPENGINE_ALLOW_ROOT=true`; it tars the install (minus uploads) to `_static-deploy-backups/`, uploads without `--delete` (so WordPress files are never removed) and skips `_headers`, `_redirects`, `.htaccess`.
- **Verify on the WP Engine staging/development environment first** (point `WPENGINE_INSTALL` at it, set `VERIFY_HOST` to its hostname), then switch to production after approval. Also create a WP Engine backup point in the portal before the first production upload.
- Needs: SSH Gateway key in the User Portal; secrets `WPENGINE_SSH_KEY`, `WPENGINE_KNOWN_HOSTS`; variables `WPENGINE_INSTALL`, `WPENGINE_ALLOW_ROOT`.
- Honest recommendation: a static site on WP Engine keeps paying for WordPress hosting it doesn't use; Hostinger or Cloudflare Pages are simpler unless the client must stay on WP Engine.

### Cloudflare Pages (production project)

- A **separate** Pages project for production (direct upload), never the Git-connected staging project. The workflow refuses if `CLOUDFLARE_PRODUCTION_PROJECT` equals `CLOUDFLARE_STAGING_PROJECT`.
- **Separate permissions:** `CLOUDFLARE_PRODUCTION_API_TOKEN` (Pages:Edit, ideally scoped to the production project) lives only in the `production` environment; the token Claude uses for staging must not be able to deploy production.
- `wrangler pages deploy dist --project-name <prod> --branch main` (wrangler version pinned in the workflow).
- The production custom domain is attached by the owner (domain change). `_headers` noindex only matches `*.pages.dev`, so the custom domain stays indexable.

### After a production deploy (read-only, Claude may run)

```bash
for p in / /sitemap.xml /robots.txt /lbwb-missing-check/ /site.config.json /package.json /.git/config /src/ /_headers /_redirects /.htaccess; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://www.CLIENT-DOMAIN.com$p"; done
curl -sI https://www.CLIENT-DOMAIN.com/ | grep -i x-robots-tag || echo "no X-Robots-Tag on production (correct)"
```

Expect 200, 200, 200, 404, then 404 for every private path. Then: Search Console sitemap submitted (owner), Rich Results Test, GBP website link, 404 monitoring for 2–4 weeks after a migration.

## Other hosts

| Host | How | Notes |
|---|---|---|
| Netlify | Same as Cloudflare (`_redirects`/`_headers` work as-is) | Separate staging/production sites |
| SiteGround / cPanel (Apache) | Hostinger job with that host's SSH details | `.htaccess` works as-is |
| Vercel | `vercel.json` redirects/headers | Generate from `site.config.json` before adopting |
| GitHub Pages | Not supported for client sites | No headers, no server redirects |

Record host, staging URL, production method and any limitation in the site's `CLAUDE.md`.

---

## Legacy static repos (v1)

Committed HTML at the repo root; both hosts serve the same committed files. Cloudflare: build `exit 0`, output `/`.
Hostinger: Git deployment from `main` with auto-deploy **off**; the owner clicks **Redeploy** after approving staging.
No deploy workflows (validate errors `auto-deploy-workflow`).

### Protecting development files — two hosts, two mechanisms

The web root also holds files that must never be public: `.claude/` (this skill), `.git/`, `.github/`, `site.config.json`, `package*.json`, `CLAUDE.md`, `README.md`, `_partials/`, `_templates/`, `_content/`, build sources like `src/` or `tools/`, and so on.

**Each host needs its own protection. Neither one covers the other:**

| Host | Reads | Ignores | Protection |
|---|---|---|---|
| **Hostinger** (Apache/LiteSpeed) — production | `.htaccess` | `_redirects`, `_headers` | `.htaccess` rules returning **404** for every private path, plus `_redirects`/`_headers` themselves |
| **Cloudflare Pages** — staging | `_redirects`, `_headers` | `.htaccess` | `_redirects` rules sending every private path (and `.htaccess`) to `/404/` |

A path hidden on staging is **not** automatically hidden on production, and the reverse. Always check both:

```bash
node $S/check-protection.mjs     # offline: compares the private entries in the web root with BOTH .htaccess and _redirects
```

It lists any gap per host and prints the exact lines to add. `validate.mjs` runs the same check (errors `hostinger-exposed`, `cloudflare-exposed`) whenever `site.config.json` has a `deploy` block.

#### Hostinger: `.htaccess` (production)

Starter rules (keep near the top, before other rewrites):

```apache
RewriteRule ^\.well-known/ - [L]
RewriteRule (^|/)\. - [R=404,L]          # dotfiles/dirs: .claude, .git, .github, .gitignore …
RewriteRule (^|/)_ - [R=404,L]           # _partials, _templates, _content, _redirects, _headers …
RewriteRule ^(site\.config\.json|package(-lock)?\.json|CLAUDE\.md|README\.md|node_modules/) - [R=404,L]
```

Projects with other private folders add them, e.g. `RedirectMatch 404 ^/(src|tools)(/|$)`. If the `.htaccess` is generated (e.g. copied from `src/static/`), edit the source and rebuild.

**Verify on production after every Redeploy that changes `.htaccess`.** Rules can be ignored if the host disables an Apache module, and staging cannot tell you that. Each probe should print 404:

```bash
for p in /.claude/skills/local-business-website-builder/SKILL.md /.git/config /site.config.json /package.json /CLAUDE.md /README.md /_redirects /_headers; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://www.CLIENT-DOMAIN.com$p"; done
curl -sI https://www.CLIENT-DOMAIN.com/ | grep -i x-robots-tag || echo "no X-Robots-Tag on production (correct)"
```

This is read-only and safe for Claude to run after the owner's Redeploy (Claude never triggers it).

#### Cloudflare: `_redirects` and `_headers` (staging)

`_redirects` (starter):

```
/.claude/* /404/ 302
/.git/* /404/ 302
/.github/* /404/ 302
/.gitignore /404/ 302
/.htaccess /404/ 302
/site.config.json /404/ 302
/package.json /404/ 302
/CLAUDE.md /404/ 302
/README.md /404/ 302
/_* /404/ 302
```

Cloudflare applies redirects before serving files, and `/404/` resolves to the site's `404.html` with HTTP 404. (Cloudflare can't return a 404 status from `_redirects` directly.) Site redirects such as migrations go below these lines and in `.htaccess` too.

`_headers` (starter) noindexes staging **only on `*.pages.dev`**, so it can never affect the production domain:

```
https://:project.pages.dev/*
  X-Robots-Tag: noindex, nofollow, noarchive

https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex, nofollow, noarchive
```

If staging uses a custom domain (`staging.client.com`), add a third block for that host. (Adding the domain itself is a domain change: owner approval.)

The starter also sends production's security headers on staging (`/*` block: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) so `verify` sees the same behaviour as Hostinger's `.htaccess`. Never put `X-Robots-Tag` in the `/*` block.

Never noindex through `<meta name="robots">`, `site.noindex: true` or `Disallow: /`. `main` is also production, so any of these would de-index the live site. `validate.mjs` errors on `site.noindex` when staging is configured.

Both files are committed in the web root (or in the folder the project's build copies to the root, e.g. `src/static/`). Hostinger's `.htaccess` hides them.


After every Hostinger Redeploy that changed `.htaccess`, run the production probe above (staging can't prove Hostinger protection).
