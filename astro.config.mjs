// @ts-check
import { defineConfig } from 'astro/config';
import hostingFiles from './integrations/hosting-files.mjs';
import config from './site.config.json' with { type: 'json' };

// Static output only: every page is pre-rendered HTML in dist/. No server, no adapter.
export default defineConfig({
  site: config.site.url,
  output: 'static',
  trailingSlash: 'always', // /about/ — matches directory URLs on Hostinger, WP Engine and Cloudflare
  build: { format: 'directory' }, // about/index.html
  compressHTML: true,
  integrations: [hostingFiles()],
});
