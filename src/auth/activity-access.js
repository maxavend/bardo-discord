import { loadActivityContext } from '../db.js';
import { parseBoardTarget } from '../kanban.js';
import { parseEventTarget } from '../event.js';
import { readBearerToken, verifyActivitySessionToken } from './session-token.js';

export const ACTIVITY_ACTIONS = Object.freeze({
  CONTEXT_READ: 'context.read',
  DOCUMENT_READ: 'document.read',
  DOCUMENT_EDIT: 'document.edit',
  DOCUMENT_EXPORT: 'document.export',
  DOCUMENT_SOURCE: 'document.source',
  DOCUMENT_NORMALIZE: 'document.normalize',
  BOARD_READ: 'board.read',
  BOARD_WRITE: 'board.write',
  MEMBER_READ: 'member.read',
  ROLE_READ: 'role.read',
  TASK_WRITE: 'task.write',
  EVENT_READ: 'event.read',
  EVENT_WRITE: 'event.write',
});

export function defaultPermissionsForTarget(target) {
  if (parseBoardTarget(target)) {
    return [
      ACTIVITY_ACTIONS.CONTEXT_READ,
      ACTIVITY_ACTIONS.BOARD_READ,
      ACTIVITY_ACTIONS.BOARD_WRITE,
      ACTIVITY_ACTIONS.MEMBER_READ,
      ACTIVITY_ACTIONS.ROLE_READ,
      ACTIVITY_ACTIONS.TASK_WRITE,
    ];
  }
  if (parseEventTarget(target)) {
    return [
      ACTIVITY_ACTIONS.CONTEXT_READ,
      ACTIVITY_ACTIONS.EVENT_READ,
      ACTIVITY_ACTIONS.EVENT_WRITE,
      ACTIVITY_ACTIONS.TASK_WRITE,
    ];
  }
  return [
    ACTIVITY_ACTIONS.CONTEXT_READ,
    ACTIVITY_ACTIONS.DOCUMENT_READ,
    ACTIVITY_ACTIONS.DOCUMENT_EDIT,
    ACTIVITY_ACTIONS.DOCUMENT_EXPORT,
    ACTIVITY_ACTIONS.DOCUMENT_SOURCE,
    ACTIVITY_ACTIONS.DOCUMENT_NORMALIZE,
  ];
}

function authJson(status) {
  return new Response(JSON.stringify({ error: 'Activity authorization required' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function readActivityInstanceId(request) {
  const instanceId = request.headers.get('x-bardo-instance-id')?.trim() || '';
  if (!instanceId || instanceId.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(instanceId)) return null;
  return instanceId;
}

function contextHasPermission(context, action) {
  const permissions = Array.isArray(context?.permissions) && context.permissions.length
    ? context.permissions
    : defaultPermissionsForTarget(context?.documentId);
  return permissions.includes(action);
}

export function contextTargetsResource(context, resourceType, resourceId) {
  if (!context || !resourceId) return false;
  if (resourceType === 'document') return context.documentId === resourceId;
  if (resourceType === 'board') return parseBoardTarget(context.documentId) === resourceId;
  if (resourceType === 'event') return parseEventTarget(context.documentId) === resourceId;
  if (resourceType === 'context') return context.instanceId === resourceId;
  return false;
}

export function verifySessionResource(session, {
  resourceType,
  resourceId,
  guildId = null,
} = {}) {
  if (!session?.context || !contextTargetsResource(session.context, resourceType, resourceId)) return authJson(403);

  const contextGuild = session.context.guildId || null;
  const tokenGuild = session.token.guild || null;
  const targetGuild = guildId ? String(guildId) : null;
  if (contextGuild && targetGuild && contextGuild !== targetGuild) return authJson(403);
  if (tokenGuild && targetGuild && tokenGuild !== targetGuild) return authJson(403);
  if (contextGuild && tokenGuild && contextGuild !== tokenGuild) return authJson(403);
  return null;
}

export async function verifyActivityAccess(request, env, {
  action,
  resourceType = 'context',
  resourceId = null,
  guildId = null,
} = {}) {
  if (!env?.DB) return { ok: false, response: authJson(401) };

  const instanceId = readActivityInstanceId(request);
  if (!instanceId) return { ok: false, response: authJson(401) };
  const context = await loadActivityContext(env.DB, instanceId);
  if (!context) return { ok: false, response: authJson(401) };

  if (context.expiresAt) {
    const expiresAt = Date.parse(context.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { ok: false, response: authJson(401) };
  }
  if (!contextHasPermission(context, action)) return { ok: false, response: authJson(403) };

  if (env.BARDO_TEST_AUTH_BYPASS === '1') {
    const testToken = { sub: 'test-user', instance: instanceId, guild: guildId ? String(guildId) : context.guildId || null };
    const session = { context, token: testToken, instanceId, userId: testToken.sub };
    const resourceError = resourceId ? verifySessionResource(session, { resourceType, resourceId, guildId }) : null;
    return resourceError ? { ok: false, response: resourceError } : { ok: true, ...session };
  }

  const bearer = readBearerToken(request);
  const signingSecret = env.BARDO_SESSION_SECRET || env.DISCORD_CLIENT_SECRET;
  if (!bearer || !signingSecret) return { ok: false, response: authJson(401) };
  const token = await verifyActivitySessionToken(bearer, {
    secret: signingSecret,
    expectedInstanceId: instanceId,
  });
  if (!token) return { ok: false, response: authJson(401) };

  const session = { context, token, instanceId, userId: token.sub };
  const resourceError = resourceId ? verifySessionResource(session, { resourceType, resourceId, guildId }) : null;
  if (resourceError) return { ok: false, response: resourceError };
  return { ok: true, ...session };
}
