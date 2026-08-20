-- Agrega soporte para miembros preconfigurados en el tablero
ALTER TABLE boards ADD COLUMN members TEXT DEFAULT '[]';
