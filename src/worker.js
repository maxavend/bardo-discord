import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import { buildDocumentPayload, buildErrorPayload, BUTTON_PREFIX } from './components.js';
import { loadDocument, saveDocument } from './db.js';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isSupportedTextAttachment(attachment) {
  const name = attachment.filename?.toLowerCase() ?? attachment.name?.toLowerCase() ?? '';
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

async function processAndSaveDocument(env, interaction, attachment, explicitTitle) {
  const applicationId = interaction.application_id;
  const token = interaction.token;
  const originalMessageUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;

  try {
    const markdown = await downloadAttachmentText(attachment);
    const { title, body } = extractDocumentTitle(markdown, explicitTitle);
    const pages = paginateMarkdown(body);

    if (pages.length === 0) {
      throw new Error('El archivo está vacío.');
    }

    const createdBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';
    const document = {
      title,
      originalMarkdown: markdown,
      pages,
      sourceName: attachment.filename || attachment.name || null,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    const documentPayload = buildDocumentPayload(document, 0);

    const editRes = await fetch(originalMessageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentPayload),
    });

    if (!editRes.ok) {
      const errText = await editRes.text();
      throw new Error(`Error al actualizar el mensaje en Discord: ${editRes.status} ${errText}`);
    }

    const messageData = await editRes.json();
    const messageId = messageData.id;

    if (messageId && env.DB) {
      await saveDocument(env.DB, messageId, document);
    }
  } catch (error) {
    console.error('Error procesando documento en background:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    const errorPayload = buildErrorPayload(message);

    await fetch(originalMessageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorPayload),
    }).catch((err) => console.error('Error enviando mensaje de error a Discord:', err));
  }
}

async function handleCommandInteraction(interaction, env, ctx) {
  const commandName = interaction.data?.name;

  if (commandName === 'documento') {
    const options = interaction.data?.options || [];
    const archivoOption = options.find((opt) => opt.name === 'archivo');
    const tituloOption = options.find((opt) => opt.name === 'titulo');

    const attachmentId = archivoOption?.value;
    const resolvedAttachment = interaction.data?.resolved?.attachments?.[attachmentId];
    const explicitTitle = tituloOption?.value;

    if (!resolvedAttachment) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No se encontró el archivo adjunto.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    // Defer the response immediately (Type 5: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
    ctx.waitUntil(processAndSaveDocument(env, interaction, resolvedAttachment, explicitTitle));

    return jsonResponse({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Comando desconocido: ${commandName}`,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

async function handleMessageComponentInteraction(interaction, env) {
  const customId = interaction.data?.custom_id || '';

  if (customId.startsWith(BUTTON_PREFIX)) {
    const targetPage = Number.parseInt(customId.slice(BUTTON_PREFIX.length), 10);

    if (!Number.isInteger(targetPage)) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Ese botón no contiene una página válida.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const messageId = interaction.message?.id;
    if (!messageId) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No se pudo identificar el mensaje asociado.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const document = await loadDocument(env.DB, messageId);
    if (!document) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No encuentro el documento en la base de datos.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const payload = buildDocumentPayload(document, targetPage);

    // Type 7: UPDATE_MESSAGE
    return jsonResponse({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: payload,
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Acción desconocida.',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');

    if (!signature || !timestamp) {
      return new Response('Invalid request signature headers', { status: 401 });
    }

    const rawBody = await request.text();

    const publicKey = env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      console.error('DISCORD_PUBLIC_KEY is not configured');
      return new Response('Internal Server Error: Missing Public Key', { status: 500 });
    }

    const isValidRequest = await verifyKey(rawBody, signature, timestamp, publicKey);
    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    let interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON payload', { status: 400 });
    }

    // Type 1: PING
    if (interaction.type === InteractionType.PING) {
      return jsonResponse({ type: InteractionResponseType.PONG });
    }

    // Type 2: APPLICATION_COMMAND
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      return handleCommandInteraction(interaction, env, ctx);
    }

    // Type 3: MESSAGE_COMPONENT
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      return handleMessageComponentInteraction(interaction, env);
    }

    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Interacción no soportada.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  },
};
