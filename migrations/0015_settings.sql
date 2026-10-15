-- Migración 0015: ajustes en tres niveles. Un valor NULL hereda del nivel de
-- arriba: canal → servidor → valor por defecto de Bardo.
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  time_zone TEXT,
  time_zone_detected INTEGER NOT NULL DEFAULT 0 CHECK (time_zone_detected IN (0, 1)),
  task_channel_notices INTEGER CHECK (task_channel_notices IN (0, 1)),
  task_dm_notices INTEGER CHECK (task_dm_notices IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_settings (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  time_zone TEXT,
  task_channel_notices INTEGER CHECK (task_channel_notices IN (0, 1)),
  task_dm_notices INTEGER CHECK (task_dm_notices IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

-- Preferencias de cada persona que dependen del servidor (los MD los envía el Worker).
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  task_dm_notices INTEGER CHECK (task_dm_notices IN (0, 1)),
  updated_at TEXT NOT NULL
);
