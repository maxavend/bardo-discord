/**
 * Conversión bidireccional entre el HTML canónico de Bardo y Markdown.
 *
 * El HTML canónico es lo que produce `plateValueToHtml` y lo que consume
 * `htmlToPlateValue`. D1 guarda Markdown, así que este módulo debe preservar
 * en ida y vuelta: encabezados h1-h3, párrafos con saltos de línea, negrita,
 * cursiva, subrayado, tachado, código inline, kbd, enlaces, listas (anidadas,
 * numeradas y de tareas), citas, destacados (callouts), desplegables
 * (details/summary), bloques de código, tablas y separadores. El texto se
 * escapa para que caracteres como `*`, `_` o un `1.` al inicio de línea no se
 * reinterpreten como formato al recargar.
 *
 * `markdownToHtml` es puro (sin DOM). `htmlToMarkdown` usa `DOMParser`.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function decodeBasicEntities(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

const ORDERED_LIST_STYLES = new Set([
  'decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha',
  'lower-latin', 'upper-latin', 'lower-roman', 'upper-roman', 'lower-greek',
]);

export function isOrderedListStyle(listStyleType) {
  return ORDERED_LIST_STYLES.has(String(listStyleType || ''));
}

/**
 * Construye HTML de listas anidadas a partir de una secuencia plana de ítems.
 * @param {Array<{level:number, kind:'ul'|'ol'|'task', html:string, done?:boolean}>} items
 */
export function buildListHtml(items) {
  const open = kind => (kind === 'ol' ? '<ol>' : kind === 'task' ? '<ul class="checklist">' : '<ul>');
  const close = kind => (kind === 'ol' ? '</ol>' : '</ul>');
  const stack = [];
  let out = '';
  for (const item of items) {
    const level = Math.max(0, Number(item.level) || 0);
    while (stack.length && stack.at(-1).level > level) {
      out += `</li>${close(stack.pop().kind)}`;
    }
    const top = stack.at(-1);
    if (top && top.level === level) {
      if (top.kind === item.kind) {
        out += '</li>';
      } else {
        out += `</li>${close(top.kind)}${open(item.kind)}`;
        stack.pop();
        stack.push({level, kind: item.kind});
      }
    } else {
      out += open(item.kind);
      stack.push({level, kind: item.kind});
    }
    out += item.kind === 'task' ? `<li${item.done ? ' class="done"' : ''}>` : '<li>';
    out += item.html || '<br>';
  }
  while (stack.length) out += `</li>${close(stack.pop().kind)}`;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Markdown -> HTML                                                          */
/* ------------------------------------------------------------------------ */

const TOKEN_OPEN = '';
const TOKEN_CLOSE = '';
const TOKEN_RE = /(\d+)/g;
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:)/i;
const ESCAPABLE = new Set('\\`*_{}[]()#+-.!|~<>'.split(''));

