// Resumen de contenido: exclusivamente lecturas y únicamente para los canales
// cuyo acceso acaba de comprobarse. Nunca carga cuerpos ni crea tableros vacíos.
const CHANNEL_BATCH_SIZE = 80; // 81 parámetros: por debajo del límite de D1.

function summaryQuery(channelCount) {
  return `WITH allowed AS (
    SELECT ? AS guild_id, column1 AS channel_id
    FROM (VALUES ${Array.from({length: channelCount}, () => '(?)').join(', ')})
  )
  SELECT a.channel_id, 'documents' AS kind, COUNT(*) AS count,
         MAX(MAX(COALESCE(NULLIF(d.updated_at, ''), d.created_at), acl.added_at)) AS updated_at
    FROM allowed a
    JOIN document_channel_access acl ON acl.guild_id = a.guild_id AND acl.channel_id = a.channel_id
    JOIN documents d ON d.id = acl.document_id
   WHERE d.archived_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM personal_documents p WHERE p.document_id = d.id)
   GROUP BY a.channel_id
  UNION ALL
  SELECT a.channel_id, 'meetings' AS kind, COUNT(*) AS count,
         MAX(MAX(COALESCE(NULLIF(s.updated_at, ''), s.created_at), COALESCE(l.updated_at, s.created_at))) AS updated_at
    FROM allowed a
    JOIN planner_sessions s ON s.guild_id = a.guild_id AND s.channel_id = a.channel_id
    LEFT JOIN planner_live_sessions l ON l.session_id = s.id AND l.guild_id = a.guild_id AND l.channel_id = a.channel_id
   WHERE s.status IS NULL OR s.status != 'archived'
   GROUP BY a.channel_id
  UNION ALL
  SELECT a.channel_id, 'tasks' AS kind, COUNT(*) AS count,
         MAX(COALESCE(NULLIF(c.updated_at, ''), c.created_at)) AS updated_at
    FROM allowed a
    JOIN kanban_boards b ON b.guild_id = a.guild_id AND b.channel_id = a.channel_id
    JOIN kanban_cards c ON c.board_id = b.id
   WHERE c.archived_at IS NULL
   GROUP BY a.channel_id`;
}

/** channelIds must come from the server-side Discord permission check. */
export async function summarizeChannelContent(db, guildId, channelIds) {
  const channels = new Map([...new Set(channelIds)].map(id => [id, {
    id, documents: 0, meetings: 0, tasks: 0, updatedAt: null,
  }]));
  const ids = [...channels.keys()];
  for (let start = 0; start < ids.length; start += CHANNEL_BATCH_SIZE) {
    const batch = ids.slice(start, start + CHANNEL_BATCH_SIZE);
    const result = await db.prepare(summaryQuery(batch.length)).bind(guildId, ...batch).all();
    // Una lectura incompleta no debe convertirse en «Aún sin contenido».
    if (result?.success === false || !Array.isArray(result?.results)) throw new Error('Content summary unavailable');
    for (const row of result.results) {
      const channel = channels.get(row.channel_id);
      if (!channel || !['documents', 'meetings', 'tasks'].includes(row.kind)) continue;
      channel[row.kind] = Number(row.count);
      const updatedAt = Date.parse(row.updated_at);
      if (Number.isFinite(updatedAt) && (channel.updatedAt === null || updatedAt > channel.updatedAt)) channel.updatedAt = updatedAt;
    }
  }
  return [...channels.values()];
}
