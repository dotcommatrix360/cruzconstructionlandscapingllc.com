# Image Workflow

## Honesty rules (non-negotiable)

- Use the client's **real photos** of their work, team and premises wherever they exist. Ask for them; list missing ones as TODOs.
- **Never present AI-generated, stock or another company's images as the client's projects**, team or location. If a non-client image is unavoidable (abstract background, illustration), it must not imply real work: no "our recent project" captions, alt text says what it is ("Illustration of…"), and it is listed in the report.
- Never fabricate credentials, badges, awards, certifications or "as seen in" logos. Only marks the client actually holds, with their permission.
- The starter's `placeholder-replace-with-client-photo.jpg` fails `validate.mjs` (`img-placeholder`) until replaced.

## Intake

1. **Look at every image** (Read tool) before naming or using it. Never guess contents from the filename.
2. Rename descriptively, kebab-case, ≤ 6 words: `IMG_1234.jpg` → `asphalt-shingle-roof-replacement-boise`. Location/service words only if actually depicted or genuinely relevant; no stuffing.
3. Keep huge originals (RAW/PSD, 20 MB phone photos) out of the repo — the client's Drive is the archive.
4. Delete unused images; no duplicates under different names.

## Astro pipeline (standard)

```bash
node $S/optimize-images.mjs _incoming/*.jpg --rename map.json      # map.json: {"IMG_1234.jpg": "asphalt-shingle-roof-replacement-boise"}
```

Writes **one clean master per photo** to `src/assets/images/<name>.jpg` (PNG when transparent): auto-rotated, metadata
stripped, capped at 2400 px. Astro generates the responsive AVIF/WebP/JPEG sizes at build time into `dist/_astro/`
(fingerprinted, cached for a year) — no variants are committed. Requires `sharp` (a starter dependency).

Render with `ResponsiveImage` (wraps Astro's `<Picture>`):

```astro
---
import ResponsiveImage from '../components/ResponsiveImage.astro';
import roof from '../assets/images/asphalt-shingle-roof-replacement-boise.jpg';
---
<!-- Hero / LCP: the single above-the-fold image → eager + fetchpriority="high" -->
<ResponsiveImage src={roof} alt="Crew installing architectural shingles on a two-story home" priority sizes="(min-width: 60rem) 50vw, 100vw" />

<!-- Below the fold: lazy by default -->
<ResponsiveImage src={roof} alt="…" sizes="(min-width: 72rem) 23rem, 100vw" widths={[480, 960]} />
```

- Output: `<picture>` with AVIF + WebP sources, a JPEG/PNG fallback, `srcset` for the widths (never upscaled), intrinsic `width`/`height` (no layout shift), `decoding="async"`, `loading="lazy"` unless `priority`.
- `sizes` must reflect the real layout width — wrong `sizes` wastes bytes.
- Collection entries reference images in front matter (`image: ../../assets/images/x.jpg` + `imageAlt`); the schema's `image()` helper validates the path at build time.
- Open Graph: `Seo.astro` crops a page's image to 1200×630 automatically; set `site.defaultOgImage` (a file in `public/`) for pages without one.
- `public/` is only for files that must keep an exact URL (favicon, logo used in schema, og-default, PDFs). Everything else goes through `src/assets/`.
- Decorative CSS backgrounds: keep small; never the LCP element. For a full-bleed hero use `ResponsiveImage` with `object-fit: cover`.
- Logos/icons: SVG (optimized, with `viewBox`) in `public/` or inline.

## Alt text

- Describe what's shown and why it matters in context, in ~5–15 words. "Finished walk-in shower with gray porcelain tile and glass door."
- Decorative/ornamental: `alt=""` (and no `title`).
- Logo link: alt = business name ("Acme Roofing home").
- Don't start with "Image of", don't invent details (brand, location, people's names) you can't see or weren't told, don't keyword-stuff.
- Text in images: put the text in alt, and prefer real HTML text.

## Validation

`validate.mjs` (on `dist/`) flags: missing alt, missing width/height, ratio mismatch, missing files, lazy-loaded first image, placeholder images still in use, oversized files (> 400 KB) and huge dimensions, generic file names. Content schemas fail the build when an entry has an image without `imageAlt`.

---

## Legacy static repos

### Optimize (legacy: committed variants)

`node $S/optimize-images.mjs <files|dir> [--out assets/images] [--widths 480,960,1600] [--formats webp] [--quality 78] [--rename map.json]`

- Requires `sharp` (`npm i -D sharp`; `node_modules/` is git-ignored). If unavailable, say so; do not fake optimization.
- Produces resized variants (never upscales), strips metadata, keeps a JPEG/PNG fallback when `--fallback` is set, and prints a ready `<img srcset>` snippet with intrinsic width/height.

Format guide:

| Content | Format |
|---|---|
| Photos | WebP (q≈75–82); AVIF for big heroes if it's meaningfully smaller; JPEG fallback only if needed |
| Logos, icons, line art | SVG (optimized, `viewBox`, no embedded rasters) |
| Screenshots / flat UI | WebP lossless or PNG |
| Transparency photos | WebP |

Sizes: generate only widths you'll use. Typical: full-bleed hero 960/1600/2400; content image 480/960/1440; card 400/800; avatar 160/320. Avoid exhaustive variant grids.

### Markup (legacy HTML)

```html
<!-- Hero / LCP: no lazy, high priority, preload in <head> if it's a CSS background or discovered late -->
<img src="/assets/images/roof-replacement-960.webp"
     srcset="/assets/images/roof-replacement-960.webp 960w, /assets/images/roof-replacement-1600.webp 1600w"
     sizes="100vw" width="1600" height="900"
     alt="Crew installing architectural shingles on a two-story home"
     fetchpriority="high" decoding="async">

<!-- Below the fold -->
<img src="..." srcset="..." sizes="(min-width: 60rem) 33vw, 100vw"
     width="800" height="600" alt="..." loading="lazy" decoding="async">
```

- Always width/height (intrinsic ratio) or CSS `aspect-ratio` → prevents CLS.
- `sizes` must reflect the actual layout width; wrong `sizes` wastes bytes.
- CSS background images: only decorative. Use `image-set()` for WebP and keep them small; if a background is the LCP element, switch to `<img>` or preload it.

