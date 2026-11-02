# Client website

Static Astro site built to the Dotcom Matrix 360 agency standard. Rules for Claude and developers: see `CLAUDE.md`.

```bash
npm install
npm run dev          # local development server
npm run build        # static site → dist/ (also writes sitemap.xml, robots.txt, _redirects, .htaccess)
npm run qa           # build + validate dist/ + protection checks
npm run preview      # serve dist/ like the production host (Apache rules)
```

- Content: `src/content/` · Pages: `src/pages/` · Components: `src/components/` · Tokens: `src/styles/tokens.css`
- Business facts, redirects and hosting settings: `site.config.json`
- Staging deploys automatically from `main` (Cloudflare Pages). Production deploys only through the manual
  **Deploy production** workflow after the owner approves staging.
