import { extractDocumentTitle, paginateMarkdown } from '../pagination.js';

const MAX_STORED_DOCUMENT_BYTES = 1_800_000;
const HISTORY_LIMIT = 30;

function parsePages(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    originalMarkdown: row.original_markdown,
    markdown: row.original_markdown,
    pages: parsePages(row.pages),
    sourceName: row.source_name || null,
    sourceType: row.source_type || null,
    sourceMime: row.source_mime || null,
    importStatus: row.import_status || null,
    hasSource: Boolean(row.source_data),
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    version: Number(row.version || 1),
    updatedAt: row.updated_at || row.created_at || null,
    lastEditedBy: row.last_edited_by || null,
    lastEditReason: row.last_edit_reason || null,
  };
}

export class DocumentVersionConflictError extends Error {
  constructor(current) {
    super('El documento cambió desde que abriste esta versión.');
    this.name = 'DocumentVersionConflictError';
    this.code = 'DOCUMENT_VERSION_CONFLICT';
    this.currentVersion = current?.version || null;
    this.updatedAt = current?.updatedAt || null;
    this.lastEditedBy = current?.lastEditedBy || null;
    this.title = current?.title || null;
  }
}

export class DocumentPreconditionError extends Error {
  constructor() {
    super('Se requiere la versión esperada del documento.');
    this.name = 'DocumentPreconditionError';
    this.code = 'DOCUMENT_VERSION_REQUIRED';
  }
}

export class DocumentVersionService {
  constructor(env) {
    this.env = env;
    this.db = env.DB;
  }

  async get(documentId) {
    return mapDocument(await this.db.prepare('SELECT * FROM documents WHERE id = ?').bind(documentId).first());
  }

  async update(documentId, input, context = {}) {
    const expectedVersion = Number(input?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new DocumentPreconditionError();

    const current = await this.get(documentId);
    if (!current) return null;
    if (current.version !== expectedVersion) throw new DocumentVersionConflictError(current);

    const title = input.title !== undefined
      ? String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 200)
      : current.title;
    const markdown = input.markdown !== undefined
      ? String(input.markdown || '').trim()
      : current.originalMarkdown;
    if (!title) throw new Error('El título es requerido.');
    if (!markdown) throw new Error('El contenido es requerido.');
    if (new TextEncoder().encode(markdown).byteLength > MAX_STORED_DOCUMENT_BYTES) {
      const error = new Error('El documento es demasiado grande.'); error.code = 'DOCUMENT_TOO_LARGE'; throw error;
    }

    const { body } = extractDocumentTitle(markdown, title);
    const pages = paginateMarkdown(body).slice(0, 1);
    const actorUserId = String(context.actorUserId || '').trim() || null;
    const reason = String(context.reason || input.reason || 'edit').trim().slice(0, 80) || 'edit';
    const forceVersion = Boolean(context.forceVersion || input.forceVersion);

    if (!forceVersion && title === current.title && markdown === current.originalMarkdown) return current;

    const now = new Date().toISOString();
    const update = this.db.prepare(`UPDATE documents
      SET title = ?, original_markdown = ?, pages = ?, version = version + 1,
          updated_at = ?, last_edited_by = ?, last_edit_reason = ?
      WHERE id = ? AND version = ?`)
      .bind(title, markdown, JSON.stringify(pages), now, actorUserId, reason, documentId, expectedVersion);
    const prune = this.db.prepare(`DELETE FROM document_revisions
      WHERE document_id = ? AND version NOT IN (
        SELECT version FROM document_revisions WHERE document_id = ? ORDER BY version DESC LIMIT ?
      )`).bind(documentId, documentId, HISTORY_LIMIT);
    if (typeof this.db.batch === 'function') await this.db.batch([update, prune]);
    else { await update.run(); await prune.run(); }

    const stored = await this.get(documentId);
    const isOwnCommit = stored?.version === expectedVersion + 1
      && stored.updatedAt === now
      && stored.title === title
      && stored.originalMarkdown === markdown;
    if (!isOwnCommit) throw new DocumentVersionConflictError(stored);
    return stored;
  }

  async history(documentId, limit = HISTORY_LIMIT) {
    const current = await this.get(documentId);
    if (!current) return null;
    const safeLimit = Math.max(1, Math.min(HISTORY_LIMIT, Number(limit) || HISTORY_LIMIT));
    const rows = await this.db.prepare(`SELECT id, version, title, author_id, reason, created_at
      FROM document_revisions WHERE document_id = ? ORDER BY version DESC LIMIT ?`)
      .bind(documentId, safeLimit).all();
    return {
      current: {
        id: 'current', version: current.version, title: current.title, authorId: current.lastEditedBy,
        reason: current.lastEditReason, createdAt: current.updatedAt, isCurrent: true,
      },
      revisions: (rows.results || []).map((row) => ({
        id: row.id, version: Number(row.version), title: row.title, authorId: row.author_id || null,
        reason: row.reason || null, createdAt: row.created_at, isCurrent: false,
      })),
    };
  }

  async restore(documentId, revisionId, expectedVersion, context = {}) {
    const revision = await this.db.prepare(`SELECT id, version, title, original_markdown
      FROM document_revisions WHERE id = ? AND document_id = ? LIMIT 1`)
      .bind(revisionId, documentId).first();
    if (!revision) return null;
    return this.update(documentId, {
      expectedVersion,
      title: revision.title,
      markdown: revision.original_markdown,
      reason: `restore:v${revision.version}`,
      forceVersion: true,
    }, { ...context, reason: `restore:v${revision.version}`, forceVersion: true });
  }
}
