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
      .setLabel('📖 Mostrar más')
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
      new TextDisplayBuilder().setContent('*Vista previa · El documento completo se abre dentro de Discord.*'),
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
    new TextDisplayBuilder().setContent(`## No pude publicar el documento\n\n${message}`),
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [container.toJSON()],
  };
}
