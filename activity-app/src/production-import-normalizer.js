const MAX_PDF_PAGES = 80;
const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
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
    throw new Error('Este PDF parece escaneado y no tiene suficiente texto seleccionable. Convierte el archivo con OCR e inténtalo de nuevo.');
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
      throw new Error(`Este PDF tiene ${pdf.numPages} páginas. Bardo puede importar hasta ${MAX_PDF_PAGES} por documento.`);
    }
    const {text} = await extractText(pdf, {mergePages:true});
    return {markdown: pdfTextToMarkdown(text, title), warnings: []};
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
  const images = [...template.content.querySelectorAll('img')];
  images.forEach(image => {
    if (image.alt) {
      const note = document.createElement('em');
      note.textContent = image.alt;
      image.replaceWith(note);
    } else {
      image.remove();
    }
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
  if (!markdown) {
    throw new Error('No encontramos texto que pueda importarse desde este archivo Word.');
  }
  return {
    markdown: ensureDocumentTitle(markdown, title),
    warnings: images.length
      ? [`${images.length === 1 ? 'Se omitió 1 imagen' : `Se omitieron ${images.length} imágenes`} durante la importación.`]
      : [],
  };
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
  if (Number(file.size || 0) > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Este archivo pesa más de 25 MB. Usa una versión más liviana e inténtalo de nuevo.');
  }

  if (/\.(?:md|markdown|txt)$/i.test(lowerName)) {
    const markdown = await file.text();
    return {title, markdown: ensureDocumentTitle(markdown, title), sourceName:name, warnings:[]};
  }
  if (/\.pdf$/i.test(lowerName)) {
    const imported = await importPdf(await file.arrayBuffer(), title);
    return {title, markdown: imported.markdown, sourceName:name, warnings:imported.warnings};
  }
  if (/\.docx$/i.test(lowerName)) {
    const imported = await importDocx(await file.arrayBuffer(), title);
    return {title, markdown: imported.markdown, sourceName:name, warnings:imported.warnings};
  }
  throw new Error('Usa un archivo .md, .markdown, .txt, .pdf o .docx.');
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

  const imported = doc.sourceType === 'pdf'
    ? await importPdf(source, doc.title || 'Documento')
    : await importDocx(source, doc.title || 'Documento');
  const markdown = imported.markdown;

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
      if (!Array.isArray(payload?.documents)) return response;
      const pending = payload.documents
        .filter(doc => doc?.importStatus === 'pending' && doc?.hasSource);
      if (!pending.length) return response;

      // File conversion can download megabytes and consume significant CPU on
      // mobile. Let the library render first and finish pending imports in the
      // background instead of delaying every /api/docs response.
      window.setTimeout(async () => {
        for (const doc of pending) {
          try {
            await normalizeDocument(doc, authenticatedFetch);
          } catch (error) {
            console.error(`Bardo Docs: no se pudo normalizar ${doc.id}`, error);
          }
        }
        window.dispatchEvent(new CustomEvent('bardo-documents-normalized'));
      }, 0);
      return response;
    } catch (error) {
      console.error('Bardo Docs: no se pudo normalizar el archivo real', error);
      return response;
    }
  };
}
