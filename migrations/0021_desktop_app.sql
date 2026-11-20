-- Migración 0021: Bardo para escritorio (macOS y Windows).
-- La app de escritorio es un cliente OAuth de primera parte del mismo servidor
-- que usa el MCP. La identidad sigue siendo solo Discord.

-- Los clientes de primera parte son de Bardo: ven una confirmación de un clic,
-- pueden pedir el permiso bardo:app y la limpieza diaria nunca los borra.
ALTER TABLE mcp_clients ADD COLUMN first_party INTEGER NOT NULL DEFAULT 0;

-- La app vuelve por loopback (RFC 8252): el puerto cambia en cada inicio de sesión.
INSERT OR IGNORE INTO mcp_clients (client_id, client_name, redirect_uris, created_at, first_party)
VALUES ('bardo_desktop', 'Bardo para escritorio', '["http://127.0.0.1/oauth/callback"]', '2026-11-20T00:00:00.000Z', 1);

-- Tokens de canal que abrió la app: se revocan junto con su autorización.
ALTER TABLE docs_sessions ADD COLUMN app_grant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_docs_sessions_app_grant ON docs_sessions(app_grant_id);
