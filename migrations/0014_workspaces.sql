-- Migración 0014: nombre del espacio de trabajo de cada canal. Sin fila, la
-- Activity muestra el nombre del canal de Discord.
CREATE TABLE IF NOT EXISTS workspaces (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);
