import {DiscordSDK} from '@discord/embedded-app-sdk';

const STORE_KEY = 'bardo.docs.heroui.v1';
const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';
const FALLBACK_CLIENT_ID = '1539704001535156254';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInline(value = '') {
  let text = escapeHtml(value);
  const codeTokens = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `%%BARDOCODE${codeTokens.length}%%`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  codeTokens.forEach((html, index) => { text = text.replace(`%%BARDOCODE${index}%%`, html); });
  return text;
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableSeparator(line = '') {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function stripLeadingTitle(markdown, title) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const index = lines.findIndex(line => line.trim());
  if (index < 0) return '';
  const match = lines[index].match(/^#\s+(.+?)\s*$/);
  if (match && match[1].trim().toLocaleLowerCase('es') === String(title || '').trim().toLocaleLowerCase('es')) {
    lines.splice(index, 1);
  }
  return lines.join('\n').trim();
}

function markdownToHtml(markdown, title) {
  const lines = stripLeadingTitle(markdown, title).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { index += 1; continue; }

    if (trimmed.startsWith('```')) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]); index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index])); index += 1;
      }
      html.push(`<table><thead><tr>${headers.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, i) => `<td>${renderInline(row[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const tag = heading[1].length <= 2 ? 'h2' : 'h3';
      html.push(`<${tag}>${renderInline(heading[2])}</${tag}>`);
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>'); index += 1; continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, '')); index += 1;
      }
      html.push(`<blockquote><p>${quote.map(renderInline).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (/^[-*+]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+\[[ xX]\]\s+/.test(lines[index].trim())) {
        const item = lines[index].trim();
        const done = /^[-*+]\s+\[[xX]\]/.test(item);
        const text = item.replace(/^[-*+]\s+\[[ xX]\]\s+/, '');
        items.push(`<li${done ? ' class="done"' : ''}>${renderInline(text)}</li>`);
        index += 1;
      }
      html.push(`<ul class="checklist">${items.join('')}</ul>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, '')); index += 1;
      }
      html.push(`<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, '')); index += 1;
      }
      html.push(`<ol>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^```/.test(next) || /^#{1,6}\s+/.test(next) || /^>\s?/.test(next) || /^[-*+]\s+/.test(next) || /^\d+[.)]\s+/.test(next) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(next) || (lines[index].includes('|') && isTableSeparator(lines[index + 1] || ''))) break;
      paragraph.push(next); index += 1;
    }
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }

  return html.join('\n') || '<p><br></p>';
}

function htmlToMarkdown(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    const inner = [...el.childNodes].map(walk).join('');
    switch (el.tagName) {
      case 'H2': return `\n## ${inner.trim()}\n\n`;
      case 'H3': return `\n### ${inner.trim()}\n\n`;
      case 'P': return `${inner.trim()}\n\n`;
      case 'STRONG': case 'B': return `**${inner}**`;
      case 'EM': case 'I': return `*${inner}*`;
      case 'U': return inner;
      case 'S': case 'DEL': return `~~${inner}~~`;
      case 'CODE': return el.parentElement?.tagName === 'PRE' ? inner : `\`${inner}\``;
      case 'PRE': return `\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
      case 'BLOCKQUOTE': return inner.split('\n').filter(Boolean).map(line => `> ${line}`).join('\n') + '\n\n';
      case 'A': return `[${inner || el.getAttribute('href')}](${el.getAttribute('href') || ''})`;
      case 'HR': return '\n---\n\n';
      case 'BR': return '\n';
      case 'LI': {
        const checklist = el.parentElement?.classList.contains('checklist');
        if (checklist) return `- [${el.classList.contains('done') ? 'x' : ' '}] ${inner.trim()}\n`;
        return `${el.parentElement?.tagName === 'OL' ? '1.' : '-'} ${inner.trim()}\n`;
      }
      case 'UL': case 'OL': return `\n${inner}\n`;
      case 'SUMMARY': return `**${inner.trim()}**\n\n`;
      case 'DETAILS': return `\n${inner}\n`;
      case 'DIV': return `\n${inner.trim()}\n\n`;
      case 'TABLE': return `\n${el.textContent?.replace(/\s+/g, ' ').trim() || ''}\n\n`;
      default: return inner;
    }
  };
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

function toRemotePayload(doc) {
  const body = htmlToMarkdown(doc.body || '');
  const title = String(doc.title || 'Sin título').trim() || 'Sin título';
  return {
    id: doc.id,
    title,
    description: String(doc.description || '').trim(),
    markdown: `# ${title}\n\n${body}`.trim(),
  };
}

function signature(doc) {
  const payload = toRemotePayload(doc);
  return JSON.stringify([payload.title, payload.description, payload.markdown]);
}

function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

async function initSdk() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('instance_id')) return null;
  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    return sdk;
  } catch (error) {
    console.warn('Bardo Docs: Discord SDK no disponible', error);
    return null;
  }
}

