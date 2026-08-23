const MAX_PDF_PAGES = 80;
let installed = false;

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

async function normalizeDocument(doc, authenticatedFetch) {
  if (doc?.importStatus !== 'pending' || !doc?.hasSource) return doc;
  if (doc.sourceType !== 'pdf' && doc.sourceType !== 'docx') return doc;

  const sourceResponse = await authenticatedFetch(`/api/docs/${encodeURIComponent(doc.id)}/source`, {
    headers:{Accept:'application/octet-stream'},
    cache:'no-store',
  });
  if (!sourceResponse.ok) throw new Error(`Source HTTP ${sourceResponse.status}`);
  const source = await sourceResponse.arrayBuffer();

  const markdown = doc.sourceType === 'pdf'
    ? await importPdf(source, doc.title || 'Documento')
    : await importDocx(source, doc.title || 'Documento');

  const saveResponse = await authenticatedFetch(`/api/docs/${encodeURIComponent(doc.id)}/normalize`, {
    method:'POST',
    headers:{'Content-Type':'application/json', Accept:'application/json'},
    body:JSON.stringify({markdown}),
    cache:'no-store',
  });
  if (!saveResponse.ok) throw new Error(`Normalize HTTP ${saveResponse.status}`);
  const saved = await saveResponse.json().catch(() => null);
  return saved?.document || {...doc, markdown, importStatus:'ready', hasSource:false};
}

export function installProductionImportNormalizer() {
  if (installed) return;
  installed = true;
  const authenticatedFetch = window.fetch.bind(window);

  window.fetch = async function bardoImportFetch(input, init = {}) {
    const response = await authenticatedFetch(input, init);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    let url;
    try { url = new URL(raw, window.location.href); } catch { return response; }

    if (method !== 'GET' || url.pathname !== '/api/docs' || !response.ok) return response;

    try {
      const payload = await response.clone().json();
      const contextId = payload?.contextDocumentId;
      if (!contextId || !Array.isArray(payload?.documents)) return response;
      const index = payload.documents.findIndex(doc => doc.id === contextId);
      if (index < 0) return response;
      const current = payload.documents[index];
      if (current?.importStatus !== 'pending' || !current?.hasSource) return response;

      payload.documents[index] = await normalizeDocument(current, authenticatedFetch);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'private, no-store');
      return new Response(JSON.stringify(payload), {
        status:response.status,
        statusText:response.statusText,
        headers,
      });
    } catch (error) {
      console.error('Bardo Docs: no se pudo normalizar el archivo real', error);
      return response;
    }
  };
}
