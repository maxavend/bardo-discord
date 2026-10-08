-- Migración 0012: estado en vivo completo del Planner.
-- Aditiva: guarda el objeto de estado del cliente tal cual (state_json) además
-- de las columnas heredadas, que se siguen rellenando cuando se pueden derivar.
ALTER TABLE planner_live_sessions ADD COLUMN state_json TEXT;
