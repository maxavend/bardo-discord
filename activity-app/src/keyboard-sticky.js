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

// Top of an element in document coordinates, from the layout alone. Not
// getBoundingClientRect(): with the keyboard open, iOS WebKit measures it from
// the visual viewport, while position: fixed uses the layout viewport.
function documentTop(element) {
  let top = 0;
  for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
  return top;
}

// With the keyboard open the toolbar is fixed, but never above its own slot in
// the document: near the top it stays in place instead of covering the title
// and leaving an empty gap where it used to be. The slot is passed in layout
// viewport coordinates, the same ones its `top` uses. visualViewport.pageTop
// and offsetTop mean the same in every engine (window.scrollY does not: WebKit
// reports the visual viewport there, Chromium the layout one).
function syncToolbarSlot() {
  if (root.dataset.editorKeyboard !== 'open') return;
  const slot = document.querySelector('.editing-route .editor-toolbar-sticky');
  if (!slot) return;
  const pageTop = viewport ? viewport.pageTop : window.scrollY;
  const offsetTop = viewport ? viewport.offsetTop : 0;
  root.style.setProperty('--bardo-toolbar-slot-top', `${documentTop(slot) - pageTop + offsetTop}px`);
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
  syncToolbarSlot();

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
// In the scroll handler itself, so the toolbar follows its slot in the same frame.
window.addEventListener('scroll', syncToolbarSlot, {passive: true});
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
