// Bardo never zooms. The viewport meta (maximum-scale=1, user-scalable=no)
// covers Discord's WebView and the zoom on focusing a field; Safari ignores it
// for pinch, so its gesture events are cancelled here, along with ctrl+wheel
// (trackpad pinch on desktop).
const cancel = event => event.preventDefault();

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, cancel, {passive: false});
}

document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, {passive: false});

window.addEventListener('wheel', event => {
  if (event.ctrlKey) event.preventDefault();
}, {passive: false});
