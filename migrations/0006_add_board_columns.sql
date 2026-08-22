-- Agrega soporte para columnas personalizadas por tablero (máximo 5)
ALTER TABLE boards ADD COLUMN columns TEXT DEFAULT NULL;
