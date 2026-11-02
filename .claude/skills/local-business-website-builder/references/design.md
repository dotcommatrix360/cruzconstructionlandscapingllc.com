# Design, Responsiveness & Browser Support

## Sources and fidelity

| Source | Approach |
|---|---|
| Figma | Pull exact tokens (colors, type, spacing, radii, shadows). Match layout at the frames given; interpolate fluidly between. |
| Screenshot | Measure proportions; sample colors; identify the font (or closest licensed/Google equivalent, noted in report). |
| Existing site | Preserve design and behaviour unless told otherwise. Inventory components first. |
| Brand guide | Tokens from the guide; build components around them. |
| Written brief only | Propose a direction grounded in the industry and audience; avoid template looks. Load the `frontend-design` skill if available. |

Before coding, replace the token set in `src/styles/tokens.css` (legacy: the `:root` block of `main.css`): palette (with contrast-checked text pairs), type scale (fluid `clamp()`), spacing scale, radii, shadows, motion durations. Components read only tokens, so a rebrand is one file.

## Quality bar

- Consistent alignment to a grid; consistent vertical rhythm from the spacing scale.
- Clear hierarchy: one dominant element per section; supporting copy readable (16px+ body, 45–75ch line length).
- CTAs: one primary action per view (call / book / quote). Phone number tappable (`tel:`) in header on mobile.
- Components consistent across pages: buttons, cards, forms, badges, section headers.
- Every interactive element has hover, `:focus-visible`, active and disabled states. Focus ring visible on all backgrounds.
- Trust elements real only: licenses, reviews, photos of actual work.
- Distinctive per client: typography pairing, color, imagery treatment, section rhythm. Never ship the starter look unmodified.
- Avoid the generic AI-template look: the same hero → three icon cards → testimonial carousel → CTA on every page, stock-photo heroes, vague claims ("quality you can trust"). Let the client's real work, place and voice shape each section; vary layouts by page purpose (service page ≠ location page ≠ homepage).
- Conversion: one primary action per view, tap-to-call in the header on mobile, the form reachable from every page, trust signals that are real (licence numbers, actual reviews with source, real project photos).
- Build sections as Astro components with props (heading level, variant) rather than copy-pasting markup between pages; page-specific sections can live in the page file.

## Responsive method

Fluid first, breakpoints only where content breaks.

- `max-width` containers with `padding-inline: clamp(1rem, 4vw, 2rem)`.
- Grids: `grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr))`.
- Type and spacing via `clamp()`; avoid fixed heights on text containers.
- Images: `max-width:100%; height:auto`; art direction with `<picture>` when crops must differ; `object-fit` + `aspect-ratio` for cards.
- Navigation: disclosure button (`aria-expanded`, `aria-controls`) under the width where links wrap; works without JS by falling back to visible links or a footer nav.
- Tap targets ≥ 24×24 CSS px (WCAG 2.2), aim for 44px on primary controls.
- Test range: 320 → 2560 wide, plus landscape phone and 200% zoom.

Check for: horizontal overflow, overlapping/clipped text, image crops hiding subjects, sticky headers covering anchors (`scroll-margin-top`), forms usable on mobile keyboards (`type`, `inputmode`, `autocomplete`), layout shift from late fonts/images/embeds.

`browser-check.mjs` scans many widths for overflow and console errors automatically; visual judgment remains manual.

## Browser support

Target: current and previous major versions of Chrome, Edge, Firefox, Safari (macOS + iOS), Samsung Internet/Android Chrome.

- Safe baseline: CSS grid/flex/gap, custom properties, `clamp()`, `aspect-ratio`, `:focus-visible`, `:is()/:where()`, `<dialog>`, `loading="lazy"`, WebP, AVIF (with fallback via `<picture>`).
- Check before relying on: `:has()` (fine in current engines; give a sane fallback), container queries (fine; provide reasonable default), view transitions, anchor positioning, `@scope`, newer `text-wrap` values — progressive enhancement only.
- Use `@supports` for enhancement, never for essential layout.
- iOS Safari specifics: `100dvh` instead of `100vh` for full-height; inputs ≥16px to avoid zoom; test `position: sticky` inside overflow containers.
- When Playwright is installed with Firefox/WebKit, run `browser-check.mjs --browsers chromium,firefox,webkit`. WebKit approximates Safari; real iOS remains a manual check.
