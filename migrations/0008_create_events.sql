-- Event Planner: agenda, live meeting, notes, decisions, task links and minutes.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  starts_at TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'scheduled',
  channel_id TEXT,
  created_by TEXT NOT NULL,
  minute_document_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_guild_starts ON events(guild_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status_starts ON events(status, starts_at);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'participant',
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_blocks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  position INTEGER NOT NULL DEFAULT 0,
  block_type TEXT NOT NULL DEFAULT 'discussion',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_blocks_order ON event_blocks(event_id, position);

CREATE TABLE IF NOT EXISTS event_block_leads (
  block_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  PRIMARY KEY (block_id, user_id),
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_items (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_items_order ON event_items(block_id, position);

CREATE TABLE IF NOT EXISTS event_item_speakers (
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  PRIMARY KEY (item_id, user_id),
  FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_links (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  block_id TEXT,
  item_id TEXT,
  label TEXT,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_links_event ON event_links(event_id);

CREATE TABLE IF NOT EXISTS event_notes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  block_id TEXT,
  item_id TEXT,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_notes_event ON event_notes(event_id, created_at);

CREATE TABLE IF NOT EXISTS event_decisions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  block_id TEXT,
  item_id TEXT,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_decisions_event ON event_decisions(event_id, created_at);

CREATE TABLE IF NOT EXISTS event_task_links (
  event_id TEXT NOT NULL,
  block_id TEXT,
  item_id TEXT,
  task_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (event_id, task_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (block_id) REFERENCES event_blocks(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_reminders (
  event_id TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (event_id, offset_minutes),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
