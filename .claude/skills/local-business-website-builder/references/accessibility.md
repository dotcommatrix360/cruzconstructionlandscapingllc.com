# Accessibility (WCAG 2.2 AA target)

Native HTML first; ARIA only to fill genuine gaps.

## Structure
- Landmarks: `<header>`, `<nav aria-label="Primary">`, `<main id="main">`, `<footer>`. One `<main>`.
- Skip link as first focusable element: `<a class="skip-link" href="#main">Skip to content</a>`.
- One H1; no skipped levels downward (H2 → H4). `lang` on `<html>`.
- Lists for lists, `<table>` with `<th scope>` for tabular data, `<button>` for actions, `<a href>` for navigation. Never `<div onclick>`.

## Keyboard & focus
- Everything operable by keyboard in logical order; no positive `tabindex`.
- Visible focus via `:focus-visible` with ≥ 3:1 contrast against adjacent colors; never `outline: none` without replacement.
- Focus not obscured by sticky headers (2.4.11) → `scroll-padding-top`.
- Mobile menu: `<button aria-expanded aria-controls>`, Esc closes, focus returns to button.
- Dialogs: native `<dialog>` with `showModal()`; labelled; Esc closes.

## Color & text
- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24px or 19px bold); UI components/graphics ≥ 3:1.
- Don't convey meaning by color alone.
- Text resizes to 200% and reflows at 320px width without horizontal scroll (except data tables/maps).
- Line height ≥ 1.5 body; respects user text-spacing overrides (no fixed heights on text boxes).

## Forms
- Every input has a visible `<label for>`; placeholders aren't labels.
- `autocomplete` tokens (`name`, `email`, `tel`, `street-address`, `postal-code`), correct `type`/`inputmode`.
- Required fields: `required` + visible indicator explained.
- Errors: text message next to field, linked via `aria-describedby`, `aria-invalid="true"`, summary focus on submit failure; announced via `role="alert"` or live region.
- Don't rely on CAPTCHA puzzles alone (3.3.8 accessible authentication) — prefer honeypot/Turnstile invisible.

## Media & motion
- Alt text per images.md. Video captions; no autoplay with sound; autoplaying motion > 5s has pause.
- `@media (prefers-reduced-motion: reduce)` disables non-essential animation and smooth scroll.
- Targets ≥ 24×24 px (2.5.8); no drag-only interactions (2.5.7).

## Testing
Automated (catches ~30–40%): `browser-check.mjs` runs axe-core when installed (`npm i -D @axe-core/playwright` or `axe-core`); `validate.mjs` covers alt, labels, lang, headings, duplicate IDs, empty links/buttons.

Manual every launch:
- Tab through home + one template page: order, focus visibility, menu, skip link.
- 200% zoom and 320px width.
- Screen reader spot check (VoiceOver/NVDA) of nav, headings list, form errors.
- Contrast of text on images/gradients (tools can't judge).
