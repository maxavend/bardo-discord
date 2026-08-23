-- Bardo Docs guild sharing + authenticated Activity sessions.
-- Additive only: existing document rows and message-linked ids remain untouched.

CREATE TABLE IF NOT EXISTS document_guild_access (
  document_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (document_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_document_guild_access_guild
  ON document_guild_access(guild_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_guild_access_document
  ON document_guild_access(document_id);

CREATE TABLE IF NOT EXISTS docs_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_sessions_expiry
  ON docs_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_docs_sessions_guild_user
  ON docs_sessions(guild_id, user_id);
