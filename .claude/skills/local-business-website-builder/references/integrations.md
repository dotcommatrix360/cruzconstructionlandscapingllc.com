# Integrations & Tracking

Rule zero: **real IDs only**. Missing ID → leave the config value empty and list it in the report. Never invent `G-XXXX`, `GTM-XXXX`, pixel IDs, API keys.

IDs live in `site.config.json` → `integrations`. `src/components/Tracking.astro` (in `BaseLayout`) renders only the integrations with values, so each script appears once, in one place. (Legacy static repos: the `head-tracking` / `body-tracking` partials.)

## Decision: GTM or direct

- Client has/needs multiple tags (GA4 + Ads + Meta + call tracking) → **GTM only** in the page; configure GA4/Ads inside GTM. Don't also add gtag.js directly (double counting).
- Single GA4 property, nothing else → direct `gtag.js`.

## Snippets (as rendered by the starter's Tracking component)

- **GTM**: head script + `<noscript>` iframe right after `<body>` (body-tracking partial).
- **GA4 direct**: `https://www.googletagmanager.com/gtag/js?id=…` async + config.
- **Search Console**: prefer DNS TXT verification (owner action). If HTML tag: `<meta name="google-site-verification" content="…">` on homepage only.
- **Microsoft Clarity**: via GTM preferred; direct snippet otherwise. Mask sensitive inputs (Clarity masks by default — keep it).
- **Google Ads conversions**: via GTM triggers on form success / `tel:` clicks; set up enhanced conversions only with client consent and policy review.
- **Call tracking** (CallRail etc.): dynamic number insertion script; keep the real number in HTML and schema (DNI swaps visually). Never put tracking numbers in schema/NAP.
- **Forms**: `src/components/ContactForm.astro` reads `integrations.form` — `provider: ghl` (iframe `embedUrl`, lazy, reserved height, `form_embed.js` once), `formspree`/`custom` (accessible native form POSTing to an https `action`, honeypot), or `none` (visible TODO that blocks deployment). Never invent an endpoint. Test-submit on staging and confirm delivery.
- **GoHighLevel**: forms/calendars via their iframe embed + `form_embed.js` once per page; reserve height to avoid CLS; set `loading="lazy"` for below-fold embeds; chat widget loaded deferred. Confirm the form posts to the right GHL location/workflow — test submission when access exists.
- **Scheduling** (Calendly, GHL calendar, Housecall Pro, Jobber): lazy iframe or click-to-open; a plain link fallback.
- **Maps**: click-to-load facade (static image + "View map" button) or `loading="lazy"` iframe with `title`. Never on every page.
- **Third-party forms / widgets** (reviews, chat): justify each; load after interaction or idle.

## Staging

Staging serves the same HTML as production, so `Tracking.astro` only loads GTM/GA4/Clarity when `location.hostname` matches the production host (`site.url`). Keep that guard when customizing tracking; for hand-added scripts, wrap them the same way. Third-party scripts in Astro: `<script is:inline>` (not bundled) with the same hostname guard. Verify tags after the production redeploy (GTM Preview / GA4 DebugView on the live domain); on staging, confirm in the network tab that no tracking requests fire.

## Events worth tracking

`tel:` clicks, `mailto:` clicks, form submissions (success state, not button click), booking completions, directions clicks. Use GTM triggers or a tiny `dataLayer.push` in `main.js`.

## Privacy & consent

- Consent banner when the client serves EU/UK/California users or requires it; use Google Consent Mode v2 defaults (denied until consent) for GA4/Ads in those regions. Don't add a banner by default to US-only local sites unless asked — but mention it.
- Privacy policy page must list tools actually used.
- Healthcare clients: **no** tracking pixels on pages with health information or appointment forms unless the client confirms HIPAA-compliant setup; never send PHI to analytics. Flag for manual review.
- Never put PII in URLs or `dataLayer`.

## Verification

When testing access exists: GTM Preview / GA4 DebugView / network tab (`browser-check.mjs --log-requests`). Otherwise report "installed, not verified".
