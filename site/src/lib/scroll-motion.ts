export {};

// Progressive enhancement: HTML is readable even if JS or observers are unavailable.
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const pending = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;

function reveal(element: HTMLElement) {
  element.classList.add('is-shown');
  element.dataset.open = 'true';
  pending.delete(element);
  observer?.unobserve(element);
  const settled = (event: TransitionEvent) => {
    if (event.propertyName !== 'filter') return;
    (event.target as HTMLElement).style.willChange = 'auto';
    if (event.target === element || event.target === element.querySelector('[data-motion-item]:last-child')) {
      element.removeEventListener('transitionend', settled);
    }
  };
  element.addEventListener('transitionend', settled);
}

function revealTarget(target: Element | null) {
  if (!target) return;
  for (const element of pending) {
    if (element.contains(target) || target.contains(element)) reveal(element);
  }
}

function revealHash() {
  let target: HTMLElement | null = null;
  try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* Malformed hash stays harmless. */ }
  revealTarget(target);
}

if (!preference.matches && typeof IntersectionObserver !== 'undefined') {
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement);
  }, {threshold: 0.08, rootMargin: '0px 0px -4% 0px'});

  const staged: HTMLElement[] = [];
  const firstViewport = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-motion-group], [data-motion-reveal], [data-motion-rule]').forEach(element => {
    // The first viewport enters from the first paint without a visible → hidden flash.
    if (element.closest('[data-entry-reveal]')) return;
    const bounds = element.getBoundingClientRect();
    element.classList.add('is-shown');
    element.dataset.open = 'true';
    if (element.hasAttribute('data-motion-group')) {
      element.classList.add('t-stagger');
      element.querySelectorAll<HTMLElement>(':scope > [data-motion-item]').forEach((item, index) => {
        item.style.setProperty('--motion-display', getComputedStyle(item).display);
        item.style.setProperty('--motion-index', String(Math.min(index, 3)));
        item.classList.add('t-stagger-line');
      });
    } else if (element.hasAttribute('data-motion-reveal')) element.classList.add('t-panel-slide');
    else element.classList.add('motion-rule');

    // Restored scroll positions and direct anchor entries never replay content above the viewport.
    if (bounds.bottom < 0 || element.contains(document.activeElement)) return;
    const targets = element.hasAttribute('data-motion-group')
      ? Array.from(element.querySelectorAll<HTMLElement>(':scope > [data-motion-item]')) : [element];
    targets.forEach(target => { target.style.transition = 'none'; staged.push(target); });
    element.classList.remove('is-shown');
    element.dataset.open = 'false';
    pending.add(element);
    if (bounds.top < innerHeight && bounds.bottom > 0) {
      firstViewport.add(element);
    }
  });
  // Commit the hidden start without a reverse transition; then reveal from a painted frame.
  void document.documentElement.offsetHeight;
  requestAnimationFrame(() => {
    staged.forEach(element => element.style.removeProperty('transition'));
    requestAnimationFrame(() => {
      for (const element of pending) {
        if (firstViewport.has(element) || preference.matches) reveal(element);
        else observer?.observe(element);
      }
      revealHash();
    });
  });
  document.addEventListener('focusin', event => revealTarget(event.target as Element));
  window.addEventListener('hashchange', revealHash);
  window.addEventListener('pageshow', event => { if (event.persisted) for (const element of pending) reveal(element); });
  preference.addEventListener('change', () => {
    if (preference.matches) {
      for (const element of pending) reveal(element);
      observer?.disconnect();
    }
  });
}
