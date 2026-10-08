import { requireDocsSession } from './discord-auth.js';
import { sessionCanAccessDocument } from './document-access.js';
import { BARDO_OPEN_PREFIX, normalizeDocumentId } from './document-id.js';
import { buildDocumentPayload } from './components.js';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import {
  adoptLegacyDocumentsForGuild,
  archiveDocument,
  restoreDocument,
  deleteDocumentPermanently,
  cacheNormalizedDocument,
  documentExists,
  grantDocumentChannelAccessStatement,
  grantDocumentGuildAccessStatement,
  hasAnyDocumentGuildAccess,
  insertDocumentStatement,
  isUniqueConstraintError,
  listDocumentChannelAccess,
  listDocumentsForChannel,
  loadDocument,
  loadDocumentSource,
  loadRecentDocsLaunchIntent,
  deleteDocsLaunchIntent,
  LAUNCH_TARGET_PREFIX,
  updateDocumentContent,
} from './db.js';
import {
  createDiscordPermissionChecker,
  discordUnavailableResponse,
  isDiscordUnavailableError,
} from './discord-permissions.js';

const DOCS_API_PREFIX = '/api/docs';
export const MAX_DOCUMENT_BYTES = 1_800_000;
const encoder = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function apiError(status, error, message, extra = {}) {
  return json({ error, ...(message ? { message } : {}), ...extra }, status);
}

export function serialize(document) {
  return {
    id: document.id,
    title: document.title || 'Sin título',
    description: document.description || '',
    markdown: document.originalMarkdown || '',
    sourceName: document.sourceName || null,
    sourceType: document.sourceType || 'markdown',
    sourceMime: document.sourceMime || null,
    importStatus: document.importStatus || 'ready',
    hasSource: Boolean(document.hasSource),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt || document.createdAt,
    archivedAt: document.archivedAt || null,
    archived: Boolean(document.archivedAt),
    createdBy: document.createdBy || null,
    createdByName: document.createdByName || null,
    updatedByName: document.updatedByName || null,
  };
}

function sessionDisplayName(session) {
  return String(session?.username || '').trim() || 'Usuario de Discord';
}

function launchDocumentId(request) {
  const customId = request.headers.get('x-bardo-custom-id')?.trim() || '';
  if (!customId.startsWith(BARDO_OPEN_PREFIX)) return null;
  return normalizeDocumentId(customId);
}

/**
 * A new `updatedAt` that is strictly later than the stored one, so the next
 * optimistic-concurrency check can never confuse two consecutive saves made in
 * the same millisecond.
 */
function nextUpdatedAt(previous) {
  const now = Date.now();
  const previousMs = Date.parse(previous || '') || 0;
  return new Date(Math.max(now, previousMs + 1)).toISOString();
}

function normalizeEditorPayload(payload, existing = null) {
  const title = String(payload?.title ?? existing?.title ?? 'Sin título').trim().slice(0, 200) || 'Sin título';
  const description = String(payload?.description ?? existing?.description ?? '').trim().slice(0, 1000);
  const markdown = String(payload?.markdown ?? existing?.originalMarkdown ?? '').trim();

  if (!markdown) return { error: 'content_required', message: 'El contenido del documento es obligatorio.', status: 400 };
  if (encoder.encode(markdown).byteLength > MAX_DOCUMENT_BYTES) {
    return { error: 'too_large', message: 'El documento supera el tamaño máximo permitido (1,8 MB).', status: 413 };
  }

  const extracted = extractDocumentTitle(markdown, title);
  const pages = paginateMarkdown(extracted.body || markdown).slice(0, 1);

  return {
    title,
    description,
    originalMarkdown: markdown,
    pages: pages.length ? pages : [markdown.slice(0, 3500)],
  };
}

function parsePath(pathname) {
  if (pathname === DOCS_API_PREFIX || pathname === `${DOCS_API_PREFIX}/`) return { collection: true };
  if (!pathname.startsWith(`${DOCS_API_PREFIX}/`)) return null;

  const rest = pathname.slice(DOCS_API_PREFIX.length + 1);
  const [encodedId, action, extra] = rest.split('/');
  if (!encodedId || extra) return null;
  if (action && !['source', 'normalize', 'message', 'restore', 'permanent'].includes(action)) return null;

  try {
    const id = normalizeDocumentId(decodeURIComponent(encodedId));
    return id ? { collection: false, id, action: action || null } : null;
  } catch {
    return null;
  }
}

async function readJson(request) {
  try {
    return { payload: await request.json() };
  } catch {
    return { error: apiError(400, 'invalid_json', 'El cuerpo de la solicitud no es JSON válido.') };
  }
}

