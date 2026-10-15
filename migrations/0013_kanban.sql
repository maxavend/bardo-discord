-- Migración 0013: Tareas (Kanban). Un tablero por canal, una fila por tarjeta.
-- `rev` del tablero es el cursor de sincronización: cada escritura lo sube y
-- marca las filas tocadas con `board_rev`, así un poll sin cambios lee una fila.
CREATE TABLE IF NOT EXISTS kanban_boards (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  next_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS kanban_columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  position INTEGER NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_columns_one_done ON kanban_columns(board_id) WHERE is_done = 1;

CREATE TABLE IF NOT EXISTS kanban_tags (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_tags_name ON kanban_tags(board_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES kanban_columns(id),
  number INTEGER NOT NULL,
  rank TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT,
  assignee_name TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date TEXT,
  tag_ids_json TEXT NOT NULL DEFAULT '[]',
  subtasks_json TEXT NOT NULL DEFAULT '[]',
  doc_ids_json TEXT NOT NULL DEFAULT '[]',
  source_ref TEXT,
  message_id TEXT,
  thread_id TEXT,
  thread_claimed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  board_rev INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_cards_number ON kanban_cards(board_id, number);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_order ON kanban_cards(board_id, column_id, rank) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_rev ON kanban_cards(board_id, board_rev);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_cards_source ON kanban_cards(board_id, source_ref) WHERE source_ref IS NOT NULL;

-- Outbox de avisos: a lo más un aviso por persona, por tarjeta y por tipo.
CREATE TABLE IF NOT EXISTS kanban_notifications (
  card_id TEXT NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  assignee_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'dm')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_code TEXT,
  message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (card_id, assignee_id, kind)
);
