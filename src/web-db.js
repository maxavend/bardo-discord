// Datos de la web y del servidor MCP (migración 0020). Solo hashes de tokens.

export async function saveWebSession(db, tokenHash, session) {
  await db
    .prepare(
      `INSERT INTO web_sessions (token_hash, user_id, username, avatar, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(tokenHash, session.userId, session.username || null, session.avatar || null, session.createdAt, session.expiresAt)
    .run();
}

export async function loadWebSession(db, tokenHash) {
  const row = await db
    .prepare('SELECT token_hash, user_id, username, avatar, created_at, expires_at FROM web_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    username: row.username || null,
    avatar: row.avatar || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** Cierra la sesión del navegador y revoca los tokens de canal que salieron de ella. */
export async function deleteWebSession(db, tokenHash) {
  await db.batch([
    db.prepare('DELETE FROM docs_sessions WHERE web_session_hash = ?').bind(tokenHash),
    db.prepare('DELETE FROM mcp_consents WHERE session_hash = ?').bind(tokenHash),
    db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').bind(tokenHash),
  ]);
}

export async function saveOauthState(db, stateHash, record) {
  await db
    .prepare('INSERT INTO web_oauth_states (state_hash, binding_hash, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(stateHash, record.bindingHash, record.codeVerifier, record.returnTo, record.expiresAt)
    .run();
}

/** Un solo uso: quien la consume la borra, incluso si después falla la validación. */
export async function consumeOauthState(db, stateHash) {
  const row = await db
    .prepare('DELETE FROM web_oauth_states WHERE state_hash = ? RETURNING binding_hash, code_verifier, return_to, expires_at')
    .bind(stateHash)
    .first();
  if (!row) return null;
  return {
    bindingHash: row.binding_hash,
    codeVerifier: row.code_verifier,
    returnTo: row.return_to,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// MCP

function parseClient(row) {
  if (!row) return null;
  let redirectUris = [];
  try {
    redirectUris = JSON.parse(row.redirect_uris);
  } catch {
    redirectUris = [];
  }
  return {clientId: row.client_id, clientName: row.client_name, redirectUris, createdAt: row.created_at};
}

export async function saveMcpClient(db, client) {
  await db
    .prepare('INSERT INTO mcp_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)')
    .bind(client.clientId, client.clientName, JSON.stringify(client.redirectUris), client.createdAt)
    .run();
}

export async function loadMcpClient(db, clientId) {
  return parseClient(await db
    .prepare('SELECT client_id, client_name, redirect_uris, created_at FROM mcp_clients WHERE client_id = ?')
    .bind(clientId)
    .first());
}

export async function saveMcpConsent(db, idHash, consent) {
  await db
    .prepare(
      `INSERT INTO mcp_consents (id_hash, session_hash, client_id, redirect_uri, state, code_challenge, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(idHash, consent.sessionHash, consent.clientId, consent.redirectUri, consent.state ?? null, consent.codeChallenge, consent.scope, consent.expiresAt)
    .run();
}

export async function consumeMcpConsent(db, idHash) {
  const row = await db
    .prepare(
      `DELETE FROM mcp_consents WHERE id_hash = ?
       RETURNING session_hash, client_id, redirect_uri, state, code_challenge, scope, expires_at`,
    )
    .bind(idHash)
    .first();
  if (!row) return null;
  return {
    sessionHash: row.session_hash,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    state: row.state,
    codeChallenge: row.code_challenge,
    scope: row.scope,
    expiresAt: row.expires_at,
  };
}

export async function saveMcpGrantWithCode(db, grant, code) {
  await db.batch([
    db.prepare(
      `INSERT INTO mcp_grants (id, client_id, user_id, username, avatar, scope, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(grant.id, grant.clientId, grant.userId, grant.username || null, grant.avatar || null, grant.scope, grant.createdAt, grant.expiresAt),
    db.prepare(
      `INSERT INTO mcp_auth_codes (code_hash, grant_id, client_id, redirect_uri, code_challenge, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(code.codeHash, grant.id, grant.clientId, code.redirectUri, code.codeChallenge, code.expiresAt),
  ]);
}

/** Marca el código como usado y lo devuelve; `alreadyUsed` delata una repetición. */
export async function consumeMcpAuthCode(db, codeHash, now) {
  const claimed = await db
    .prepare(
      `UPDATE mcp_auth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL
       RETURNING grant_id, client_id, redirect_uri, code_challenge, expires_at`,
    )
    .bind(now, codeHash)
    .first();
  if (claimed) {
    return {
      grantId: claimed.grant_id,
      clientId: claimed.client_id,
      redirectUri: claimed.redirect_uri,
      codeChallenge: claimed.code_challenge,
      expiresAt: claimed.expires_at,
    };
  }
  const used = await db.prepare('SELECT grant_id FROM mcp_auth_codes WHERE code_hash = ?').bind(codeHash).first();
  return used ? {alreadyUsed: true, grantId: used.grant_id} : null;
}

function parseGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name ?? null,
    userId: row.user_id,
    username: row.username || null,
    avatar: row.avatar || null,
    scope: row.scope,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || null,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null,
  };
}

export async function loadMcpGrant(db, grantId) {
  return parseGrant(await db
    .prepare(`SELECT g.id, g.client_id, c.client_name, g.user_id, g.username, g.avatar, g.scope, g.created_at, g.last_used_at, g.expires_at, g.revoked_at
       FROM mcp_grants g JOIN mcp_clients c ON c.client_id = g.client_id WHERE g.id = ?`)
    .bind(grantId)
    .first());
}

export async function saveMcpTokens(db, grantId, tokens, createdAt) {
  await db.batch(tokens.map(token => db
    .prepare('INSERT INTO mcp_tokens (token_hash, grant_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token.tokenHash, grantId, token.kind, createdAt, token.expiresAt)));
}

/** Token de acceso vigente con su permiso, o null. */
export async function loadMcpAccess(db, tokenHash, now) {
  const row = await db
    .prepare(
      `SELECT g.id, g.client_id, c.client_name, g.user_id, g.username, g.avatar, g.scope, g.created_at, g.last_used_at, g.expires_at, g.revoked_at, t.expires_at AS token_expires_at
       FROM mcp_tokens t
       JOIN mcp_grants g ON g.id = t.grant_id
       JOIN mcp_clients c ON c.client_id = g.client_id
       WHERE t.token_hash = ? AND t.kind = 'access'`,
    )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  const grant = parseGrant(row);
  if (grant.revokedAt || row.token_expires_at <= now || grant.expiresAt <= now) return null;
  return grant;
}

/** Marca el refresh como usado; `alreadyUsed` delata un token robado o repetido. */
export async function consumeMcpRefreshToken(db, tokenHash, now) {
  const claimed = await db
    .prepare(
      `UPDATE mcp_tokens SET used_at = ?
       WHERE token_hash = ? AND kind = 'refresh' AND used_at IS NULL AND expires_at > ?
       RETURNING grant_id`,
    )
    .bind(now, tokenHash, now)
    .first();
  if (claimed) return {grantId: claimed.grant_id};
  const previous = await db
    .prepare("SELECT grant_id, used_at FROM mcp_tokens WHERE token_hash = ? AND kind = 'refresh'")
    .bind(tokenHash)
    .first();
  return previous?.used_at ? {alreadyUsed: true, usedAt: previous.used_at, grantId: previous.grant_id} : null;
}

export async function revokeMcpGrant(db, grantId, now) {
  await db.batch([
    db.prepare('UPDATE mcp_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').bind(now, grantId),
    db.prepare('DELETE FROM mcp_tokens WHERE grant_id = ?').bind(grantId),
    db.prepare('DELETE FROM mcp_auth_codes WHERE grant_id = ?').bind(grantId),
  ]);
}

export async function touchMcpGrant(db, grantId, now) {
  await db.prepare('UPDATE mcp_grants SET last_used_at = ? WHERE id = ?').bind(now, grantId).run();
}

export async function listMcpGrantsForUser(db, userId, now) {
  const {results} = await db
    .prepare(
      `SELECT g.id, g.client_id, c.client_name, g.user_id, g.username, g.avatar, g.scope, g.created_at, g.last_used_at, g.expires_at, g.revoked_at
       FROM mcp_grants g JOIN mcp_clients c ON c.client_id = g.client_id
       WHERE g.user_id = ? AND g.revoked_at IS NULL AND g.expires_at > ?
       ORDER BY COALESCE(g.last_used_at, g.created_at) DESC LIMIT 50`,
    )
    .bind(userId, now)
    .all();
  return results.map(parseGrant);
}

export async function revokeMcpGrantForUser(db, grantId, userId, now) {
  const grant = await loadMcpGrant(db, grantId);
  if (!grant || grant.userId !== String(userId) || grant.revokedAt) return false;
  await revokeMcpGrant(db, grantId, now);
  return true;
}

export async function recordMcpAudit(db, entry) {
  await db
    .prepare(
      `INSERT INTO mcp_audit (grant_id, client_name, user_id, guild_id, channel_id, tool, target, ok, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.grantId,
      entry.clientName || null,
      entry.userId,
      entry.guildId || null,
      entry.channelId || null,
      entry.tool,
      entry.target || null,
      entry.ok ? 1 : 0,
      entry.errorCode || null,
      entry.createdAt,
    )
    .run();
}

/** Limpieza diaria: solo registros caducados por definición. */
export async function cleanupWebAndMcp(db, now = new Date()) {
  const nowIso = now.toISOString();
  const auditCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const grantCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM web_sessions WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM web_oauth_states WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM mcp_consents WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM mcp_auth_codes WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM mcp_tokens WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM mcp_audit WHERE created_at < ?').bind(auditCutoff),
    // Permisos terminados hace tiempo y clientes registrados que nadie autorizó.
    db.prepare('DELETE FROM mcp_grants WHERE COALESCE(revoked_at, expires_at) < ?').bind(grantCutoff),
    db.prepare(
      'DELETE FROM mcp_clients WHERE created_at < ? AND client_id NOT IN (SELECT client_id FROM mcp_grants)',
    ).bind(grantCutoff),
  ]);
}