/** Renderiza Markdown inline a HTML seguro. Los saltos de línea se vuelven <br>. */
export function renderInline(value = '') {
  const tokens = [];
  const stash = html => {
    tokens.push(html);
    return `${TOKEN_OPEN}${tokens.length - 1}${TOKEN_CLOSE}`;
  };

  const source = String(value).replace(/[]/g, '');

  // 1-2. Escapes con barra invertida y código inline (contenido literal, N backticks).
  let text = '';
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length && ESCAPABLE.has(source[i + 1])) {
      text += stash(escapeHtml(source[i + 1]));
      i += 2;
      continue;
    }
    if (ch === '`') {
      let run = 0;
      while (source[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      let searchFrom = i + run;
      let closeAt = -1;
      while (searchFrom < source.length) {
        const found = source.indexOf(fence, searchFrom);
        if (found < 0) break;
        let length = 0;
        while (source[found + length] === '`') length += 1;
        if (length === run) { closeAt = found; break; }
        searchFrom = found + length;
      }
      if (closeAt >= 0) {
        let content = source.slice(i + run, closeAt);
        if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim()) {
          content = content.slice(1, -1);
        }
        text += stash(`<code>${escapeHtml(content)}</code>`);
        i = closeAt + run;
        continue;
      }
      text += fence;
      i += run;
      continue;
    }
    text += ch;
    i += 1;
  }

  // 3. Etiquetas inline permitidas.
  text = text.replace(/<br\s*\/?>/gi, () => stash('<br>'));
  text = text.replace(/<(\/?)(u|kbd)>/gi, (_, slash, tag) => stash(`<${slash}${tag.toLowerCase()}>`));

  // 4. Escape HTML del resto.
  text = escapeHtml(text);

  // 5. Enlaces [texto](url)
  text = text.replace(/\[([^\]\n]+)\]\((?:&lt;([^\n]*?)&gt;|([^)\s]+))\)/g, (match, label, angleUrl, plainUrl) => {
    const url = decodeBasicEntities(angleUrl ?? plainUrl ?? '');
    if (!SAFE_URL_RE.test(url)) return match;
    return stash(`<a href="${escapeHtml(url)}">`) + label + stash('</a>');
  });

  // 6. Énfasis.
  text = text.replace(/\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^\w])__(?=\S)([\s\S]+?)(?<=\S)__(?!\w)/g, '$1<strong>$2</strong>');
  text = text.replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*]|[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_]|[^\s_])_(?!\w)/g, '$1<em>$2</em>');
  text = text.replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '<s>$1</s>');

  // 7. Saltos de línea.
  text = text.replace(/\n/g, '<br>');

  // 8. Restaurar tokens (pueden anidarse dentro de otros tokens).
  let guard = 0;
  while (TOKEN_RE.test(text) && guard < 5) {
    TOKEN_RE.lastIndex = 0;
    text = text.replace(TOKEN_RE, (_, index) => tokens[Number(index)] ?? '');
    guard += 1;
  }
  TOKEN_RE.lastIndex = 0;
  return text;
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let current = '';
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '\\|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function hasUnescapedPipe(line = '') {
  return /(^|[^\\])\|/.test(line);
}

function isTableSeparator(line = '') {
  if (!line.includes('-')) return false;
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
  return lines.join('\n');
}

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const HEADING_RE = /^#{1,6}(?:\s+|$)/;
const HR_RE = /^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])(?:\s+(.*))?$/;
const QUOTE_RE = /^\s*>/;
const DETAILS_OPEN_RE = /^\s*<details\b[^>]*>/i;

function indentWidth(raw = '') {
  return raw.replace(/\t/g, '    ').length;
}

function isBlockStart(lines, index) {
  const line = lines[index];
  const trimmed = line.trim();
  return FENCE_RE.test(line)
    || HEADING_RE.test(trimmed)
    || QUOTE_RE.test(line)
    || HR_RE.test(trimmed)
    || LIST_ITEM_RE.test(line)
    || DETAILS_OPEN_RE.test(line)
    || (hasUnescapedPipe(line) && isTableSeparator(lines[index + 1] || ''));
}

function parseList(lines, start) {
  const items = [];
  const widths = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      // Lista "suelta": continúa si la siguiente línea no vacía es un ítem.
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (next < lines.length && LIST_ITEM_RE.test(lines[next]) && !FENCE_RE.test(lines[next])) {
        index = next;
        continue;
      }
      break;
    }

    const match = line.match(LIST_ITEM_RE);
    if (!match) {
      const previous = items.at(-1);
      if (previous && indentWidth(line.match(/^\s*/)[0]) > previous.width && !isBlockStart(lines, index)) {
        previous.text += `\n${line.trim()}`;
        index += 1;
        continue;
      }
      if (previous && !isBlockStart(lines, index) && indentWidth(line.match(/^\s*/)[0]) > 0) {
        previous.text += `\n${line.trim()}`;
        index += 1;
        continue;
      }
      break;
    }

    const width = indentWidth(match[1]);
    while (widths.length && width < widths.at(-1)) widths.pop();
    if (!widths.length || width > widths.at(-1)) widths.push(width);
    const level = widths.length - 1;

    const marker = match[2];
    let text = match[3] || '';
    let kind = /\d/.test(marker) ? 'ol' : 'ul';
    let done = false;
    const task = kind === 'ul' ? text.match(/^\[([ xX])\](?:\s+|$)([\s\S]*)$/) : null;
    if (task) {
      kind = 'task';
      done = task[1].toLowerCase() === 'x';
      text = task[2];
    }
    items.push({level, kind, done, text, width});
    index += 1;
  }

  const html = buildListHtml(items.map(item => ({
    level: item.level,
    kind: item.kind,
    done: item.done,
    html: renderInline(item.text.trim()),
  })));
  return {html, next: index};
}

