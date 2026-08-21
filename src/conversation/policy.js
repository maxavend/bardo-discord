export const TOOL_CLASS = Object.freeze({
  get_my_tasks: 'read',
  get_upcoming_events: 'read',
  find_documents: 'read',
  get_project_status: 'read',
  summarize_channel: 'read',
  create_task: 'write',
  update_task: 'write',
  create_event: 'write',
  update_event: 'write',
  create_document: 'write',
  create_minutes_from_channel: 'write',
  create_tasks_from_channel: 'write',
});

const TENTATIVE = /\b(quiz[aá]s|tal vez|a lo mejor|podr[ií]amos|deber[ií]amos|ser[ií]a bueno|maybe|perhaps|might|could)\b/i;

export function isWriteTool(name) {
  return TOOL_CLASS[name] === 'write';
}

export function shouldRequireClarification(text, toolCalls = []) {
  if (!toolCalls.some((call) => isWriteTool(call.name))) return false;
  return TENTATIVE.test(String(text || ''));
}

export function redactAuditArgs(args = {}) {
  const out = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (/content|markdown|messages|transcript|body/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') out[key] = value.slice(0, 160);
    else if (Array.isArray(value)) out[key] = `[array:${value.length}]`;
    else if (value && typeof value === 'object') out[key] = '[object]';
    else out[key] = value;
  }
  return out;
}

export async function consumeRateLimit(db, { guildId, userId, limit = 20, windowMinutes = 10, now = new Date() } = {}) {
  if (!db) return { allowed: true, count: 0, limit };
  const periodMs = Math.max(1, Number(windowMinutes) || 10) * 60_000;
  const windowStartMs = Math.floor(now.getTime() / periodMs) * periodMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const scopeKey = `${String(guildId || 'dm')}:${String(userId || 'unknown')}`;
  try {
    await db.prepare(`INSERT INTO ai_rate_limits (scope_key, window_start, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(scope_key, window_start) DO UPDATE SET request_count = request_count + 1`)
      .bind(scopeKey, windowStart).run();
    const row = await db.prepare('SELECT request_count FROM ai_rate_limits WHERE scope_key = ? AND window_start = ?')
      .bind(scopeKey, windowStart).first();
    const count = Number(row?.request_count || 1);
    return { allowed: count <= limit, count, limit, windowStart };
  } catch (error) {
    console.warn('[Bardo AI] rate-limit storage unavailable:', error);
    return { allowed: true, count: 0, limit, degraded: true };
  }
}

export async function auditToolCall(db, {
  interactionId, guildId, userId, toolName, status, args = {}, error = null,
} = {}) {
  if (!db) return;
  try {
    await db.prepare(`INSERT INTO ai_action_audit
      (id, interaction_id, guild_id, user_id, tool_name, action_class, args_json, result_status, error_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        String(interactionId || ''),
        String(guildId || ''),
        String(userId || ''),
        String(toolName || ''),
        TOOL_CLASS[toolName] || 'unknown',
        JSON.stringify(redactAuditArgs(args)),
        String(status || 'unknown'),
        error ? String(error).slice(0, 500) : null,
        new Date().toISOString(),
      ).run();
  } catch (auditError) {
    console.warn('[Bardo AI] audit log unavailable:', auditError);
  }
}

export async function runIdempotentWrite(db, {
  key, guildId, userId, toolName, run,
} = {}) {
  const idempotencyKey = String(key || '').trim();
  if (!db || !idempotencyKey) return run();

  const now = new Date().toISOString();
  let claimed = false;
  try {
    const claim = await db.prepare(`INSERT INTO ai_tool_runs
      (idempotency_key, guild_id, user_id, tool_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'running', ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(idempotencyKey, String(guildId || ''), String(userId || ''), String(toolName || ''), now, now).run();
    claimed = Number(claim?.meta?.changes || 0) > 0;
    if (!claimed) {
      const existing = await db.prepare('SELECT status, result_json, error_text FROM ai_tool_runs WHERE idempotency_key = ? LIMIT 1')
        .bind(idempotencyKey).first();
      if (existing?.status === 'completed' && existing.result_json) return JSON.parse(existing.result_json);
      if (existing?.status === 'running') {
        const error = new Error('Esta acción ya se está procesando.');
        error.code = 'ACTION_IN_PROGRESS';
        throw error;
      }
      if (existing?.status === 'failed') {
        const error = new Error(existing.error_text || 'La acción anterior falló.');
        error.code = 'ACTION_PREVIOUSLY_FAILED';
        throw error;
      }
    }
  } catch (error) {
    if (error?.code === 'ACTION_IN_PROGRESS' || error?.code === 'ACTION_PREVIOUSLY_FAILED') throw error;
    console.warn('[Bardo AI] idempotency storage unavailable; continuing without persistence:', error);
    return run();
  }

  try {
    const result = await run();
    await db.prepare(`UPDATE ai_tool_runs SET status='completed', result_json=?, updated_at=? WHERE idempotency_key=?`)
      .bind(JSON.stringify(result), new Date().toISOString(), idempotencyKey).run();
    return result;
  } catch (error) {
    if (claimed) {
      await db.prepare(`UPDATE ai_tool_runs SET status='failed', error_text=?, updated_at=? WHERE idempotency_key=?`)
        .bind(String(error?.message || error).slice(0, 500), new Date().toISOString(), idempotencyKey).run()
        .catch(() => null);
    }
    throw error;
  }
}
