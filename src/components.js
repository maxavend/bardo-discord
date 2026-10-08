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
const REUS_LIST_TEXT_MAX = 3000;
const REU_CARD_TEXT_MAX = 3200;

function truncateText(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

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

/** Escapes Discord markdown in user-provided names. */
export function escapeDiscordMarkdown(text) {
  return String(text ?? '').replace(/([\\*_~`|>#[\]()])/g, '\\$1');
}

export const OPEN_DOCUMENT_LABEL = 'Abrir documento';

/**
 * Card of a document in a channel. `attribution` (e.g. "Compartido por Ana")
 * is shown under the title; the footer names the real button.
 */
export function buildDocumentPayload(document, { documentId, attribution = null }) {
  const previewSource = document.pages?.[0] || document.originalMarkdown || '';
  const preview = createDocumentPreview(previewSource);
  const cleanId = normalizeDocumentId(documentId) || documentId;

  // Use a real Discord message component again. The Worker acknowledges this
  // interaction inline with LAUNCH_ACTIVITY (type 12), preserving guild/channel
  // context for the embedded Activity without relying on an external deep-link.
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(OPEN_DOCUMENT_LABEL)
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}${cleanId}`),
  );

  const heading = `# 📄 ${truncateText(document.title || 'Documento', 200)}`;
  const byline = attribution ? `\n-# ${escapeDiscordMarkdown(truncateText(attribution, 120))}` : '';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${heading}${byline}`),
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
      new TextDisplayBuilder().setContent(`*Vista previa · Pulsa **${OPEN_DOCUMENT_LABEL}** para leerlo completo en Bardo.*`),
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
  const hostText = session.hostName ? ` · Facilita: ${session.hostName}` : '';
  const metaLine = `📅 **${dateText}** a las **${timeText}** (${durationText})${hostText}`;

  const descLine = session.description ? `\n\n${session.description}` : '';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎙️ ${truncateText(session.title || 'Nueva Reunión', 200)}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      // Guarantees Discord's 4000-character Components V2 limit even if a
      // long description reaches here (the meeting is saved before sending).
      new TextDisplayBuilder().setContent(truncateText(`${metaLine}${descLine}`, REU_CARD_TEXT_MAX)),
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
  const finished = sessions.filter((s) => s.status === 'finished' || s.status === 'recap' || s.status === 'completed');

  let listText = '';

  if (live.length > 0) {
    listText += '🔴 **En curso**\n';
    for (const s of live.slice(0, 5)) {
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
    listText += '✅ **Terminadas**\n';
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
      // Components V2 messages allow 4000 characters in total.
      new TextDisplayBuilder().setContent(truncateText(listText.trim(), REUS_LIST_TEXT_MAX)),
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

// Discord caps custom_id at 100 characters.
const CUSTOM_ID_MAX = 100;
const NEW_DOC_TARGET = 'new-doc';

/**
 * Legacy custom_id of "Crear en Bardo" (cards posted before /doc-new created
 * the document on the server). Still routed: opens a blank editor with the
 * title prefilled. Also used by the "Nuevo documento" button of /docs.
 */
export function newDocCustomId(title = null) {
  const base = `${BARDO_OPEN_PREFIX}${NEW_DOC_TARGET}`;
  const clean = title?.trim().replace(/\s+/g, ' ');
  if (!clean) return base;
  return `${base}:${Array.from(clean).slice(0, CUSTOM_ID_MAX - base.length - 1).join('')}`;
}

export const EDIT_DOC_TARGET_PREFIX = 'edit:';

/** custom_id of the /doc-new card: opens the (already created) document in the editor. */
export function editDocCustomId(documentId) {
  return `${BARDO_OPEN_PREFIX}${EDIT_DOC_TARGET_PREFIX}${normalizeDocumentId(documentId) || documentId}`;
}

/**
 * Card posted by /doc-new. The document already exists (empty) in this
 * channel; the button opens it straight in the editor.
 */
export function buildDocNewPayload({ documentId, title = null, createdByName = null }) {
  const openRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(OPEN_DOCUMENT_LABEL)
      .setStyle(ButtonStyle.Primary)
      .setCustomId(editDocCustomId(documentId)),
  );

  const displayTitle = truncateText(title?.trim() || 'Sin título', 200);
  const author = createdByName ? ` por ${escapeDiscordMarkdown(truncateText(createdByName, 80))}` : '';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📝 ${displayTitle}\n-# Documento nuevo creado${author}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`El documento ya está en **Documentos** de este canal.\nPulsa **${OPEN_DOCUMENT_LABEL}** para empezar a escribir.`),
    )
    .addActionRowComponents(openRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

const DOCS_LIST_BUTTONS_MAX = 5;
const DOCS_LIST_TEXT_MAX = 3000;

export function buildDocsListPayload({ documents = [], channelName = null }) {
  const channelHeading = channelName ? ` en #${channelName}` : '';
  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Abrir Bardo')
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`${BARDO_OPEN_PREFIX}docs`),
    new ButtonBuilder()
      .setLabel('Nuevo documento')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId(newDocCustomId()),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📚 Documentos${channelHeading}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (!documents.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Todavía no hay documentos en este canal.\nCrea uno con `/doc-new` o sube un archivo con `/doc-upload`.'),
    );
  } else {
    const lines = documents.map((doc, index) => {
      const title = truncateText(doc.title || 'Sin título', 120);
      return index < DOCS_LIST_BUTTONS_MAX ? `**${index + 1}.** ${title}` : `• ${title}`;
    });
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(truncateText(lines.join('\n'), DOCS_LIST_TEXT_MAX)),
    );
    const openButtons = documents.slice(0, DOCS_LIST_BUTTONS_MAX).map((doc, index) =>
      new ButtonBuilder()
        .setLabel(`${index + 1}. ${truncateText(doc.title || 'Sin título', 60)}`)
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`${BARDO_OPEN_PREFIX}${normalizeDocumentId(doc.id) || doc.id}`),
    );
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(new ActionRowBuilder().addComponents(...openButtons));
  }

  container.addActionRowComponents(actionsRow);

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export const HELP_TEXT = [
  '**Abrir**',
  '`/bardo` — abre Bardo en este canal (elige sección: documentos, reuniones o nuevo documento).',
  '',
  '**Documentos**',
  '`/doc-new` — crea un documento nuevo (título opcional).',
  '`/doc-upload` — sube un Markdown, TXT, PDF o Word.',
  '`/docs` — lista los documentos del canal con botones para abrirlos.',
  '',
  '**Reuniones**',
  '`/reu-new` — agenda una reunión (título, fecha AAAA-MM-DD, hora HH:MM, duración, descripción).',
  '`/reus` — muestra las reuniones programadas, en curso y terminadas.',
].join('\n');

export function buildHelpPayload() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🧭 Comandos de Bardo'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(HELP_TEXT))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Abrir Bardo')
          .setStyle(ButtonStyle.Primary)
          .setCustomId(`${BARDO_OPEN_PREFIX}docs`),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function buildErrorPayload(message) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## No se pudo procesar la solicitud\n\n${truncateText(message, 3000)}`),
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

