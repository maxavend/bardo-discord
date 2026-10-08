/**
 * Utilidades de texto de Documentos (sin React): búsqueda, texto plano para
 * copiar, tareas del lector y detección de documentos vacíos.
 * Usan `DOMParser` (en Node se provee con domino en los tests).
 */
import {htmlToMarkdown} from './editor/bardo-markdown.js';

/** Minúsculas y sin tildes: "Reunión" y "reunion" coinciden (la ñ se compara como n). */
export function normalizeSearchText(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL',
  'LI', 'TABLE', 'TR', 'DETAILS', 'SUMMARY', 'HR', 'SECTION', 'ARTICLE',
]);

function parseBody(html) {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html || ''}</body></html>`, 'text/html').body;
}

/**
 * HTML del documento -> texto plano legible: conserva párrafos y saltos de
 * línea, numera listas, marca tareas (☐/☑) y separa celdas de tablas.
 */
export function htmlToPlainText(html = '') {
  const lines = [];
  let current = '';
  const pushLine = () => {
    lines.push(current.replace(/[ \t]+/g, ' ').trim());
    current = '';
  };
  const blankLine = () => {
    if (current.trim()) pushLine();
    if (lines.length && lines.at(-1) !== '') lines.push('');
  };

  const walk = (node, context = {}) => {
    if (node.nodeType === 3) {
      current += (node.textContent || '').replace(/\s*\n\s*/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = el.tagName;
    if (el.classList?.contains('check-control')) return;
    if (tag === 'BR') { pushLine(); return; }
    if (tag === 'HR') { blankLine(); lines.push('———'); lines.push(''); return; }
    if (tag === 'PRE') {
      blankLine();
      String(el.textContent || '').replace(/\n$/, '').split('\n').forEach(line => lines.push(line));
      lines.push('');
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      if (current.trim()) pushLine();
      const ordered = tag === 'OL';
      const checklist = el.classList?.contains('checklist');
      let number = Number(el.getAttribute('start')) || 1;
      const depth = (context.depth ?? -1) + 1;
      Array.from(el.children).forEach(child => {
        if (child.tagName !== 'LI') { walk(child, {...context, depth}); return; }
        const marker = checklist
          ? (child.classList.contains('done') ? '☑ ' : '☐ ')
          : ordered ? `${number++}. ` : '• ';
        current = `${'  '.repeat(depth)}${marker}`;
        Array.from(child.childNodes).forEach(grand => {
          if (grand.nodeType === 1 && (grand.tagName === 'UL' || grand.tagName === 'OL')) {
            if (current.trim()) pushLine();
            walk(grand, {...context, depth});
          } else {
            walk(grand, {...context, depth});
          }
        });
        if (current.trim()) pushLine();
      });
      if (depth === 0) lines.push('');
      return;
    }
    if (tag === 'TABLE') {
      blankLine();
      Array.from(el.querySelectorAll('tr')).forEach(tr => {
        const cells = Array.from(tr.children)
          .filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH')
          .map(cell => htmlToPlainText(cell.innerHTML).replace(/\n+/g, ' ').trim());
        lines.push(cells.join(' | '));
      });
      lines.push('');
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) blankLine();
    Array.from(el.childNodes).forEach(child => walk(child, context));
    if (isBlock) blankLine();
  };

  Array.from(parseBody(html).childNodes).forEach(node => walk(node));
  if (current.trim()) pushLine();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Texto de búsqueda de un documento (título, descripción y cuerpo), en caché por objeto. */
const searchTextCache = new WeakMap();
function documentSearchText(doc) {
  let cached = searchTextCache.get(doc);
  if (cached === undefined) {
    cached = normalizeSearchText(`${doc?.title || ''} ${doc?.description || ''} ${htmlToPlainText(doc?.body || '')}`);
    searchTextCache.set(doc, cached);
  }
  return cached;
}

/**
 * Filtra documentos por título, descripción y texto del cuerpo, sin distinguir
 * mayúsculas ni tildes ("reunion" encuentra "Reunión"). No busca en etiquetas
 * como el origen ("Creado en Bardo") ni en nombres de autores.
 */
export function filterDocumentsByQuery(docs, query) {
  const q = normalizeSearchText(query);
  if (!q) return docs;
  const terms = q.split(' ').filter(Boolean);
  return docs.filter(doc => {
    const haystack = documentSearchText(doc);
    return terms.every(term => haystack.includes(term));
  });
}

/** Texto completo de un documento para copiar: título, descripción y cuerpo. */
export function documentPlainText(doc) {
  const parts = [String(doc?.title || 'Sin título').trim()];
  if (String(doc?.description || '').trim()) parts.push(String(doc.description).trim());
  const body = htmlToPlainText(doc?.body || '');
  if (body) parts.push(body);
  return parts.join('\n\n');
}

/** Índice (en orden del documento) de un ítem de tarea `ul.checklist > li`. */
export function checklistItems(root) {
  return Array.from(root?.querySelectorAll?.('ul.checklist > li') || []);
}

/**
 * Aplica cambios de tareas `{index, done}` sobre el HTML de un documento.
 * Devuelve el HTML nuevo, o null si algún índice ya no existe.
 */
export function applyChecklistOps(html = '', ops = []) {
  const body = parseBody(html);
  const items = checklistItems(body);
  for (const op of ops) {
    const item = items[Number(op?.index)];
    if (!item) return null;
    if (op.done) item.classList.add('done');
    else item.classList.remove('done');
  }
  return body.innerHTML;
}

/** Pegar en el título: siempre una sola línea. */
export function flattenPastedTitle(text) {
  return String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
}

/** Un documento nuevo sin título, descripción ni contenido no se crea. */
export function isEmptyDocSnapshot(snapshot) {
  if (!snapshot) return true;
  if (String(snapshot.title || '').trim() || String(snapshot.description || '').trim()) return false;
  return !htmlToMarkdown(String(snapshot.body || '')).trim();
}
