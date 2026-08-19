import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import { loadDocument, saveDocument } from './storage.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN?.trim();
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID?.trim();
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const BUTTON_PREFIX = 'bardo:page:';

if (!DISCORD_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN o DISCORD_GUILD_ID en el archivo .env.');
  process.exit(1);
}

const documentCommand = new SlashCommandBuilder()
  .setName('documento')
  .setDescription('Publica un Markdown largo como un único mensaje navegable.')
  .addAttachmentOption((option) =>
    option
      .setName('archivo')
      .setDescription('Archivo .md, .markdown o .txt')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('titulo')
      .setDescription('Título opcional. Si se omite, Bardo usa el H1 del Markdown.'),
  );

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function buildNavigationRow(pageIndex, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}${pageIndex - 1}`)
      .setLabel('← Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}${pageIndex}`)
      .setLabel(`${pageIndex + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}${pageIndex + 1}`)
      .setLabel('Siguiente →')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex >= totalPages - 1),
  );
}

function buildDocumentPayload(document, pageIndex) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), document.pages.length - 1);
  const page = document.pages[safeIndex];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📚 ${document.title}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(page))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Página ${safeIndex + 1} de ${document.pages.length}**`,
      ),
    )
    .addActionRowComponents(buildNavigationRow(safeIndex, document.pages.length));

  return {
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    components: [container],
  };
}

function buildErrorPayload(message) {
  return {
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## No pude publicar el documento\n\n${message}`),
      ),
    ],
  };
}

function isSupportedTextAttachment(attachment) {
  const name = attachment.name?.toLowerCase() ?? '';
  return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt');
}

async function downloadAttachmentText(attachment) {
  if (!isSupportedTextAttachment(attachment)) {
    throw new Error('Usa un archivo `.md`, `.markdown` o `.txt`.');
  }

  if (attachment.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('El archivo supera 2 MB. Para documentación de texto debería ser mucho más pequeño.');
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Discord devolvió HTTP ${response.status} al leer el archivo.`);
  }

  return response.text();
}

async function handleDocumentCommand(interaction) {
  await interaction.deferReply();

  try {
    const attachment = interaction.options.getAttachment('archivo', true);
    const explicitTitle = interaction.options.getString('titulo');
    const markdown = await downloadAttachmentText(attachment);
    const { title, body } = extractDocumentTitle(markdown, explicitTitle);
    const pages = paginateMarkdown(body);

    if (pages.length === 0) {
      throw new Error('El archivo está vacío.');
    }

    const document = {
      title,
      pages,
      sourceName: attachment.name,
      createdAt: new Date().toISOString(),
      createdBy: interaction.user.id,
    };

    await interaction.editReply(buildDocumentPayload(document, 0));
    const message = await interaction.fetchReply();
    await saveDocument(message.id, document);

    console.log(`Documento publicado: ${title} (${pages.length} páginas, mensaje ${message.id})`);
  } catch (error) {
    console.error('Error publicando documento:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    await interaction.editReply(buildErrorPayload(message));
  }
}

async function handlePageButton(interaction) {
  const targetPage = Number.parseInt(interaction.customId.slice(BUTTON_PREFIX.length), 10);

  if (!Number.isInteger(targetPage)) {
    await interaction.reply({
      content: 'Ese botón no contiene una página válida.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const document = await loadDocument(interaction.message.id);
  if (!document) {
    await interaction.reply({
      content: 'No encuentro el documento guardado. Si Bardo cambió de computador, copia también su carpeta `data/`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.update(buildDocumentPayload(document, targetPage));
}

client.once(Events.ClientReady, async (readyClient) => {
  try {
    const guild = await readyClient.guilds.fetch(DISCORD_GUILD_ID);
    await guild.commands.set([documentCommand.toJSON()]);
    console.log(`Bardo está listo como ${readyClient.user.tag}.`);
    console.log(`Comando /documento registrado en ${guild.name}.`);
  } catch (error) {
    console.error('Bardo inició, pero no pudo registrar /documento:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'documento') {
      await handleDocumentCommand(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
      await handlePageButton(interaction);
    }
  } catch (error) {
    console.error('Error procesando interacción:', error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Bardo tuvo un error procesando esa acción.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

await client.login(DISCORD_TOKEN);
