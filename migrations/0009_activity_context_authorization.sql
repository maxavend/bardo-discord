-- Phase 1: enrich Activity contexts for centralized authorization.
-- Forward-only: historical migration 0002 remains unchanged.
ALTER TABLE activity_contexts ADD COLUMN guild_id TEXT;
ALTER TABLE activity_contexts ADD COLUMN expires_at TEXT;
ALTER TABLE activity_contexts ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_activity_contexts_expires_at
  ON activity_contexts(expires_at);
