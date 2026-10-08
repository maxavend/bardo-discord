import { SlashCommandBuilder } from 'discord.js';
import { REU_DESCRIPTION_MAX, REU_DURATION_MAX_MINUTES, TITLE_MAX } from '../src/limits.js';

const titleOption = (description, required = false) => (option) =>
  option
    .setName('titulo')
    .setDescription(description)
    .setRequired(required)
    .setMaxLength(TITLE_MAX);

const docUploadCommand = new SlashCommandBuilder()
  .setName('doc-upload')
  .setDescription('Sube un archivo a Documentos de este canal.')
  .addAttachmentOption((option) =>
    option
      .setName('archivo')
      .setDescription('Markdown, TXT, PDF o Word (.docx)')
      .setRequired(true),
  )
  .addStringOption(titleOption('Título opcional para el documento.'));

const legacyUploadCommand = new SlashCommandBuilder()
  .setName('upload-docs')
  .setDescription('Sube un archivo a Documentos de este canal (igual que /doc-upload).')
  .addAttachmentOption((option) =>
    option
      .setName('archivo')
      .setDescription('Markdown, TXT, PDF o Word (.docx)')
      .setRequired(true),
  )
  .addStringOption(titleOption('Título opcional para el documento.'));

const docNewCommand = new SlashCommandBuilder()
  .setName('doc-new')
  .setDescription('Crea un documento nuevo en Documentos de este canal.')
  .addStringOption(titleOption('Título opcional para el nuevo documento.'));

const reuNewCommand = new SlashCommandBuilder()
  .setName('reu-new')
  .setDescription('Crea y agenda una nueva reunión con orden del día y tiempos para este canal.')
  .addStringOption(titleOption('Título o tema de la reunión.', true))
  .addStringOption((option) =>
    option
      .setName('fecha')
      .setDescription('Fecha en formato YYYY-MM-DD (ej: 2026-09-15). Por defecto hoy.')
      .setMaxLength(10),
  )
  .addStringOption((option) =>
    option
      .setName('hora')
      .setDescription('Hora en formato HH:MM (ej: 15:30). Por defecto 10:00.')
      .setMaxLength(5),
  )
  .addIntegerOption((option) =>
    option
      .setName('duracion')
      .setDescription('Duración estimada en minutos (ej: 45, 60). Por defecto 60.')
      .setMinValue(1)
      .setMaxValue(REU_DURATION_MAX_MINUTES),
  )
  .addStringOption((option) =>
    option
      .setName('descripcion')
      .setDescription('Descripción u objetivo general de la reunión.')
      // Keeps the Components V2 card under Discord's 4000-character limit.
      .setMaxLength(REU_DESCRIPTION_MAX),
  );

const reusCommand = new SlashCommandBuilder()
  .setName('reus')
  .setDescription('Muestra las reuniones programadas, en curso y terminadas de este canal.');

const bardoCommand = new SlashCommandBuilder()
  .setName('bardo')
  .setDescription('Abre Bardo en este canal.')
  .addStringOption((option) =>
    option
      .setName('seccion')
      .setDescription('Dónde abrir Bardo. Por defecto, Documentos.')
      .addChoices(
        { name: 'Documentos', value: 'docs' },
        { name: 'Reuniones', value: 'reuniones' },
        { name: 'Nuevo documento', value: 'nuevo' },
      ),
  );

const docsCommand = new SlashCommandBuilder()
  .setName('docs')
  .setDescription('Lista los documentos de este canal con botones para abrirlos.');

const helpCommand = new SlashCommandBuilder()
  .setName('ayuda')
  .setDescription('Muestra todos los comandos de Bardo.');

export const allCommands = [
  bardoCommand,
  docNewCommand,
  docUploadCommand,
  docsCommand,
  reuNewCommand,
  reusCommand,
  helpCommand,
  legacyUploadCommand,
];
