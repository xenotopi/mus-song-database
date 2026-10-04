/* Lucide 0.468.0: https://github.com/lucide-icons/lucide/tree/0.468.0/icons
 * Selected, unmodified SVG geometry. See ../icons/lucide-LICENSE.txt.
 * Only explicitly marked decorative icons are rendered; links remain the controls.
 */
(() => {
  if (window.SiteIcons) return;
  if (!document.querySelector('link[href*="assets/css/icons.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'assets/css/icons.css?v=2';
    document.head.append(css);
  }
  const shapes = Object.freeze({
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'music-2': '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/>',
    'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'mic-vocal': '<path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/><path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/><circle cx="16" cy="7" r="5"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'chart-no-axes-column-increasing': '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
    'users-round': '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
    'history': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'
  });

  function render(root = document) {
    const hosts = [...(root.matches?.('[data-site-icon]') ? [root] : []), ...root.querySelectorAll('[data-site-icon]')];
    hosts.forEach(host => {
      const name = host.dataset.siteIcon;
      if (!Object.hasOwn(shapes, name) || host.dataset.iconRendered === name) return;
      host.innerHTML = `<svg class="site-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name]}</svg>`;
      host.dataset.iconRendered = name;
    });
  }

  window.SiteIcons = Object.freeze({ render });
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1 && node.namespaceURI !== 'http://www.w3.org/2000/svg') render(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(), { once: true });
  else render();
})();
