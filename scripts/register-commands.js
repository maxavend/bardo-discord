import { SlashCommandBuilder } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN?.trim();
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID?.trim();

if (!DISCORD_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN o DISCORD_GUILD_ID en el archivo .env.');
  process.exit(1);
}

const docUploadCommand = new SlashCommandBuilder()
  .setName('doc-upload')
  .setDescription('Sube un documento al espacio de Docs de este canal.')
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

const legacyUploadCommand = new SlashCommandBuilder()
  .setName('upload-docs')
  .setDescription('Sube un documento al espacio de Docs de este canal (alias de /doc-upload).')
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

const docNewCommand = new SlashCommandBuilder()
  .setName('doc-new')
  .setDescription('Crea un nuevo documento colaborativo en Bardo para este canal.')
  .addStringOption((option) =>
    option
      .setName('titulo')
      .setDescription('Título opcional para el nuevo documento.'),
  );

const reuNewCommand = new SlashCommandBuilder()
  .setName('reu-new')
  .setDescription('Crea y agenda una nueva reunión con orden del día y tiempos para este canal.')
  .addStringOption((option) =>
    option
      .setName('titulo')
      .setDescription('Título o tema de la reunión.')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('fecha')
      .setDescription('Fecha en formato YYYY-MM-DD (ej: 2026-09-15). Por defecto hoy.'),
  )
  .addStringOption((option) =>
    option
      .setName('hora')
      .setDescription('Hora en formato HH:MM (ej: 15:30). Por defecto 10:00.'),
  )
  .addIntegerOption((option) =>
    option
      .setName('duracion')
      .setDescription('Duración estimada en minutos (ej: 45, 60). Por defecto 60.'),
  )
  .addStringOption((option) =>
    option
      .setName('descripcion')
      .setDescription('Descripción u objetivo general de la reunión.'),
  );

const reusCommand = new SlashCommandBuilder()
  .setName('reus')
  .setDescription('Muestra las reuniones agendadas, en curso y concluidas de este canal.');

const allCommands = [
  reuNewCommand,
  reusCommand,
  docUploadCommand,
  docNewCommand,
  legacyUploadCommand,
];


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

  console.log(`Registrando comandos (/reu-new, /reus, /doc-upload, /doc-new, /upload-docs) en el servidor ${DISCORD_GUILD_ID} (App ID: ${applicationId})...`);

  const regRes = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${DISCORD_GUILD_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(allCommands.map((cmd) => cmd.toJSON())),
    },
  );

  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Error registrando comandos: ${regRes.status} ${err}`);
  }

  const registered = await regRes.json();
  console.log(`✅ Comandos registrados exitosamente (${registered.length} comandos activos en guild): ${registered.map((c) => `/${c.name}`).join(', ')}.`);
}

registerCommands().catch((err) => {
  console.error('❌ Falló el registro de comandos:', err);
  process.exit(1);
});
