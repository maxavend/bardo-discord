-- Migración 0004: metadata editorial para Bardo Docs.
-- Es estrictamente aditiva: no elimina ni reescribe documentos existentes.
ALTER TABLE documents ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN updated_at TEXT;
ALTER TABLE documents ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_updated_at
ON documents(COALESCE(updated_at, created_at));

CREATE INDEX IF NOT EXISTS idx_documents_archived_at
ON documents(archived_at);
