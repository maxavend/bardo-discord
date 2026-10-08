/**
 * Serialización bidireccional entre el HTML canónico de Bardo y el valor de Plate.
 *
 * Modelo de listas: Bardo usa la lista "plana" de `@platejs/list`. Cada ítem es
 * un bloque `p` con `listStyleType` ('disc', 'decimal', …) e `indent` (1 = primer
 * nivel). Las tareas son bloques `action_item` (con `checked` e `indent`
 * opcional). En HTML se representan como `<ul>/<ol>` anidados y
 * `<ul class="checklist">`.
 */

import {buildListHtml, escapeHtml, isOrderedListStyle} from './bardo-markdown.js';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return `https://${value}`;
}

const INLINE_BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI',
  'UL', 'OL', 'TABLE', 'TR', 'TD', 'TH', 'DETAILS', 'SUMMARY', 'SECTION', 'ARTICLE',
]);

/**
 * Convierte los hijos DOM de un bloque en nodos inline de Slate (texto + enlaces).
 * Los bloques anidados se aplanan separándolos con un salto de línea.
 */
function deserializeInline(domNode, marks = {}) {
  const nodes = [];

  domNode.childNodes.forEach(child => {
    if (child.nodeType === TEXT_NODE) {
      const text = (child.textContent || '').replace(/\s*\n\s*/g, ' ');
      if (text) nodes.push({text, ...marks});
      return;
    }
    if (child.nodeType !== ELEMENT_NODE) return;

    const el = child;
    const tag = el.tagName;
    if (el.classList?.contains('check-control')) return;

    if (tag === 'STRONG' || tag === 'B') { nodes.push(...deserializeInline(el, {...marks, bold: true})); return; }
    if (tag === 'EM' || tag === 'I') { nodes.push(...deserializeInline(el, {...marks, italic: true})); return; }
    if (tag === 'U') { nodes.push(...deserializeInline(el, {...marks, underline: true})); return; }
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') { nodes.push(...deserializeInline(el, {...marks, strikethrough: true})); return; }
    if (tag === 'CODE') { nodes.push({text: el.textContent || '', ...marks, code: true}); return; }
    if (tag === 'KBD') { nodes.push(...deserializeInline(el, {...marks, kbd: true})); return; }
    if (tag === 'BR') { nodes.push({text: '\n', ...marks}); return; }

    if (tag === 'A') {
      const url = normalizeUrl(el.getAttribute('href') || '');
      const children = deserializeInline(el, marks).filter(node => node.text !== undefined);
      nodes.push({
        type: 'a',
        url: url || '#',
        target: '_blank',
        children: children.length > 0 ? children : [{text: url || el.textContent || ''}],
      });
      return;
    }

    if (INLINE_BLOCK_TAGS.has(tag)) {
      const inner = deserializeInline(el, marks);
      if (inner.length) {
        const last = nodes.at(-1);
        if (nodes.length && !(last?.text ?? '').endsWith('\n')) nodes.push({text: '\n', ...marks});
        nodes.push(...inner);
      }
      return;
    }

    nodes.push(...deserializeInline(el, marks));
  });

  return nodes;
}

function sameMarks(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('text');
  for (const key of keys) {
    if (Boolean(a[key]) !== Boolean(b[key])) return false;
  }
  return true;
}

/** Une textos adyacentes con las mismas marcas (como hace la normalización de Slate). */
function mergeTexts(nodes) {
  const out = [];
  nodes.forEach(node => {
    const last = out.at(-1);
    if (node.text !== undefined && last && last.text !== undefined && sameMarks(last, node)) {
      out[out.length - 1] = {...last, text: last.text + node.text};
      return;
    }
    if (node.type === 'a') {
      out.push({...node, children: mergeTexts(node.children)});
      return;
    }
    out.push(node);
  });
  return out;
}

function inlineChildren(el, marks) {
  const nodes = mergeTexts(deserializeInline(el, marks));
  // Un <br> final no crea una línea visible en HTML (p. ej. el marcador de
  // párrafo vacío `<p><br></p>`): no debe convertirse en un "\n" real.
  const last = nodes.at(-1);
  if (last && last.text !== undefined && last.text.endsWith('\n')) {
    const trimmed = last.text.slice(0, -1);
    if (trimmed || nodes.length === 1) nodes[nodes.length - 1] = {...last, text: trimmed};
    else nodes.pop();
  }
  return nodes.length > 0 ? nodes : [{text: ''}];
}

