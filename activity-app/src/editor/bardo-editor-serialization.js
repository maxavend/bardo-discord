/**
 * Serialización y deserialización bidireccional entre HTML canónico de Bardo y el AST de Slate / Plate.
 * Garantiza round-trip limpio preservando encabezados, estilos inline, listas, checklists,
 * callouts, spoilers, code blocks, tablas y separadores sin mutaciones DOM ni controles efímeros.
 */

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return `https://${value}`;
}

/**
 * Convierte un árbol de nodos DOM a nodos del AST de Slate/Plate.
 */
function deserializeDomChildren(domNode, marks = {}) {
  const nodes = [];

  domNode.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        nodes.push({ text, ...marks });
      }
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const el = child;
    const tag = el.tagName.toLowerCase();

    // Ignorar controles efímeros inyectados previamente
    if (el.classList.contains('check-control')) return;

    // Formatos inline (marcas)
    if (['strong', 'b'].includes(tag)) {
      nodes.push(...deserializeDomChildren(el, { ...marks, bold: true }));
      return;
    }
    if (['em', 'i'].includes(tag)) {
      nodes.push(...deserializeDomChildren(el, { ...marks, italic: true }));
      return;
    }
    if (tag === 'u') {
      nodes.push(...deserializeDomChildren(el, { ...marks, underline: true }));
      return;
    }
    if (['s', 'del', 'strike'].includes(tag)) {
      nodes.push(...deserializeDomChildren(el, { ...marks, strikethrough: true }));
      return;
    }
    if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') {
      nodes.push(...deserializeDomChildren(el, { ...marks, code: true }));
      return;
    }
    if (tag === 'kbd') {
      nodes.push(...deserializeDomChildren(el, { ...marks, kbd: true }));
      return;
    }

    // Enlaces
    if (tag === 'a') {
      const url = normalizeUrl(el.getAttribute('href') || '');
      const children = deserializeDomChildren(el, marks);
      nodes.push({
        type: 'a',
        url: url || '#',
        target: '_blank',
        children: children.length > 0 ? children : [{ text: url || el.textContent || '' }],
      });
      return;
    }

    // Saltos de línea inline
    if (tag === 'br') {
      nodes.push({ text: '\n', ...marks });
      return;
    }

    // Spans y elementos inline genéricos
    if (tag === 'span') {
      nodes.push(...deserializeDomChildren(el, marks));
      return;
    }

    // Bloques anidados
    const block = deserializeDomElement(el);
    if (block) {
      nodes.push(block);
    }
  });

  return nodes;
}

/**
 * Normaliza los hijos de un elemento de texto para que siempre haya al menos un nodo de texto válido.
 */
function ensureInlineChildren(children) {
  if (!children || children.length === 0) {
    return [{ text: '' }];
  }
  const flattened = [];
  children.forEach(child => {
    if (child.text !== undefined || child.type === 'a') {
      flattened.push(child);
    } else if (child.children) {
      flattened.push(...ensureInlineChildren(child.children));
    }
  });
  return flattened.length > 0 ? flattened : [{ text: '' }];
}

/**
 * Convierte un elemento DOM de bloque a un nodo de Slate/Plate.
 */
