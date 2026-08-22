import p4Entry from './p4-entry.js';
import { ACTIVITY_ACTIONS, verifyActivityAccess } from './auth/activity-access.js';
import { normalizeDocumentId } from './document-id.js';
import { saveNormalizedBackupToR2 } from './backup-r2.js';
import {
  DocumentPreconditionError,
  DocumentVersionConflictError,
  DocumentVersionService,
} from './services/document-versioning.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function etag(version) { return `"bardo-doc-${Number(version || 1)}"`; }

function expectedVersionFrom(request, payload = null) {
  const raw = request.headers.get('if-match')?.trim() || '';
  const match = raw.match(/^(?:W\/)?"?(?:bardo-doc-)?(\d+)"?$/i);
  if (match) return Number(match[1]);
  const bodyVersion = Number(payload?.expectedVersion);
  return Number.isInteger(bodyVersion) && bodyVersion > 0 ? bodyVersion : null;
}

function parseRoute(pathname) {
  if (!pathname.startsWith('/api/documents/')) return null;
  const raw = pathname.slice('/api/documents/'.length).split('/').filter(Boolean);
  if (!raw.length) return null;
  try {
    const documentId = normalizeDocumentId(decodeURIComponent(raw[0]));
    if (!documentId) return null;
    return { documentId, parts: raw.slice(1).map(decodeURIComponent) };
  } catch { return null; }
}

async function authorize(request, env, documentId, action) {
  const access = await verifyActivityAccess(request, env, {
    action,
    resourceType: 'document',
    resourceId: documentId,
  });
  return access.ok ? access : { response: access.response };
}

function publicDocument(document) {
  return {
    id: document.id,
    title: document.title,
    markdown: document.originalMarkdown,
    sourceName: document.sourceName,
    sourceType: document.sourceType,
    sourceMime: document.sourceMime,
    importStatus: document.importStatus,
    hasSource: document.hasSource,
    createdAt: document.createdAt,
    version: document.version,
    updatedAt: document.updatedAt,
    lastEditedBy: document.lastEditedBy,
  };
}

function errorResponse(error) {
  if (error instanceof DocumentPreconditionError || error?.code === 'DOCUMENT_VERSION_REQUIRED') {
    return json({ error: error.message, code: 'DOCUMENT_VERSION_REQUIRED' }, 428);
  }
  if (error instanceof DocumentVersionConflictError || error?.code === 'DOCUMENT_VERSION_CONFLICT') {
    return json({
      error: 'El documento cambió desde que abriste esta versión.',
      code: 'DOCUMENT_VERSION_CONFLICT',
      currentVersion: error.currentVersion,
      updatedAt: error.updatedAt,
      lastEditedBy: error.lastEditedBy,
      title: error.title,
    }, 409);
  }
  if (error?.code === 'DOCUMENT_TOO_LARGE') return json({ error: error.message, code: error.code }, 413);
  return json({ error: error instanceof Error ? error.message : 'Document update failed' }, 400);
}

function ownBackup(ctx, work) {
  const safe = work.catch((error) => console.warn('No se pudo actualizar el backup del documento:', error));
  if (typeof ctx?.waitUntil === 'function') { ctx.waitUntil(safe); return null; }
  return safe;
}

async function handleDocumentRead(request, env, documentId) {
  const access = await authorize(request, env, documentId, ACTIVITY_ACTIONS.DOCUMENT_READ);
  if (access.response) return access.response;
  const document = await new DocumentVersionService(env).get(documentId);
  if (!document) return json({ error: 'Not found' }, 404);
  return json(publicDocument(document), 200, { ETag: etag(document.version) });
}

async function handleDocumentUpdate(request, env, ctx, documentId) {
  const access = await authorize(request, env, documentId, ACTIVITY_ACTIONS.DOCUMENT_EDIT);
  if (access.response) return access.response;
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  const expectedVersion = expectedVersionFrom(request, payload);
  try {
    const service = new DocumentVersionService(env);
    const document = await service.update(documentId, { ...payload, expectedVersion }, {
      actorUserId: access.userId,
      reason: payload.reason || 'edit',
    });
    if (!document) return json({ error: 'Not found' }, 404);
    const backup = ownBackup(ctx, saveNormalizedBackupToR2(env, documentId, document));
    if (backup) await backup;
    return json({ ok: true, document: publicDocument(document) }, 200, { ETag: etag(document.version) });
  } catch (error) { return errorResponse(error); }
}

async function handleHistory(request, env, documentId) {
  const access = await authorize(request, env, documentId, ACTIVITY_ACTIONS.DOCUMENT_READ);
  if (access.response) return access.response;
  const limit = new URL(request.url).searchParams.get('limit');
  const history = await new DocumentVersionService(env).history(documentId, limit);
  return history ? json(history) : json({ error: 'Not found' }, 404);
}

async function handleRestore(request, env, ctx, documentId, revisionId) {
  const access = await authorize(request, env, documentId, ACTIVITY_ACTIONS.DOCUMENT_EDIT);
  if (access.response) return access.response;
  const payload = await request.json().catch(() => ({}));
  const expectedVersion = expectedVersionFrom(request, payload);
  try {
    const service = new DocumentVersionService(env);
    const document = await service.restore(documentId, revisionId, expectedVersion, { actorUserId: access.userId });
    if (!document) return json({ error: 'Revision not found' }, 404);
    const backup = ownBackup(ctx, saveNormalizedBackupToR2(env, documentId, document));
    if (backup) await backup;
    return json({ ok: true, document: publicDocument(document) }, 200, { ETag: etag(document.version) });
  } catch (error) { return errorResponse(error); }
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);
    const route = parseRoute(url.pathname);
    if (route) {
      if (route.parts.length === 0 && request.method === 'GET') return handleDocumentRead(request, env, route.documentId);
      if (route.parts.length === 0 && request.method === 'PATCH') return handleDocumentUpdate(request, env, ctx, route.documentId);
      if (route.parts.length === 1 && route.parts[0] === 'history' && request.method === 'GET') return handleHistory(request, env, route.documentId);
      if (route.parts.length === 3 && route.parts[0] === 'history' && route.parts[2] === 'restore' && request.method === 'POST') {
        return handleRestore(request, env, ctx, route.documentId, route.parts[1]);
      }
    }
    return p4Entry.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx = { waitUntil: () => {} }) { return p4Entry.scheduled(event, env, ctx); },
};
