import { BARDO_OPEN_PREFIX, normalizeDocumentId } from './document-id.js';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import {
  archiveDocument,
  listDocuments,
  loadActivityContext,
  loadDocument,
  saveActivityContext,
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

async function verifyActivitySession(request, env) {
  if (!env.DB) return { error: json({ error: 'Database unavailable' }, 503) };

  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId) return { error: json({ error: 'Activity instance required' }, 401) };

  let context = await loadActivityContext(env.DB, instanceId);
  if (context) return { instanceId, context };

  // LAUNCH_ACTIVITY can open the iframe before Discord exposes the new
  // activity_instance_id back to the interaction callback. The Activity itself,
  // however, receives the server-generated message component custom_id in its
  // launch URL. Use that capability to repair the missing instance -> document
  // mapping exactly once. Existing mappings are never overwritten here.
  const documentId = launchDocumentId(request);
  if (!documentId) return { error: json({ error: 'Activity session not recognized' }, 403) };

  const document = await loadDocument(env.DB, documentId);
  if (!document) return { error: json({ error: 'Launch document not found' }, 404) };

  await saveActivityContext(env.DB, instanceId, documentId);
  context = { instanceId, documentId };
  return { instanceId, context };
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

  const encoded = pathname.slice(DOCS_API_PREFIX.length + 1);
  if (!encoded || encoded.includes('/')) return null;

  try {
    const id = normalizeDocumentId(decodeURIComponent(encoded));
    return id ? { collection: false, id } : null;
  } catch {
    return null;
  }
}

export async function handleDocsApi(request, url, env) {
  const route = parsePath(url.pathname);
  if (!route) return null;

  const session = await verifyActivitySession(request, env);
  if (session.error) return session.error;

  if (route.collection && request.method === 'GET') {
    const documents = await listDocuments(env.DB, 150);
    const contextDocumentId = session.context.documentId || null;

    // The Discord message is the source of truth for production. A document can
    // be archived from the library and must still open forever from its old
    // Discord message, so always hydrate the context document explicitly.
    if (contextDocumentId && !documents.some(document => document.id === contextDocumentId)) {
      const contextDocument = await loadDocument(env.DB, contextDocumentId);
      if (contextDocument) documents.unshift(contextDocument);
    }

    return json({
      documents: documents.map(serialize),
      contextDocumentId,
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
      createdBy: 'activity',
    });
    await updateDocumentContent(env.DB, documentId, {
      ...normalized,
      updatedAt: now,
    });

    return json(serialize(await loadDocument(env.DB, documentId)), 201);
  }

  const existing = await loadDocument(env.DB, route.id);
  if (!existing) return json({ error: 'Document not found' }, 404);

  if (request.method === 'GET') {
    return json(serialize(existing));
  }

  if (request.method === 'PATCH' || request.method === 'PUT') {
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }

    const normalized = normalizeEditorPayload(payload, existing);
    if (normalized.error) return json({ error: normalized.error }, normalized.status || 400);

    await updateDocumentContent(env.DB, route.id, normalized);
    return json(serialize(await loadDocument(env.DB, route.id)));
  }

  if (request.method === 'DELETE') {
    // Soft-delete only. The D1 row and its ID stay intact so Discord messages
    // already pointing to this document continue to work forever.
    await archiveDocument(env.DB, route.id);
    return json({ ok: true, archived: true, id: route.id });
  }

  return new Response('Method not allowed', { status: 405 });
}
