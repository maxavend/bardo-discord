-- Migración 0016: MD de acuerdos de reunión. Cada acuerdo llega a lo más una
-- vez a cada persona, y quién los envía queda registrado para limitar abusos.
CREATE TABLE IF NOT EXISTS planner_agreement_dms (
  session_id TEXT NOT NULL REFERENCES planner_sessions(id) ON DELETE CASCADE,
  agreement_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, agreement_id, assignee_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_agreement_dms_actor
  ON planner_agreement_dms (actor_id, created_at);
