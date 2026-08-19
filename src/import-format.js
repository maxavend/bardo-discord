export const SOURCE_TYPES = Object.freeze({
  MARKDOWN: 'markdown',
  TEXT: 'text',
  PDF: 'pdf',
  DOCX: 'docx',
});

export function getSourceType(fileName = '') {
  const name = String(fileName).trim().toLowerCase();

  if (name.endsWith('.md') || name.endsWith('.markdown')) return SOURCE_TYPES.MARKDOWN;
  if (name.endsWith('.txt')) return SOURCE_TYPES.TEXT;
  if (name.endsWith('.pdf')) return SOURCE_TYPES.PDF;
  if (name.endsWith('.docx')) return SOURCE_TYPES.DOCX;

  return null;
}

export function isTextSourceType(sourceType) {
  return sourceType === SOURCE_TYPES.MARKDOWN || sourceType === SOURCE_TYPES.TEXT;
}

export function sourceLabel(sourceType) {
  switch (sourceType) {
    case SOURCE_TYPES.PDF:
      return 'PDF';
    case SOURCE_TYPES.DOCX:
      return 'Word';
    case SOURCE_TYPES.TEXT:
      return 'TXT';
    case SOURCE_TYPES.MARKDOWN:
      return 'Markdown';
    default:
      return 'documento';
  }
}

export function fileStem(fileName = '') {
  const value = String(fileName).trim().replace(/^.*[\\/]/, '');
  return value.replace(/\.(?:md|markdown|txt|pdf|docx)$/i, '').trim() || 'Documento';
}
