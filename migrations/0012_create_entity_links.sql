-- Phase 4: generic cross-product entity graph.
CREATE TABLE IF NOT EXISTS entity_links (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, target_type, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(guild_id, source_type, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(guild_id, target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_links_relation ON entity_links(guild_id, relation_type, created_at DESC);
