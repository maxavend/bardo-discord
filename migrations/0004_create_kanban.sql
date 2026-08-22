-- Bardo Kanban MVP: tableros y tareas por servidor
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (guild_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'doing', 'done')),
  assignee_id TEXT,
  assignee_name TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_guild ON boards(guild_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_board_status ON tasks(board_id, status, position, created_at);