function deserializeDomElement(el) {
  const tag = el.tagName.toLowerCase();

  // Encabezados
  if (tag === 'h1') {
    return { type: 'h1', children: ensureInlineChildren(deserializeDomChildren(el)) };
  }
  if (tag === 'h2') {
    return { type: 'h2', children: ensureInlineChildren(deserializeDomChildren(el)) };
  }
  if (tag === 'h3') {
    return { type: 'h3', children: ensureInlineChildren(deserializeDomChildren(el)) };
  }
  if (['h4', 'h5', 'h6'].includes(tag)) {
    return { type: 'h3', children: ensureInlineChildren(deserializeDomChildren(el)) };
  }

  // Párrafo
  if (tag === 'p') {
    return { type: 'p', children: ensureInlineChildren(deserializeDomChildren(el)) };
  }

  // Cita
  if (tag === 'blockquote') {
    const rawChildren = deserializeDomChildren(el);
    const inlineChildren = ensureInlineChildren(rawChildren);
    return { type: 'blockquote', children: inlineChildren };
  }

  // Separador horizontal
  if (tag === 'hr') {
    return { type: 'hr', children: [{ text: '' }] };
  }

  // Bloque de código <pre><code>...</code></pre>
  if (tag === 'pre') {
    const codeEl = el.querySelector('code');
    const textContent = (codeEl ? codeEl.textContent : el.textContent) || '';
    return {
      type: 'code_block',
      children: [{ text: textContent }],
    };
  }

  // Callout: <div class="doc-callout"> o <div class="callout">
  if (el.classList.contains('doc-callout') || el.classList.contains('callout')) {
    return {
      type: 'callout',
      children: ensureInlineChildren(deserializeDomChildren(el)),
    };
  }

  // Spoiler / Desplegable: <details class="spoiler"><summary>...</summary><p>...</p></details>
  if (tag === 'details' || el.classList.contains('spoiler')) {
    const summaryEl = el.querySelector('summary');
    const summaryText = summaryEl?.textContent?.trim() || 'Detalles';

    // Extraer contenido que no sea el summary
    const contentNodes = [];
    el.childNodes.forEach(child => {
      if (child === summaryEl) return;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const item = deserializeDomElement(child);
        if (item) contentNodes.push(item);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        contentNodes.push({ type: 'p', children: [{ text: child.textContent }] });
      }
    });

    if (contentNodes.length === 0) {
      contentNodes.push({ type: 'p', children: [{ text: '' }] });
    }

    return {
      type: 'toggle',
      summary: summaryText,
      children: contentNodes,
    };
  }

  // Listas con viñetas o checklist
  if (tag === 'ul') {
    const isChecklist = el.classList.contains('checklist');
    const items = [];

    el.querySelectorAll(':scope > li').forEach(li => {
      // Limpiar controles temporales antes de procesar
      li.querySelectorAll('.check-control').forEach(btn => btn.remove());
      const checked = li.classList.contains('done');
      const inlineChildren = ensureInlineChildren(deserializeDomChildren(li));

      if (isChecklist) {
        items.push({
          type: 'action_item',
          checked,
          children: inlineChildren,
        });
      } else {
        items.push({
          type: 'li',
          children: [{ type: 'lic', children: inlineChildren }],
        });
      }
    });

    if (isChecklist) {
      return items.length > 0 ? items : [{ type: 'action_item', checked: false, children: [{ text: '' }] }];
    }

    return {
      type: 'ul',
      children: items.length > 0 ? items : [{ type: 'li', children: [{ type: 'lic', children: [{ text: '' }] }] }],
    };
  }

  // Listas ordenadas (numeradas)
  if (tag === 'ol') {
    const items = [];
    el.querySelectorAll(':scope > li').forEach(li => {
      const inlineChildren = ensureInlineChildren(deserializeDomChildren(li));
      items.push({
        type: 'li',
        children: [{ type: 'lic', children: inlineChildren }],
      });
    });

    return {
      type: 'ol',
      children: items.length > 0 ? items : [{ type: 'li', children: [{ type: 'lic', children: [{ text: '' }] }] }],
    };
  }

  // Elemento de lista suelto <li>
  if (tag === 'li') {
    return {
      type: 'li',
      children: [{ type: 'lic', children: ensureInlineChildren(deserializeDomChildren(el)) }],
    };
  }

  // Tablas
  if (tag === 'table') {
    const rows = [];
    el.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        const isHeader = cell.tagName.toLowerCase() === 'th';
        cells.push({
          type: isHeader ? 'th' : 'td',
          children: [{ type: 'p', children: ensureInlineChildren(deserializeDomChildren(cell)) }],
        });
      });
      if (cells.length > 0) {
        rows.push({ type: 'tr', children: cells });
      }
    });

    return {
      type: 'table',
      children: rows.length > 0 ? rows : [
        {
          type: 'tr',
          children: [{ type: 'td', children: [{ type: 'p', children: [{ text: '' }] }] }],
        },
      ],
    };
  }

  // Div genérico -> Convertir a párrafo o extraer bloques
  if (tag === 'div') {
    const children = deserializeDomChildren(el);
    const hasBlocks = children.some(c => c.type && c.type !== 'a');
    if (hasBlocks) {
      return children;
    }
    return {
      type: 'p',
      children: ensureInlineChildren(children),
    };
  }

  // Fallback para cualquier otro elemento
  const inlineChildren = ensureInlineChildren(deserializeDomChildren(el));
  return {
    type: 'p',
    children: inlineChildren,
  };
}

/**
 * Deserializa un string HTML al valor inicial de Plate AST.
 * @param {string} html
 * @returns {Array<Object>} Slate node array
 */
export function htmlToPlateValue(html = '') {
  const cleanHtml = String(html || '').trim();
  if (!cleanHtml) {
    return [{ type: 'p', children: [{ text: '' }] }];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${cleanHtml}</body>`, 'text/html');

  const nodes = [];
  doc.body.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        nodes.push({ type: 'p', children: [{ text }] });
      }
      return;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const res = deserializeDomElement(child);
      if (Array.isArray(res)) {
        nodes.push(...res);
      } else if (res) {
        nodes.push(res);
      }
    }
  });

  return nodes.length > 0 ? nodes : [{ type: 'p', children: [{ text: '' }] }];
}

/**
 * Serializa un nodo de texto o inline mark a HTML.
 */
function serializeLeafOrInline(node) {
  if (node.type === 'a') {
    const url = normalizeUrl(node.url || '');
    const inner = (node.children || []).map(serializeLeafOrInline).join('');
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${inner || escapeHtml(url)}</a>`;
  }

  let text = escapeHtml(node.text || '');

  // Manejo de saltos de línea internos
  if (text.includes('\n')) {
    text = text.split('\n').join('<br>');
  }

  if (node.bold) text = `<strong>${text}</strong>`;
  if (node.italic) text = `<em>${text}</em>`;
  if (node.underline) text = `<u>${text}</u>`;
  if (node.strikethrough) text = `<s>${text}</s>`;
  if (node.code) text = `<code>${text}</code>`;
  if (node.kbd) text = `<kbd>${text}</kbd>`;

  return text;
}

