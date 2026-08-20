const bodyEl = document.querySelector('#document-body');

function hydrateUnderlineMarkup() {
  if (!bodyEl) return;
  const html = bodyEl.innerHTML;
  if (!html.includes('&lt;u&gt;') && !html.includes('&lt;/u&gt;')) return;

  const hydrated = html
    .replaceAll('&lt;u&gt;', '<u>')
    .replaceAll('&lt;/u&gt;', '</u>');

  if (hydrated !== html) {
    bodyEl.innerHTML = hydrated;
  }
}

if (bodyEl) {
  const observer = new MutationObserver(hydrateUnderlineMarkup);
  observer.observe(bodyEl, { childList: true, subtree: true });
  requestAnimationFrame(hydrateUnderlineMarkup);
}
