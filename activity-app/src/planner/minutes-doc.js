import {markdownToHtml} from '../editor/bardo-markdown.js';

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
