-- Migración 0017: el tema (claro, oscuro o sistema) es de cada persona y la
-- acompaña en todos sus dispositivos. NULL = nunca lo eligió (oscuro).
ALTER TABLE user_settings ADD COLUMN theme TEXT CHECK (theme IN ('dark', 'light', 'system'));
