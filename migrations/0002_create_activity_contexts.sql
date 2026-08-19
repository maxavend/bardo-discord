-- Migración 0002: Crear tabla de contextos de activity
CREATE TABLE IF NOT EXISTS activity_contexts (
  instance_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
