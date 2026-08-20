import { DiscordSDK } from '@discord/embedded-app-sdk';
import { DOCX_STYLE_MAP, ensureDocumentTitle, pdfTextToMarkdown } from '../import-format.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const MAX_PDF_PAGES = 80;
const nativeFetch = window.fetch.bind(window);

function setImportStatus(title, message) {
  const loading = document.querySelector('#loading');
  const titleEl = loading?.querySelector('strong');
  const messageEl = loading?.querySelector('p');
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
}

function resolveClientId() {
  const host = window.location.hostname || '';
  return host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i)?.[1] || FALLBACK_CLIENT_ID;
}

async function resolveActivityInstanceId() {
  const params = new URLSearchParams(window.location.search);
  const queryInstanceId = params.get('instance_id');
  if (queryInstanceId) return queryInstanceId;

  if (!window.location.hostname.endsWith('.discordsays.com')) return null;

  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    return sdk.instanceId || null;
  } catch (error) {
    console.warn('Bardo no pudo resolver el instanceId para importar el archivo:', error);
    return null;
  }
}

async function importPdf(arrayBuffer, title) {
  setImportStatus('Adaptando PDF', 'Reconstruyendo encabezados, listas y contenido para el lector de Bardo…');

  if (typeof Promise.try !== 'function') {
    Object.defineProperty(Promise, 'try', {
      configurable: true,
      value(callback, ...args) {
        return new Promise((resolve) => resolve(callback(...args)));
      },
    });
  }

  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer), {
    maxImageSize: 16_777_216,
  });

  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      return `# ${title}\n\n> Este PDF tiene ${pdf.numPages} páginas. Por ahora Bardo convierte hasta ${MAX_PDF_PAGES} páginas por documento.`;
    }

    const { text } = await extractText(pdf, { mergePages: true });
    return pdfTextToMarkdown(text, title);
  } finally {
    await pdf.destroy?.();
  }
}

async function importDocx(arrayBuffer, title) {
  setImportStatus('Adaptando Word', 'Convirtiendo títulos, estilos, listas y tablas al formato de Bardo…');

  const [mammothModule, turndownModule, gfmModule] = await Promise.all([
    import('mammoth'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);

  const mammoth = mammothModule.default || mammothModule;
  const TurndownService = turndownModule.default || turndownModule;
  const gfm = gfmModule.gfm || gfmModule.default?.gfm;

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: DOCX_STYLE_MAP,
      includeDefaultStyleMap: true,
      includeEmbeddedStyleMap: true,
      externalFileAccess: false,
    },
  );

  const template = document.createElement('template');
  template.innerHTML = result.value || '';
  template.content.querySelectorAll('img').forEach((image) => {
    const note = document.createElement('em');
    note.textContent = image.alt ? `Imagen: ${image.alt}` : 'Imagen omitida por Bardo';
    image.replaceWith(note);
  });

  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  if (gfm) turndown.use(gfm);

  const markdown = turndown
    .turndown(template.innerHTML)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!markdown) {
    return `# ${title}\n\n> Bardo no encontró contenido de texto que pudiera convertir en este documento Word.`;
  }

  return ensureDocumentTitle(markdown, title);
}

async function fetchSource(documentId, instanceId, maxAttempts = 6) {
  let lastStatus = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await nativeFetch(`/api/documents/${encodeURIComponent(documentId)}/source`, {
      headers: { 'x-bardo-instance-id': instanceId },
      cache: 'no-store',
    });

    if (response.ok) return response.arrayBuffer();

    lastStatus = response.status;
    const isLaunchRace = response.status === 401 || response.status === 403 || response.status === 404;
    if (!isLaunchRace || attempt === maxAttempts - 1) break;

    setImportStatus('Preparando documento', 'Sincronizando la sesión con Discord…');
    await new Promise((resolve) => setTimeout(resolve, Math.min(150 * (2 ** attempt), 1200)));
  }

  throw new Error(`No pudimos recuperar el archivo original (HTTP ${lastStatus ?? 'desconocido'}).`);
}

async function cacheNormalization(documentId, instanceId, markdown) {
  setImportStatus('Guardando documento', 'Dejando esta conversión lista para las próximas aperturas…');

  const response = await nativeFetch(`/api/documents/${encodeURIComponent(documentId)}/normalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': instanceId,
    },
    body: JSON.stringify({ markdown }),
  });

  if (!response.ok) {
    console.warn('Bardo pudo convertir el documento, pero no logró guardar el resultado:', response.status);
  }
}

async function normalizePendingDocument(data, documentId) {
  if (data.importStatus !== 'pending' || !data.hasSource) return data;

  const instanceId = await resolveActivityInstanceId();
  if (!instanceId) return data;

  const source = await fetchSource(documentId, instanceId);
  let markdown;

  if (data.sourceType === 'pdf') {
    markdown = await importPdf(source, data.title || 'Documento');
  } else if (data.sourceType === 'docx') {
    markdown = await importDocx(source, data.title || 'Documento');
  } else {
    return data;
  }

  await cacheNormalization(documentId, instanceId, markdown);

  return {
    ...data,
    markdown,
    importStatus: 'ready',
    hasSource: false,
  };
}

function parseDocumentMetadataRequest(input, init) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return null;

  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!rawUrl) return null;

  const url = new URL(rawUrl, window.location.origin);
  const match = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

window.fetch = async function bardoFetch(input, init) {
  const documentId = parseDocumentMetadataRequest(input, init);
  const response = await nativeFetch(input, init);

  if (!documentId || !response.ok) return response;

  try {
    const data = await response.clone().json();
    if (data?.importStatus !== 'pending' || !data?.hasSource) return response;

    const normalized = await normalizePendingDocument(data, documentId);
    if (normalized === data) return response;

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'private, no-store');

    return new Response(JSON.stringify(normalized), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('No se pudo normalizar el documento importado:', error);
    return response;
  }
};
