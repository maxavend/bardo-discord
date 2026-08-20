import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import { generateDocxDocument, generatePdfDocument, sanitizeExportFileName } from './export-format.js';
import { buildDocumentPayload, buildErrorPayload, BARDO_OPEN_PREFIX } from './components.js';
import { normalizeDocumentId } from './document-id.js';
import { fileStem, getSourceType, isTextSourceType, sourceLabel } from './import-format.js';
import {
  cacheNormalizedDocument,
  loadActivityContext,
  loadDocument,
  loadDocumentSource,
  saveActivityContext,
  saveDiscordMessageReference,
  saveDocument,
  saveDocumentSource,
  updateDocumentContent,
} from './db.js';

const MAX_STORED_DOCUMENT_BYTES = 1_800_000;
const DOCUMENT_API_PREFIX = '/api/documents/';
const ACTIVITY_CONTEXT_API_PREFIX = '/api/activity-context/';

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function attachmentName(attachment) {
  return attachment.filename || attachment.name || '';
}

function validateAttachment(attachment) {
  const name = attachmentName(attachment);
  const sourceType = getSourceType(name);

  if (!sourceType) {
    if (name.toLowerCase().endsWith('.doc')) {
      throw new Error('El formato Word antiguo `.doc` todavía no es compatible. Guárdalo como `.docx` y vuelve a subirlo.');
    }
    throw new Error('Usa un archivo `.md`, `.markdown`, `.txt`, `.pdf` o `.docx`.');
  }

  if (attachment.size > MAX_STORED_DOCUMENT_BYTES) {
    throw new Error('El archivo supera 1,8 MB. Por ahora Bardo limita PDF y Word a ese tamaño para mantener el almacenamiento gratuito.');
  }

  return sourceType;
}

async function downloadAttachment(attachment, sourceType) {
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Discord devolvió HTTP ${response.status} al leer el archivo.`);
  }

  if (isTextSourceType(sourceType)) {
    return { text: await response.text() };
  }

  return { bytes: new Uint8Array(await response.arrayBuffer()) };
}

function firstPreviewPage(markdown) {
  return paginateMarkdown(markdown).slice(0, 1);
}

function pendingImportPreview(sourceType) {
  const label = sourceLabel(sourceType);
  return `**${label} listo para leer.**\n\nBardo adaptará el contenido al mismo formato del lector cuando abras **Mostrar más** por primera vez.`;
}

async function processAndSaveDocument(env, interaction, attachment, explicitTitle) {
  const applicationId = interaction.application_id;
  const token = interaction.token;
  const originalMessageUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;

  try {
    const sourceType = validateAttachment(attachment);
    const downloaded = await downloadAttachment(attachment, sourceType);
    const createdBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';
    const documentId = crypto.randomUUID();
    const sourceName = attachmentName(attachment) || null;

    let title;
    let originalMarkdown;
    let pages;

    if (isTextSourceType(sourceType)) {
      originalMarkdown = downloaded.text;
      const extracted = extractDocumentTitle(originalMarkdown, explicitTitle);
      title = extracted.title;
      pages = firstPreviewPage(extracted.body);

      if (pages.length === 0) {
        throw new Error('El archivo está vacío.');
      }
    } else {
      title = (explicitTitle?.trim() || fileStem(sourceName)).slice(0, 200);
      originalMarkdown = `# ${title}\n\n${pendingImportPreview(sourceType)}`;
      pages = [pendingImportPreview(sourceType)];
    }

    const document = {
      id: documentId,
      title,
      originalMarkdown,
      pages,
      sourceName,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    if (!env.DB) {
      throw new Error('La base de datos de Bardo no está disponible.');
    }

    await saveDocument(env.DB, documentId, document);

    if (!isTextSourceType(sourceType)) {
      await saveDocumentSource(env.DB, documentId, {
        bytes: downloaded.bytes,
        mime: attachment.content_type || (sourceType === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        type: sourceType,
      });
    }

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

    const discordMessage = await editRes.json().catch(() => null);
    await saveDiscordMessageReference(
      env.DB,
      documentId,
      discordMessage?.channel_id || interaction.channel_id || null,
      discordMessage?.id || null,
    );

    console.log(`Documento publicado: ${title} (${documentId}, ${sourceType})`);
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

  if (commandName === 'doc' || commandName === 'documento') {
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

function extractActivityInstanceIds(callbackData) {
  return [
    callbackData?.interaction?.activity_instance_id,
    callbackData?.resource?.activity_instance?.id,
    callbackData?.activity_instance_id,
    callbackData?.activity_instance?.id,
    callbackData?.resource?.id,
    callbackData?.instance_id,
  ].filter((value, index, values) => typeof value === 'string' && value && values.indexOf(value) === index);
}

async function handleComponentInteraction(interaction, env) {
  const customId = interaction.data?.custom_id || '';

  if (!customId.startsWith(BARDO_OPEN_PREFIX)) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Acción no reconocida.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const documentId = normalizeDocumentId(customId);
  if (!documentId || !env.DB) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'No pude abrir este documento.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Este documento ya no está disponible.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;

  try {
    const callbackRes = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 12 }),
    });

    if (!callbackRes.ok) {
      console.error('Discord callback error:', callbackRes.status, await callbackRes.text().catch(() => ''));
      return new Response(null, { status: 202 });
    }

    const callbackData = await callbackRes.json().catch(() => null);
    const instanceIds = extractActivityInstanceIds(callbackData);
    const userId = interaction.member?.user?.id || interaction.user?.id || null;

    if (instanceIds.length === 0) {
      console.error('Discord launched the Activity without a readable instance id.', {
        interaction: callbackData?.interaction,
        resource: callbackData?.resource,
      });
    } else {
      await Promise.all(instanceIds.map((instanceId) => saveActivityContext(env.DB, instanceId, documentId, userId)));
    }

    return new Response(null, { status: 202 });
  } catch (error) {
    console.error('Error handling component interaction:', error);
    return new Response(null, { status: 202 });
  }
}

