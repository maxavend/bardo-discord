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
  '`/bardo` — abre siempre Inicio de Bardo en este canal.',
  '',
  '**Documentos**',
  '`/doc-new` — crea un documento y muestra un botón para editarlo (título opcional).',
  '`/doc-upload` — sube un Markdown, TXT, PDF o Word.',
  '`/docs` — lista los documentos del canal con botones para abrirlos.',
  '',
  '**Reuniones**',
  '`/reu-new` — agenda una reunión (título, fecha AAAA-MM-DD, hora HH:MM, duración, descripción).',
  '`/reus` — muestra las reuniones programadas, en curso y terminadas.',
  '',
  '**Tareas**',
  '`/tarea` — crea una tarea en el tablero del canal (título, responsable y fecha opcionales) y avisa a quien la recibe.',
  '`/tareas` — te muestra (solo a ti) las tareas abiertas del canal; con `mias:true`, solo las tuyas.',
  '',
  '**Ayuda**',
  '`/ayuda` — muestra esta guía.',
  '`/upload-docs` — alias de /doc-upload; hace lo mismo.',
  '',
  '**Recuperar contenido anterior**',
  'Si te falta contenido de una versión anterior, pide ayuda al administrador de Bardo. Usa el mismo dispositivo y no borres los datos de Discord o del navegador: podrían conservar una copia. Las copias antiguas no se incorporan automáticamente porque no podemos verificar a qué cuenta pertenecen.',
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
          .setCustomId(`${BARDO_OPEN_PREFIX}home`),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

// ---------------------------------------------------------------------------
// Tareas (Kanban)

const KANBAN_PRIORITY_TEXT = { high: 'Prioridad alta', urgent: '🔺 Urgente' };
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const KANBAN_LIST_CARDS_MAX = 10;
const KANBAN_LIST_BUTTONS_MAX = 5;

export function kanbanCardCustomId(cardId) {
  return `${BARDO_OPEN_PREFIX}kanban-card:${cardId}`;
}

export function formatKanbanDueDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) return null;
  return `${Number(match[3])} ${MONTHS_ES[Number(match[2]) - 1]}`;
}

function kanbanCardTitle(card) {
  return `#${card.number} · ${escapeDiscordMarkdown(truncateText(card.title || 'Sin título', 180))}`;
}

function kanbanMetaLine(card, { columnName = null } = {}) {
  const parts = [];
  if (card.assignee?.id) parts.push(`Responsable: <@${card.assignee.id}>`);
  const due = formatKanbanDueDate(card.dueDate);
  if (due) parts.push(`Vence: **${due}**`);
  if (KANBAN_PRIORITY_TEXT[card.priority]) parts.push(KANBAN_PRIORITY_TEXT[card.priority]);
  if (columnName) parts.push(`En **${escapeDiscordMarkdown(columnName)}**`);
  return parts.join(' · ');
}

function openKanbanCardRow(cardId, label = 'Abrir tarjeta') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Primary).setCustomId(kanbanCardCustomId(cardId)),
  );
}

/** Aviso público de una tarea creada o asignada. Solo menciona a quien la recibe. */
export function buildKanbanCardPayload({ card, columnName = null, actorName = null, verb = 'asignó', mention = true }) {
  const meta = kanbanMetaLine(card, { columnName });
  const byline = actorName ? `*${escapeDiscordMarkdown(truncateText(actorName, 80))} ${verb} esta tarea.*` : null;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📌 ${kanbanCardTitle(card)}`));
  const body = [meta, byline].filter(Boolean).join('\n');
  if (body) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(truncateText(body, 1000)));
  container.addActionRowComponents(openKanbanCardRow(card.id));

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [], users: mention && card.assignee?.id ? [String(card.assignee.id)] : [] },
    components: [container.toJSON()],
  };
}

/** Lista efímera de /tareas: abiertas, agrupadas por columna. */
export function buildKanbanListPayload({ cards = [], columns = [], mine = false, total = cards.length }) {
  const heading = mine ? '# 📋 Tus tareas abiertas' : '# 📋 Tareas abiertas';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const shown = cards.slice(0, KANBAN_LIST_CARDS_MAX);
  if (!shown.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(mine
      ? 'No tienes tareas abiertas en este canal. 🎉'
      : 'No hay tareas abiertas en este canal.\nCrea una con `/tarea`.'));
  } else {
    const sections = [];
    for (const column of columns) {
      const inColumn = shown.filter(card => card.columnId === column.id);
      if (!inColumn.length) continue;
      const lines = inColumn.map(card => {
        const extra = [card.assignee?.id ? `<@${card.assignee.id}>` : null,
          formatKanbanDueDate(card.dueDate) ? `vence ${formatKanbanDueDate(card.dueDate)}` : null].filter(Boolean).join(' · ');
        return `• **#${card.number}** ${escapeDiscordMarkdown(truncateText(card.title, 90))}${extra ? ` — ${extra}` : ''}`;
      });
      sections.push(`**${escapeDiscordMarkdown(column.name)}**\n${lines.join('\n')}`);
    }
    if (total > shown.length) sections.push(`*…y ${total - shown.length} más en el tablero.*`);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(truncateText(sections.join('\n\n'), 3000)));
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        ...shown.slice(0, KANBAN_LIST_BUTTONS_MAX).map(card => new ButtonBuilder()
          .setLabel(`#${card.number} ${truncateText(card.title, 40)}`)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId(kanbanCardCustomId(card.id))),
      ));
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Abrir tablero').setStyle(ButtonStyle.Primary).setCustomId(`${BARDO_OPEN_PREFIX}kanban`),
  ));

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

