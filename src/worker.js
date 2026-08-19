import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import { buildDocumentPayload, buildErrorPayload } from './components.js';
import { loadDocument, saveDocument } from './db.js';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const DOCUMENT_API_PREFIX = '/api/documents/';

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
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
    const documentId = crypto.randomUUID();
    const document = {
      id: documentId,
      title,
      originalMarkdown: markdown,
      pages,
      sourceName: attachment.filename || attachment.name || null,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    if (!env.DB) {
      throw new Error('La base de datos de Bardo no está disponible.');
    }

    await saveDocument(env.DB, documentId, document);

    const documentPayload = buildDocumentPayload(document, {
      applicationId,
      documentId,
    });

    const editRes = await fetch(originalMessageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentPayload),
    });

    if (!editRes.ok) {
      const errText = await editRes.text();
      throw new Error(`Error al actualizar el mensaje en Discord: ${editRes.status} ${errText}`);
    }

    console.log(`Documento publicado: ${title} (${documentId})`);
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

async function handleDocumentApi(url, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const encodedId = url.pathname.slice(DOCUMENT_API_PREFIX.length);
  if (!encodedId) {
    return jsonResponse({ error: 'Document id required' }, 400);
  }

  let documentId;
  try {
    documentId = decodeURIComponent(encodedId);
  } catch {
    return jsonResponse({ error: 'Invalid document id' }, 400);
  }

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'Document not found' }, 404);
  }

  return jsonResponse(
    {
      id: document.id || documentId,
      title: document.title,
      markdown: document.originalMarkdown,
      sourceName: document.sourceName,
      createdAt: document.createdAt,
    },
    200,
    {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  );
}

async function handleDiscordInteraction(request, env, ctx) {
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

  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommandInteraction(interaction, env, ctx);
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Interacción no soportada.',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname.startsWith(DOCUMENT_API_PREFIX)) {
      return handleDocumentApi(url, env);
    }

    if (request.method === 'POST') {
      return handleDiscordInteraction(request, env, ctx);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
