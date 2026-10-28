const root = document.documentElement;
const viewport = window.visualViewport;

let baselineHeight = viewport?.height || window.innerHeight;
let frame = 0;
let settleTimer = 0;
let pinProbe = null;

function editingTextIsFocused() {
  const active = document.activeElement;
  if (!active?.closest?.('.editing-route')) return false;
  return active.isContentEditable || active.matches?.('.doc-title-input, .doc-description-input, textarea, input[type="text"], input[type="url"]');
}

function rememberBaseline() {
  if (!viewport) return;
  baselineHeight = Math.max(baselineHeight, viewport.height);
}

// The sticky line (below the header) in layout-viewport coordinates, measured
// with a fixed probe so it includes Discord's safe area.
function toolbarPinLine() {
  if (!pinProbe) {
    pinProbe = document.createElement('div');
    pinProbe.className = 'editor-toolbar-pin-probe';
    pinProbe.setAttribute('aria-hidden', 'true');
    document.body.append(pinProbe);
  }
  return pinProbe.getBoundingClientRect().top;
}

// With the keyboard open the toolbar is pinned only once scrolling has carried
// it to the sticky line, like position: sticky; before that it stays in place.
function syncToolbarPin(keyboardOpen) {
  const wrapper = document.querySelector('.editing-route .editor-toolbar-sticky');
  const toolbar = wrapper?.querySelector('.editor-toolbar-container');
  if (!keyboardOpen || !wrapper || !toolbar) {
    root.removeAttribute('data-editor-toolbar');
    if (toolbar) root.style.setProperty('--bardo-editor-toolbar-height', `${toolbar.offsetHeight}px`);
    return;
  }
  if (root.dataset.editorToolbar !== 'pinned') {
    root.style.setProperty('--bardo-editor-toolbar-height', `${toolbar.offsetHeight}px`);
  }
  const pinned = wrapper.getBoundingClientRect().top <= toolbarPinLine() + 0.5;
  if (pinned) root.dataset.editorToolbar = 'pinned';
  else root.removeAttribute('data-editor-toolbar');
}

function syncKeyboardState() {
  if (!viewport) {
    root.style.setProperty('--bardo-visual-viewport-top', '0px');
    root.style.setProperty('--bardo-visual-viewport-left', '0px');
    root.removeAttribute('data-editor-keyboard');
    syncToolbarPin(false);
    return;
  }

  root.style.setProperty('--bardo-visual-viewport-top', `${Math.max(0, viewport.offsetTop)}px`);
  root.style.setProperty('--bardo-visual-viewport-left', `${Math.max(0, viewport.offsetLeft)}px`);

  const focused = editingTextIsFocused();
  const reduction = Math.max(0, baselineHeight - viewport.height);
  const keyboardOpen = focused && reduction > 120;

  if (keyboardOpen) root.dataset.editorKeyboard = 'open';
  else root.removeAttribute('data-editor-keyboard');
  syncToolbarPin(keyboardOpen);

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
window.addEventListener('scroll', scheduleSync, {passive: true});
document.addEventListener('focusin', () => {
  // focusin usually fires before the keyboard finishes animating, which makes
  // it the safest moment to preserve the keyboard-free baseline.
  rememberBaseline();
  scheduleSync();
});
document.addEventListener('focusout', () => window.setTimeout(scheduleSync, 0));
window.addEventListener('orientationchange', () => {
  root.removeAttribute('data-editor-keyboard');
  root.removeAttribute('data-editor-toolbar');
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
