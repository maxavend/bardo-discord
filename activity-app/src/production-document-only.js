const STORE_KEY = 'bardo.docs.heroui.v1';
const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return parsed && Array.isArray(parsed.docs) ? parsed : null;
  } catch {
    return null;
  }
}

function readLastOpenedId() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_OPENED_KEY) || 'null');
    return typeof parsed?.id === 'string' && parsed.id.trim() ? parsed.id.trim() : null;
  } catch {
    return null;
  }
}

function documentIdFromHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (hash.startsWith('doc-')) return hash.slice(4) || null;
  if (hash.startsWith('edit-')) return hash.slice(5) || null;
  return null;
}

function forceDocumentRoute(documentId) {
  if (!documentId) return;
  const encoded = encodeURIComponent(documentId);
  const expectedDoc = `#doc-${encoded}`;
  const expectedEdit = `#edit-${encoded}`;
  if (location.hash === expectedDoc || location.hash === expectedEdit) return;
  history.replaceState(null, '', expectedDoc);
}

function installDocumentOnlyGuard(documentId) {
  document.documentElement.dataset.bardoMode = 'document-only';

  const disableNonDocumentActions = () => {
    document.querySelectorAll('option[value="reset"], option[value="duplicate"], option[value="delete"]').forEach(option => {
      option.disabled = true;
    });
  };

  const observer = new MutationObserver(disableNonDocumentActions);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  disableNonDocumentActions();

  const enforceRoute = () => {
    if (!documentId) return;
    const decoded = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (decoded === `doc-${documentId}` || decoded === `edit-${documentId}`) return;
    forceDocumentRoute(documentId);
  };

  window.addEventListener('hashchange', enforceRoute);
  enforceRoute();
}

export async function activateBardoDocumentOnlyMode() {
  if (!window.__BARDO_PRODUCTION__) return {active:false, ready:true, documentId:null};

  window.__BARDO_DOCUMENT_ONLY__ = true;

  // The authenticated /api/docs hydration is the source of truth. It resolves
  // the document from a signed Discord launch intent (or custom_id when present)
  // and writes the resulting route/LAST_OPENED state before this guard runs.
  const store = readStore();
  const candidates = [
    window.__BARDO_DOCUMENT_ID__,
    documentIdFromHash(),
    readLastOpenedId(),
  ].filter(Boolean);
  let documentId = candidates.find(id => store?.docs?.some(doc => doc.id === id)) || null;

  if (!documentId && store?.docs?.length > 0) {
    documentId = store.docs[0].id;
  }

  window.__BARDO_DOCUMENT_ID__ = documentId;
  installDocumentOnlyGuard(documentId);

  if (documentId) {
    try {
      localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({id:documentId, offset:0, at:Date.now()}));
    } catch {}
    forceDocumentRoute(documentId);
  }

  return {active:true, ready:true, documentId};
}
