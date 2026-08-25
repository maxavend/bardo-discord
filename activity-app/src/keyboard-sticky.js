const root = document.documentElement;
const viewport = window.visualViewport;

let baselineHeight = viewport?.height || window.innerHeight;
let frame = 0;
let settleTimer = 0;

function editingTextIsFocused() {
  const active = document.activeElement;
  if (!active?.closest?.('.editing-route')) return false;
  return active.isContentEditable || active.matches?.('.doc-title-input, .doc-description-input, textarea, input[type="text"], input[type="url"]');
}

function rememberBaseline() {
  if (!viewport) return;
  baselineHeight = Math.max(baselineHeight, viewport.height);
}

function syncKeyboardState() {
  if (!viewport) {
    root.style.setProperty('--bardo-visual-viewport-top', '0px');
    root.style.setProperty('--bardo-visual-viewport-left', '0px');
    root.removeAttribute('data-editor-keyboard');
    return;
  }

  root.style.setProperty('--bardo-visual-viewport-top', `${Math.max(0, viewport.offsetTop)}px`);
  root.style.setProperty('--bardo-visual-viewport-left', `${Math.max(0, viewport.offsetLeft)}px`);

  const focused = editingTextIsFocused();
  const reduction = Math.max(0, baselineHeight - viewport.height);
  const keyboardOpen = focused && reduction > 120;

  if (keyboardOpen) root.dataset.editorKeyboard = 'open';
  else root.removeAttribute('data-editor-keyboard');

  if (!focused && reduction < 80) {
    baselineHeight = Math.max(viewport.height, window.innerHeight);
  }
}

function scheduleSync() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(syncKeyboardState);
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(syncKeyboardState, 180);
}

// Establish the largest normal visual viewport as our keyboard-free baseline.
rememberBaseline();

viewport?.addEventListener('resize', scheduleSync, {passive: true});
viewport?.addEventListener('scroll', scheduleSync, {passive: true});
window.addEventListener('resize', scheduleSync, {passive: true});
document.addEventListener('focusin', () => {
  // focusin usually fires before the keyboard finishes animating, which makes
  // it the safest moment to preserve the keyboard-free baseline.
  rememberBaseline();
  scheduleSync();
});
document.addEventListener('focusout', () => window.setTimeout(scheduleSync, 0));
window.addEventListener('orientationchange', () => {
  root.removeAttribute('data-editor-keyboard');
  window.setTimeout(() => {
    baselineHeight = viewport?.height || window.innerHeight;
    scheduleSync();
  }, 300);
});
window.addEventListener('pageshow', () => {
  baselineHeight = viewport?.height || window.innerHeight;
  scheduleSync();
});

scheduleSync();
