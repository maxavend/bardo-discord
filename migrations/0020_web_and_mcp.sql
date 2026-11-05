-- Migración 0020: Bardo en el navegador y servidor MCP.
-- No hay cuentas propias: la identidad siempre es el usuario de Discord. Solo
-- se guardan hashes de tokens, nunca el token ni el acceso de Discord.

-- Sesión del navegador (cookie HttpOnly). No da acceso a datos por sí sola:
-- de ella salen los tokens de cada canal, que son filas de docs_sessions.
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_expiry ON web_sessions(expires_at);

-- Al cerrar sesión en la web se revocan también sus tokens de canal.
ALTER TABLE docs_sessions ADD COLUMN web_session_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_docs_sessions_web ON docs_sessions(web_session_hash);

-- Inicio de sesión con Discord en curso (un solo uso, diez minutos).
CREATE TABLE IF NOT EXISTS web_oauth_states (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Clientes MCP registrados (Claude Code, Codex, etc.). Son públicos: sin secreto.
CREATE TABLE IF NOT EXISTS mcp_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Pantalla de autorización abierta: la solicitud ya validada queda aquí y el
-- formulario solo lleva su id, así que no se puede alterar desde el navegador.
CREATE TABLE IF NOT EXISTS mcp_consents (
  id_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES mcp_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Permiso que una persona le dio a un cliente. Se puede revocar y caduca.
CREATE TABLE IF NOT EXISTS mcp_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES mcp_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_grants(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  code_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens(grant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expiry ON mcp_tokens(expires_at);

-- Qué hizo cada agente y en nombre de quién (solo cambios, 90 días).
CREATE TABLE IF NOT EXISTS mcp_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id TEXT NOT NULL,
  client_name TEXT,
  user_id TEXT NOT NULL,
  guild_id TEXT,
  channel_id TEXT,
  tool TEXT NOT NULL,
  target TEXT,
  ok INTEGER NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_user ON mcp_audit(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON mcp_audit(created_at);
