-- Migración 0003: soporte de importación diferida para PDF y DOCX
ALTER TABLE documents ADD COLUMN source_blob BLOB;
ALTER TABLE documents ADD COLUMN source_mime TEXT;
ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'markdown';
ALTER TABLE documents ADD COLUMN import_status TEXT NOT NULL DEFAULT 'ready';
