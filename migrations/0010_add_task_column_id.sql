-- Phase 1: custom Kanban columns without rebuilding the tasks table.
-- `status` remains the legacy compatibility value constrained by migration 0004.
-- `column_id` is the authoritative board-column identifier from this migration onward.
ALTER TABLE tasks ADD COLUMN column_id TEXT;

UPDATE tasks
SET column_id = status
WHERE column_id IS NULL OR column_id = '';

CREATE INDEX IF NOT EXISTS idx_tasks_board_column
  ON tasks(board_id, column_id, position, created_at);
