# QA, Testing & Reporting

Scale testing to the project: every site gets `validate.mjs` + `check-protection.mjs`; browser checks and Lighthouse when tools exist; visual regression only for sites with ongoing changes. On Astro sites every public-site check runs against the generated `dist/` — exactly what the hosts serve. `validate.mjs --build` builds first and reports build errors.

## Severity

| Level | Meaning | Deploy? |
|---|---|---|
| **ERROR** (blocking) | Build failure, stale/missing `dist/`, broken link/asset, missing title/H1/canonical, missing alt, placeholder image, `TODO:` left, near-duplicate pages (Astro), secret in repo, invalid JSON-LD, sitemap points to missing page, `Disallow: /`, private file in `dist/`, committed `dist/`, automatic deploy workflow | No |
| **WARN** | Likely problem: duplicate description, heading skip, missing width/height, oversized image, lazy LCP, missing OG, `_blank` without noopener | Judge; fix or justify |
| **REC** (recommendation) | Improvement: unreferenced images, long titles, missing breadcrumbs | Optional |
| **NOT RUN** | Tool unavailable or needs live URL/access | Report honestly |

## Automated

| Check | Tool |
|---|---|
| Build succeeds; `dist/` current | `validate.mjs --build` (`build-failed`, `build-stale`, `build-missing`); content schemas (zod) at build time |
| Type errors | `npm run check:types` (`astro check`) |
| HTML well-formedness basics (doctype, lang, charset, viewport, unclosed/duplicate IDs) | validate.mjs |
| Full W3C HTML validity | `npx html-validate "**/*.html"` if installed, else NOT RUN (note: vnu needs Java) |
| Broken internal links, missing assets (img, srcset, css, js, icons) | validate.mjs |
| Titles/descriptions present, unique, length | validate.mjs |
| Canonical present, absolute, matches expected URL | validate.mjs |
| One H1, heading hierarchy | validate.mjs |
| Alt attributes, width/height, ratio vs file, oversized/huge images, generic filenames, lazy first image | validate.mjs |
| JSON-LD parses, has `@type` | validate.mjs |
| Sitemap ↔ pages consistency, robots.txt sanity | validate.mjs |
| Collections: duplicate slugs, items missing generated page, pagination pages exist, required front matter | validate.mjs |
| Leftover `TODO:`, `{{`, lorem ipsum, placeholder images | validate.mjs |
| Near-duplicate pages (name-swapped location pages) and thin pages | validate.mjs (`duplicate-content`, `similar-content`, `thin-content`) |
| Redirect map safe (no chains/loops/missing targets) | the build (hosting-files integration) |
| Secrets patterns | validate.mjs |
| Horizontal overflow at 320–2560 px, console errors, failed requests | browser-check.mjs (Playwright) |
| Automated accessibility rules | browser-check.mjs + axe-core |
| Firefox/WebKit rendering smoke | browser-check.mjs `--browsers` |
| Performance/SEO/a11y lab scores | Lighthouse CLI |
| Visual regression | `browser-check.mjs --screenshots .qa/after` then compare against a baseline folder with `--compare .qa/before` (pixel diff count; requires `pngjs`+`pixelmatch` if installed, otherwise screenshots only) |
| Old URLs preserved/redirected | migration-check.mjs |
| Astro: only public files in `dist/`; `.htaccess` serves `/_astro/` and hides dotfiles/`_headers`; staging noindex; `dist/`/`node_modules`/`.env` not committed; deploy workflows manual-only, dist-only, secrets-only | check-protection.mjs, validate.mjs (`deploy` group) |
| Legacy: dev files hidden on Hostinger (.htaccess) and Cloudflare (_redirects); staging noindex rules (_headers) | check-protection.mjs, validate.mjs (`deploy` group) |
| Staging live: noindex, exposed files, soft 404s, links, images, forms | staging-check.mjs |
| Production deploy: domain confirmed, main only, backup, dist-only upload, live probe | Deploy production workflow (owner runs it) |

