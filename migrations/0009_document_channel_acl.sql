-- Restrict documents to the Discord channels where they were shared.
CREATE TABLE IF NOT EXISTS document_channel_access (
  document_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (document_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_document_channel_access_guild_channel
  ON document_channel_access(guild_id, channel_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_channel_access_document
  ON document_channel_access(document_id);

ALTER TABLE docs_sessions ADD COLUMN channel_id TEXT;

ALTER TABLE docs_launch_intents ADD COLUMN channel_id TEXT;
