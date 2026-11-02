# Performance & Core Web Vitals

## Targets (Google "good", 75th percentile of real users)

| Metric | Good |
|---|---|
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |

Lighthouse is lab data (simulated device/network). Field data comes from CrUX / Search Console / PageSpeed Insights "Discover what your real users are experiencing" — often unavailable for small sites. Always label which one you report. Never claim a score you didn't measure; never trade real functionality for a synthetic score.

## Default techniques

**LCP**
- Hero image as `<img>` with `fetchpriority="high"`, correct `srcset/sizes`, no lazy. Preload only if it's discovered late (CSS background, JS-inserted).
- Server: compression + caching via `.htaccess`. Avoid redirects chains on the landing URL.
- No sliders/carousels for the hero.

**Render-blocking**
- Astro bundles and minifies CSS per page and inlines very small stylesheets automatically; component `<script>`s become deferred modules. Don't add render-blocking scripts in `<head>` (tracking stays async behind the production-host guard).
- Avoid client islands (`client:load`) for content; a hydrated framework component costs far more than a few lines of vanilla JS. Prefer `client:visible`/`client:idle` when an island is truly needed.
- Third parties (chat, reviews widgets, maps, video) load on interaction or idle: facade pattern (click-to-load YouTube/maps), `loading="lazy"` iframes.

**Fonts**
- Self-host woff2, 1–2 families, ≤ 4 files. `font-display: swap`; preload only the above-the-fold weight. Use size-adjusted fallback (`size-adjust`, `ascent-override`) to reduce shift, or system font stack.
- Google Fonts allowed when convenient: `preconnect` + `display=swap`, limited weights.

**CLS**
- width/height on images/iframes/video; reserve space for embeds and banners; no late-injected content above existing content; cookie banner as overlay.

**INP**
- Minimal JS, no heavy frameworks for brochure sites; passive listeners; avoid layout thrash; break long tasks; defer analytics via GTM settings.

**Caching**
- Astro fingerprints `/_astro/*` files (CSS, JS, generated images) → cached for a year (starter `.htaccess` and `_headers`); HTML `no-cache`. Legacy static repos use `?v=hash` from build.mjs.

## Measuring

```bash
npm run build && node $S/serve.mjs --port 8080 &   # serves dist/
npx lighthouse http://localhost:8080/ --form-factor=mobile --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./.lighthouse/home.json --chrome-flags="--headless"
```

Local server results omit real hosting latency; re-test on the live/staging URL with PageSpeed Insights when possible. Test the homepage plus one of each template (service, article, archive, contact).

No arbitrary byte budgets. Flag images > 400 KB, JS > ~100 KB, and any third-party script for justification, then judge.
