-- Bardo Conversational V1: rate limits, idempotent AI writes and privacy-conscious audit metadata.

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  scope_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_window
  ON ai_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS ai_tool_runs (
  idempotency_key TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  result_json TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_runs_guild_created
  ON ai_tool_runs(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_action_audit (
  id TEXT PRIMARY KEY,
  interaction_id TEXT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  action_class TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '{}',
  result_status TEXT NOT NULL,
  error_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_action_audit_guild_created
  ON ai_action_audit(guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_action_audit_user_created
  ON ai_action_audit(user_id, created_at DESC);
