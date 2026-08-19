import { DiscordSDK } from '@discord/embedded-app-sdk';
import { normalizeDocumentId } from '../document-id.js';

export { normalizeDocumentId };

const FALLBACK_CLIENT_ID = '1539704001535156254';
const BARDO_OPEN_PREFIX = 'bardo:open:';

const loadingEl = document.querySelector('#loading');
const emptyEl = document.querySelector('#empty');
const errorEl = document.querySelector('#error');
const errorMessageEl = document.querySelector('#error-message');
const documentEl = document.querySelector('#document');
const titleEl = document.querySelector('#document-title');
const metaEl = document.querySelector('#document-meta');
const bodyEl = document.querySelector('#document-body');

const views = {
  loading: loadingEl,
  empty: emptyEl,
  error: errorEl,
  document: documentEl,
};

function setView(name) {
  for (const [key, element] of Object.entries(views)) {
    if (!element) continue;
    element.hidden = key !== name;
  }
}

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

function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

async function initDiscordSdk() {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded =
    window.location.hostname.endsWith('.discordsays.com') ||
    params.has('frame_id') ||
    params.has('instance_id');

  if (!isEmbedded) return null;

  try {
    const discordSdk = new DiscordSDK(resolveClientId());
    await discordSdk.ready();
    return discordSdk;
  } catch (error) {
    console.warn('No se pudo inicializar DiscordSDK:', error);
    return null;
  }
}

async function fetchActivityContextWithRetry(instanceId, maxAttempts = 4) {
  if (!instanceId) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        const documentId = normalizeDocumentId(data?.documentId);
        if (documentId) return documentId;
      }
    } catch (error) {
      console.warn('No se pudo resolver el contexto de la Activity:', error);
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt)));
    }
  }

  return null;
}

function pushCandidate(candidates, value, source) {
  const id = normalizeDocumentId(value);
  if (!id || id === BARDO_OPEN_PREFIX || candidates.some((candidate) => candidate.id === id)) return;
  candidates.push({ id, source });
}

async function resolveDocumentCandidates(discordSdk) {
  const candidates = [];
  const params = new URLSearchParams(window.location.search);
  const instanceId = discordSdk?.instanceId || params.get('instance_id');

  if (instanceId) {
    const contextDocumentId = await fetchActivityContextWithRetry(instanceId);
    pushCandidate(candidates, contextDocumentId, 'activity-context');
  }

  pushCandidate(candidates, discordSdk?.customId, 'sdk-custom-id');
  pushCandidate(candidates, params.get('custom_id'), 'query-custom-id');
  pushCandidate(candidates, params.get('document'), 'query-document');
  pushCandidate(candidates, params.get('id'), 'query-id');

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

function renderDocument(data) {
  titleEl.textContent = data.title || 'Documento';
  document.title = `${data.title || 'Documento'} · Bardo`;

  const meta = [];
  if (data.sourceName) meta.push(`<span>${escapeHtml(data.sourceName)}</span>`);
  const date = formatDate(data.createdAt);
  if (date) meta.push(`<span>${escapeHtml(date)}</span>`);
  metaEl.innerHTML = meta.join('');

  const markdown = stripLeadingTitle(data.markdown || '', data.title || '');
  bodyEl.innerHTML = renderMarkdown(markdown);
  setView('document');
}

function showError(message) {
  errorMessageEl.textContent = message;
  setView('error');
}

async function start() {
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
