ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN updated_at TEXT;
ALTER TABLE documents ADD COLUMN last_edited_by TEXT;
ALTER TABLE documents ADD COLUMN last_edit_reason TEXT;

UPDATE documents
SET updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE document_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  original_markdown TEXT NOT NULL,
  pages TEXT NOT NULL,
  author_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(document_id, version)
);

CREATE INDEX idx_document_revisions_document_version
  ON document_revisions(document_id, version DESC);

CREATE TRIGGER bardo_document_revision_before_content_update
BEFORE UPDATE OF title, original_markdown, pages ON documents
WHEN OLD.title IS NOT NEW.title
  OR OLD.original_markdown IS NOT NEW.original_markdown
  OR OLD.pages IS NOT NEW.pages
  OR OLD.version IS NOT NEW.version
BEGIN
  INSERT OR IGNORE INTO document_revisions (
    id, document_id, version, title, original_markdown, pages, author_id, reason, created_at
  ) VALUES (
    lower(hex(randomblob(16))),
    OLD.id,
    OLD.version,
    OLD.title,
    OLD.original_markdown,
    OLD.pages,
    COALESCE(OLD.last_edited_by, OLD.created_by),
    COALESCE(OLD.last_edit_reason, 'snapshot'),
    COALESCE(OLD.updated_at, OLD.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  DELETE FROM document_revisions
  WHERE document_id = OLD.id
    AND version NOT IN (
      SELECT version FROM document_revisions
      WHERE document_id = OLD.id
      ORDER BY version DESC
      LIMIT 30
    );
END;

CREATE TRIGGER bardo_document_auto_version_after_legacy_update
AFTER UPDATE OF title, original_markdown, pages ON documents
WHEN NEW.version = OLD.version
  AND (
    OLD.title IS NOT NEW.title
    OR OLD.original_markdown IS NOT NEW.original_markdown
    OR OLD.pages IS NOT NEW.pages
  )
BEGIN
  UPDATE documents
  SET version = OLD.version + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      last_edit_reason = COALESCE(NEW.last_edit_reason, 'legacy_write')
  WHERE id = OLD.id;
END;
