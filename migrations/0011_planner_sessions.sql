-- Migración 0011: Sesiones de Bardo Planner y estado de reunión en vivo
CREATE TABLE IF NOT EXISTS planner_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  host_id TEXT,
  host_name TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  target_duration INTEGER NOT NULL,
  description TEXT,
  mentions TEXT,
  blocks_json TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_sessions_guild_channel
  ON planner_sessions(guild_id, channel_id, date DESC);

CREATE TABLE IF NOT EXISTS planner_live_sessions (
  session_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,
  active_block_id TEXT,
  active_point_id TEXT,
  block_started_at INTEGER,
  block_elapsed_before_pause_ms INTEGER,
  session_started_at INTEGER,
  session_paused_at INTEGER,
  total_paused_ms INTEGER,
  decisions_json TEXT,
  recordings_meta_json TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES planner_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_planner_live_sessions_guild_channel
  ON planner_live_sessions(guild_id, channel_id);