## Staging (live deployment, before production approval)

First `node $S/cloudflare-pages.mjs status --wait` (deployment for this commit is green), then `node $S/cloudflare-pages.mjs verify`, which checks headers on both staging hosts and runs the two scripts below. Without API access, run them directly.

`node $S/staging-check.mjs <staging-url>` (needs network, no credentials):

| Area | Automated check |
|---|---|
| Indexing | Every sitemap page sends `X-Robots-Tag: noindex`; canonicals point to production, never staging |
| Exposure | Config, partials, templates, content sources, `.claude/`, dotfiles, `package.json`, `CLAUDE.md` return 404 |
| Missing pages | Every sitemap URL returns 200; a random URL returns a real 404 with the custom page (catches SPA soft-404s) |
| Navigation & links | All internal links found on pages (nav, footer, body) resolve |
| Images & assets | Every local `<img>`/`srcset`/CSS/JS loads; images served with an image content type |
| Forms | Action present, https, not a placeholder; embeds (GHL, Calendly…) listed for manual testing |
| Security | `X-Content-Type-Options`, `Referrer-Policy`, framing headers; no `http://` resources on https staging |

`node $S/browser-check.mjs --base-url <staging-url>`: horizontal overflow at 320–1920px, mobile menu, console errors, failed requests, axe.

Manual on staging:
- Click through header/footer nav on a phone (real device if possible) and desktop.
- Submit every form once with "TEST" in the name; confirm delivery (CRM/inbox/GHL workflow), then delete the test lead.
- Click-to-call/email links, booking embeds, maps.
- Client review of content and visuals.

Production approval is the owner's decision; Claude reports readiness only.

## Manual (always)

- Visual fidelity vs design/source at mobile, tablet, desktop.
- Content accuracy: NAP, hours, services, licence numbers, spelling, client-provided copy intact.
- Keyboard pass, focus visibility, 200% zoom, screen reader spot check.
- Contrast of text over images.
- Real iOS Safari check (if possible) for menus, forms, sticky elements.
- Forms submit and arrive at the right destination; thank-you state.
- Tracking fires (GTM preview / DebugView) — or reported as unverified.
- Rich Results Test on live URL after deploy.
- After a production deploy: the workflow's verify step passed (homepage is the Astro build, real 404, private paths not served, no `X-Robots-Tag: noindex`); run the read-only probe in deployment.md yourself too; sitemap fetchable; Search Console sitemap submitted (owner).
- Legacy repos: after any Hostinger Redeploy that changed `.htaccess`, run the production probe — every dev path must return 404 on Hostinger, since passing on staging proves nothing about Hostinger.

## Report template

```markdown
## Site report — <client> — <date>

**Built / changed:** …
**Pages generated or updated:** … (list or count + notable)
**Images optimized:** N files (formats, total size before → after if measured)
**SEO:** titles/descriptions, schema, sitemap, redirects, internal links …

**Tests executed**
| Check | Result |
|---|---|
| npm run build / check:types | success / 0 errors |
| validate.mjs (dist/) | 0 errors, 3 warnings (listed below) |
| check-protection.mjs | pass |
| browser-check.mjs (chromium, 8 widths × 6 pages) | pass / issues |
| Lighthouse mobile (lab, local server) | Home: P 96 · A 100 · BP 100 · SEO 100 |

**Not run:** … (why)
**Remaining issues:** …
**Needs manual review:** …
**Missing from client:** (TODOs: GA4 ID, licence #, hours …)
**Staging:** <url> — deployment `<id>` for `<sha>`: success · verify/staging-check: N errors · browser-check (staging): …
**Deploy readiness:** Ready for production approval / Ready after X / Not ready — commit `<sha>` on `main`; after approval the owner runs Actions → Deploy production (target: hostinger | wpengine | cloudflare-pages). Host limitations: …
```

Only include numbers you actually measured.