function elementChildren(el) {
  return Array.from(el.childNodes).filter(child => child.nodeType === ELEMENT_NODE);
}

/** Aplana listas HTML anidadas en bloques planos de Plate. */
function deserializeList(listEl, level, out) {
  const isChecklist = listEl.classList?.contains('checklist');
  const ordered = listEl.tagName === 'OL';
  // <ol start="N">: el primer ítem reinicia la numeración en N (Plate: listRestart).
  const startAttr = ordered && listEl.hasAttribute?.('start') ? Number(listEl.getAttribute('start')) : null;
  let pendingRestart = Number.isInteger(startAttr) && startAttr >= 0 ? startAttr : null;

  elementChildren(listEl).forEach(child => {
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      deserializeList(child, level + 1, out);
      return;
    }
    if (child.tagName !== 'LI') return;

    const nested = [];
    const holder = child.cloneNode(true);
    elementChildren(holder).forEach(node => {
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        nested.push(node);
        node.remove();
      }
    });
    const children = inlineChildren(holder);

    if (isChecklist) {
      const item = {type: 'action_item', checked: child.classList.contains('done'), children};
      if (level > 0) item.indent = level + 1;
      out.push(item);
    } else {
      const item = {
        type: 'p',
        listStyleType: ordered ? 'decimal' : 'disc',
        indent: level + 1,
        children,
      };
      if (ordered && pendingRestart !== null) item.listRestart = pendingRestart;
      pendingRestart = null;
      out.push(item);
    }
    nested.forEach(list => deserializeList(list, level + 1, out));
  });
}

function deserializeBlocks(nodes) {
  const out = [];
  let inlineRun = [];

  const flush = () => {
    if (!inlineRun.length) return;
    const wrapper = {childNodes: inlineRun};
    const children = deserializeInline(wrapper);
    if (children.some(node => (node.text ?? '').trim() || node.type === 'a')) {
      out.push({type: 'p', children});
    }
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
    if (!INLINE_BLOCK_TAGS.has(el.tagName) && el.tagName !== 'HR') {
      inlineRun.push(el);
      return;
    }
    flush();
    out.push(...deserializeElement(el));
  });

  flush();
  return out;
}

/** Convierte un elemento DOM de bloque en uno o más nodos de Plate. */
function deserializeElement(el) {
  const tag = el.tagName;

  if (tag === 'H1') return [{type: 'h1', children: inlineChildren(el)}];
  if (tag === 'H2') return [{type: 'h2', children: inlineChildren(el)}];
  if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') return [{type: 'h3', children: inlineChildren(el)}];
  if (tag === 'P' || tag === 'SUMMARY') return [{type: 'p', children: inlineChildren(el)}];
  if (tag === 'BLOCKQUOTE') return [{type: 'blockquote', children: inlineChildren(el)}];
  if (tag === 'HR') return [{type: 'hr', children: [{text: ''}]}];

  if (tag === 'PRE') {
    const codeEl = el.querySelector('code');
    let text = (codeEl ? codeEl.textContent : el.textContent) || '';
    if (text.endsWith('\n')) text = text.slice(0, -1);
    const lang = Array.from(codeEl?.classList || []).find(name => name.startsWith('language-'))?.slice(9);
    const node = {type: 'code_block', children: [{text}]};
    if (lang) node.lang = lang;
    return [node];
  }

  if (el.classList?.contains('doc-callout') || el.classList?.contains('callout')) {
    return [{type: 'callout', children: inlineChildren(el)}];
  }

  if (tag === 'DETAILS' || el.classList?.contains('spoiler')) {
    const summaryEl = elementChildren(el).find(child => child.tagName === 'SUMMARY');
    const summary = (summaryEl?.textContent || '').replace(/\s+/g, ' ').trim() || 'Detalles';
    const content = deserializeBlocks(Array.from(el.childNodes).filter(child => child !== summaryEl));
    return [{
      type: 'toggle',
      summary,
      children: content.length ? content : [{type: 'p', children: [{text: ''}]}],
    }];
  }

  if (tag === 'UL' || tag === 'OL') {
    const out = [];
    deserializeList(el, 0, out);
    return out;
  }

  if (tag === 'LI') {
    return [{type: 'p', listStyleType: 'disc', indent: 1, children: inlineChildren(el)}];
  }

  if (tag === 'TABLE') {
    const rows = [];
    Array.from(el.querySelectorAll('tr')).forEach(tr => {
      const cells = elementChildren(tr)
        .filter(cell => cell.tagName === 'TH' || cell.tagName === 'TD')
        .map(cell => ({
          type: cell.tagName === 'TH' ? 'th' : 'td',
          children: [{type: 'p', children: inlineChildren(cell)}],
        }));
      if (cells.length) rows.push({type: 'tr', children: cells});
    });
    const columns = Math.max(1, ...rows.map(row => row.children.length));
    rows.forEach(row => {
      while (row.children.length < columns) {
        row.children.push({type: 'td', children: [{type: 'p', children: [{text: ''}]}]});
      }
    });
    return [{
      type: 'table',
      children: rows.length ? rows : [{type: 'tr', children: [{type: 'td', children: [{type: 'p', children: [{text: ''}]}]}]}],
    }];
  }

  if (tag === 'TR' || tag === 'TD' || tag === 'TH') {
    return [{type: 'p', children: inlineChildren(el)}];
  }

  // DIV y contenedores genéricos: si contienen bloques se aplanan.
  const hasBlocks = elementChildren(el).some(child => INLINE_BLOCK_TAGS.has(child.tagName) || child.tagName === 'HR');
  if (hasBlocks) return deserializeBlocks(Array.from(el.childNodes));
  return [{type: 'p', children: inlineChildren(el)}];
}

