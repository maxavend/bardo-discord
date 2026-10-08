-- Migración 0001: Crear tabla de documentos
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_markdown TEXT NOT NULL,
  pages TEXT NOT NULL,
  source_name TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  -- Production already has this column (created by the pre-migrations
  -- collaborative schema). It is declared here so a fresh database (wrangler
  -- dev, staging, CI) can apply 0004, which indexes it. Existing databases
  -- never re-run 0001, so this does not alter production.
  updated_at TEXT
);
