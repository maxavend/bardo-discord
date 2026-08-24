-- Repair legacy document_guild_access schemas created before the canonical guild-auth contract.
-- This migration preserves every (document_id, guild_id) relationship and does not touch documents.

ALTER TABLE document_guild_access RENAME TO document_guild_access_legacy_0007;

CREATE TABLE document_guild_access (
  document_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (document_id, guild_id)
);

INSERT OR IGNORE INTO document_guild_access (document_id, guild_id, added_at, added_by)
SELECT document_id, guild_id, CURRENT_TIMESTAMP, NULL
FROM document_guild_access_legacy_0007;

DROP TABLE document_guild_access_legacy_0007;

CREATE INDEX IF NOT EXISTS idx_document_guild_access_guild
  ON document_guild_access(guild_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_guild_access_document
  ON document_guild_access(document_id);