/**
 * Serializa los hijos inlines de un bloque.
 */
function serializeInlineChildren(children) {
  if (!children || children.length === 0) return '<br>';
  const html = children.map(serializeLeafOrInline).join('');
  return html || '<br>';
}

/**
 * Serializa un nodo del AST de Slate/Plate a HTML canónico de Bardo.
 */
function serializeNodeToHtml(node) {
  const type = node.type || 'p';

  switch (type) {
    case 'h1':
      return `<h1>${serializeInlineChildren(node.children)}</h1>`;
    case 'h2':
      return `<h2>${serializeInlineChildren(node.children)}</h2>`;
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `<h3>${serializeInlineChildren(node.children)}</h3>`;
    case 'p':
      return `<p>${serializeInlineChildren(node.children)}</p>`;
    case 'blockquote':
      return `<blockquote>${serializeInlineChildren(node.children)}</blockquote>`;
    case 'hr':
      return `<hr>`;
    case 'code_block': {
      let codeText = '';
      if (node.children) {
        codeText = node.children.map(c => c.text || '').join('\n');
      }
      return `<pre><code>${escapeHtml(codeText)}</code></pre>`;
    }
    case 'callout':
      return `<div class="doc-callout">${serializeInlineChildren(node.children)}</div>`;
    case 'toggle': {
      const summary = escapeHtml(node.summary || 'Detalles');
      const innerHtml = (node.children || []).map(serializeNodeToHtml).join('');
      return `<details class="spoiler" open><summary>${summary}</summary>${innerHtml || '<p><br></p>'}</details>`;
    }
    case 'action_item': {
      const doneClass = node.checked ? ' class="done"' : '';
      return `<li${doneClass}>${serializeInlineChildren(node.children)}</li>`;
    }
    case 'ul': {
      const items = (node.children || []).map(li => {
        if (li.type === 'li') {
          const lic = li.children?.find(c => c.type === 'lic') || li;
          return `<li>${serializeInlineChildren(lic.children || li.children)}</li>`;
        }
        return serializeNodeToHtml(li);
      }).join('');
      return `<ul>${items}</ul>`;
    }
    case 'ol': {
      const items = (node.children || []).map(li => {
        if (li.type === 'li') {
          const lic = li.children?.find(c => c.type === 'lic') || li;
          return `<li>${serializeInlineChildren(lic.children || li.children)}</li>`;
        }
        return serializeNodeToHtml(li);
      }).join('');
      return `<ol>${items}</ol>`;
    }
    case 'table': {
      const rows = (node.children || []).map(serializeNodeToHtml).join('');
      return `<table><tbody>${rows}</tbody></table>`;
    }
    case 'tr': {
      const cells = (node.children || []).map(serializeNodeToHtml).join('');
      return `<tr>${cells}</tr>`;
    }
    case 'th': {
      const inner = (node.children || []).map(child => child.children ? serializeInlineChildren(child.children) : serializeLeafOrInline(child)).join('');
      return `<th>${inner}</th>`;
    }
    case 'td': {
      const inner = (node.children || []).map(child => child.children ? serializeInlineChildren(child.children) : serializeLeafOrInline(child)).join('');
      return `<td>${inner}</td>`;
    }
    default:
      if (node.children) {
        return `<p>${serializeInlineChildren(node.children)}</p>`;
      }
      return '';
  }
}

/**
 * Serializa un array de nodos Slate/Plate a HTML canónico de Bardo agrupando checklists consecutivas.
 * @param {Array<Object>} value
 * @returns {string} Canonical HTML
 */
export function plateValueToHtml(value = []) {
  if (!Array.isArray(value) || value.length === 0) {
    return '<p><br></p>';
  }

  const htmlChunks = [];
  let currentChecklist = [];

  const flushChecklist = () => {
    if (currentChecklist.length > 0) {
      const lis = currentChecklist.map(item => {
        const doneClass = item.checked ? ' class="done"' : '';
        return `<li${doneClass}>${serializeInlineChildren(item.children)}</li>`;
      }).join('');
      htmlChunks.push(`<ul class="checklist">${lis}</ul>`);
      currentChecklist = [];
    }
  };

  value.forEach(node => {
    if (node.type === 'action_item') {
      currentChecklist.push(node);
    } else {
      flushChecklist();
      htmlChunks.push(serializeNodeToHtml(node));
    }
  });

  flushChecklist();

  return htmlChunks.join('\n') || '<p><br></p>';
}
