import {htmlToMarkdown, markdownToHtml} from '../editor/bardo-markdown.js';

export const MINUTES_DOC_ORIGIN = 'Acta de reunión';

/**
 * Library document for an acta. `docData.body` is the Markdown produced by
 * generateMinutesMarkdown; Docs stores HTML, so it is converted exactly like
 * an imported Markdown file. With `existing` it updates that document.
 */
export function buildMinutesDoc(docData, {existing = null, now = new Date().toISOString(), editorName = ''} = {}) {
  const title = docData?.title || 'Acta de reunión';
  return {
    ...(existing || {}),
    id: docData.id,
    title,
    description: docData?.description || '',
    body: markdownToHtml(String(docData?.body || ''), title),
    origin: MINUTES_DOC_ORIGIN,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdByName: existing?.createdByName || docData?.createdByName || editorName,
    updatedByName: docData?.updatedByName || editorName,
    builtin: false,
    stress: false,
  };
}

/**
 * Huella del contenido de un acta (sobre su Markdown normalizado, estable
 * tras guardar y recargar). Sirve para saber si alguien la editó en Documentos
 * después de generarla.
 */
export function minutesContentHash(html) {
  const text = htmlToMarkdown(String(html || '')).replace(/\s+/g, ' ').trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(16)}`;
}

/**
 * Qué hacer al guardar de nuevo un acta:
 * - 'create': no existe todavía;
 * - 'update': el documento sigue igual a la última acta generada (o igual a la
 *   nueva), se actualiza sin preguntar;
 * - 'confirm': fue editado en Documentos; hay que preguntar antes de pisarlo.
 */
export function planMinutesSave({existing = null, generatedBody = '', lastGeneratedHash = null} = {}) {
  if (!existing) return 'create';
  const currentHash = minutesContentHash(existing.body);
  if (lastGeneratedHash && currentHash === lastGeneratedHash) return 'update';
  if (currentHash === minutesContentHash(generatedBody)) return 'update';
  return 'confirm';
}

/** Acta guardada como documento nuevo (no toca la versión editada). */
export function buildMinutesCopy(docData, {id, now = new Date().toISOString(), editorName = ''} = {}) {
  // El cuerpo se genera con el título original (así no se repite como encabezado).
  const doc = buildMinutesDoc({...docData, id}, {now, editorName});
  return {...doc, title: `${doc.title} (nueva versión)`};
}
