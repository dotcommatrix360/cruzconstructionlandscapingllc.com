# Astro sample — "Summit Peak Roofing" (fictional)

A **fictional** business used to demonstrate and self-test the Astro starter. Every fact, phone number (555-01xx),
address, licence and article here is invented for the example only — never copy these values into a real client site.
It contains no testimonials on purpose: the starter never invents reviews.

`node scripts/selftest.mjs` scaffolds the Astro starter into a temp folder with `init.mjs`, removes the starter's
`example-*` entries, overlays these files, imports the raw photo from `../sample-site/_raw-images/IMG_2041.jpg` with
`optimize-images.mjs` (master mode), runs `npm install` + `npm run build`, and expects validate, check-protection,
migration-check, serve and staging-check to pass on `dist/`.

- `site.config.json` — filled-in config with two redirects (old WordPress URLs)
- `src/pages/` — homepage, services and service-area hubs, contact (TODO-free versions of the starter pages)
- `src/content/services/` — two services · `src/content/locations/` — two genuinely different service areas
- `src/content/blog/` — three posts; one keeps its old root-level WordPress URL with `permalink:`
- `old-urls.txt` — the "old site" URL list for migration-check
