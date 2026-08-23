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

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
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

  const stripNonDocumentUi = () => {
    document.querySelectorAll('.back-button').forEach(node => node.remove());
    document.querySelectorAll('option[value="reset"], option[value="duplicate"], option[value="delete"]').forEach(option => option.remove());
  };

  const observer = new MutationObserver(stripNonDocumentUi);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  stripNonDocumentUi();

  const enforceRoute = () => {
    if (!documentId) return;
    const decoded = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (decoded === `doc-${documentId}` || decoded === `edit-${documentId}`) return;
    forceDocumentRoute(documentId);
  };

  window.addEventListener('hashchange', enforceRoute);
  enforceRoute();
}

async function resolveContextDocument(instanceId) {
  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
    headers:{Accept:'application/json'},
    cache:'no-store',
  });
  if (!response.ok) throw new Error(`activity-context HTTP ${response.status}`);
  const payload = await response.json();
  return typeof payload?.documentId === 'string' && payload.documentId.trim() ? payload.documentId.trim() : null;
}

export async function activateBardoDocumentOnlyMode() {
  if (!window.__BARDO_PRODUCTION__) return {active:false, ready:true, documentId:null};

  const instanceId = window.__BARDO_INSTANCE_ID__;
  window.__BARDO_DOCUMENT_ONLY__ = true;

  if (!instanceId) {
    installDocumentOnlyGuard(null);
    return {active:true, ready:false, documentId:null, message:'Abre un documento desde un mensaje de Bardo en Discord.'};
  }

  let documentId = null;
  try {
    documentId = await resolveContextDocument(instanceId);
  } catch (error) {
    console.warn('Bardo Docs: no se pudo resolver el documento de la Activity', error);
  }

  window.__BARDO_DOCUMENT_ID__ = documentId;
  installDocumentOnlyGuard(documentId);

  if (!documentId) {
    return {active:true, ready:false, documentId:null, message:'No pudimos identificar el documento de este mensaje.'};
  }

  const store = readStore();
  const current = store?.docs?.find(doc => doc.id === documentId) || null;
  if (!current) {
    return {active:true, ready:false, documentId, message:'No pudimos cargar este documento. Cierra esta vista y vuelve a abrirlo desde el mensaje.'};
  }

  writeStore({
    ...store,
    docs:[current],
  });

  try {
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({id:documentId, offset:0, at:Date.now()}));
  } catch {}

  forceDocumentRoute(documentId);
  return {active:true, ready:true, documentId};
}
