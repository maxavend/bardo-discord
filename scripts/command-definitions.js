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
  .addStringOption(titleOption('Título del documento (opcional).'));

const legacyUploadCommand = new SlashCommandBuilder()
  .setName('upload-docs')
  .setDescription('Sube un archivo a Documentos de este canal. Es el nombre antiguo de /doc-upload.')
  .addAttachmentOption((option) =>
    option
      .setName('archivo')
      .setDescription('Markdown, TXT, PDF o Word (.docx)')
      .setRequired(true),
  )
  .addStringOption(titleOption('Título del documento (opcional).'));

const docNewCommand = new SlashCommandBuilder()
  .setName('doc-new')
  .setDescription('Crea un documento en este canal y muestra un botón para editarlo.')
  .addStringOption(titleOption('Título del documento (opcional).'));

const reuNewCommand = new SlashCommandBuilder()
  .setName('reu-new')
  .setDescription('Agenda una reunión en este canal y prepara sus temas y tiempos en Bardo.')
  .addStringOption(titleOption('Título o tema de la reunión.', true))
  .addStringOption((option) =>
    option
      .setName('fecha')
      .setDescription('Fecha en formato AAAA-MM-DD, por ejemplo 2026-09-15. Si la omites, será hoy.')
      .setMaxLength(10),
  )
  .addStringOption((option) =>
    option
      .setName('hora')
      .setDescription('Hora de inicio en formato HH:MM de 24 horas, por ejemplo 15:30. Si la omites, 10:00.')
      .setMaxLength(5),
  )
  .addIntegerOption((option) =>
    option
      .setName('duracion')
      .setDescription('Duración en minutos, por ejemplo 45. Si la omites, 60.')
      .setMinValue(1)
      .setMaxValue(REU_DURATION_MAX_MINUTES),
  )
  .addStringOption((option) =>
    option
      .setName('descripcion')
      .setDescription('Objetivo o contexto de la reunión.')
      // Keeps the Components V2 card under Discord's 4000-character limit.
      .setMaxLength(REU_DESCRIPTION_MAX),
  );

const reusCommand = new SlashCommandBuilder()
  .setName('reus')
  .setDescription('Muestra las reuniones programadas, en curso y terminadas de este canal.');

const tareaCommand = new SlashCommandBuilder()
  .setName('tarea')
  .setDescription('Crea una tarea en el tablero de este canal y avisa a la persona responsable.')
  .addStringOption(titleOption('Qué hay que hacer.', true))
  .addUserOption((option) =>
    option
      .setName('responsable')
      .setDescription('Quién se hace cargo (recibe una mención y un mensaje directo).'),
  )
  .addStringOption((option) =>
    option
      .setName('fecha')
      .setDescription('Fecha límite: AAAA-MM-DD, «hoy» o «mañana».')
      .setMaxLength(10),
  );

const tareasCommand = new SlashCommandBuilder()
  .setName('tareas')
  .setDescription('Te muestra (solo a ti) las tareas abiertas de este canal.')
  .addBooleanOption((option) =>
    option
      .setName('mias')
      .setDescription('Muestra solo las tareas en las que eres responsable.'),
  );

const bardoCommand = new SlashCommandBuilder()
  .setName('bardo')
  .setDescription('Abre el Inicio de Bardo en este canal.');

const docsCommand = new SlashCommandBuilder()
  .setName('docs')
  .setDescription('Lista los documentos de este canal con botones para abrirlos.');

const helpCommand = new SlashCommandBuilder()
  .setName('ayuda')
  .setDescription('Muestra qué hace cada comando de Bardo.');

export const allCommands = [
  bardoCommand,
  docNewCommand,
  docUploadCommand,
  docsCommand,
  reuNewCommand,
  reusCommand,
  tareaCommand,
  tareasCommand,
  helpCommand,
  legacyUploadCommand,
];
