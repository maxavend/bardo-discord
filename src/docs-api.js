import { requireDocsSession } from './discord-auth.js';
import { BARDO_OPEN_PREFIX, normalizeDocumentId } from './document-id.js';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import {
  archiveDocument,
  cacheNormalizedDocument,
  documentHasGuildAccess,
  grantDocumentGuildAccess,
  listDocumentsForGuild,
  loadDocument,
  loadDocumentSource,
  loadRecentDocsLaunchIntent,
  saveDocument,
  updateDocumentContent,
} from './db.js';

const DOCS_API_PREFIX = '/api/docs';
const MAX_DOCUMENT_BYTES = 1_800_000;
const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function serialize(document) {
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
    createdBy: document.createdBy || null,
  };
}

function launchDocumentId(request) {
  const customId = request.headers.get('x-bardo-custom-id')?.trim() || '';
  if (!customId.startsWith(BARDO_OPEN_PREFIX)) return null;
  return normalizeDocumentId(customId);
}

function normalizeEditorPayload(payload, existing = null) {
  const title = String(payload?.title ?? existing?.title ?? 'Sin título').trim().slice(0, 200) || 'Sin título';
  const description = String(payload?.description ?? existing?.description ?? '').trim().slice(0, 1000);
  const markdown = String(payload?.markdown ?? existing?.originalMarkdown ?? '').trim();

  if (!markdown) return { error: 'Document content is required' };
  if (encoder.encode(markdown).byteLength > MAX_DOCUMENT_BYTES) return { error: 'Document is too large', status: 413 };

  const extracted = extractDocumentTitle(markdown, title);
  const pages = paginateMarkdown(extracted.body || markdown).slice(0, 1);

  return {
    title,
    description,
    originalMarkdown: markdown,
    pages: pages.length ? pages : [markdown.slice(0, 3500)],
    updatedAt: new Date().toISOString(),
  };
}

function parsePath(pathname) {
  if (pathname === DOCS_API_PREFIX || pathname === `${DOCS_API_PREFIX}/`) return { collection: true };
  if (!pathname.startsWith(`${DOCS_API_PREFIX}/`)) return null;

  const rest = pathname.slice(DOCS_API_PREFIX.length + 1);
  const [encodedId, action, extra] = rest.split('/');
  if (!encodedId || extra) return null;
  if (action && action !== 'source' && action !== 'normalize') return null;

  try {
    const id = normalizeDocumentId(decodeURIComponent(encodedId));
    return id ? { collection: false, id, action: action || null } : null;
  } catch {
    return null;
  }
}

async function soleAuthenticatedGuild(env) {
  const row = await env.DB
    .prepare('SELECT COUNT(DISTINCT guild_id) AS guild_count, MIN(guild_id) AS guild_id FROM docs_sessions')
    .first();
  return Number(row?.guild_count || 0) === 1 ? row.guild_id || null : null;
}

async function adoptLegacyLibraryIfSafe(env, session) {
  if (!env.DB || !session?.guildId) return false;

  const accessSummary = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM document_guild_access')
    .first();
  if (Number(accessSummary?.count || 0) > 0) return false;

  const onlyGuild = await soleAuthenticatedGuild(env);
  if (!onlyGuild || onlyGuild !== session.guildId) return false;

  const addedAt = new Date().toISOString();
  await env.DB
    .prepare(`INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by)
      SELECT d.id, ?, ?, ?
      FROM documents d
      WHERE d.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id
        )`)
    .bind(session.guildId, addedAt, session.userId || null)
    .run();

  return true;
}

async function requireDocumentAccess(env, documentId, guildId) {
  const allowed = await documentHasGuildAccess(env.DB, documentId, guildId);
  if (!allowed) return { error: json({ error: 'Document is not shared with this Discord server' }, 403) };
  const document = await loadDocument(env.DB, documentId);
  if (!document) return { error: json({ error: 'Document not found' }, 404) };
  return { document };
}

