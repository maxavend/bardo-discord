-- Phase 4: optional task due date used by cross-product task creation.
ALTER TABLE tasks ADD COLUMN due_at TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_due ON tasks(assignee_id, due_at, updated_at DESC);
