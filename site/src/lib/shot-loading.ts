export {};

// Static pictures remain visible without JavaScript; only cold images need a skeleton.
document.querySelectorAll<HTMLElement>('.shot-loader').forEach(loader => {
  const image = loader.querySelector<HTMLImageElement>('img');
  if (!image) return;
  const fail = () => {
    loader.classList.remove('t-skel');
    loader.dataset.state = 'error';
    loader.removeAttribute('aria-busy');
    loader.querySelector<HTMLElement>('[data-shot-error]')?.removeAttribute('hidden');
  };
  const reveal = async () => {
    try { await image.decode(); } catch {
      if (!image.naturalWidth) { fail(); return; }
    }
    loader.classList.add('is-revealed');
    loader.dataset.state = 'loaded';
    loader.removeAttribute('aria-busy');
  };
  image.addEventListener('load', reveal);
  image.addEventListener('error', fail);
  if (image.complete && image.naturalWidth) {
    loader.dataset.state = 'loaded';
    return;
  }
  if (image.complete && image.currentSrc) { fail(); return; }
  loader.classList.add('t-skel');
  loader.dataset.state = 'loading';
  loader.setAttribute('aria-busy', 'true');
});
