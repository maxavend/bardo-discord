export const MAX_PDF_PAGES = 80;
/** Mismo límite que el servidor para el contenido de un documento (1,8 MB). */
export const MAX_IMPORTED_MARKDOWN_BYTES = 1_800_000;
/** Archivos más grandes congelan el navegador al convertirlos en el dispositivo. */
export const MAX_LOCAL_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Error de importación con un mensaje en español listo para mostrar. `code`:
 * unsupported | too_large | empty | no_text | too_many_pages | password | unreadable.
 */
export class ImportError extends Error {
  constructor(code, userMessage) {
    super(userMessage);
    this.name = 'ImportError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

function utf8Length(value) {
  return new TextEncoder().encode(String(value || '')).byteLength;
}

/** Convierte cualquier error de pdf.js / mammoth en un ImportError en español. */
export function toImportError(error, kind = 'archivo') {
  if (error instanceof ImportError) return error;
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new ImportError('password', `Este ${kind} está protegido con contraseña. Quítale la contraseña y vuelve a subirlo.`);
  }
  return new ImportError('unreadable', `No pudimos leer este ${kind}. Puede estar dañado o en un formato que Bardo no reconoce.`);
}

function ensureDocumentTitle(markdown, title) {
  const normalized = String(markdown || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return `# ${title}`;
  const firstLine = normalized.split('\n').find(line => line.trim()) || '';
  return /^#\s+/.test(firstLine.trim()) ? normalized : `# ${title}\n\n${normalized}`;
}

function pdfTextToMarkdown(text, title) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (normalized.replace(/\s/g, '').length < 30) {
    throw new ImportError('no_text', 'Este PDF no tiene texto seleccionable (parece una imagen o un escaneo). Bardo todavía no puede leer PDF escaneados.');
  }

  const output = [`# ${title}`];
  const paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    output.push(paragraph.join(' ').replace(/\s+/g, ' ').trim());
    paragraph.length = 0;
  };

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    const numberedHeading = /^\d+(?:\.\d+)*[.)]?\s+[A-ZÁÉÍÓÚÜÑ]/.test(line) && line.length <= 120;
    const uppercaseHeading = line.length >= 3 && line.length <= 80 && /[A-ZÁÉÍÓÚÜÑ]/.test(line) && line === line.toLocaleUpperCase('es');
    if (numberedHeading || uppercaseHeading) {
      flush();
      output.push(`## ${line}`);
      continue;
    }
    const bullet = line.match(/^[•●▪◦-]\s*(.+)$/);
    if (bullet) {
      flush();
      output.push(`- ${bullet[1]}`);
      continue;
    }
    if (paragraph.length && paragraph.at(-1).endsWith('-') && /^[a-záéíóúüñ]/.test(line)) {
      paragraph[paragraph.length - 1] = `${paragraph.at(-1).slice(0, -1)}${line}`;
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return output.filter(Boolean).join('\n\n').trim();
}

async function importPdf(arrayBuffer, title) {
  if (typeof Promise.try !== 'function') {
    Object.defineProperty(Promise, 'try', {
      configurable:true,
      value(callback, ...args) { return new Promise(resolve => resolve(callback(...args))); },
    });
  }

  const {extractText, getDocumentProxy} = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(arrayBuffer), {maxImageSize:16_777_216});
  } catch (error) {
    throw toImportError(error, 'PDF');
  }
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ImportError('too_many_pages', `Este PDF tiene ${pdf.numPages} páginas y Bardo puede leer hasta ${MAX_PDF_PAGES}. Divídelo en partes más pequeñas y súbelas por separado.`);
    }
    let text;
    try {
      ({text} = await extractText(pdf, {mergePages:true}));
    } catch (error) {
      throw toImportError(error, 'PDF');
    }
    return pdfTextToMarkdown(text, title);
  } finally {
    await pdf.destroy?.();
  }
}

