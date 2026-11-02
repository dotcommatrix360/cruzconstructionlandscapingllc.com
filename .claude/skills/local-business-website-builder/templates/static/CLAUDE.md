# Client site notes

Use the `local-business-website-builder` skill for all work in this repo.

## Business
- Name / industry / service area: TODO
- Primary conversion: TODO (call, quote form, booking)
- Source of truth for facts: `site.config.json` — only client-confirmed values.

## Brand
- Tokens origin (Figma / brand guide / existing site): TODO
- Fonts: TODO

## Hosting & deploy
- Branch: `main` only. Claude commits and pushes; Claude never deploys production.
- One repo, one branch (`main`), one set of site files at the repo root. No copies, no other branches.
- Staging: Cloudflare Pages auto-publishes `main` → TODO: https://<project>.pages.dev
  (project TODO: <name>; build command `exit 0`, output directory `/`; noindex via `_headers`, dev files hidden via `_redirects`).
  Claude may manage this staging project with `cloudflare-pages.mjs` (detect/create/configure/status/logs/retry/verify).
  Owner approval required for: Hostinger deploys, DNS, deleting Cloudflare projects, custom/live domains.
- Production: Hostinger, auto-deployment OFF. Owner clicks Redeploy only after approving staging. Dev files hidden by `.htaccess`.
- Before every commit: `build.mjs` → `validate.mjs` (includes the protection check). After pushing: `cloudflare-pages.mjs status --wait` → `cloudflare-pages.mjs verify`.

## Integrations
- GTM / GA4 / Clarity / forms / booking: TODO (IDs live in site.config.json)

## Deviations from the standard
- None yet.

## Open TODOs from client
- TODO
