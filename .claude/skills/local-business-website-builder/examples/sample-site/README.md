# Sample site — "Summit Peak Roofing" (fictional)

A fictional business used to demonstrate and self-test the skill. Every fact here is invented **for the example only** — never copy these values into a real client site.

`node scripts/selftest.mjs` copies the starter into a temp folder, overlays these files, then runs build → validate → build --check → migration-check and expects zero blocking errors.

Files:
- `site.config.json` — filled-in config
- `index.html`, `services/index.html`, `services/roof-repair/index.html` — hand-written pages using include markers
- `_content/blog/*.md` — three posts in two categories (one category gets an archive page; one stays below `minCategoryItems`)
- `old-urls.txt` — URL list from the "old WordPress site" for migration-check
- `.htaccess.redirects` — redirect lines appended to the starter .htaccess