function parseDocumentApiPath(pathname) {
  if (!pathname.startsWith(DOCUMENT_API_PREFIX)) return null;

  const rest = pathname.slice(DOCUMENT_API_PREFIX.length);
  const [encodedId, action, extra] = rest.split('/');
  if (!encodedId || extra) return null;

  let rawId;
  try {
    rawId = decodeURIComponent(encodedId);
  } catch {
    return null;
  }

  const documentId = normalizeDocumentId(rawId);
  if (!documentId) return null;

  return { documentId, action: action || null };
}

async function verifyActivityDocumentAccess(request, env, documentId) {
  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId) {
    return jsonResponse({ error: 'Activity instance required' }, 401);
  }

  const context = await loadActivityContext(env.DB, instanceId);
  if (!context || context.documentId !== documentId) {
    return jsonResponse({ error: 'Activity instance does not match document' }, 403);
  }

  return null;
}

async function resolveEditorAccess(request, env, documentId) {
  if (!env.DB) {
    return { response: jsonResponse({ error: 'Database unavailable' }, 503) };
  }

  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId) {
    return { response: jsonResponse({ error: 'Activity instance required' }, 401) };
  }

  const [context, document] = await Promise.all([
    loadActivityContext(env.DB, instanceId),
    loadDocument(env.DB, documentId),
  ]);

  if (!document) {
    return { response: jsonResponse({ error: 'Document not found' }, 404) };
  }

  if (!context || context.documentId !== documentId) {
    return { response: jsonResponse({ error: 'Activity instance does not match document' }, 403) };
  }

  if (!context.userId || !document.createdBy || document.createdBy === 'unknown' || context.userId !== document.createdBy) {
    return { response: jsonResponse({ error: 'Only the document author can edit it' }, 403) };
  }

  return { context, document };
}

async function canEditDocument(request, env, document) {
  if (!env.DB || !document) return false;
  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId) return false;
  const context = await loadActivityContext(env.DB, instanceId);
  return Boolean(
    context
    && context.documentId === document.id
    && context.userId
    && document.createdBy
    && document.createdBy !== 'unknown'
    && context.userId === document.createdBy
    && document.importStatus === 'ready'
  );
}

async function handleDocumentExportApi(url, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'Document not found' }, 404);
  }

  const format = url.searchParams.get('format')?.toLowerCase() || 'markdown';
  const baseName = sanitizeExportFileName(document.title || document.sourceName || 'documento');

  if (format === 'docx' || format === 'word' || format === 'doc') {
    const fileName = `${baseName}.docx`;
    const docxBytes = await generateDocxDocument(document);
    return new Response(docxBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(docxBytes.byteLength),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (format === 'pdf') {
    const fileName = `${baseName}.pdf`;
    const pdfBytes = await generatePdfDocument(document);
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const fileName = `${baseName}.md`;
  return new Response(document.originalMarkdown || '', {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function handleDocumentApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'Document not found' }, 404);
  }

  const canEdit = await canEditDocument(request, env, document);

  return jsonResponse(
    {
      id: document.id || documentId,
      title: document.title,
      markdown: document.originalMarkdown,
      sourceName: document.sourceName,
      sourceType: document.sourceType,
      sourceMime: document.sourceMime,
      importStatus: document.importStatus,
      hasSource: document.hasSource,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      canEdit,
    },
    200,
    {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  );
}

async function handleDocumentEditApi(request, documentId, env) {
  const access = await resolveEditorAccess(request, env, documentId);
  if (access.response) return access.response;
  if (access.document.importStatus !== 'ready') {
    return jsonResponse({ error: 'Document must finish importing before editing' }, 409);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const title = typeof payload?.title === 'string' ? payload.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim() : '';
  if (!title) return jsonResponse({ error: 'Document title required' }, 400);
  if (!markdown) return jsonResponse({ error: 'Document markdown required' }, 400);

  const byteLength = new TextEncoder().encode(markdown).byteLength;
  if (byteLength > MAX_STORED_DOCUMENT_BYTES) {
    return jsonResponse({ error: 'Document is too large' }, 413);
  }

  const { body } = extractDocumentTitle(markdown, title);
  const pages = firstPreviewPage(body);
  const updatedAt = new Date().toISOString();

  await updateDocumentContent(env.DB, documentId, {
    title,
    markdown,
    pages,
    updatedAt,
  });

  return jsonResponse({ ok: true, updatedAt });
}

async function handleDocumentFinishApi(request, documentId, env) {
  const access = await resolveEditorAccess(request, env, documentId);
  if (access.response) return access.response;

  const document = access.document;
  if (!document.discordChannelId || !document.discordMessageId || !env.DISCORD_TOKEN) {
    return jsonResponse({ ok: true, synced: false });
  }

  const payload = buildDocumentPayload(document, { documentId });
  const response = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(document.discordChannelId)}/messages/${encodeURIComponent(document.discordMessageId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allowed_mentions: payload.allowed_mentions,
        components: payload.components,
      }),
    },
  );

  if (!response.ok) {
    console.error('No se pudo sincronizar el preview editado:', response.status, await response.text().catch(() => ''));
    return jsonResponse({ ok: true, synced: false }, 200);
  }

  return jsonResponse({ ok: true, synced: true });
}

