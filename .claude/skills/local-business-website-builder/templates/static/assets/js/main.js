// main.js — progressive enhancement only. The site must work without it.
// The inline <head> snippet adds .js before first paint (prevents layout shift); this is a fallback.
document.documentElement.classList.add('js');

(function navToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById(toggle?.getAttribute('aria-controls') || '');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 56.0625rem)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
})();

(function trackClicks() {
  // Pushes tel:/mailto: clicks to dataLayer for GTM triggers. Harmless without GTM.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="tel:"], a[href^="mailto:"]');
    if (!a) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: a.href.startsWith('tel:') ? 'phone_click' : 'email_click', link_url: a.href });
  });
})();
