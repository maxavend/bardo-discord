-- Editor inline de Bardo: identidad de la Activity, timestamps y referencia al mensaje de Discord.
ALTER TABLE activity_contexts ADD COLUMN user_id TEXT;
ALTER TABLE documents ADD COLUMN updated_at TEXT;
ALTER TABLE documents ADD COLUMN discord_channel_id TEXT;
ALTER TABLE documents ADD COLUMN discord_message_id TEXT;
