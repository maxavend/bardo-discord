import { EditorSaveCoordinator } from './editor-save-machine.js';

const securedFetch = window.fetch.bind(window);
const DRAFT_PREFIX = 'bardo:document-draft:';
const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let currentDocumentId = null;
let bypassExitProtection = false;
let draftTimer = null;
let stateRenderTimer = null;

function documentFingerprint(job) {
  const value = job?.document || job || {};
  return JSON.stringify({ title: String(value.title || ''), markdown: String(value.markdown || '') });
}

function statusNode() { return document.querySelector('#action-status'); }
function bodyNode() { return document.querySelector('#document-body'); }
function titleNode() { return document.querySelector('#document-title'); }
function editButton() { return document.querySelector('#edit-document'); }
function isEditing() { return Boolean(bodyNode()?.isContentEditable || bodyNode()?.getAttribute('contenteditable') === 'true'); }
function unsafeState(state) { return ['dirty', 'saving', 'error', 'conflict'].includes(state); }

function draftKey(documentId = currentDocumentId) { return documentId ? `${DRAFT_PREFIX}${documentId}` : null; }

function readDraft(documentId = currentDocumentId) {
  const key = draftKey(documentId); if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value || Date.now() - Number(value.updatedAt || 0) > DRAFT_MAX_AGE) { localStorage.removeItem(key); return null; }
    return value;
  } catch { return null; }
}

function writeDraft() {
  const key = draftKey(); const body = bodyNode(); const title = titleNode();
  if (!key || !body || !title) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      title: title.textContent || '',
      html: body.innerHTML,
      baseVersion: coordinator.version,
      updatedAt: Date.now(),
    }));
  } catch {}
}

function clearDraft() {
  const key = draftKey(); if (!key) return;
  try { localStorage.removeItem(key); } catch {}
  document.querySelector('#bardo-draft-recovery')?.remove();
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(writeDraft, 250);
}

function renderState(state, detail) {
  const node = statusNode();
  if (node) {
    node.classList.toggle('is-error', state === 'error' || state === 'conflict');
    node.setAttribute('role', state === 'error' || state === 'conflict' ? 'alert' : 'status');
    const labels = {
      dirty: 'Cambios sin guardar',
      saving: 'Guardando…',
      saved: 'Guardado',
      clean: '',
      error: 'No se pudo guardar · Reintenta',
      conflict: 'Conflicto · Hay una versión más reciente',
    };
    node.textContent = labels[state] ?? '';
  }
  document.documentElement.dataset.bardoEditorSaveState = state;
  if (state === 'saved') clearDraft();
  if (state === 'error' || state === 'conflict') {
    clearTimeout(stateRenderTimer);
    stateRenderTimer = window.setTimeout(() => {
      renderState(state, detail);
      showIssuePanel(state, detail);
    }, 0);
  } else if (state !== 'saving') {
    document.querySelector('#bardo-editor-issue')?.remove();
  }
  window.dispatchEvent(new CustomEvent('bardo:editor-state', { detail: { state, version: coordinator.version } }));
}

function versionFromEtag(response, data) {
  const explicit = Number(data?.version || data?.document?.version);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = response.headers.get('etag')?.match(/bardo-doc-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function buildHeaders(input, init, expectedVersion) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
  headers.set('Content-Type', 'application/json');
  headers.set('If-Match', `"bardo-doc-${expectedVersion}"`);
  return headers;
}

async function saveTransport(job, expectedVersion) {
  if (!Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) < 1) {
    const error = new Error('No conocemos la versión base del documento. Recarga antes de guardar.');
    error.code = 'DOCUMENT_VERSION_REQUIRED';
    throw error;
  }
  let response;
  try {
    response = await securedFetch(job.input, {
      ...job.init,
      method: 'PATCH',
      headers: buildHeaders(job.input, job.init, expectedVersion),
      body: JSON.stringify({ ...job.document, expectedVersion }),
    });
  } catch (cause) {
    const error = new Error('No pudimos contactar a Bardo para guardar.');
    error.code = 'DOCUMENT_SAVE_NETWORK_ERROR'; error.cause = cause; throw error;
  }
  const data = await response.clone().json().catch(() => ({}));
  if (response.status === 409) {
    const error = new Error(data.error || 'El documento cambió en otra sesión.');
    error.code = 'DOCUMENT_VERSION_CONFLICT';
    error.currentVersion = data.currentVersion || null;
    error.updatedAt = data.updatedAt || null;
    error.lastEditedBy = data.lastEditedBy || null;
    error.title = data.title || null;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data.error || `No se pudo guardar (HTTP ${response.status}).`);
    error.code = data.code || 'DOCUMENT_SAVE_ERROR'; throw error;
  }
  return { response, version: versionFromEtag(response, data) || expectedVersion + 1 };
}

const coordinator = new EditorSaveCoordinator({
  transport: saveTransport,
  fingerprint: documentFingerprint,
  onState: renderState,
});
globalThis.__bardoEditorSave = coordinator;

