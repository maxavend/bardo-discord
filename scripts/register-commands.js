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
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('titulo')
      .setDescription('Título del documento o nombre de un nuevo documento.'),
  );

const boardCommand = new SlashCommandBuilder()
  .setName('tablero')
  .setDescription('Crea y abre tableros Kanban de Bardo.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('crear')
      .setDescription('Crea un tablero nuevo.')
      .addStringOption((option) =>
        option.setName('nombre').setDescription('Nombre del tablero.').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('descripcion').setDescription('Descripción opcional del tablero.'),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('abrir')
      .setDescription('Abre un tablero existente.')
      .addStringOption((option) =>
        option.setName('tablero').setDescription('Nombre del tablero.').setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('listar').setDescription('Lista los tableros del servidor.'),
  );

const taskCommand = new SlashCommandBuilder()
  .setName('tarea')
  .setDescription('Crea una tarea en un tablero de Bardo.')
  .addStringOption((option) =>
    option.setName('tablero').setDescription('Nombre del tablero.').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('titulo').setDescription('Título de la tarea.').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('descripcion').setDescription('Descripción opcional de la tarea.'),
  )
  .addUserOption((option) =>
    option.setName('responsable').setDescription('Persona responsable dentro del servidor.'),
  )
  .addStringOption((option) =>
    option.setName('chips').setDescription('Etiquetas separadas por coma, por ejemplo: UX, urgente.'),
  )
  .addStringOption((option) =>
    option
      .setName('estado')
      .setDescription('Columna inicial del Kanban.')
      .addChoices(
        { name: 'Backlog', value: 'backlog' },
        { name: 'Por hacer', value: 'todo' },
        { name: 'En curso', value: 'doing' },
        { name: 'Hecho', value: 'done' },
      ),
  )
  .addStringOption((option) =>
    option
      .setName('prioridad')
      .setDescription('Nivel de prioridad de la tarea.')
      .addChoices(
        { name: 'Baja', value: 'low' },
        { name: 'Media', value: 'medium' },
        { name: 'Alta', value: 'high' },
        { name: 'Urgente', value: 'urgent' },
      ),
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
  const commands = [documentCommand, boardCommand, taskCommand].map((command) => command.toJSON());

  console.log(`Registrando /doc, /tablero y /tarea en ${DISCORD_GUILD_ID} (App ID: ${applicationId})...`);

  const regRes = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${DISCORD_GUILD_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    },
  );

  if (!regRes.ok) {
    const err = await regRes.text();
    throw new Error(`Error registrando comandos: ${regRes.status} ${err}`);
  }

  const registered = await regRes.json();
  console.log(`✅ ${registered.length} comandos de Bardo registrados exitosamente.`);
}

registerCommands().catch((err) => {
  console.error('❌ Falló el registro de comandos:', err);
  process.exit(1);
});