async function soleAuthenticatedGuild(env) {
  try {
    const row = await env.DB
      .prepare('SELECT COUNT(DISTINCT guild_id) AS guild_count, MIN(guild_id) AS guild_id FROM docs_sessions')
      .first();
    return Number(row?.guild_count || 0) === 1 ? row.guild_id || null : null;
  } catch {
    return null;
  }
}

// Once any document has a guild ACL the legacy adoption can never apply again,
// so remember it per database binding and stop probing on every request.
const legacyAdoptionSettled = new WeakSet();

async function adoptLegacyLibraryIfSafe(env, session) {
  if (!env.DB || !session?.guildId || legacyAdoptionSettled.has(env.DB)) return false;

  try {
    if (await hasAnyDocumentGuildAccess(env.DB)) {
      legacyAdoptionSettled.add(env.DB);
      return false;
    }

    const onlyGuild = await soleAuthenticatedGuild(env);
    if (!onlyGuild || onlyGuild !== session.guildId) return false;

    await adoptLegacyDocumentsForGuild(env.DB, session.guildId, session.userId || null);
    legacyAdoptionSettled.add(env.DB);
    return true;
  } catch {
    return false;
  }
}

async function requireDocumentAccess(env, documentId, session) {
  const allowed = await sessionCanAccessDocument(env, session, documentId);
  if (!allowed) return { error: apiError(403, 'forbidden', 'Este documento no está compartido en este canal de Discord.') };
  const document = await loadDocument(env.DB, documentId);
  if (!document) return { error: apiError(404, 'not_found', 'No se encontró el documento.') };
  return { document };
}

async function sessionCanViewCurrentChannel(env, session) {
  if (!session?.channelId) return false;
  return createDiscordPermissionChecker(env, session.guildId, session.userId)
    .canViewChannel(session.channelId);
}

async function resolveLaunchContext(request, env, session) {
  const requested = launchDocumentId(request);
  if (requested && !requested.startsWith(LAUNCH_TARGET_PREFIX)) {
    const channels = await listDocumentChannelAccess(env.DB, requested, session.guildId);
    if (channels.includes(session.channelId)) return { contextDocumentId: requested, launchTarget: null };
  }

  // Some Discord mobile clients launch the Activity without forwarding the
  // originating custom_id, and slash commands never have one. The interaction
  // handler stores a short-lived intent for this exact user/guild/channel,
  // which is safe to use as a fallback.
  const intent = await loadRecentDocsLaunchIntent(env.DB, session.userId, session.guildId);
  if (!intent?.documentId || (intent.channelId && intent.channelId !== session.channelId)) {
    return { contextDocumentId: null, launchTarget: null };
  }

  if (intent.documentId.startsWith(LAUNCH_TARGET_PREFIX)) {
    await deleteDocsLaunchIntent(env.DB, session.userId, session.guildId, intent.documentId);
    return { contextDocumentId: null, launchTarget: intent.documentId.slice(LAUNCH_TARGET_PREFIX.length) || null };
  }

  const channels = await listDocumentChannelAccess(env.DB, intent.documentId, session.guildId);
  if (channels.includes(session.channelId)) return { contextDocumentId: intent.documentId, launchTarget: null };
  return { contextDocumentId: null, launchTarget: null };
}

async function handleSource(route, request, env, session) {
  if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
  const access = await requireDocumentAccess(env, route.id, session);
  if (access.error) return access.error;
  const source = await loadDocumentSource(env.DB, route.id);
  if (!source) return apiError(404, 'source_not_found', 'El archivo original ya no está disponible.');

  return new Response(source.bytes, {
    status:200,
    headers:{
      'Content-Type': source.mime,
      'Content-Length': String(source.bytes.byteLength),
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    },
  });
}

/**
 * Stores the client-side conversion of a pending PDF/DOCX import. Only valid
 * while the import is pending: a late or repeated normalization answers 409
 * with the current document instead of overwriting later edits.
 */
export async function normalizeDocumentImport(env, session, document, payload) {
  if (document.importStatus !== 'pending') {
    return apiError(409, 'already_normalized', 'Este documento ya fue importado.', { document: serialize(document) });
  }

  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim() : '';
  if (!markdown) return apiError(400, 'content_required', 'Falta el contenido normalizado.');
  if (encoder.encode(markdown).byteLength > MAX_DOCUMENT_BYTES) {
    return apiError(413, 'too_large', 'El documento importado supera el tamaño máximo permitido (1,8 MB).');
  }

  const {body} = extractDocumentTitle(markdown, document.title);
  const pages = paginateMarkdown(body || markdown).slice(0, 1);
  if (!pages.length) return apiError(400, 'content_required', 'El documento importado está vacío.');

  const written = await cacheNormalizedDocument(env.DB, document.id, markdown, pages, {
    updatedAt: nextUpdatedAt(document.updatedAt),
    updatedBy: session.userId,
    updatedByName: sessionDisplayName(session),
  });
  const current = await loadDocument(env.DB, document.id);
  if (!written) {
    return apiError(409, 'already_normalized', 'Este documento ya fue importado.', { document: serialize(current) });
  }
  return json({ok:true, document:serialize(current)});
}

