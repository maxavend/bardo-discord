import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { BARDO_OPEN_PREFIX, normalizeDocumentId } from './document-id.js';

export { BARDO_OPEN_PREFIX, normalizeDocumentId };

const PREVIEW_LIMIT = 1200;

function isMarkdownTable(block) {
  const lines = block.trim().split('\n');
  if (lines.length < 2 || !lines[0].includes('|') || !lines[1].includes('|')) return false;
  return /^\s*\|?\s*:?-{3,}/.test(lines[1]);
}

function normalizePreviewBlock(block) {
  const trimmed = block.trim();
  if (!trimmed) return '';
  if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return '';
  if (isMarkdownTable(trimmed)) {
    return '*Tabla disponible en el documento completo.*';
  }
  return trimmed;
}

export function createDocumentPreview(markdown, limit = PREVIEW_LIMIT) {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return '*Documento sin contenido de vista previa.*';

  const blocks = normalized
    .split(/\n{2,}/)
    .map(normalizePreviewBlock)
    .filter(Boolean);

  let preview = '';
  let truncated = false;

  for (const block of blocks) {
    const candidate = preview ? `${preview}\n\n${block}` : block;
    if (candidate.length <= limit) {
      preview = candidate;
      continue;
    }

    truncated = true;
    if (!preview) {
      let cut = block.lastIndexOf('\n', limit);
      if (cut < Math.floor(limit * 0.55)) cut = block.lastIndexOf(' ', limit);
      if (cut < Math.floor(limit * 0.55)) cut = limit;
      preview = block.slice(0, cut).trimEnd();
    }
    break;
  }

  if (blocks.join('\n\n').length > preview.length) truncated = true;

  if (truncated) {
    preview = `${preview}\n\n*… Abre el documento completo para seguir leyendo.*`;
  }

  return preview;
}

export function buildDocumentPayload(document, { documentId }) {
  const previewSource = document.pages?.[0] || document.originalMarkdown || '';
  const preview = createDocumentPreview(previewSource);
  const cleanId = normalizeDocumentId(documentId) || documentId;

  // Use a real Discord message component again. The Worker acknowledges this
  // interaction inline with LAUNCH_ACTIVITY (type 12), preserving guild/channel
  // context for the embedded Activity without relying on an external deep-link.
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Abrir documento')
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}${cleanId}`),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📚 ${document.title}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(preview))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*Vista previa · Abre Bardo para ver el documento completo.*'),
    )
    .addActionRowComponents(openRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function buildReuNewPayload({ session, channelName = null }) {
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Abrir reunión')
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}planner-session:${session.id}`),
  );

  const durationText = session.targetDuration ? `${session.targetDuration} min` : '60 min';
  const dateText = session.date || 'Hoy';
  const timeText = session.startTime || 'Por definir';
  const hostText = session.hostName ? ` · Organiza: ${session.hostName}` : '';
  const metaLine = `📅 **${dateText}** a las **${timeText}** (${durationText})${hostText}`;

  const descLine = session.description ? `\n\n${session.description}` : '';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎙️ ${session.title || 'Nueva Reunión'}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${metaLine}${descLine}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*Haz clic abajo para unirte a la agenda colaborativa en Bardo.*'),
    )
    .addActionRowComponents(openRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function buildReusListPayload({ sessions = [], channelName = null }) {
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Abrir Reuniones')
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}planner`),
  );

  const channelHeading = channelName ? ` en #${channelName}` : '';

  if (!sessions.length) {
    const emptyContainer = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 📅 Reuniones${channelHeading}`),
      )
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('No hay reuniones programadas ni registradas en este canal.\nPuedes crear una nueva usando `/reu-new`.'),
      )
      .addActionRowComponents(openRow);

    return {
      flags: MessageFlags.IsComponentsV2,
      allowed_mentions: { parse: [] },
      components: [emptyContainer.toJSON()],
    };
  }

  const live = sessions.filter((s) => s.status === 'live');
  const scheduled = sessions.filter((s) => s.status === 'scheduled' || !s.status);
  const finished = sessions.filter((s) => s.status === 'finished' || s.status === 'recap');

  let listText = '';

  if (live.length > 0) {
    listText += '🔴 **En curso**\n';
    for (const s of live) {
      listText += `• **${s.title}** (${s.startTime || ''}) - *En vivo*\n`;
    }
    listText += '\n';
  }

  if (scheduled.length > 0) {
    listText += '⏳ **Programadas**\n';
    for (const s of scheduled.slice(0, 5)) {
      listText += `• **${s.title}** — ${s.date || ''} ${s.startTime || ''}\n`;
    }
    listText += '\n';
  }

  if (finished.length > 0) {
    listText += '✅ **Pasadas / Concluidas**\n';
    for (const s of finished.slice(0, 3)) {
      listText += `• **${s.title}** — ${s.date || ''}\n`;
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📅 Reuniones${channelHeading}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(listText.trim()),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*Abre Bardo para gestionar temas, actas y tiempos en tiempo real.*'),
    )
    .addActionRowComponents(openRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function buildDocNewPayload({ title = null }) {
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Crear en Bardo')
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}new-doc`),
  );

  const displayTitle = title?.trim() ? `"${title.trim()}"` : 'un nuevo documento';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 📝 Crear nuevo documento'),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Listo para redactar ${displayTitle} en este canal.\nHaz clic en el botón para abrir el editor colaborativo de Bardo.`),
    )
    .addActionRowComponents(openRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function buildErrorPayload(message) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## No se pudo procesar la solicitud\n\n${message}`),
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

