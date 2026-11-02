# Security & Reliability

Static sites are low-risk; most incidents come from third-party scripts, exposed files, and leaked keys.

## What gets published (Astro)

Only `dist/` is ever uploaded — by Cloudflare's build for staging and by the manual Deploy production workflow for production. Source, config, `.git`, `node_modules` and the skill never reach a server. `check-protection.mjs` proves it on every run: no configs, Markdown sources, env files, archives or dotfiles in `dist/` (source maps warned), `.htaccess` hides dotfiles and `_headers`/`_redirects` without blocking `/_astro/`, `dist/`/`node_modules/`/`.env*` not committed and listed in `.gitignore`.

## Defaults (starter `public/.htaccess`)
- Force HTTPS (301). HSTS `max-age=31536000` only once HTTPS is confirmed working on all hostnames — starter ships it commented with a note.
- Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` (remove if the client embeds the site elsewhere), `Permissions-Policy` disabling camera/mic/geolocation unless used.
- CSP: start as `Content-Security-Policy-Report-Only` tailored to actual third parties; promote to enforcing only after verifying nothing breaks (GTM/GHL need broad allowances). Don't ship a CSP that breaks forms or tracking.
- Block web access to dotfiles (except `/.well-known/`) and the Cloudflare-only `_headers`/`_redirects`. Do **not** block `_` paths in general — Astro serves assets from `/_astro/`. (Legacy static repos additionally block `_`-folders, configs and docs at the web root, because their source lives there.)
- `Options -Indexes` (no directory listings).

## Staging hosts

Cloudflare Pages ignores `.htaccess` (and would serve the file itself — the generated `dist/_redirects` hides it); Hostinger ignores `_redirects`/`_headers` (the `.htaccess` hides them). `staging-check.mjs` probes staging live; the Deploy production workflow probes production after every deploy. Legacy static repos: every private path needs a rule in **both** `.htaccess` and `_redirects` — `check-protection.mjs` verifies both offline.

## Secrets
- No API keys, passwords, tokens, private URLs in the repo. Client-side IDs (GA4, GTM, public form keys) are fine.
- Deployment credentials (SSH keys, API tokens) live only in **GitHub Actions secrets**, preferably scoped to the `production` environment so only the approved deploy job can read them. Use a dedicated deploy key per site, pinned `known_hosts`, and separate Cloudflare tokens for staging and production. Workflows never echo secrets (`validate.mjs` errors on credentials written in workflow files and warns on `set -x`).
- Never use `.env` for anything the static site needs at runtime — anything in the build output is public. `.env*` files are git-ignored and flagged if committed.
- `validate.mjs` scans for common secret patterns (AWS keys, Stripe secret keys, private keys, generic `api_key=` with long values) — blocking.
- Server-side needs (form → email with a secret) go to a hosted form/GHL/serverless function, never inline JS.

## External content
- `target="_blank"` links get `rel="noopener"` (validate warns); `rel="nofollow sponsored"` for paid links.
- Third-party scripts: from official CDNs only, minimal set, documented in `CLAUDE.md`. Use SRI (`integrity` + `crossorigin`) for pinned library versions from CDNs; not possible for GTM/GHL dynamic scripts.
- Iframes: `title`, `loading="lazy"`, `sandbox` where it doesn't break the embed, `referrerpolicy` as needed.

## Forms
- Use hosted endpoints (GHL, Formspree, Netlify-style, client CRM). HTTPS action URLs only.
- Spam: honeypot field + provider protection (Turnstile/reCAPTCHA if required).
- Validate inputs client-side for UX; the provider validates server-side.
- Never collect sensitive data (SSN, card numbers, health details) via generic forms.

## Dependencies
- Build-time only: `astro`, `sharp` (+ `@astrojs/check`, `typescript` for type checks). No runtime server dependencies — the output is static files.
- Exact versions pinned in `package.json` with a committed `package-lock.json`; CI and Cloudflare install with the lockfile. `npm audit` when adding packages; add a dependency only with a stated reason.
- Optional QA tools (`playwright`, `axe-core`, `html-validate`) stay in `devDependencies`.

## Reliability
- All asset paths root-relative (`/assets/...`) so nested pages work.
- `validate.mjs` catches missing files and broken internal links before deploy.
- JS failure must not break navigation, content or forms (progressive enhancement).