export function discordMessageUrl(guildId, channelId, messageId = null) {
  return `https://discord.com/channels/${guildId}/${channelId}${messageId ? `/${messageId}` : ''}`;
}

/** MD a quien recibe tareas. Sin descripción (privacidad); enlace al canal. */
export function buildKanbanDmPayload({ card = null, cards = card ? [card] : [], guildId, channelId, messageId = null, actorName = null, channelName = null }) {
  const where = channelName ? ` en **#${escapeDiscordMarkdown(channelName)}**` : '';
  const many = cards.length > 1;
  const what = many ? `${cards.length} tareas` : 'una tarea';
  const who = actorName
    ? `${escapeDiscordMarkdown(truncateText(actorName, 80))} te asignó ${what}${where}.`
    : `Te asignaron ${what}${where}.`;
  const lines = cards.slice(0, 10).map(item => {
    const due = formatKanbanDueDate(item.dueDate);
    return `${many ? '• ' : ''}**${kanbanCardTitle(item)}**${due ? ` — vence ${due}` : ''}`;
  });
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📌 ${many ? 'Nuevas tareas para ti' : 'Nueva tarea para ti'}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncateText(`${who}\n${lines.join('\n')}`, 2000)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Ver en el canal').setStyle(ButtonStyle.Link).setURL(discordMessageUrl(guildId, channelId, messageId)),
    ));
  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}

/** Un solo aviso para todas las tareas creadas desde los acuerdos de una reunión. */
export function buildKanbanBulkAssignedPayload({ cards = [], sessionTitle = null, actorName = null }) {
  const title = sessionTitle ? ` de «${escapeDiscordMarkdown(truncateText(sessionTitle, 80))}»` : '';
  const lines = cards.slice(0, 20).map(card =>
    `• **#${card.number}** ${escapeDiscordMarkdown(truncateText(card.title, 90))}${card.assignee?.id ? ` — <@${card.assignee.id}>` : ''}`);
  if (cards.length > 20) lines.push(`*…y ${cards.length - 20} más.*`);
  const byline = actorName ? `\n\n*${escapeDiscordMarkdown(truncateText(actorName, 80))} convirtió los acuerdos en tareas.*` : '';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Tareas de la reunión${title}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(truncateText(`${lines.join('\n')}${byline}`, 3000)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Abrir Tareas').setStyle(ButtonStyle.Primary).setCustomId(`${BARDO_OPEN_PREFIX}kanban`),
    ));
  const users = [...new Set(cards.map(card => card.assignee?.id).filter(Boolean).map(String))].slice(0, 100);
  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [], users },
    components: [container.toJSON()],
  };
}

/** Primer mensaje de un hilo creado sin mensaje previo: suma al hilo a quienes menciona. */
export function buildKanbanThreadStarterPayload({ card, actorId = null }) {
  const people = [...new Set([card.assignee?.id, actorId].filter(Boolean).map(String))];
  const mentions = people.map(id => `<@${id}>`).join(' ');
  const meta = kanbanMetaLine(card);
  const content = [`## 📌 ${kanbanCardTitle(card)}`, meta, mentions ? `${mentions} — conversemos esta tarea aquí.` : 'Conversemos esta tarea aquí.']
    .filter(Boolean).join('\n');
  return {
    content: truncateText(content, 1900),
    allowed_mentions: { parse: [], users: people },
  };
}

export function kanbanThreadName(card) {
  return truncateText(`#${card.number} · ${card.title || 'Tarea'}`, 100);
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