async function parsePatchJob(input, init) {
  const request = input instanceof Request
    ? input.clone()
    : new Request(new URL(String(input), location.href), { ...init, method: 'PATCH' });
  const document = await request.json().catch(() => null);
  if (!document) return null;
  return { input, init, document };
}

function documentRoute(url) {
  const match = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

window.fetch = async (input, init = {}) => {
  const raw = input instanceof Request ? input.url : String(input);
  const url = new URL(raw, location.href);
  const documentId = url.origin === location.origin ? documentRoute(url) : null;
  const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (documentId && method === 'GET') {
    const response = await securedFetch(input, init);
    if (response.ok) {
      const data = await response.clone().json().catch(() => null);
      if (data?.version) {
        currentDocumentId = documentId;
        coordinator.sync({ version: data.version, payload: { document: { title: data.title, markdown: data.markdown } } });
        window.setTimeout(() => installDraftRecovery(data.version), 0);
      }
    }
    return response;
  }

  if (documentId && method === 'PATCH') {
    currentDocumentId = documentId;
    const job = await parsePatchJob(input, init);
    if (!job) return securedFetch(input, init);
    try {
      const result = await coordinator.enqueue(job);
      if (result?.response) return result.response;
      return new Response(JSON.stringify({ ok: true, deduped: true, document: { version: coordinator.version } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: `"bardo-doc-${coordinator.version}"` },
      });
    } catch (error) {
      if (error?.code === 'DOCUMENT_VERSION_CONFLICT') {
        return new Response(JSON.stringify({
          error: error.message,
          code: error.code,
          currentVersion: error.currentVersion,
          updatedAt: error.updatedAt,
          lastEditedBy: error.lastEditedBy,
          title: error.title,
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      throw error;
    }
  }
  return securedFetch(input, init);
};

function issuePanel() {
  let panel = document.querySelector('#bardo-editor-issue');
  if (panel) return panel;
  panel = document.createElement('aside'); panel.id = 'bardo-editor-issue'; panel.className = 'bardo-editor-issue'; panel.setAttribute('role', 'alert');
  document.querySelector('.document-header')?.appendChild(panel);
  return panel;
}

function button(label, action, primary = false) {
  const node = document.createElement('button'); node.type = 'button'; node.className = `bardo-button ${primary ? 'bardo-button-primary' : 'bardo-button-secondary'}`; node.textContent = label; node.addEventListener('click', action); return node;
}

function copyOwnChanges() {
  const text = `${titleNode()?.textContent || ''}\n\n${bodyNode()?.innerText || ''}`.trim();
  navigator.clipboard?.writeText(text).catch(() => {});
}

function showIssuePanel(state, detail) {
  const panel = issuePanel(); panel.replaceChildren();
  const copy = document.createElement('div'); copy.className = 'bardo-editor-issue-copy';
  const strong = document.createElement('strong'); strong.textContent = state === 'conflict' ? 'Hay una versión más reciente' : 'No se pudo guardar';
  const text = document.createElement('span');
  text.textContent = state === 'conflict'
    ? `Tus cambios siguen en este dispositivo. La versión actual es v${detail?.currentVersion || '?'}. Revisa antes de reemplazar contenido.`
    : 'Conservamos un borrador local. Puedes reintentar sin salir del documento.';
  copy.append(strong, text); const actions = document.createElement('div'); actions.className = 'bardo-editor-issue-actions';
  actions.appendChild(button('Copiar mis cambios', copyOwnChanges));
  if (state === 'error') {
    actions.appendChild(button('Reintentar y recargar', () => {
      coordinator.retry().then(() => location.reload()).catch((error) => showIssuePanel(error?.code === 'DOCUMENT_VERSION_CONFLICT' ? 'conflict' : 'error', error));
    }, true));
  } else {
    actions.appendChild(button('Recargar versión actual', () => location.reload(), true));
  }
  panel.append(copy, actions);
}

function recoveryPanel(draft, serverVersion) {
  let panel = document.querySelector('#bardo-draft-recovery');
  if (panel) return panel;
  panel = document.createElement('aside'); panel.id = 'bardo-draft-recovery'; panel.className = 'bardo-editor-issue'; panel.setAttribute('role', 'status');
  const copy = document.createElement('div'); copy.className = 'bardo-editor-issue-copy';
  const strong = document.createElement('strong'); strong.textContent = 'Hay un borrador recuperable';
  const text = document.createElement('span'); text.textContent = Number(draft.baseVersion) === Number(serverVersion)
    ? 'Este borrador no llegó al servidor. Puedes recuperarlo para seguir editando.'
    : `El borrador partió de v${draft.baseVersion}; el servidor está en v${serverVersion}. Revisa la versión actual antes de recuperarlo.`;
  copy.append(strong, text);
  const actions = document.createElement('div'); actions.className = 'bardo-editor-issue-actions';
  actions.append(button('Descartar', () => clearDraft()));
  actions.append(button('Recuperar para revisar', () => applyDraft(draft), true));
  panel.append(copy, actions);
  document.querySelector('.document-header')?.appendChild(panel);
  return panel;
}

function installDraftRecovery(serverVersion) {
  const draft = readDraft();
  if (!draft || !document.querySelector('.document-header')) return;
  recoveryPanel(draft, serverVersion);
}

function applyDraft(draft) {
  const apply = () => {
    if (titleNode()) titleNode().textContent = draft.title || titleNode().textContent || '';
    if (bodyNode()) bodyNode().innerHTML = draft.html || bodyNode().innerHTML;
    bodyNode()?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    titleNode()?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    document.querySelector('#bardo-draft-recovery')?.remove();
  };
  if (!isEditing()) { editButton()?.click(); window.setTimeout(apply, 0); } else apply();
}

function triggerManualSave() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
}

async function protectEditorExit(target) {
  if (coordinator.state === 'dirty') triggerManualSave();
  const settled = await coordinator.waitForSettled();
  if (settled === 'saved' || settled === 'clean') {
    bypassExitProtection = true; target.click();
  } else showIssuePanel(settled, coordinator.retryJob?.error || null);
}

document.addEventListener('input', (event) => {
  if (!(event.target instanceof Node)) return;
  if (!bodyNode()?.contains(event.target) && event.target !== titleNode()) return;
  if (!isEditing()) return;
  coordinator.markDirty(); scheduleDraft();
}, true);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('#edit-document') : null;
  if (!target || !isEditing()) return;
  if (bypassExitProtection) { bypassExitProtection = false; return; }
  if (!unsafeState(coordinator.state)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (coordinator.state === 'error' || coordinator.state === 'conflict') { showIssuePanel(coordinator.state, null); return; }
  protectEditorExit(target).catch(() => showIssuePanel('error', null));
}, true);

window.addEventListener('beforeunload', (event) => {
  if (!unsafeState(coordinator.state)) return;
  writeDraft(); event.preventDefault(); event.returnValue = '';
});
window.addEventListener('pagehide', () => { if (unsafeState(coordinator.state)) writeDraft(); });

function formatHistoryMeta(item) {
  const bits = [`v${item.version}`];
  if (item.authorId) bits.push(item.authorId);
  if (item.reason) bits.push(item.reason);
  if (item.createdAt) {
    const date = new Date(item.createdAt); if (!Number.isNaN(date.getTime())) bits.push(new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date));
  }
  return bits.join(' · ');
}

async function restoreRevision(revisionId) {
  const response = await securedFetch(`/api/documents/${encodeURIComponent(currentDocumentId)}/history/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"bardo-doc-${coordinator.version}"` },
    body: JSON.stringify({ expectedVersion: coordinator.version }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    const error = new Error(data.error || 'Conflicto'); error.code = 'DOCUMENT_VERSION_CONFLICT'; error.currentVersion = data.currentVersion; showIssuePanel('conflict', error); return;
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  clearDraft(); location.reload();
}

async function openHistory() {
  if (!currentDocumentId) return;
  const response = await securedFetch(`/api/documents/${encodeURIComponent(currentDocumentId)}/history?limit=30`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const history = await response.json();
  const backdrop = document.createElement('div'); backdrop.className = 'bardo-product-modal-backdrop';
  const modal = document.createElement('section'); modal.className = 'bardo-product-modal bardo-history-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'bardo-history-title');
  const heading = document.createElement('h2'); heading.id = 'bardo-history-title'; heading.textContent = 'Historial del documento';
  const current = document.createElement('p'); current.className = 'bardo-history-current'; current.textContent = `Versión actual: v${history.current?.version || coordinator.version}`;
  const list = document.createElement('div'); list.className = 'bardo-history-list';
  for (const item of history.revisions || []) {
    const row = document.createElement('article'); row.className = 'bardo-history-row';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.title || 'Documento'; const meta = document.createElement('span'); meta.textContent = formatHistoryMeta(item); copy.append(title, meta);
    const restore = button('Restaurar', () => { restore.disabled = true; restoreRevision(item.id).catch(() => { restore.disabled = false; }); });
    row.append(copy, restore); list.appendChild(row);
  }
  if (!list.childElementCount) { const empty = document.createElement('p'); empty.textContent = 'Todavía no hay versiones anteriores.'; list.appendChild(empty); }
  const close = button('Cerrar', () => backdrop.remove()); const actions = document.createElement('div'); actions.className = 'bardo-product-modal-actions'; actions.appendChild(close);
  modal.append(heading, current, list, actions); backdrop.appendChild(modal); document.body.appendChild(backdrop); close.focus();
}

function installHistoryButton() {
  const actions = document.querySelector('.document-actions');
  if (!actions || actions.querySelector('[data-bardo-history]')) return;
  const node = document.createElement('button'); node.type = 'button'; node.className = 'action-button action-button-secondary'; node.dataset.bardoHistory = 'true'; node.textContent = 'Historial';
  node.addEventListener('click', () => openHistory().catch(() => showIssuePanel('error', null)));
  actions.appendChild(node);
}

const observer = new MutationObserver(() => installHistoryButton());
function start() { installHistoryButton(); observer.observe(document.body, { childList: true, subtree: true }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
