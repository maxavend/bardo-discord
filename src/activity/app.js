import { DiscordSDK } from '@discord/embedded-app-sdk';
import { normalizeDocumentId } from '../document-id.js';

export { normalizeDocumentId };

const FALLBACK_CLIENT_ID = '1539704001535156254';

const loadingEl = document.querySelector('#loading');
const emptyEl = document.querySelector('#empty');
const errorEl = document.querySelector('#error');
const errorMessageEl = document.querySelector('#error-message');
const documentEl = document.querySelector('#document');
const titleEl = document.querySelector('#document-title');
const metaEl = document.querySelector('#document-meta');
const bodyEl = document.querySelector('#document-body');
const copyButtonEl = document.querySelector('#copy-document');
const downloadSelectEl = document.querySelector('#download-select');
const actionStatusEl = document.querySelector('#action-status');

let currentDocumentData = null;
let actionStatusTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInline(value) {
  let text = escapeHtml(value);
  const codeTokens = [];

  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `%%BARDO_CODE_${codeTokens.length}%%`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, label, href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  codeTokens.forEach((html, index) => {
    text = text.replace(`%%BARDO_CODE_${index}%%`, html);
  });

  return text;
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(lines) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const head = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = headers.map((_, index) => `<td>${renderInline(row[index] ?? '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function isSpecialLine(lines, index) {
  const line = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  const trimmed = line.trim();

  return (
    !trimmed ||
    /^```/.test(trimmed) ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
    (line.includes('|') && isTableSeparator(next))
  );
}