function parseBlocks(lines) {
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { index += 1; continue; }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const fenceChar = fence[2][0];
      const fenceLength = fence[2].length;
      const lang = fence[3] || '';
      const closeRe = new RegExp(`^\\s*${fenceChar === '`' ? '`' : '~'}{${fenceLength},}\\s*$`);
      const code = [];
      index += 1;
      while (index < lines.length && !closeRe.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const langClass = /^[\w+#.-]+$/.test(lang) ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${langClass}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (DETAILS_OPEN_RE.test(line)) {
      const collected = [];
      let depth = 0;
      while (index < lines.length) {
        const current = lines[index];
        depth += (current.match(/<details\b/gi) || []).length;
        depth -= (current.match(/<\/details>/gi) || []).length;
        collected.push(current);
        index += 1;
        if (depth <= 0) break;
      }
      let content = collected.join('\n');
      content = content.replace(/^\s*<details\b[^>]*>/i, '');
      const closeAt = content.toLowerCase().lastIndexOf('</details>');
      if (closeAt >= 0) content = content.slice(0, closeAt);
      let summary = 'Detalles';
      content = content.replace(/^\s*<summary>([\s\S]*?)<\/summary>/i, (_, raw) => {
        summary = decodeBasicEntities(raw).replace(/\s+/g, ' ').trim() || 'Detalles';
        return '';
      });
      const inner = parseBlocks(content.split('\n'));
      html.push(`<details class="spoiler"><summary>${escapeHtml(summary)}</summary>${inner || '<p><br></p>'}</details>`);
      continue;
    }

    if (hasUnescapedPipe(line) && isTableSeparator(lines[index + 1] || '')) {
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && hasUnescapedPipe(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const columns = Math.max(headers.length, ...rows.map(row => row.length));
      const emptyHeader = headers.every(cell => !cell);
      const head = emptyHeader
        ? ''
        : `<thead><tr>${Array.from({length: columns}, (_, i) => `<th>${renderInline(headers[i] || '')}</th>`).join('')}</tr></thead>`;
      const body = rows
        .map(row => `<tr>${Array.from({length: columns}, (_, i) => `<td>${renderInline(row[i] || '')}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<table>${head}<tbody>${body}</tbody></table>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})(?:\s+(.*?))?\s*$/);
    if (heading) {
      const level = heading[1].length;
      const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      const content = (heading[2] || '').replace(/\s+#+$/, '');
      html.push(`<${tag}>${renderInline(content) || '<br>'}</${tag}>`);
      index += 1;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (index < lines.length && QUOTE_RE.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      const callout = quote[0]?.match(/^\[!(\w+)\]\s*$/);
      if (callout) {
        const content = quote.slice(1).join('\n').trim();
        html.push(`<div class="doc-callout">${renderInline(content) || '<br>'}</div>`);
      } else {
        const content = quote.join('\n').trim();
        html.push(`<blockquote><p>${renderInline(content) || '<br>'}</p></blockquote>`);
      }
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const list = parseList(lines, index);
      html.push(list.html);
      index = list.next;
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
  }

  return html.join('\n');
}

export function markdownToHtml(markdown, title) {
  const lines = stripLeadingTitle(markdown, title).replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines) || '<p><br></p>';
}

/* ------------------------------------------------------------------------ */
/* HTML -> Markdown                                                          */
/* ------------------------------------------------------------------------ */

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'HR', 'DIV', 'DETAILS',
  'SUMMARY', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE',
]);

function isBlockElement(node) {
  return node?.nodeType === ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
}

function elementChildren(el) {
  return Array.from(el.childNodes).filter(child => child.nodeType === ELEMENT_NODE);
}