async function resolveContextDocument(request, env, session) {
  const requested = launchDocumentId(request);
  if (requested && await documentHasGuildAccess(env.DB, requested, session.guildId)) return requested;

  const intent = await loadRecentDocsLaunchIntent(env.DB, session.userId, session.guildId);
  if (intent?.documentId && await documentHasGuildAccess(env.DB, intent.documentId, session.guildId)) {
    return intent.documentId;
  }
  return null;
}

async function handleSource(route, request, env, session) {
  if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
  const access = await requireDocumentAccess(env, route.id, session.guildId);
  if (access.error) return access.error;
  const source = await loadDocumentSource(env.DB, route.id);
  if (!source) return json({error:'Document source not found'}, 404);

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

async function handleNormalize(route, request, env, session) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  const access = await requireDocumentAccess(env, route.id, session.guildId);
  if (access.error) return access.error;

  let payload;
  try { payload = await request.json(); } catch { return json({error:'Invalid JSON payload'}, 400); }
  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim() : '';
  if (!markdown) return json({error:'Normalized markdown required'}, 400);
  if (encoder.encode(markdown).byteLength > MAX_DOCUMENT_BYTES) return json({error:'Normalized document is too large'}, 413);

  const {body} = extractDocumentTitle(markdown, access.document.title);
  const pages = paginateMarkdown(body || markdown).slice(0, 1);
  if (!pages.length) return json({error:'Normalized document is empty'}, 400);

  await cacheNormalizedDocument(env.DB, route.id, markdown, pages);
  return json({ok:true, document:serialize(await loadDocument(env.DB, route.id))});
}

export async function handleDocsApi(request, url, env) {
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

  if (route.collection && request.method === 'GET') {
    const documents = await listDocumentsForGuild(env.DB, session.guildId, 150);
    const contextDocumentId = await resolveContextDocument(request, env, session);

    if (contextDocumentId && !documents.some(document => document.id === contextDocumentId)) {
      const contextDocument = await loadDocument(env.DB, contextDocumentId);
      if (contextDocument) documents.unshift(contextDocument);
    }

    return json({
      documents: documents.map(serialize),
      contextDocumentId,
      guildId: session.guildId,
      user: {
        id: session.userId,
        username: session.username,
        avatar: session.avatar,
      },
    });
  }

  if (route.collection && request.method === 'POST') {
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }

    const preferredId = typeof payload?.id === 'string' ? payload.id.trim() : '';
    const documentId = preferredId && /^[A-Za-z0-9._:-]{1,128}$/.test(preferredId)
      ? preferredId
      : crypto.randomUUID();

    const normalized = normalizeEditorPayload(payload);
    if (normalized.error) return json({ error: normalized.error }, normalized.status || 400);

    const now = new Date().toISOString();
    await saveDocument(env.DB, documentId, {
      title: normalized.title,
      originalMarkdown: normalized.originalMarkdown,
      pages: normalized.pages,
      sourceName: null,
      createdAt: now,
      createdBy: session.userId,
    });
    await updateDocumentContent(env.DB, documentId, {
      ...normalized,
      updatedAt: now,
    });
    await grantDocumentGuildAccess(env.DB, documentId, session.guildId, session.userId);

    return json(serialize(await loadDocument(env.DB, documentId)), 201);
  }

  const access = await requireDocumentAccess(env, route.id, session.guildId);
  if (access.error) return access.error;
  const existing = access.document;

  if (request.method === 'GET') return json(serialize(existing));

  if (request.method === 'PATCH' || request.method === 'PUT') {
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }

    const normalized = normalizeEditorPayload(payload, existing);
    if (normalized.error) return json({ error: normalized.error }, normalized.status || 400);

    await updateDocumentContent(env.DB, route.id, normalized);
    return json(serialize(await loadDocument(env.DB, route.id)));
  }

  if (request.method === 'DELETE') {
    await archiveDocument(env.DB, route.id);
    return json({ ok: true, archived: true, id: route.id });
  }

  return new Response('Method not allowed', { status: 405 });
}
