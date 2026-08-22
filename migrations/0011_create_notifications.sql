-- Phase 2: notification preferences and idempotent delivery ledger.
CREATE TABLE IF NOT EXISTS notification_preferences (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  dm_enabled INTEGER NOT NULL DEFAULT 1 CHECK (dm_enabled IN (0, 1)),
  reminder_offset_minutes INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, event_type)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  scheduled_for TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON notification_deliveries(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_entity
  ON notification_deliveries(entity_type, entity_id);