function escapeInlineText(text) {
  return text
    .replace(/[\\`*_[\]~|]/g, '\\$&')
    .replace(/<(?=[A-Za-z/!?])/g, '\\<');
}

/** Escapa patrones que, al inicio de una línea, se leerían como bloques. */
function escapeLineStarts(markdown) {
  return markdown.split('\n').map(line => {
    if (/^\s*#{1,6}(?=\s|$)/.test(line)) return line.replace(/^(\s*)#/, '$1\\#');
    if (/^\s*>/.test(line)) return line.replace(/^(\s*)>/, '$1\\>');
    if (/^\s*-(?:\s*-){2,}\s*$/.test(line)) return line.replace(/^(\s*)-/, '$1\\-');
    if (/^\s*[-+](?=\s|$)/.test(line)) return line.replace(/^(\s*)([-+])/, '$1\\$2');
    if (/^\s*\d{1,9}[.)](?=\s|$)/.test(line)) return line.replace(/^(\s*\d{1,9})([.)])/, '$1\\$2');
    return line;
  }).join('\n');
}

function wrapMark(marker, inner) {
  if (!inner || !inner.trim()) return inner;
  const match = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function codeSpan(text) {
  const runs = text.match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || (/^ [\s\S]* $/.test(text)) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function encodeHref(href) {
  if (!/[()\s<>]/.test(href)) return href;
  // Forma de destino entre ángulos de CommonMark: admite paréntesis y espacios.
  return `<${href.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\n/g, '%0A')}>`;
}

/** Markdown inline para los hijos de un nodo. `br` define cómo se escribe un salto. */
function inlineMarkdown(nodes, br) {
  let out = '';
  nodes.forEach(node => {
    if (node.nodeType === TEXT_NODE) {
      out += escapeInlineText((node.textContent || '').replace(/\s*\n\s*/g, ' '));
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const el = node;
    if (el.classList?.contains('check-control')) return;
    const inner = () => inlineMarkdown(Array.from(el.childNodes), br);
    switch (el.tagName) {
      case 'BR': out += br; break;
      case 'STRONG': case 'B': out += wrapMark('**', inner()); break;
      case 'EM': case 'I': out += wrapMark('*', inner()); break;
      case 'S': case 'DEL': case 'STRIKE': out += wrapMark('~~', inner()); break;
      case 'U': out += `<u>${inner()}</u>`; break;
      case 'KBD': out += `<kbd>${inner()}</kbd>`; break;
      case 'CODE': out += codeSpan(el.textContent || ''); break;
      case 'A': {
        const href = (el.getAttribute('href') || '').trim();
        const label = inner();
        if (SAFE_URL_RE.test(href)) out += `[${label || escapeInlineText(href)}](${encodeHref(href)})`;
        else out += label;
        break;
      }
      default:
        if (isBlockElement(el)) {
          const content = inner();
          if (content && out && !out.endsWith(br)) out += br;
          out += content;
        } else {
          out += inner();
        }
    }
  });
  return out;
}

function prefixLines(markdown, prefix) {
  return markdown.split('\n').map(line => (line ? `${prefix}${line}` : prefix.trimEnd())).join('\n');
}

function listToMarkdown(el, indent = '') {
  const ordered = el.tagName === 'OL';
  const checklist = el.classList?.contains('checklist');
  let number = Number(el.getAttribute('start')) || 1;
  const lines = [];

  elementChildren(el).forEach(child => {
    if (child.tagName !== 'LI') {
      if (child.tagName === 'UL' || child.tagName === 'OL') lines.push(listToMarkdown(child, indent));
      return;
    }
    const marker = checklist
      ? `- [${child.classList.contains('done') ? 'x' : ' '}] `
      : ordered ? `${number++}. ` : '- ';
    const inlineNodes = [];
    const nested = [];
    child.childNodes.forEach(node => {
      if (node.nodeType === ELEMENT_NODE && (node.tagName === 'UL' || node.tagName === 'OL')) nested.push(node);
      else inlineNodes.push(node);
    });
    const text = escapeLineStarts(inlineMarkdown(inlineNodes, '<br>').trim());
    lines.push(`${indent}${marker}${text}`.trimEnd());
    nested.forEach(list => lines.push(listToMarkdown(list, indent + ' '.repeat(marker.length))));
  });

  return lines.filter(Boolean).join('\n');
}

function tableToMarkdown(el) {
  const rows = Array.from(el.querySelectorAll('tr')).map(tr => {
    const cells = elementChildren(tr).filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH');
    return {
      header: cells.length > 0 && cells.every(cell => cell.tagName === 'TH'),
      cells: cells.map(cell => inlineMarkdown(Array.from(cell.childNodes), '<br>').trim()),
    };
  }).filter(row => row.cells.length > 0);
  if (!rows.length) return '';

  const columns = Math.max(...rows.map(row => row.cells.length));
  const pad = cells => Array.from({length: columns}, (_, i) => cells[i] || '');
  const line = cells => `| ${pad(cells).join(' | ')} |`;
  const [first, ...rest] = rows;
  const header = first.header ? first.cells : [];
  const body = first.header ? rest : rows;
  return [
    line(header),
    `| ${Array.from({length: columns}, () => '---').join(' | ')} |`,
    ...body.map(row => line(row.cells)),
  ].join('\n');
}

function codeBlockToMarkdown(el) {
  const codeEl = el.querySelector('code');
  let text = (codeEl || el).textContent || '';
  if (text.endsWith('\n')) text = text.slice(0, -1);
  const lang = Array.from(codeEl?.classList || []).find(name => name.startsWith('language-'))?.slice(9) || '';
  const runs = text.match(/`{3,}/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 2);
  const fence = '`'.repeat(longest + 1);
  return `${fence}${lang}\n${text}\n${fence}`;
}

