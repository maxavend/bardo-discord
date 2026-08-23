const root = document.documentElement;
const viewport = window.visualViewport;

let frame = 0;
let settleTimer = 0;

function editingControlIsFocused() {
  const active = document.activeElement;
  if (!active?.closest?.('.editing-route')) return false;
  return active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
}

function readVisualTop() {
  if (!viewport || !editingControlIsFocused()) return 0;

  // WebKit positions sticky elements against the layout viewport while the
  // software keyboard can pan the visual viewport. pageTop - scrollY is a
  // useful fallback on iOS versions where offsetTop briefly reports 0.
  const offsetTop = Number(viewport.offsetTop) || 0;
  const pageDelta = Math.max(0, (Number(viewport.pageTop) || 0) - window.scrollY);
  return Math.max(0, offsetTop, pageDelta);
}

function commitViewportOffset() {
  const top = readVisualTop();
  root.style.setProperty('--bardo-visual-viewport-top', `${top.toFixed(2)}px`);
}

function syncViewportOffset() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(commitViewportOffset);

  // iOS can publish the final visualViewport offset one tick late after the
  // keyboard animates. Re-read once after the animation starts settling.
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(commitViewportOffset, 80);
}

root.style.setProperty('--bardo-visual-viewport-top', '0px');

viewport?.addEventListener('resize', syncViewportOffset, {passive: true});
viewport?.addEventListener('scroll', syncViewportOffset, {passive: true});
window.addEventListener('scroll', syncViewportOffset, {passive: true});
document.addEventListener('focusin', syncViewportOffset);
document.addEventListener('focusout', () => window.setTimeout(syncViewportOffset, 0));
window.addEventListener('pageshow', syncViewportOffset);
window.addEventListener('orientationchange', syncViewportOffset);

syncViewportOffset();
