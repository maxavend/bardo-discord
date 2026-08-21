-- Phase 4: durable document visibility in a verified Discord guild.
-- Grants are created server-side only after Discord OAuth identity + guild membership checks.
CREATE TABLE IF NOT EXISTS document_guild_access (
  document_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_id, guild_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_guild_access_guild ON document_guild_access(guild_id, created_at DESC);
