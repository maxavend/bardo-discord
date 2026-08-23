-- Signed Discord component clicks are the durable deep-link source for Activities.
CREATE TABLE IF NOT EXISTS docs_launch_intents (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_docs_launch_intents_created
  ON docs_launch_intents(created_at);
