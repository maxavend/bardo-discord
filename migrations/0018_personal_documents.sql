-- Migración 0018: documentos personales. No pertenecen a ningún canal sino a
-- una persona, que los ve desde cualquier servidor donde abra Bardo. Nunca
-- tienen filas en document_guild_access ni document_channel_access; llevarlos a
-- un canal borra esta fila y les da el ACL del canal.
CREATE TABLE IF NOT EXISTS personal_documents (
  document_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  -- Quién más puede abrirlo con el enlace: nadie, solo leer o también editar.
  link_access TEXT NOT NULL DEFAULT 'none' CHECK (link_access IN ('none', 'read', 'edit')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_documents_owner
  ON personal_documents(owner_id);

-- Quien abrió un documento personal ajeno por su enlace, para que lo vuelva a
-- encontrar en «Compartidos contigo» mientras el enlace siga activo.
CREATE TABLE IF NOT EXISTS personal_document_visitors (
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_document_visitors_user
  ON personal_document_visitors(user_id, last_opened_at DESC);
