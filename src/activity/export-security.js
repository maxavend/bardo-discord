import { normalizeDocumentId } from '../document-id.js';

function directDocumentId() {
  const params = new URLSearchParams(window.location.search);
  const candidates = [params.get('custom_id'), params.get('document'), params.get('id')];
  for (const candidate of candidates) {
    const id = normalizeDocumentId(candidate);
    if (id) return id;
  }
  return null;
}

async function resolveDocumentId() {
  const direct = directDocumentId();
  if (direct) return direct;
  const auth = await globalThis.__bardoActivityAuth?.ready;
  const instanceId = auth?.instanceId;
  if (!instanceId) return null;
  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const context = await response.json();
  return normalizeDocumentId(context?.documentId);
}

function filenameFromResponse(response, format) {
  const disposition = response.headers.get('content-disposition') || '';
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.replace(/^"|"$/g, '')); } catch {}
  }
  const basic = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  if (basic) return basic;
  const extension = format === 'word' || format === 'doc' ? 'docx' : format;
  return `documento-bardo.${extension || 'md'}`;
}

function setDownloadStatus(message, isError = false) {
  const status = document.querySelector('#action-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function downloadAuthenticatedDocument(format) {
  const documentId = await resolveDocumentId();
  if (!documentId) throw new Error('No se pudo resolver el documento de esta Activity.');
  setDownloadStatus('Preparando descarga…');

  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/export?format=${encodeURIComponent(format)}`, {
    headers: { Accept: '*/*' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filenameFromResponse(response, format);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setDownloadStatus('Descarga lista');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

// app.js registers a bubbling change listener. Capture here so exports cannot fall
// through to the legacy unauthenticated navigation/openExternalLink path.
document.addEventListener('change', (event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || select.id !== 'download-select') return;
  const format = select.value;
  if (!format) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void downloadAuthenticatedDocument(format)
    .catch((error) => {
      console.error('Error al descargar documento de forma autenticada:', error);
      setDownloadStatus('No se pudo descargar · Reintentar', true);
    })
    .finally(() => {
      select.value = '';
    });
}, true);
