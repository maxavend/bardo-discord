import { SlashCommandBuilder } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN?.trim();
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID?.trim();

if (!DISCORD_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN o DISCORD_GUILD_ID en el archivo .env.');
  process.exit(1);
}

const documentCommand = new SlashCommandBuilder()
  .setName('doc')
  .setDescription('Publica y abre documentos en el lector de Bardo.')
  .addAttachmentOption((option) =>
    option
      .setName('archivo')
      .setDescription('Markdown, TXT, PDF o Word (.docx)')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('titulo')
      .setDescription('Título opcional para el documento.'),
  );

async function registerCommands() {
  console.log('Obteniendo información de la aplicación de Discord...');
  const appRes = await fetch('https://discord.com/api/v10/applications/@me', {
    headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
  });

  if (!appRes.ok) {
    const err = await appRes.text();
    throw new Error(`Error obteniendo aplicación de Discord: ${appRes.status} ${err}`);
  }

  const app = await appRes.json();
  const applicationId = app.id;

  console.log(`Registrando comando /doc en el servidor ${DISCORD_GUILD_ID} (App ID: ${applicationId})...`);

  const regRes = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${DISCORD_GUILD_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([documentCommand.toJSON()]),
    },
  );

  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Error registrando comandos: ${regRes.status} ${err}`);
  }

  const registered = await regRes.json();
  console.log(`✅ Comando /doc registrado exitosamente (${registered.length} comandos activos en guild).`);
}

registerCommands().catch((err) => {
  console.error('❌ Falló el registro de comandos:', err);
  process.exit(1);
});
