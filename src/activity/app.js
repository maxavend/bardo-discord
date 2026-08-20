import { DiscordSDK } from '@discord/embedded-app-sdk';
import { normalizeDocumentId } from '../document-id.js';
import { cleanEscapedMarkdown } from '../import-format.js';

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
const editButtonEl = document.querySelector('#edit-document');
const downloadSelectEl = document.querySelector('#download-select');
const actionStatusEl = document.querySelector('#action-status');

let currentDocumentData = null;
let actionStatusTimer = null;
let autoSaveTimer = null;
let isEditing = false;
let activeDiscordSdk = null;

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
    const token = `%%BARDOCODE${codeTokens.length}%%`;
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
    text = text.replace(`%%BARDOCODE${index}%%`, html);
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
  const cleaned = cleanEscapedMarkdown(markdown);
  const lines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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

async function exportDocument(format) {
  if (!currentDocumentData) return;

  const documentId = currentDocumentData.id;
  const exportUrl = `${window.location.origin}/api/documents/${encodeURIComponent(documentId)}/export?format=${format}`;

  // 1. Si estamos dentro de Discord (DiscordSDK activo), usar openExternalLink para descargar en el navegador nativo del sistema
  if (activeDiscordSdk?.commands?.openExternalLink) {
    try {
      await activeDiscordSdk.commands.openExternalLink({ url: exportUrl });
      return;
    } catch (sdkErr) {
      console.warn('discordSdk.openExternalLink no disponible o cancelado:', sdkErr);
    }
  }

  // 2. Fallback estándar para navegador externo: abrir endpoint de descarga
  try {
    const link = document.createElement('a');
    link.href = exportUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error('Error al descargar archivo:', err);
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

async function htmlToMarkdown(html) {
  const [turndownModule, gfmModule] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);
  const TurndownService = turndownModule.default || turndownModule;
  const gfm = gfmModule.gfm || gfmModule.default?.gfm;
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  turndown.escape = (str) => str;
  if (gfm) turndown.use(gfm);
  const raw = turndown.turndown(html);
  return cleanEscapedMarkdown(raw).replace(/\n{3,}/g, '\n\n').trim();
}

const PENCIL_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

const editorToolbarEl = document.querySelector('#editor-toolbar');
const tbBlockTypeEl = document.querySelector('#tb-block-type');
const slashMenuEl = document.querySelector('#slash-command-menu');
const bubbleMenuEl = document.querySelector('#selection-bubble-menu');

let slashActive = false;
let slashQuery = '';
let slashSelectedIndex = 0;
let slashRange = null;

const SLASH_COMMANDS = [
  {
    id: 'p',
    title: 'Texto',
    desc: 'Empieza a escribir con texto plano',
    keywords: ['texto', 'parrafo', 'p', 'normal'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
    action: () => applyFormatting('p'),
  },
  {
    id: 'h1',
    title: 'Encabezado 1',
    desc: 'Título de sección grande',
    keywords: ['h1', 'titulo', 'encabezado', 'grande'],
    icon: `<span style="font-weight: 800; font-size: 13px;">H1</span>`,
    action: () => applyFormatting('h1'),
  },
  {
    id: 'h2',
    title: 'Encabezado 2',
    desc: 'Subtítulo mediano',
    keywords: ['h2', 'subtitulo', 'mediano'],
    icon: `<span style="font-weight: 700; font-size: 12px;">H2</span>`,
    action: () => applyFormatting('h2'),
  },
  {
    id: 'h3',
    title: 'Encabezado 3',
    desc: 'Título de sección pequeño',
    keywords: ['h3', 'pequeno', 'seccion'],
    icon: `<span style="font-weight: 600; font-size: 11px;">H3</span>`,
    action: () => applyFormatting('h3'),
  },
  {
    id: 'bulletList',
    title: 'Lista con viñetas',
    desc: 'Crea una lista simple con viñetas',
    keywords: ['lista', 'vineta', 'bullet', 'puntos', 'ul'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>`,
    action: () => applyFormatting('bulletList'),
  },
  {
    id: 'numberList',
    title: 'Lista numerada',
    desc: 'Crea una lista ordenada con números',
    keywords: ['lista', 'numerada', 'ordenada', 'ol', '1'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
    action: () => applyFormatting('numberList'),
  },
  {
    id: 'blockquote',
    title: 'Cita',
    desc: 'Destaca una frase o cita importante',
    keywords: ['cita', 'quote', 'destacado', 'bloque'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`,
    action: () => applyFormatting('blockquote'),
  },
  {
    id: 'pre',
    title: 'Bloque de código',
    desc: 'Escribe fragmentos de código',
    keywords: ['codigo', 'code', 'bloque', 'script', 'pre'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    action: () => applyFormatting('pre'),
  },
  {
    id: 'table',
    title: 'Tabla',
    desc: 'Inserta una tabla simple 2x3',
    keywords: ['tabla', 'grid', 'table', 'filas', 'columnas'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/></svg>`,
    action: () => applyFormatting('table'),
  },
  {
    id: 'divider',
    title: 'Divisor',
    desc: 'Inserta una línea divisoria horizontal',
    keywords: ['divisor', 'linea', 'separador', 'hr'],
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
    action: () => applyFormatting('divider'),
  },
];

function applyFormatting(format, value = null) {
  if (!isEditing) return;
  bodyEl?.focus();

  switch (format) {
    case 'bold':
      document.execCommand('bold', false, null);
      break;
    case 'italic':
      document.execCommand('italic', false, null);
      break;
    case 'strikeThrough':
      document.execCommand('strikeThrough', false, null);
      break;
    case 'inlineCode': {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) break;
      const range = sel.getRangeAt(0);
      const codeParent = range.commonAncestorContainer.parentElement?.closest('code');
      if (codeParent) {
        const textNode = document.createTextNode(codeParent.textContent || '');
        codeParent.replaceWith(textNode);
      } else if (!range.collapsed) {
        const span = document.createElement('code');
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
      break;
    }
    case 'link': {
      const url = prompt('Ingresa la URL del enlace:', 'https://');
      if (url && url.trim() && url !== 'https://') {
        document.execCommand('createLink', false, url.trim());
      }
      break;
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'p':
    case 'blockquote':
    case 'pre':
      document.execCommand('formatBlock', false, `<${format}>`);
      break;
    case 'bulletList':
      document.execCommand('insertUnorderedList', false, null);
      break;
    case 'numberList':
      document.execCommand('insertOrderedList', false, null);
      break;
    case 'divider':
      document.execCommand('insertHorizontalRule', false, null);
      break;
    case 'table': {
      const tableHtml = `<div class="table-wrap"><table><thead><tr><th>Encabezado 1</th><th>Encabezado 2</th></tr></thead><tbody><tr><td>Celda 1</td><td>Celda 2</td></tr><tr><td>Celda 3</td><td>Celda 4</td></tr></tbody></table></div><p><br></p>`;
      document.execCommand('insertHTML', false, tableHtml);
      break;
    }
    default:
      if (value) document.execCommand('formatBlock', false, `<${value}>`);
      break;
  }

  handleEditorInput();
}

// ==========================================================
// MENÚ SLASH (NOTION STYLE)
// ==========================================================
function getFilteredSlashCommands(query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.title.toLowerCase().includes(q) ||
    cmd.desc.toLowerCase().includes(q) ||
    cmd.keywords.some((k) => k.includes(q))
  );
}

function renderSlashMenu() {
  if (!slashMenuEl) return;
  const filtered = getFilteredSlashCommands(slashQuery);

  if (filtered.length === 0) {
    slashMenuEl.style.display = 'none';
    return;
  }

  if (slashSelectedIndex >= filtered.length) {
    slashSelectedIndex = 0;
  }

  slashMenuEl.innerHTML = `
    <div class="slash-cmd-header">Bloques básicos</div>
    ${filtered.map((cmd, idx) => `
      <button type="button" class="slash-cmd-item ${idx === slashSelectedIndex ? 'is-selected' : ''}" data-slash-id="${cmd.id}">
        <span class="slash-cmd-icon">${cmd.icon}</span>
        <div class="slash-cmd-text">
          <span class="slash-cmd-title">${escapeHtml(cmd.title)}</span>
          <span class="slash-cmd-desc">${escapeHtml(cmd.desc)}</span>
        </div>
      </button>
    `).join('')}
  `;

  slashMenuEl.style.display = 'flex';

  slashMenuEl.querySelectorAll('.slash-cmd-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmdId = btn.dataset.slashId;
      const cmd = SLASH_COMMANDS.find((c) => c.id === cmdId);
      if (cmd) executeSlashCommand(cmd);
    });
  });
}

function executeSlashCommand(cmd) {
  hideSlashMenu();

  // Limpiar el texto '/query' actual
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const slashIndex = text.lastIndexOf('/');
      if (slashIndex >= 0) {
        node.textContent = text.slice(0, slashIndex);
      }
    }
  }

  cmd.action();
}

function hideSlashMenu() {
  slashActive = false;
  slashQuery = '';
  slashSelectedIndex = 0;
  if (slashMenuEl) slashMenuEl.style.display = 'none';
}

function updateSlashMenuPosition() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !slashMenuEl) return;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const top = rect.bottom + window.scrollY + 6;
  const left = Math.min(Math.max(rect.left + window.scrollX, 16), window.innerWidth - 290);

  slashMenuEl.style.top = `${top}px`;
  slashMenuEl.style.left = `${left}px`;
}

// ==========================================================
// BUBBLE MENU FLOTANTE DE SELECCIÓN
// ==========================================================
function updateBubbleMenu() {
  if (!bubbleMenuEl || !isEditing) return;

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !bodyEl?.contains(sel.anchorNode)) {
    bubbleMenuEl.style.display = 'none';
    return;
  }

  const text = sel.toString().trim();
  if (!text) {
    bubbleMenuEl.style.display = 'none';
    return;
  }

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    bubbleMenuEl.style.display = 'none';
    return;
  }

  const top = rect.top + window.scrollY - 42;
  const left = Math.max(16, rect.left + window.scrollX + (rect.width / 2) - 130);

  bubbleMenuEl.style.top = `${top}px`;
  bubbleMenuEl.style.left = `${left}px`;
  bubbleMenuEl.style.display = 'flex';
}

document.addEventListener('selectionchange', () => {
  if (isEditing) {
    updateBubbleMenu();
  }
});

// Eventos de barra de herramientas y menús de formato
document.querySelectorAll('[data-format]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const format = btn.dataset.format;
    applyFormatting(format);
  });
});

tbBlockTypeEl?.addEventListener('change', (e) => {
  const block = e.target.value;
  applyFormatting(block);
});

// ==========================================================
// EDITOR KEYDOWN (ATAJOS, MARKDOWN AUTO-TRANSFORM, SLASH)
// ==========================================================
bodyEl?.addEventListener('keydown', (e) => {
  if (!isEditing) return;

  // Atajos con Ctrl / Cmd
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      applyFormatting('bold');
      return;
    }
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      applyFormatting('italic');
      return;
    }
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      applyFormatting('inlineCode');
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      applyFormatting('link');
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      saveDocumentChanges(true);
      return;
    }
  }

  // Manejo de navegación en menú Slash
  if (slashActive) {
    const filtered = getFilteredSlashCommands(slashQuery);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashSelectedIndex = (slashSelectedIndex + 1) % filtered.length;
      renderSlashMenu();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashSelectedIndex = (slashSelectedIndex - 1 + filtered.length) % filtered.length;
      renderSlashMenu();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[slashSelectedIndex]) {
        executeSlashCommand(filtered[slashSelectedIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  // Markdown Auto-transform al presionar Espacio
  if (e.key === ' ') {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node && node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const offset = range.startOffset;
        const prefix = text.slice(0, offset).trim();

        if (prefix === '#') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('h1');
          return;
        }
        if (prefix === '##') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('h2');
          return;
        }
        if (prefix === '###') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('h3');
          return;
        }
        if (prefix === '-' || prefix === '*') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('bulletList');
          return;
        }
        if (prefix === '1.') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('numberList');
          return;
        }
        if (prefix === '>') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('blockquote');
          return;
        }
        if (prefix === '---') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('divider');
          return;
        }
        if (prefix === '```') {
          e.preventDefault();
          node.textContent = text.slice(offset);
          applyFormatting('pre');
          return;
        }
      }
    }
  }
});

bodyEl?.addEventListener('keyup', (e) => {
  if (!isEditing) return;

  // Detectar trigger '/'
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const offset = range.startOffset;
      const textBefore = text.slice(0, offset);
      const slashIndex = textBefore.lastIndexOf('/');

      if (slashIndex >= 0 && !/\s/.test(textBefore.slice(slashIndex + 1))) {
        slashActive = true;
        slashQuery = textBefore.slice(slashIndex + 1);
        updateSlashMenuPosition();
        renderSlashMenu();
        return;
      }
    }
  }

  if (slashActive) {
    hideSlashMenu();
  }
});

