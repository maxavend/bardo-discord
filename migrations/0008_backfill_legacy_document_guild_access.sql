-- Migration 0008: Backfill legacy document guild access for single-guild deployment
-- All pre-existing documents created before guild access tracking belong to the primary guild.

INSERT OR IGNORE INTO document_guild_access (document_id, guild_id, added_at, added_by)
SELECT d.id, '1458156309420572865', COALESCE(d.created_at, CURRENT_TIMESTAMP), d.created_by
FROM documents d
WHERE d.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id
  );