async function handleNormalize(route, request, env, session) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  const access = await requireDocumentAccess(env, route.id, session);
  if (access.error) return access.error;

  const body = await readJson(request);
  if (body.error) return body.error;
  return normalizeDocumentImport(env, session, access.document, body.payload);
}

async function handleMessage(route, request, env, session) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  if (!session.channelId) return apiError(403, 'channel_required', 'Abre Bardo desde un canal de Discord.');

  const botToken = String(env.DISCORD_TOKEN || '').trim();
  if (!botToken) return apiError(503, 'bot_not_configured', 'El bot de Bardo no está configurado para publicar.');

  const access = await requireDocumentAccess(env, route.id, session);
  if (access.error) return access.error;

  const discordFetch = env.DISCORD_FETCH || fetch;
  const response = await discordFetch(`https://discord.com/api/v10/channels/${encodeURIComponent(session.channelId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildDocumentPayload(access.document, {documentId: route.id})),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Discord publish failed', response.status, detail.slice(0, 500));
    if (response.status === 429 || response.status >= 500) {
      return apiError(503, 'discord_unavailable', 'Discord no aceptó el mensaje ahora. Inténtalo de nuevo.', { retryAfterMs: 2000 });
    }
    return apiError(response.status === 403 ? 403 : 502, 'publish_failed', 'Bardo no pudo enviar el documento a este canal.');
  }

  const message = await response.json().catch(() => null);
  return json({ok:true, messageId:message?.id || null});
}

async function handleList(request, url, env, session) {
  const isArchivedQuery = url.searchParams.get('archived') === '1' || url.searchParams.get('status') === 'archived';
  const summary = url.searchParams.get('summary') === '1';

  if (!(await sessionCanViewCurrentChannel(env, session))) {
    return json({ documents: [], contextDocumentId: null, guildId: session.guildId, user: sessionUser(session) });
  }

  const documents = await listDocumentsForChannel(env.DB, session.guildId, session.channelId, {
    archived: isArchivedQuery,
    limit: 150,
    summary,
  });
  const { contextDocumentId, launchTarget } = isArchivedQuery
    ? { contextDocumentId: null, launchTarget: null }
    : await resolveLaunchContext(request, env, session);

  if (contextDocumentId && !documents.some(document => document.id === contextDocumentId)) {
    const contextDocument = await loadDocument(env.DB, contextDocumentId);
    if (contextDocument && !contextDocument.archivedAt) documents.unshift(contextDocument);
  }

  return json({
    documents: documents.map(serialize),
    contextDocumentId,
    launchTarget,
    guildId: session.guildId,
    user: sessionUser(session),
  });
}

function sessionUser(session) {
  return {
    id: session.userId,
    username: session.username,
    avatar: session.avatar,
  };
}

async function handleCreate(request, env, session) {
  const body = await readJson(request);
  if (body.error) return body.error;
  const payload = body.payload;

  const requestedId = typeof payload?.id === 'string' && payload.id.trim()
    ? normalizeDocumentId(payload.id.trim())
    : null;

  const normalized = normalizeEditorPayload(payload);
  if (normalized.error) return apiError(normalized.status || 400, normalized.error, normalized.message);

  if (!session.channelId || !(await sessionCanViewCurrentChannel(env, session))) {
    return apiError(403, 'channel_required', 'Necesitas acceso a este canal de Discord para crear documentos.');
  }

  const existsResponse = async () => {
    // Only reveal the existing document when the caller may read it.
    const visible = await sessionCanAccessDocument(env, session, requestedId);
    const existing = visible ? await loadDocument(env.DB, requestedId) : null;
    return apiError(409, 'exists', 'Ya existe un documento con ese identificador.', existing ? { document: serialize(existing) } : {});
  };

  if (requestedId && await documentExists(env.DB, requestedId)) return existsResponse();

  const documentId = requestedId || crypto.randomUUID();
  const now = new Date().toISOString();
  const displayName = sessionDisplayName(session);

  try {
    await env.DB.batch([
      insertDocumentStatement(env.DB, documentId, {
        ...normalized,
        sourceName: null,
        createdAt: now,
        createdBy: session.userId,
        createdByName: displayName,
        updatedAt: now,
        updatedBy: session.userId,
        updatedByName: displayName,
      }),
      grantDocumentGuildAccessStatement(env.DB, documentId, session.guildId, session.userId),
      grantDocumentChannelAccessStatement(env.DB, documentId, session.guildId, session.channelId, session.userId),
    ]);
  } catch (error) {
    if (requestedId && isUniqueConstraintError(error)) return existsResponse();
    throw error;
  }

  return json({ document: serialize(await loadDocument(env.DB, documentId)) }, 201);
}

async function handleUpdate(route, request, env, session, existing) {
  const body = await readJson(request);
  if (body.error) return body.error;
  const payload = body.payload;

  if (existing.importStatus === 'pending') {
    return apiError(409, 'import_pending', 'Bardo todavía está importando este archivo. Espera unos segundos.', {
      document: serialize(existing),
    });
  }

  const baseUpdatedAt = typeof payload?.baseUpdatedAt === 'string' && payload.baseUpdatedAt.trim()
    ? payload.baseUpdatedAt.trim()
    : null;
  if (baseUpdatedAt && baseUpdatedAt !== existing.updatedAt) {
    return apiError(409, 'conflict', 'Otra persona guardó cambios en este documento.', { document: serialize(existing) });
  }

  const normalized = normalizeEditorPayload(payload, existing);
  if (normalized.error) return apiError(normalized.status || 400, normalized.error, normalized.message);

  const written = await updateDocumentContent(env.DB, route.id, {
    ...normalized,
    updatedAt: nextUpdatedAt(existing.updatedAt),
    updatedBy: session.userId,
    updatedByName: sessionDisplayName(session),
  }, { baseUpdatedAt: baseUpdatedAt || existing.updatedAt });

  const current = await loadDocument(env.DB, route.id);
  if (!written) {
    // Someone saved (or an import started) between our read and our write.
    const code = current?.importStatus === 'pending' ? 'import_pending' : 'conflict';
    return apiError(409, code, 'Otra persona guardó cambios en este documento.', { document: current ? serialize(current) : null });
  }
  return json({ document: serialize(current) });
}

async function handlePermanentDelete(route, env, session, existing) {
  if (!existing.archivedAt) {
    return apiError(409, 'not_archived', 'Archiva el documento antes de eliminarlo definitivamente.');
  }

  const isAuthor = existing.createdBy && String(existing.createdBy) === String(session.userId);
  const canModerate = isAuthor || await createDiscordPermissionChecker(env, session.guildId, session.userId)
    .canModerateDocuments(session.channelId);
  if (!canModerate) {
    return apiError(403, 'forbidden', 'Solo quien creó el documento o quien modera el canal puede eliminarlo definitivamente.');
  }

  const deleted = await deleteDocumentPermanently(env.DB, route.id);
  if (!deleted) return apiError(409, 'not_archived', 'El documento fue restaurado antes de eliminarse.');
  return json({ ok: true, deleted: true, id: route.id });
}

async function routeDocsApi(request, url, env) {
  const route = parsePath(url.pathname);
  if (!route) return null;

  const auth = await requireDocsSession(request, env);
  if (auth.error) return auth.error;
  const { session } = auth;

  // Legacy Bardo stored documents before guild ACL existed. If production has
  // never assigned any document and every authenticated session points at the
  // same guild, that guild is the only safe legacy owner. This restores the
  // existing library once, without making documents globally readable.
  await adoptLegacyLibraryIfSafe(env, session);

  if (!route.collection && route.action === 'source') return handleSource(route, request, env, session);
  if (!route.collection && route.action === 'normalize') return handleNormalize(route, request, env, session);
  if (!route.collection && route.action === 'message') return handleMessage(route, request, env, session);

  if (route.collection && request.method === 'GET') return handleList(request, url, env, session);
  if (route.collection && request.method === 'POST') return handleCreate(request, env, session);
  if (route.collection) return new Response('Method not allowed', { status: 405 });

  const access = await requireDocumentAccess(env, route.id, session);
  if (access.error) return access.error;
  const existing = access.document;

  if (route.action === 'restore') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    await restoreDocument(env.DB, route.id);
    // Restoring bumps updated_at; return the row so clients refresh their
    // baseUpdatedAt and the next PATCH is not a false conflict.
    const restored = await loadDocument(env.DB, route.id);
    return json({ ok: true, restored: true, id: route.id, document: restored ? serialize(restored) : null });
  }

  if (route.action === 'permanent') {
    if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });
    return handlePermanentDelete(route, env, session, existing);
  }

  if (request.method === 'GET') return json(serialize(existing));

  if (request.method === 'PATCH' || request.method === 'PUT') {
    return handleUpdate(route, request, env, session, existing);
  }

  if (request.method === 'DELETE') {
    await archiveDocument(
      env.DB,
      route.id,
      nextUpdatedAt(existing.updatedAt),
      session.userId,
      sessionDisplayName(session),
    );
    const archived = await loadDocument(env.DB, route.id);
    return json({ ok: true, archived: true, id: route.id, document: archived ? serialize(archived) : null });
  }

  return new Response('Method not allowed', { status: 405 });
}

export async function handleDocsApi(request, url, env) {
  try {
    return await routeDocsApi(request, url, env);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
