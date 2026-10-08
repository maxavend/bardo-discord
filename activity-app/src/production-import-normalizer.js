const MAX_PDF_PAGES = 80;

function ensureDocumentTitle(markdown, title) {
  const normalized = String(markdown || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return `# ${title}`;
  const firstLine = normalized.split('\n').find(line => line.trim()) || '';
  return /^#\s+/.test(firstLine.trim()) ? normalized : `# ${title}\n\n${normalized}`;
}

function pdfTextToMarkdown(text, title) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (normalized.replace(/\s/g, '').length < 30) {
    return `# ${title}\n\n> Bardo no encontró suficiente texto seleccionable en este PDF. Los documentos escaneados todavía necesitan OCR para poder convertirse.`;
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
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer), {maxImageSize:16_777_216});
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      return `# ${title}\n\n> Este PDF tiene ${pdf.numPages} páginas. Por ahora Bardo convierte hasta ${MAX_PDF_PAGES} páginas por documento.`;
    }
    const {text} = await extractText(pdf, {mergePages:true});
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

  const result = await mammoth.convertToHtml(
    {arrayBuffer},
    {includeEmbeddedStyleMap:false, externalFileAccess:false},
  );
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
  return markdown
    ? ensureDocumentTitle(markdown, title)
    : `# ${title}\n\n> Bardo no encontró contenido de texto que pudiera convertir en este documento Word.`;
}

function fileTitle(name) {
  return String(name || 'Documento')
    .replace(/\.[^.]+$/, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Documento';
}

export async function convertDocumentFile(file) {
  const name = String(file?.name || '').trim();
  const lowerName = name.toLocaleLowerCase('es');
  const title = fileTitle(name);
  if (!file || !name) throw new Error('Selecciona un archivo para subir.');

  if (/\.(?:md|markdown|txt)$/i.test(lowerName)) {
    const markdown = await file.text();
    return {title, markdown: ensureDocumentTitle(markdown, title), sourceName:name};
  }
  if (/\.pdf$/i.test(lowerName)) {
    return {title, markdown: await importPdf(await file.arrayBuffer(), title), sourceName:name};
  }
  if (/\.docx$/i.test(lowerName)) {
    return {title, markdown: await importDocx(await file.arrayBuffer(), title), sourceName:name};
  }
  throw new Error('Usa un archivo .md, .markdown, .txt, .pdf o .docx.');
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
  if (!sourceResponse.ok) throw new Error(`Source HTTP ${sourceResponse.status}`);
  const source = await sourceResponse.arrayBuffer();

  const markdown = doc.sourceType === 'pdf'
    ? await importPdf(source, doc.title || 'Documento')
    : await importDocx(source, doc.title || 'Documento');

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

/**
 * Normaliza en serie las importaciones pendientes y devuelve los documentos ya
 * listos (formato del API). Se llama explícitamente desde el bridge con la
 * lista inicial, sin depender del orden en que se envolvió `fetch`.
 */
export async function normalizePendingImports(documents, {request, fetchImpl, getHeaders = sessionHeaders} = {}) {
  const ready = [];
  const doFetch = fetchImpl || ((...args) => window.fetch(...args));
  for (const doc of documents || []) {
    try {
      const normalized = await normalizeDocument(doc, {request, fetchImpl: doFetch, getHeaders});
      if (normalized) ready.push(normalized);
    } catch (error) {
      console.error(`Bardo Docs: no se pudo normalizar ${doc?.id}`, error);
    }
  }
  return ready;
}
