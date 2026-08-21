import { announce, enhanceDialog, restoreDialogFocus } from './primitives.js';

document.documentElement.dataset.bardoUi = '3';

const MODE_TO_NAV = { board: 'boards', event: 'agenda', document: 'documents' };
const NAV_ITEMS = [
  ['home', 'Inicio'],
  ['documents', 'Documentos'],
  ['boards', 'Tableros'],
  ['agenda', 'Agenda'],
];

function currentMode() {
  return MODE_TO_NAV[document.documentElement.dataset.bardoMode] || 'documents';
}

function hrefFor(key) {
  const url = new URL(location.href);
  const params = url.searchParams;
  const keyMap = { documents: 'document', boards: 'board', agenda: 'event' };
  if (key === 'home') return null; // Real Home ships in Phase 4.
  const parameter = keyMap[key];
  if (!parameter || !params.get(parameter)) return key === currentMode() ? location.href : null;
  ['document', 'board', 'event', 'custom_id'].forEach((name) => { if (name !== parameter) params.delete(name); });
  return url.toString();
}

function buildNav() {
  const nav = document.createElement('nav');
  nav.className = 'bardo-context-nav';
  nav.setAttribute('aria-label', 'Navegación de Bardo');
  for (const [key, label] of NAV_ITEMS) {
    const href = hrefFor(key);
    const item = href ? document.createElement('a') : document.createElement('button');
    item.textContent = label;
    item.dataset.bardoNav = key;
    if (href) item.href = href;
    else { item.type = 'button'; item.setAttribute('aria-disabled', 'true'); item.title = key === 'home' ? 'Inicio estará disponible con Bardo Home' : `Abre un ${label.toLowerCase()} desde Discord para conservar el contexto`; }
    if (key === currentMode()) item.setAttribute('aria-current', 'page');
    nav.appendChild(item);
  }
  return nav;
}

function installNavigation() {
  const mode = document.documentElement.dataset.bardoMode;
  const host = mode === 'board'
    ? document.querySelector('.kanban-topbar')
    : mode === 'event'
      ? document.querySelector('.ev-top')
      : document.querySelector('.topbar');
  if (!host || host.querySelector('.bardo-context-nav')) return;
  host.appendChild(buildNav());
}

function enhanceNode(node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches('.kanban-modal,.ev-modal,[role="dialog"]')) enhanceDialog(node);
  node.querySelectorAll?.('.kanban-modal,.ev-modal,[role="dialog"]').forEach(enhanceDialog);
  node.querySelectorAll?.('.kanban-toast,.ev-toast').forEach((toast) => { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); });
  node.querySelectorAll?.('.view-state,.kanban-state').forEach((state) => { if (/no pudimos|error/i.test(state.textContent || '')) state.dataset.bardoError = 'true'; });
}

const removedDialogs = new Set();
const observer = new MutationObserver((records) => {
  for (const record of records) {
    record.addedNodes.forEach(enhanceNode);
    record.removedNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches('.kanban-modal,.ev-modal,[role="dialog"]')) removedDialogs.add(node);
      node.querySelectorAll?.('.kanban-modal,.ev-modal,[role="dialog"]').forEach((dialog) => removedDialogs.add(dialog));
    });
  }
  for (const dialog of removedDialogs) { restoreDialogFocus(dialog); removedDialogs.delete(dialog); }
  installNavigation();
});

function start() {
  enhanceNode(document.body);
  observer.observe(document.body, { childList: true, subtree: true });
  installNavigation();
  const modeObserver = new MutationObserver(installNavigation);
  modeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bardo-mode'] });
  window.addEventListener('bardo:save-error', () => announce('No se pudo guardar. Reintenta.', 'assertive'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
