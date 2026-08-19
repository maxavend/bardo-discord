-- Migración 0001: Crear tabla de documentos
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_markdown TEXT NOT NULL,
  pages TEXT NOT NULL,
  source_name TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
