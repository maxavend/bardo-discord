-- Human-readable authorship metadata for document creation and latest changes.
ALTER TABLE documents ADD COLUMN created_by_name TEXT;
ALTER TABLE documents ADD COLUMN updated_by TEXT;
ALTER TABLE documents ADD COLUMN updated_by_name TEXT;