async function handleDocumentSourceApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const accessError = await verifyActivityDocumentAccess(request, env, documentId);
  if (accessError) return accessError;

  const source = await loadDocumentSource(env.DB, documentId);
  if (!source) {
    return jsonResponse({ error: 'Document source not found' }, 404);
  }

  return new Response(source.bytes, {
    status: 200,
    headers: {
      'Content-Type': source.mime,
      'Content-Length': String(source.bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function handleDocumentNormalizeApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const accessError = await verifyActivityDocumentAccess(request, env, documentId);
  if (accessError) return accessError;

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'Document not found' }, 404);
  }

  if (document.importStatus === 'ready') {
    return jsonResponse({ ok: true, alreadyNormalized: true });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim() : '';
  if (!markdown) {
    return jsonResponse({ error: 'Normalized markdown required' }, 400);
  }

  const byteLength = new TextEncoder().encode(markdown).byteLength;
  if (byteLength > MAX_STORED_DOCUMENT_BYTES) {
    return jsonResponse({ error: 'Normalized document is too large' }, 413);
  }

  const { body } = extractDocumentTitle(markdown, document.title);
  const pages = firstPreviewPage(body);
  if (pages.length === 0) {
    return jsonResponse({ error: 'Normalized document is empty' }, 400);
  }

  await cacheNormalizedDocument(env.DB, documentId, markdown, pages);
  return jsonResponse({ ok: true });
}

async function handleActivityContextApi(url, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  const encodedId = url.pathname.slice(ACTIVITY_CONTEXT_API_PREFIX.length);
  if (!encodedId) {
    return jsonResponse({ error: 'Instance id required' }, 400);
  }

  let instanceId;
  try {
    instanceId = decodeURIComponent(encodedId);
  } catch {
    return jsonResponse({ error: 'Invalid instance id' }, 400);
  }

  const context = await loadActivityContext(env.DB, instanceId);
  if (!context) {
    return jsonResponse({ error: 'Activity context not found' }, 404);
  }

  return jsonResponse(
    {
      instanceId: context.instanceId,
      documentId: context.documentId,
      createdAt: context.createdAt,
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

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponentInteraction(interaction, env);
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

    if (url.pathname.startsWith(DOCUMENT_API_PREFIX)) {
      const route = parseDocumentApiPath(url.pathname);
      if (!route) return jsonResponse({ error: 'Invalid document route' }, 400);

      if (request.method === 'GET' && route.action === null) {
        return handleDocumentApi(request, route.documentId, env);
      }

      if (request.method === 'PATCH' && route.action === null) {
        return handleDocumentEditApi(request, route.documentId, env);
      }

      if (request.method === 'POST' && route.action === 'finish') {
        return handleDocumentFinishApi(request, route.documentId, env);
      }

      if (request.method === 'GET' && (route.action === 'export' || route.action === 'download')) {
        return handleDocumentExportApi(url, route.documentId, env);
      }

      if (request.method === 'GET' && route.action === 'source') {
        return handleDocumentSourceApi(request, route.documentId, env);
      }

      if (request.method === 'POST' && route.action === 'normalize') {
        return handleDocumentNormalizeApi(request, route.documentId, env);
      }

      return new Response('Method not allowed', { status: 405 });
    }

    if (request.method === 'GET' && url.pathname.startsWith(ACTIVITY_CONTEXT_API_PREFIX)) {
      return handleActivityContextApi(url, env);
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