function blocksToMarkdown(nodes) {
  const blocks = [];
  let inlineRun = [];

  const flushInline = () => {
    if (!inlineRun.length) return;
    const text = inlineMarkdown(inlineRun, '\n').trim();
    if (text) blocks.push(escapeLineStarts(text));
    inlineRun = [];
  };

  nodes.forEach(node => {
    if (node.nodeType === TEXT_NODE) {
      if ((node.textContent || '').trim() || inlineRun.length) inlineRun.push(node);
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const el = node;
    if (el.classList?.contains('check-control')) return;
    if (!isBlockElement(el)) {
      inlineRun.push(el);
      return;
    }
    flushInline();

    switch (el.tagName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const level = Math.min(3, Number(el.tagName.slice(1)));
        const text = inlineMarkdown(Array.from(el.childNodes), '<br>').trim();
        if (text) blocks.push(`${'#'.repeat(level)} ${text}`);
        break;
      }
      case 'P': case 'SUMMARY': {
        const text = inlineMarkdown(Array.from(el.childNodes), '\n').trim();
        if (text) blocks.push(escapeLineStarts(text));
        break;
      }
      case 'BLOCKQUOTE': {
        const inner = blocksToMarkdown(Array.from(el.childNodes));
        if (inner) blocks.push(prefixLines(inner, '> '));
        break;
      }
      case 'PRE':
        blocks.push(codeBlockToMarkdown(el));
        break;
      case 'HR':
        blocks.push('---');
        break;
      case 'UL': case 'OL': {
        const list = listToMarkdown(el);
        if (list) blocks.push(list);
        break;
      }
      case 'LI': {
        const text = inlineMarkdown(Array.from(el.childNodes), '<br>').trim();
        if (text) blocks.push(`- ${escapeLineStarts(text)}`);
        break;
      }
      case 'TABLE': case 'THEAD': case 'TBODY': {
        const table = tableToMarkdown(el);
        if (table) blocks.push(table);
        break;
      }
      case 'DETAILS': {
        const summaryEl = elementChildren(el).find(child => child.tagName === 'SUMMARY');
        const summary = (summaryEl?.textContent || '').replace(/\s+/g, ' ').trim() || 'Detalles';
        const inner = blocksToMarkdown(Array.from(el.childNodes).filter(child => child !== summaryEl));
        blocks.push(`<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n\n</details>`.replace(/\n{3,}/g, '\n\n'));
        break;
      }
      default: {
        if (el.classList?.contains('doc-callout') || el.classList?.contains('callout')) {
          const inner = blocksToMarkdown(Array.from(el.childNodes));
          blocks.push(prefixLines(`[!NOTE]\n${inner}`, '> '));
        } else {
          const inner = blocksToMarkdown(Array.from(el.childNodes));
          if (inner) blocks.push(inner);
        }
      }
    }
  });

  flushInline();
  return blocks.join('\n\n');
}

export function htmlToMarkdown(html = '') {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  return blocksToMarkdown(Array.from(doc.body.childNodes)).replace(/\n{3,}/g, '\n\n').trim();
}