/**
 * Deserializa un string HTML al valor inicial de Plate.
 * @param {string} html
 * @returns {Array<Object>}
 */
export function htmlToPlateValue(html = '') {
  const cleanHtml = String(html || '').trim();
  if (!cleanHtml) return [{type: 'p', children: [{text: ''}]}];

  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${cleanHtml}</body></html>`, 'text/html');
  const nodes = deserializeBlocks(Array.from(doc.body.childNodes));
  return nodes.length > 0 ? nodes : [{type: 'p', children: [{text: ''}]}];
}

/* ------------------------------------------------------------------------ */

function serializeLeafOrInline(node) {
  if (node.type === 'a') {
    const url = normalizeUrl(node.url || '');
    const inner = (node.children || []).map(serializeLeafOrInline).join('');
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${inner || escapeHtml(url)}</a>`;
  }

  if (node.text === undefined) {
    // Un bloque dentro de un contexto inline: aplanar su texto.
    return (node.children || []).map(serializeLeafOrInline).join('');
  }

  let text = escapeHtml(node.text || '');
  if (text.includes('\n')) text = text.split('\n').join('<br>');
  if (!text) return '';

  if (node.code) text = `<code>${text}</code>`;
  if (node.kbd) text = `<kbd>${text}</kbd>`;
  if (node.strikethrough) text = `<s>${text}</s>`;
  if (node.underline) text = `<u>${text}</u>`;
  if (node.italic) text = `<em>${text}</em>`;
  if (node.bold) text = `<strong>${text}</strong>`;
  return text;
}

function serializeInlineChildren(children) {
  if (!children || children.length === 0) return '<br>';
  const html = children.map(serializeLeafOrInline).join('');
  if (!html) return '<br>';
  // Un salto de línea final necesita un <br> extra para seguir visible (y
  // sobrevivir a la deserialización, que ignora el último <br>).
  const lastText = children.at(-1)?.text;
  if (typeof lastText === 'string' && lastText.endsWith('\n') && !children.at(-1)?.type) return `${html}<br>`;
  return html;
}

function serializeCell(node) {
  const parts = (node.children || []).map(child => (child.children ? serializeInlineChildren(child.children) : serializeLeafOrInline(child)));
  return parts.filter(part => part && part !== '<br>').join('<br>');
}

function isListBlock(node) {
  return Boolean(node?.listStyleType) || node?.type === 'action_item';
}

function listNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function listItemFor(node) {
  const level = Math.max(1, Number(node.indent) || 1) - 1;
  const html = serializeInlineChildren(node.children);
  if (node.type === 'action_item' || node.listStyleType === 'todo') {
    return {level, kind: 'task', done: Boolean(node.checked), html};
  }
  if (!isOrderedListStyle(node.listStyleType)) return {level, kind: 'ul', html};
  // Número visible del ítem: reinicio explícito o el que calculó Plate.
  const restart = listNumber(node.listRestart);
  const start = restart ?? listNumber(node.listStart) ?? listNumber(node.listRestartPolite) ?? undefined;
  return {level, kind: 'ol', html, start, restart: restart !== null};
}

function serializeNodeToHtml(node) {
  const type = node.type || 'p';

  switch (type) {
    case 'h1': return `<h1>${serializeInlineChildren(node.children)}</h1>`;
    case 'h2': return `<h2>${serializeInlineChildren(node.children)}</h2>`;
    case 'h3': case 'h4': case 'h5': case 'h6': return `<h3>${serializeInlineChildren(node.children)}</h3>`;
    case 'p': return `<p>${serializeInlineChildren(node.children)}</p>`;
    case 'blockquote': return `<blockquote>${serializeInlineChildren(node.children)}</blockquote>`;
    case 'hr': return '<hr>';
    case 'code_block': {
      const codeText = (node.children || []).map(child => (child.text ?? (child.children || []).map(c => c.text || '').join(''))).join('\n');
      const lang = /^[\w+#.-]+$/.test(node.lang || '') ? ` class="language-${escapeHtml(node.lang)}"` : '';
      return `<pre><code${lang}>${escapeHtml(codeText)}</code></pre>`;
    }
    case 'callout': return `<div class="doc-callout">${serializeInlineChildren(node.children)}</div>`;
    case 'toggle': {
      const summary = escapeHtml(node.summary || 'Detalles');
      const innerHtml = serializeBlocks(node.children || []);
      return `<details class="spoiler" open><summary>${summary}</summary>${innerHtml || '<p><br></p>'}</details>`;
    }
    case 'table': {
      const rows = (node.children || []).map(serializeNodeToHtml).join('');
      return `<table><tbody>${rows}</tbody></table>`;
    }
    case 'tr': return `<tr>${(node.children || []).map(serializeNodeToHtml).join('')}</tr>`;
    case 'th': return `<th>${serializeCell(node)}</th>`;
    case 'td': return `<td>${serializeCell(node)}</td>`;
    // Estructura de listas clásica (contenido heredado): aplanar a texto.
    case 'ul': case 'ol': case 'li': case 'lic':
      return serializeBlocks(flattenClassicList(node, type === 'ol' ? 'decimal' : 'disc', 0));
    default:
      if (node.children) return `<p>${serializeInlineChildren(node.children)}</p>`;
      return '';
  }
}

/** Compatibilidad con valores antiguos ul > li > lic. */
function flattenClassicList(node, style, level) {
  const out = [];
  const visit = (current, currentStyle, currentLevel) => {
    if (current.type === 'ul' || current.type === 'ol') {
      (current.children || []).forEach(child => visit(child, current.type === 'ol' ? 'decimal' : 'disc', currentLevel + 1));
      return;
    }
    if (current.type === 'li') {
      (current.children || []).forEach(child => {
        if (child.type === 'ul' || child.type === 'ol') visit(child, currentStyle, currentLevel);
        else visit(child, currentStyle, currentLevel);
      });
      return;
    }
    out.push({type: 'p', listStyleType: currentStyle, indent: Math.max(1, currentLevel), children: current.text !== undefined ? [current] : (current.children || [{text: ''}])});
  };
  visit(node, style, level);
  return out;
}

function serializeBlocks(nodes) {
  const chunks = [];
  let run = [];
  const flushRun = () => {
    if (!run.length) return;
    chunks.push(buildListHtml(run.map(listItemFor)));
    run = [];
  };
  nodes.forEach(node => {
    if (isListBlock(node)) {
      run.push(node);
      return;
    }
    flushRun();
    chunks.push(serializeNodeToHtml(node));
  });
  flushRun();
  return chunks.filter(Boolean).join('\n');
}

/**
 * Serializa un array de nodos de Plate a HTML canónico de Bardo.
 * @param {Array<Object>} value
 * @returns {string}
 */
export function plateValueToHtml(value = []) {
  if (!Array.isArray(value) || value.length === 0) return '<p><br></p>';
  return serializeBlocks(value) || '<p><br></p>';
}