function stripLeadingTitle(markdown, title) {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return markdown;

  const match = lines[index].match(/^#\s+(.+?)\s*$/);
  if (match && match[1].trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()) {
    lines.splice(index, 1);
  }

  return lines.join('\n').trim();
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const languageAttr = language ? ` data-language="${escapeHtml(language)}"` : '';
      html.push(`<pre><code${languageAttr}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && isTableSeparator(lines[index + 1] ?? '')) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote><p>${quoteLines.map(renderInline).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }

  return html.join('\n');
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function setView(view) {
  if (loadingEl) loadingEl.hidden = view !== 'loading';
  if (emptyEl) emptyEl.hidden = view !== 'empty';
  if (errorEl) errorEl.hidden = view !== 'error';
  if (documentEl) documentEl.hidden = view !== 'document';
}

function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  if (match && match[1]) {
    return match[1];
  }
  return FALLBACK_CLIENT_ID;
}

async function initDiscordSdk() {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.has('frame_id') && params.has('instance_id');

  if (!isEmbedded) {
    return null;
  }

  try {
    const clientId = resolveClientId();
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
    return discordSdk;
  } catch (error) {
    console.warn('No se pudo inicializar DiscordSDK:', error);
    return null;
  }
}

async function fetchActivityContextWithRetry(instanceId, maxRetries = 5) {
  if (!instanceId) return null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.documentId) {
          return data.documentId;
        }
      }
    } catch (err) {
      console.warn(`Intento ${attempt + 1} de obtener contexto falló:`, err);
    }

    if (attempt < maxRetries) {
      const delay = Math.min(200 * Math.pow(2, attempt), 1500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

async function resolveDocumentCandidates(discordSdk) {
  const candidates = [];
  const addCandidate = (value, source) => {
    const normalized = normalizeDocumentId(value);
    if (normalized && !candidates.some((item) => item.id === normalized)) {
      candidates.push({ id: normalized, source });
    }
  };

  const params = new URLSearchParams(window.location.search);

  if (discordSdk?.customId) {
    addCandidate(discordSdk.customId, 'discordSdk.customId');
  }

  addCandidate(params.get('custom_id'), 'query.custom_id');
  addCandidate(params.get('document'), 'query.document');
  addCandidate(params.get('id'), 'query.id');

  if (discordSdk?.instanceId) {
    const contextDocId = await fetchActivityContextWithRetry(discordSdk.instanceId);
    if (contextDocId) {
      addCandidate(contextDocId, 'discordSdk.instanceId -> activity-context');
    }
  }

  const queryInstanceId = params.get('instance_id');
  if (queryInstanceId && queryInstanceId !== discordSdk?.instanceId) {
    const contextDocId = await fetchActivityContextWithRetry(queryInstanceId);
    if (contextDocId) {
      addCandidate(contextDocId, 'query.instance_id -> activity-context');
    }
  }

  return candidates;
}

async function fetchDocument(documentId) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function sanitizeFileName(value) {
  const normalized = String(value || 'documento')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return (normalized || 'documento').slice(0, 96);
}

function exportBaseName() {
  const sourceName = currentDocumentData?.sourceName || '';
  const sourceStem = sourceName.replace(/\.(?:md|markdown|txt|docx?|pdf)$/i, '').trim();
  return sanitizeFileName(sourceStem || currentDocumentData?.title || 'documento-bardo');
}

function showActionStatus(message, isError = false) {
  if (!actionStatusEl) return;

  window.clearTimeout(actionStatusTimer);
  actionStatusEl.textContent = message;
  actionStatusEl.classList.toggle('is-error', isError);

  actionStatusTimer = window.setTimeout(() => {
    actionStatusEl.textContent = '';
    actionStatusEl.classList.remove('is-error');
  }, 2800);
}

function downloadBlobFallback(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function saveFile({ blob, fileName, mimeType, extension, title = "Documento" }) {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const ext = extension || (fileName.includes(".") ? ("." + fileName.split(".").pop()) : "");

  // 1. En Desktop (Mac / Windows / Linux), usar showSaveFilePicker PRIMERO para abrir la ventana del Finder / Explorador de archivos
  if (!isMobile && typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: title,
            accept: { [mimeType]: [ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showActionStatus("Archivo guardado");
      return;
    } catch (pickerErr) {
      if (pickerErr.name === "AbortError") {
        // El usuario canceló la ventana de guardar
        return;
      }
      console.warn("showSaveFilePicker no disponible o falló:", pickerErr);
    }
  }

  // 2. En Móviles (iOS / Android), usar Web Share API para abrir el menú de "Guardar en Archivos" / Compartir
  if (isMobile && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined") {
    try {
      const file = new File([blob], fileName, { type: mimeType });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
        });
        showActionStatus("Archivo guardado / compartido");
        return;
      }
    } catch (shareErr) {
      if (shareErr.name === "AbortError") {
        return;
      }
      console.warn("navigator.share no se pudo completar:", shareErr);
    }
  }

  // 3. Fallback de descarga mediante enlace HTML5 con blob
  try {
    downloadBlobFallback(blob, fileName);
    showActionStatus("Descargado");
  } catch (downloadErr) {
    console.error("Error al descargar archivo:", downloadErr);
    showActionStatus("No se pudo guardar el archivo", true);
  }
}

function currentMarkdown() {
  if (currentDocumentData?.markdown) return currentDocumentData.markdown;
  const title = currentDocumentData?.title || titleEl?.textContent || 'Documento';
  return `# ${title}\n\n${bodyEl?.innerText || ''}`.trim();
}

function currentPlainText() {
  const title = currentDocumentData?.title || titleEl?.textContent || 'Documento';
  const body = bodyEl?.innerText?.trim() || '';
  return `${title}${body ? `\n\n${body}` : ''}`;
}

function currentRichHtml() {
  const title = currentDocumentData?.title || titleEl?.textContent || 'Documento';
  return `<h1>${escapeHtml(title)}</h1>${bodyEl?.innerHTML || ''}`;
}

function wordDocumentHtml() {
  const title = currentDocumentData?.title || titleEl?.textContent || 'Documento';
  const body = bodyEl?.innerHTML || '';

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 2.2cm 2cm; }
    body { font-family: Aptos, Calibri, Arial, sans-serif; color: #202124; font-size: 11pt; line-height: 1.55; }
    h1 { font-size: 24pt; line-height: 1.12; margin: 0 0 18pt; }
    h2 { font-size: 17pt; margin: 22pt 0 8pt; }
    h3 { font-size: 13pt; margin: 18pt 0 6pt; }
    h4 { font-size: 11pt; margin: 14pt 0 5pt; }
    p { margin: 0 0 9pt; }
    ul, ol { margin: 6pt 0 10pt 20pt; }
    li { margin: 2pt 0; }
    blockquote { border-left: 3pt solid #777; margin: 12pt 0; padding: 7pt 10pt; color: #444; background: #f4f4f4; }
    table { width: 100%; border-collapse: collapse; margin: 12pt 0 16pt; }
    th, td { border: 1pt solid #d1d5db; padding: 6pt 7pt; text-align: left; vertical-align: top; }
    th { background: #f2f3f5; font-weight: 700; }
    code { font-family: Consolas, monospace; background: #f3f4f6; }
    pre { font-family: Consolas, monospace; background: #f3f4f6; padding: 10pt; white-space: pre-wrap; }
    a { color: #2457c5; }
    .table-wrap { width: 100%; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

function legacyCopyPlainText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('No se pudo copiar');
}

async function copyDocument() {
  if (!currentDocumentData) return;

  const plainText = currentPlainText();
  const richHtml = currentRichHtml();

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain;charset=utf-8' }),
        'text/html': new Blob([richHtml], { type: 'text/html;charset=utf-8' }),
      });
      await navigator.clipboard.write([item]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plainText);
    } else {
      legacyCopyPlainText(plainText);
    }

    showActionStatus('Copiado completo');
  } catch (error) {
    console.warn('No se pudo usar el portapapeles moderno:', error);
    try {
      legacyCopyPlainText(plainText);
      showActionStatus('Copiado completo');
    } catch (fallbackError) {
      console.error('No se pudo copiar el documento:', fallbackError);
      showActionStatus('No pudimos copiarlo', true);
    }
  }
}

async function downloadMarkdown() {
  if (!currentDocumentData) return;
  const fileName = `${exportBaseName()}.md`;
  const blob = new Blob([currentMarkdown()], { type: 'text/markdown;charset=utf-8' });
  await saveFile({
    blob,
    fileName,
    mimeType: 'text/markdown',
    extension: '.md',
    title: currentDocumentData.title || 'Documento',
  });
}

async function downloadWord() {
  if (!currentDocumentData) return;
  const fileName = `${exportBaseName()}.doc`;
  const blob = new Blob(['\ufeff', wordDocumentHtml()], { type: 'application/msword;charset=utf-8' });
  await saveFile({
    blob,
    fileName,
    mimeType: 'application/msword',
    extension: '.doc',
    title: currentDocumentData.title || 'Documento',
  });
}

async function downloadPdf() {
  if (!currentDocumentData) return;

  const previousTitle = document.title;
  const nextTitle = exportBaseName();

  try {
    document.documentElement.classList.add('print-export');
    document.title = nextTitle;
    document.body.offsetHeight;
    showActionStatus('Elige “Guardar como PDF”');
    window.print();
  } catch (error) {
    console.error('No se pudo abrir el diálogo de PDF:', error);
    showActionStatus('No pudimos abrir el PDF', true);
  } finally {
    window.setTimeout(() => {
      document.documentElement.classList.remove('print-export');
      document.title = previousTitle;
    }, 500);
  }
}

function renderDocument(data) {
  currentDocumentData = data;
  titleEl.textContent = data.title || 'Documento';
  document.title = `${data.title || 'Documento'} · Bardo`;

  const meta = [];
  const date = formatDate(data.createdAt);
  if (date) meta.push(`<span>${escapeHtml(date)}</span>`);
  metaEl.innerHTML = meta.join('');

  const markdown = stripLeadingTitle(data.markdown || '', data.title || '');
  bodyEl.innerHTML = renderMarkdown(markdown);
  setView('document');
}

function showError(message) {
  currentDocumentData = null;
  errorMessageEl.textContent = message;
  setView('error');
}

copyButtonEl?.addEventListener('click', copyDocument);

downloadSelectEl?.addEventListener('change', async (event) => {
  const format = event.target.value;
  if (!format) return;

  if (format === 'pdf') {
    await downloadPdf();
  } else if (format === 'markdown') {
    await downloadMarkdown();
  } else if (format === 'word') {
    await downloadWord();
  }

  event.target.value = '';
});

async function start() {
  currentDocumentData = null;
  setView('loading');

  const discordSdk = await initDiscordSdk();
  const candidates = await resolveDocumentCandidates(discordSdk);

  if (candidates.length === 0) {
    setView('empty');
    return;
  }

  for (const candidate of candidates) {
    try {
      const data = await fetchDocument(candidate.id);
      if (data) {
        renderDocument(data);
        return;
      }
      console.warn(`Documento no encontrado usando ${candidate.source}.`);
    } catch (error) {
      console.error(`Error cargando documento usando ${candidate.source}:`, error);
      showError('No pudimos conectar con Bardo. Cierra esta vista y vuelve a intentarlo desde el mensaje.');
      return;
    }
  }

  showError('No encontramos este documento. Cierra esta vista y vuelve a abrir “Mostrar más” desde el mensaje de Bardo.');
}

start();