document.addEventListener('click', (e) => {
  if (!slashMenuEl?.contains(e.target) && slashActive) {
    hideSlashMenu();
  }
  if (!bubbleMenuEl?.contains(e.target) && !bodyEl?.contains(e.target)) {
    if (bubbleMenuEl) bubbleMenuEl.style.display = 'none';
  }
});

async function saveDocumentChanges(isManual = false) {
  if (!currentDocumentData?.id) return;
  const title = (titleEl?.textContent || '').trim() || 'Documento';

  if (isManual) {
    showActionStatus('Guardando…');
  }

  try {
    const rawHtml = bodyEl?.innerHTML || '';
    const bodyMarkdown = await htmlToMarkdown(rawHtml);
    const fullMarkdown = `# ${title}\n\n${bodyMarkdown}`;

    const res = await fetch(`/api/documents/${encodeURIComponent(currentDocumentData.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        markdown: fullMarkdown,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    currentDocumentData.title = title;
    currentDocumentData.markdown = fullMarkdown;
    document.title = `${title} · Bardo`;

    showActionStatus('Guardado', false);
  } catch (error) {
    console.error('Error guardando documento:', error);
    showActionStatus('No se pudo guardar', true);
  }
}

function toggleEditMode() {
  isEditing = !isEditing;

  if (isEditing) {
    documentEl?.classList.add('is-editing');
    if (editorToolbarEl) editorToolbarEl.style.display = 'flex';
    if (editButtonEl) {
      editButtonEl.innerHTML = `${CHECK_SVG}<span>Guardar</span>`;
      editButtonEl.className = 'action-button action-button-editing';
    }
    if (titleEl) titleEl.contentEditable = 'true';
    if (bodyEl) {
      bodyEl.contentEditable = 'true';
      bodyEl.focus();
    }
    showActionStatus('Modo edición');
  } else {
    documentEl?.classList.remove('is-editing');
    if (editorToolbarEl) editorToolbarEl.style.display = 'none';
    if (slashMenuEl) slashMenuEl.style.display = 'none';
    if (bubbleMenuEl) bubbleMenuEl.style.display = 'none';
    if (editButtonEl) {
      editButtonEl.innerHTML = `${PENCIL_SVG}<span>Editar</span>`;
      editButtonEl.className = 'action-button action-button-secondary';
    }
    if (titleEl) titleEl.contentEditable = 'false';
    if (bodyEl) bodyEl.contentEditable = 'false';
    saveDocumentChanges(true);
  }
}

function handleEditorInput() {
  if (!isEditing) return;
  showActionStatus('Guardando…');
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    saveDocumentChanges(false);
  }, 2500);
}

copyButtonEl?.addEventListener('click', copyDocument);
editButtonEl?.addEventListener('click', toggleEditMode);
titleEl?.addEventListener('input', handleEditorInput);
bodyEl?.addEventListener('input', handleEditorInput);

downloadSelectEl?.addEventListener('change', async (event) => {
  const format = event.target.value;
  if (!format) return;

  try {
    await exportDocument(format);
  } catch (err) {
    console.error('Error al exportar documento:', err);
  } finally {
    event.target.value = '';
  }
});

async function start() {
  currentDocumentData = null;
  setView('loading');

  activeDiscordSdk = await initDiscordSdk();
  const candidates = await resolveDocumentCandidates(activeDiscordSdk);

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