export async function prepareBardoProduction(options = {}) {
  const instanceId = options.instanceId
    || window.__BARDO_INSTANCE_ID__
    || new URLSearchParams(window.location.search).get('instance_id')?.trim()
    || null;

  window.__BARDO_PRODUCTION__ = true;
  if (instanceId) window.__BARDO_INSTANCE_ID__ = instanceId;

  const sdk = options.sdk || window.__BARDO_DISCORD_SDK__ || await initSdk();
  if (sdk) window.__BARDO_DISCORD_SDK__ = sdk;

  window.__bardoExportDocument = async (documentId, format) => {
    const url = `${window.location.origin}/api/documents/${encodeURIComponent(documentId)}/export?format=${encodeURIComponent(format)}`;
    const headers = {'Accept': 'application/octet-stream'};
    if (window.__BARDO_SESSION_TOKEN__) headers['Authorization'] = `Bearer ${window.__BARDO_SESSION_TOKEN__}`;
    if (window.__BARDO_CUSTOM_ID__) headers['x-bardo-custom-id'] = window.__BARDO_CUSTOM_ID__;
    if (instanceId) headers['x-bardo-instance-id'] = instanceId;

    const response = await fetch(url, {headers, cache: 'no-store'});
    if (!response.ok) throw new Error(`Export HTTP ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${documentId}.${format === 'word' ? 'docx' : format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const headers = {'Accept':'application/json'};
  if (window.__BARDO_SESSION_TOKEN__) headers['Authorization'] = `Bearer ${window.__BARDO_SESSION_TOKEN__}`;
  if (window.__BARDO_CUSTOM_ID__) headers['x-bardo-custom-id'] = window.__BARDO_CUSTOM_ID__;
  if (instanceId) headers['x-bardo-instance-id'] = instanceId;

  let payload = {documents:[], contextDocumentId:null};
  try {
    const response = await fetch('/api/docs', {headers, cache:'no-store'});
    if (response.ok) payload = await response.json();
    else console.warn('Bardo Docs: library API unavailable', response.status);
  } catch (error) {
    console.warn('Bardo Docs: no se pudo hidratar la biblioteca', error);
  }

  const remote = new Map();
  const docs = (payload.documents || []).map(item => {
    const doc = {
      id:item.id,
      title:item.title || 'Sin título',
      description:item.description || '',
      body:markdownToHtml(item.markdown || '', item.title || ''),
      origin:item.sourceName ? 'Desde Discord' : 'Creado en Bardo',
      createdAt:item.createdAt || new Date().toISOString(),
      updatedAt:item.updatedAt || item.createdAt || new Date().toISOString(),
      createdByName:item.createdByName || null,
      updatedByName:item.updatedByName || item.createdByName || null,
      builtin:false,
      stress:false,
      sourceName:item.sourceName || null,
      sourceType:item.sourceType || 'markdown',
      importStatus:item.importStatus || 'ready',
      hasSource:Boolean(item.hasSource),
    };
    remote.set(doc.id, signature(doc));
    return doc;
  });

  localStorage.setItem(STORE_KEY, JSON.stringify({version:1, docs, deletedIds:[]}));

  const explicitCustomId = window.__BARDO_CUSTOM_ID__?.startsWith('bardo:open:')
    ? window.__BARDO_CUSTOM_ID__.slice('bardo:open:'.length)
    : window.__BARDO_CUSTOM_ID__;
  const contextId = payload.contextDocumentId || explicitCustomId;

  if (contextId && docs.some(doc => doc.id === contextId)) {
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({id:contextId, offset:0, at:Date.now()}));
    window.__BARDO_DOCUMENT_ID__ = contextId;
    history.replaceState(null, '', `#doc-${encodeURIComponent(contextId)}`);
  } else if (docs.length > 0) {
    const targetId = docs[0].id;
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({id:targetId, offset:0, at:Date.now()}));
    window.__BARDO_DOCUMENT_ID__ = targetId;
    if (!location.hash || location.hash === '#docs') {
      history.replaceState(null, '', `#doc-${encodeURIComponent(targetId)}`);
    }
  } else if (!location.hash) {
    history.replaceState(null, '', '#docs');
  }

  const nativeSetItem = Storage.prototype.setItem;
  let syncChain = Promise.resolve();
  let lastStoreJson = localStorage.getItem(STORE_KEY) || '';

  const request = async (path, init = {}) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(window.__BARDO_SESSION_TOKEN__ ? {'Authorization': `Bearer ${window.__BARDO_SESSION_TOKEN__}`} : {}),
      ...(window.__BARDO_CUSTOM_ID__ ? {'x-bardo-custom-id': window.__BARDO_CUSTOM_ID__} : {}),
      ...(instanceId ? {'x-bardo-instance-id': instanceId} : {}),
      ...(init.headers || {}),
    };
    const response = await fetch(path, {
      ...init,
      headers: reqHeaders,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  async function syncStore(nextJson) {
    if (nextJson === lastStoreJson) return;
    lastStoreJson = nextJson;
    let parsed;
    try { parsed = JSON.parse(nextJson); } catch { return; }
    if (!Array.isArray(parsed?.docs)) return;

    const nextIds = new Set(parsed.docs.map(doc => doc.id));

    for (const doc of parsed.docs) {
      const nextSignature = signature(doc);
      const previousSignature = remote.get(doc.id);
      if (previousSignature === nextSignature) continue;

      const payloadDoc = toRemotePayload(doc);
      if (previousSignature == null) {
        await request('/api/docs', {method:'POST', body:JSON.stringify(payloadDoc)});
      } else {
        await request(`/api/docs/${encodeURIComponent(doc.id)}`, {method:'PATCH', body:JSON.stringify(payloadDoc)});
      }
      remote.set(doc.id, nextSignature);
    }

    for (const id of [...remote.keys()]) {
      if (!nextIds.has(id)) {
        await request(`/api/docs/${encodeURIComponent(id)}`, {method:'DELETE'});
        remote.delete(id);
      }
    }
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && key === STORE_KEY && window.__BARDO_PRODUCTION__) {
      syncChain = syncChain.then(() => syncStore(String(value))).catch(error => console.error('Bardo Docs: error sincronizando D1', error));
    }
  };

  return true;
}
