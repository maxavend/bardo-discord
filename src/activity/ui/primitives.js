export function announce(message, tone = 'polite') {
  let region = document.querySelector('#bardo-live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'bardo-live-region';
    region.className = 'bardo-live-region';
    region.setAttribute('aria-live', tone === 'assertive' ? 'assertive' : 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = String(message || ''); });
}

export function enhanceDialog(dialog) {
  if (!(dialog instanceof HTMLElement) || dialog.dataset.bardoDialogEnhanced === 'true') return;
  dialog.dataset.bardoDialogEnhanced = 'true';
  dialog.setAttribute('role', dialog.getAttribute('role') || 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const heading = dialog.querySelector('h1,h2,h3,.modal-title');
  if (heading && !dialog.hasAttribute('aria-labelledby')) {
    if (!heading.id) heading.id = `bardo-dialog-title-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog._bardoPreviousFocus = previous;
  const focusables = () => [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hidden && el.getClientRects().length);
  queueMicrotask(() => (focusables()[0] || dialog).focus?.());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const nodes = focusables();
    if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export function restoreDialogFocus(dialog) {
  dialog?._bardoPreviousFocus?.focus?.({ preventScroll: true });
}

export function markStatus(element, state) {
  if (!element) return;
  element.dataset.state = state;
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
}
