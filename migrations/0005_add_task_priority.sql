-- Bardo Kanban: agregar columna de prioridad en tareas
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
CREATE INDEX IF NOT EXISTS idx_tasks_board_priority ON tasks(board_id, priority);