async function importDocx(arrayBuffer, title) {
  const [mammothModule, turndownModule, gfmModule] = await Promise.all([
    import('mammoth'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);
  const mammoth = mammothModule.default || mammothModule;
  const TurndownService = turndownModule.default || turndownModule;
  const gfm = gfmModule.gfm || gfmModule.default?.gfm;

  let result;
  try {
    result = await mammoth.convertToHtml(
      {arrayBuffer},
      {includeEmbeddedStyleMap:false, externalFileAccess:false},
    );
  } catch (error) {
    throw toImportError(error, 'documento Word');
  }
  const template = document.createElement('template');
  template.innerHTML = result.value || '';
  template.content.querySelectorAll('img').forEach(image => {
    const note = document.createElement('em');
    note.textContent = image.alt ? `Imagen: ${image.alt}` : 'Imagen omitida por Bardo';
    image.replaceWith(note);
  });

  const turndown = new TurndownService({
    headingStyle:'atx',
    bulletListMarker:'-',
    codeBlockStyle:'fenced',
    emDelimiter:'*',
    strongDelimiter:'**',
  });
  if (gfm) turndown.use(gfm);
  const markdown = turndown.turndown(template.innerHTML).replace(/\n{3,}/g, '\n\n').trim();
  if (!markdown) throw new ImportError('empty', 'Este documento Word no tiene texto que Bardo pueda mostrar.');
  return ensureDocumentTitle(markdown, title);
}

function assertImportSize(markdown) {
  if (utf8Length(markdown) > MAX_IMPORTED_MARKDOWN_BYTES) {
    throw new ImportError('too_large', 'El contenido de este archivo supera el máximo de un documento de Bardo (1,8 MB de texto). Divídelo en partes más pequeñas.');
  }
  return markdown;
}

function fileTitle(name) {
  return String(name || 'Documento')
    .replace(/\.[^.]+$/, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Documento';
}

/**
 * Texto de un archivo .txt/.md: UTF-8, y si trae caracteres inválidos (archivos
 * guardados en Windows con tildes) se reintenta como Windows-1252.
 */
export function decodeTextFile(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(view);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(view);
    } catch {
      return new TextDecoder('utf-8').decode(view);
    }
  }
}

export async function convertDocumentFile(file) {
  const name = String(file?.name || '').trim();
  const lowerName = name.toLocaleLowerCase('es');
  const title = fileTitle(name);
  if (!file || !name) throw new ImportError('unsupported', 'Selecciona un archivo para subir.');
  if (Number(file.size) > MAX_LOCAL_UPLOAD_BYTES) {
    throw new ImportError('too_large', 'El archivo es demasiado grande (máximo 25 MB). Divídelo en partes más pequeñas.');
  }

  if (/\.(?:md|markdown|txt)$/i.test(lowerName)) {
    const text = decodeTextFile(await file.arrayBuffer());
    if (!text.trim()) throw new ImportError('empty', 'El archivo está vacío.');
    return {title, markdown: assertImportSize(ensureDocumentTitle(text, title)), sourceName:name};
  }
  if (/\.pdf$/i.test(lowerName)) {
    return {title, markdown: assertImportSize(await importPdf(await file.arrayBuffer(), title)), sourceName:name};
  }
  if (/\.docx$/i.test(lowerName)) {
    return {title, markdown: assertImportSize(await importDocx(await file.arrayBuffer(), title)), sourceName:name};
  }
  if (/\.doc$/i.test(lowerName)) {
    throw new ImportError('unsupported', 'El formato Word antiguo (.doc) no es compatible. Ábrelo en Word, guárdalo como .docx y vuelve a subirlo.');
  }
  throw new ImportError('unsupported', 'Bardo puede leer archivos .md, .txt, .pdf y .docx.');
}

/**
 * Descarga el archivo original de una importación PDF/DOCX pendiente, lo
 * convierte a Markdown en el navegador y lo guarda con /normalize.
 * @param {object} doc documento del API (`importStatus: 'pending'`)
 * @param {(path: string, init?: object) => Promise<any>} request request JSON autenticado
 * @param {typeof fetch} fetchImpl fetch para el binario
 * @param {() => Record<string,string>} getHeaders
 */
async function normalizeDocument(doc, {request, fetchImpl, getHeaders}) {
  if (doc?.importStatus !== 'pending' || !doc?.hasSource) return null;
  if (doc.sourceType !== 'pdf' && doc.sourceType !== 'docx') return null;

  const sourceResponse = await fetchImpl(`/api/docs/${encodeURIComponent(doc.id)}/source`, {
    headers:{Accept:'application/octet-stream', ...getHeaders()},
    cache:'no-store',
  });
  if (sourceResponse.status === 404) {
    throw new ImportError('unreadable', 'El archivo original ya no está disponible. Vuelve a subirlo.');
  }
  if (!sourceResponse.ok) throw new Error(`Source HTTP ${sourceResponse.status}`);
  const source = await sourceResponse.arrayBuffer();

  const markdown = assertImportSize(doc.sourceType === 'pdf'
    ? await importPdf(source, doc.title || 'Documento')
    : await importDocx(source, doc.title || 'Documento'));

  try {
    const saved = await request(`/api/docs/${encodeURIComponent(doc.id)}/normalize`, {method:'POST', body:{markdown}});
    return saved?.document || {...doc, markdown, importStatus:'ready', hasSource:false};
  } catch (error) {
    // Otra sesión ya lo normalizó: usar esa versión.
    if (error?.status === 409 && error?.data?.document) return error.data.document;
    throw error;
  }
}

function sessionHeaders() {
  return {
    ...(window.__BARDO_SESSION_TOKEN__ ? {Authorization: `Bearer ${window.__BARDO_SESSION_TOKEN__}`} : {}),
    ...(window.__BARDO_CUSTOM_ID__ ? {'x-bardo-custom-id': window.__BARDO_CUSTOM_ID__} : {}),
    ...(window.__BARDO_INSTANCE_ID__ ? {'x-bardo-instance-id': window.__BARDO_INSTANCE_ID__} : {}),
  };
}

/** ¿El fallo es del archivo (no se reintenta) o de la red/servidor (sí)? */
function isFileFailure(error) {
  return error instanceof ImportError;
}

/**
 * Normaliza en serie las importaciones pendientes y devuelve los documentos ya
 * listos (formato del API). Se llama explícitamente desde el bridge con la
 * lista inicial, sin depender del orden en que se envolvió `fetch`.
 * `onFailure(doc, importError)` recibe los archivos que no se pueden leer
 * (dañados, con contraseña, escaneados, demasiado largos); los errores de red
 * se ignoran para reintentar en la próxima apertura.
 */
export async function normalizePendingImports(documents, {request, fetchImpl, getHeaders = sessionHeaders, onFailure} = {}) {
  const ready = [];
  const doFetch = fetchImpl || ((...args) => window.fetch(...args));
  for (const doc of documents || []) {
    try {
      const normalized = await normalizeDocument(doc, {request, fetchImpl: doFetch, getHeaders});
      if (normalized) ready.push(normalized);
    } catch (error) {
      console.error(`Bardo Docs: no se pudo normalizar ${doc?.id}`, error);
      if (isFileFailure(error)) {
        try { onFailure?.(doc, error); } catch {}
      }
    }
  }
  return ready;
}
