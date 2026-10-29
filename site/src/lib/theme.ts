export {};

const root = document.documentElement;
const query = matchMedia('(prefers-color-scheme: dark)');
const key = 'bardo-site-theme';

function preference() {
  try { const stored = localStorage.getItem(key); return stored === 'dark' || stored === 'light' ? stored : null; }
  catch { return null; }
}

function apply(theme: 'dark' | 'light') {
  const dark = theme === 'dark';
  root.classList.toggle('dark', dark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', dark ? '#211c25' : '#faf5ff');
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach(button => {
    button.disabled = false;
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    button.querySelector<HTMLElement>('[data-theme-icon]')?.setAttribute('data-state', dark ? 'b' : 'a');
  });
}

apply(preference() || (query.matches ? 'dark' : 'light'));
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem(key, next); } catch { /* The toggle still works when storage is unavailable. */ }
    apply(next);
  });
});
query.addEventListener('change', () => { if (!preference()) apply(query.matches ? 'dark' : 'light'); });
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) apply(preference() || (query.matches ? 'dark' : 'light'));
});
