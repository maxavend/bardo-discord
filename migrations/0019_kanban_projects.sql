-- Migración 0019: proyectos de Tareas. Cada tablero tiene su lista y cada tarea
-- pertenece a lo más a un proyecto. Sin FK en `project_id`: al eliminar un
-- proyecto, la API limpia las tareas y sube su `board_rev` para que el poll lo vea.
CREATE TABLE IF NOT EXISTS kanban_projects (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_projects_name ON kanban_projects(board_id, name COLLATE NOCASE);

ALTER TABLE kanban_cards ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_project ON kanban_cards(board_id, project_id) WHERE project_id IS NOT NULL;
