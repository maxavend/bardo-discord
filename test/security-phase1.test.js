import test from 'node:test';
import assert from 'node:assert/strict';
import securityWorker from '../src/security-worker.js';
import { createActivitySessionToken, verifyActivitySessionToken } from '../src/auth/session-token.js';
import { ACTIVITY_ACTIONS, verifyActivityAccess } from '../src/auth/activity-access.js';
import { handleDiscordOAuthExchange } from '../src/auth/discord-oauth.js';
import { getMemberRoleBadge } from '../src/activity/member-role.js';

const SECRET = 'phase1-test-secret-that-is-long-enough';
const FUTURE = '2099-08-20T23:00:00.000Z';
const GUILD_A = '123456789012345678';
const GUILD_B = '223456789012345678';

function contextDb({ target = 'doc-1', guildId = null, permissions = null, board = null, tasks = [] } = {}) {
  const contextPermissions = permissions || (
    target.startsWith('board:')
      ? ['context.read', 'board.read', 'board.write', 'member.read', 'role.read', 'task.write']
      : target.startsWith('event:')
        ? ['context.read', 'event.read', 'event.write', 'task.write']
        : ['context.read', 'document.read', 'document.edit', 'document.export', 'document.source', 'document.normalize']
  );

  return {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM activity_contexts')) {
                if (params[0] !== 'inst-1') return null;
                return {
                  instance_id: 'inst-1',
                  document_id: target,
                  created_at: '2026-08-20T23:00:00.000Z',
                  guild_id: guildId,
                  expires_at: FUTURE,
                  permissions: JSON.stringify(contextPermissions),
                };
              }
              if (query.includes('FROM boards WHERE id = ?')) {
                if (!board || params[0] !== board.id) return null;
                return {
                  id: board.id,
                  guild_id: board.guildId,
                  name: board.name || 'Board',
                  description: '',
                  columns: JSON.stringify(board.columns || [
                    { id: 'backlog', label: 'Backlog', color: '#8a8e9b' },
                    { id: 'done', label: 'Hecho', color: '#23a55a' },
                  ]),
                  members: '[]',
                  created_by: 'user-1',
                  created_at: '2026-08-20T23:00:00.000Z',
                  updated_at: '2026-08-20T23:00:00.000Z',
                };
              }
              return null;
            },
            async all() {
              if (query.includes('FROM tasks WHERE board_id = ?')) {
                return { results: tasks.map((task, index) => ({
                  id: task.id || `task-${index}`,
                  board_id: board?.id,
                  title: task.title || 'Task',
                  description: '',
                  status: 'backlog',
                  column_id: task.status || 'backlog',
                  priority: 'medium',
                  assignee_id: null,
                  assignee_name: null,
                  labels: '[]',
                  position: index,
                  created_by: 'user-1',
                  created_at: '2026-08-20T23:00:00.000Z',
                  updated_at: '2026-08-20T23:00:00.000Z',
                })) };
              }
              return { results: [] };
            },
            async run() { return { success: true }; },
          };
        },
      };
    },
  };
}

function documentDb() {
  const state = {
    document: {
      id: 'doc-1',
      title: 'Documento seguro',
      original_markdown: '# Documento seguro\n\nContenido',
      pages: JSON.stringify(['Contenido']),
      source_name: 'seguro.md',
      created_at: '2026-08-20T23:00:00.000Z',
      created_by: 'user-1',
      source_mime: null,
      source_type: 'markdown',
      import_status: 'ready',
      has_source: 0,
    },
  };

  return {
    state,
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM activity_contexts')) {
                if (params[0] !== 'inst-1') return null;
                return {
                  instance_id: 'inst-1',
                  document_id: 'doc-1',
                  created_at: '2026-08-20T23:00:00.000Z',
                  guild_id: null,
                  expires_at: FUTURE,
                  permissions: JSON.stringify(['context.read', 'document.read', 'document.edit', 'document.export', 'document.source', 'document.normalize']),
                };
              }
              if (query.includes('FROM documents WHERE id = ?')) {
                return params[0] === 'doc-1' ? { ...state.document } : null;
              }
              if (query.includes('SELECT guild_id FROM events WHERE minute_document_id')) return null;
              return null;
            },
            async run() {
              if (query.includes('UPDATE documents SET title = ?')) {
                const [title, markdown, pages, id] = params;
                if (id === 'doc-1') {
                  state.document.title = title;
                  state.document.original_markdown = markdown;
                  state.document.pages = pages;
                }
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

async function signedRequest(url, { instance = 'inst-1', userId = 'user-1', guildId = null, method = 'GET', body = null } = {}) {
  const token = await createActivitySessionToken({
    secret: SECRET,
    instanceId: instance,
    userId,
    guildId,
    expiresInSeconds: 3600,
  });
  return new Request(url, {
    method,
    headers: {
      'x-bardo-instance-id': instance,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('Activity session token is bound to instance, rejects tampering and expires', async () => {
  const now = Date.now();
  const token = await createActivitySessionToken({
    secret: SECRET,
    instanceId: 'inst-1',
    userId: 'user-1',
    guildId: GUILD_A,
    expiresInSeconds: 120,
    now,
  });
  const valid = await verifyActivitySessionToken(token, { secret: SECRET, expectedInstanceId: 'inst-1', now: now + 30_000 });
  assert.equal(valid.sub, 'user-1');
  assert.equal(valid.guild, GUILD_A);
  assert.equal(await verifyActivitySessionToken(token, { secret: SECRET, expectedInstanceId: 'inst-2', now }), null);

  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(await verifyActivitySessionToken(tampered, { secret: SECRET, expectedInstanceId: 'inst-1', now }), null);
  assert.equal(await verifyActivitySessionToken(token, { secret: SECRET, expectedInstanceId: 'inst-1', now: now + 180_000 }), null);
});

test('central Activity guard authorizes the exact document and hides metadata on mismatch', async () => {
  const request = await signedRequest('https://bardo.test/api/documents/doc-1');
  const env = { DB: contextDb(), DISCORD_CLIENT_SECRET: SECRET };
  const allowed = await verifyActivityAccess(request, env, {
    action: ACTIVITY_ACTIONS.DOCUMENT_READ,
    resourceType: 'document',
    resourceId: 'doc-1',
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.userId, 'user-1');

  const denied = await verifyActivityAccess(request, env, {
    action: ACTIVITY_ACTIONS.DOCUMENT_READ,
    resourceType: 'document',
    resourceId: 'private-doc-uuid',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.response.status, 403);
  const body = await denied.response.text();
  assert.equal(body.includes('private-doc-uuid'), false);
  assert.equal(body.includes('doc-1'), false);
});

test('all private API families reject UUID-only or anonymous access before resource disclosure', async () => {
  const env = { DB: {}, DISCORD_CLIENT_SECRET: SECRET };
  const cases = [
    ['GET', '/api/documents/doc-uuid'],
    ['PATCH', '/api/documents/doc-uuid'],
    ['GET', '/api/documents/doc-uuid/export?format=pdf'],
    ['GET', '/api/documents/doc-uuid/source'],
    ['POST', '/api/documents/doc-uuid/normalize'],
    ['GET', '/api/activity-context/instance-uuid'],
    ['GET', '/api/boards/board-uuid'],
    ['GET', '/api/boards/board-uuid/guild-members'],
    ['GET', '/api/boards/board-uuid/guild-roles'],
    ['PATCH', '/api/boards/board-uuid'],
    ['PATCH', '/api/tasks/task-uuid'],
    ['DELETE', '/api/tasks/task-uuid'],
    ['GET', '/api/events'],
    ['POST', '/api/events'],
    ['GET', '/api/events/event-uuid'],
    ['PATCH', '/api/events/event-uuid'],
  ];

  for (const [method, path] of cases) {
    const hasBody = ['POST', 'PATCH'].includes(method);
    const response = await securityWorker.fetch(new Request(`https://bardo.test${path}`, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? '{}' : undefined,
    }), env);
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: 'Activity authorization required' });
  }
});

test('legitimate document reader/editor/exporter continues through the protected entry point', async () => {
  const db = documentDb();
  const env = { DB: db, DISCORD_CLIENT_SECRET: SECRET };

  const read = await securityWorker.fetch(await signedRequest('https://bardo.test/api/documents/doc-1'), env);
  assert.equal(read.status, 200);
  const document = await read.json();
  assert.equal(document.id, 'doc-1');
  assert.equal(document.title, 'Documento seguro');

  const edit = await securityWorker.fetch(await signedRequest('https://bardo.test/api/documents/doc-1', {
    method: 'PATCH',
    body: { title: 'Documento editado', markdown: '# Documento editado\n\nSeguro' },
  }), env);
  assert.equal(edit.status, 200);
  assert.equal(db.state.document.title, 'Documento editado');

  const exported = await securityWorker.fetch(await signedRequest('https://bardo.test/api/documents/doc-1/export?format=markdown'), env);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.match(await exported.text(), /Documento editado/);
});

test('board access denies cross-guild context and normal board polling excludes guild directories', async () => {
  const mismatchEnv = {
    DB: contextDb({ target: 'board:board-1', guildId: GUILD_A, board: { id: 'board-1', guildId: GUILD_B } }),
    BARDO_TEST_AUTH_BYPASS: '1',
  };
  const mismatch = await securityWorker.fetch(new Request('https://bardo.test/api/boards/board-1', {
    headers: { 'x-bardo-instance-id': 'inst-1' },
  }), mismatchEnv);
  assert.equal(mismatch.status, 403);

  const env = {
    DB: contextDb({
      target: 'board:board-1',
      guildId: GUILD_A,
      board: { id: 'board-1', guildId: GUILD_A },
      tasks: [{ id: 'task-1', title: 'Private task' }],
    }),
    BARDO_TEST_AUTH_BYPASS: '1',
  };
  const response = await securityWorker.fetch(new Request('https://bardo.test/api/boards/board-1', {
    headers: { 'x-bardo-instance-id': 'inst-1' },
  }), env);
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.id, 'board-1');
  assert.equal(board.tasks.length, 1);
  assert.equal('guildMembers' in board, false);
  assert.equal('guildRoles' in board, false);
});

test('Discord OAuth exchange derives guild authorization server-side and signs the Bardo session', async () => {
  const db = contextDb({ target: 'board:board-1', board: { id: 'board-1', guildId: GUILD_A } });
  const env = {
    DB: db,
    DISCORD_APPLICATION_ID: 'app-1',
    DISCORD_CLIENT_SECRET: SECRET,
    DISCORD_TOKEN: 'bot-token',
  };
  const request = new Request('https://bardo.test/api/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': 'inst-1',
      'x-bardo-guild-id': GUILD_A,
    },
    body: JSON.stringify({ code: 'oauth-code' }),
  });

  const fakeFetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/api/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'discord-access', token_type: 'Bearer', expires_in: 1800, scope: 'identify' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (value.endsWith('/api/oauth2/@me')) {
      return new Response(JSON.stringify({ application: { id: 'app-1' }, user: { id: 'user-1' }, scopes: ['identify'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (value.includes(`/guilds/${GUILD_A}/members/user-1`)) return new Response('{}', { status: 200 });
    return new Response('{}', { status: 404 });
  };

  const response = await handleDiscordOAuthExchange(request, env, fakeFetch);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.access_token, 'discord-access');
  const session = await verifyActivitySessionToken(payload.session_token, {
    secret: SECRET,
    expectedInstanceId: 'inst-1',
  });
  assert.equal(session.sub, 'user-1');
  assert.equal(session.guild, GUILD_A);
});

test('Discord OAuth exchange rejects a user who is not a member of the target guild', async () => {
  const db = contextDb({ target: 'board:board-1', board: { id: 'board-1', guildId: GUILD_A } });
  const env = { DB: db, DISCORD_APPLICATION_ID: 'app-1', DISCORD_CLIENT_SECRET: SECRET, DISCORD_TOKEN: 'bot-token' };
  const request = new Request('https://bardo.test/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bardo-instance-id': 'inst-1' },
    body: JSON.stringify({ code: 'oauth-code' }),
  });
  const fakeFetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/api/oauth2/token')) return new Response(JSON.stringify({ access_token: 'discord-access', scope: 'identify' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (value.endsWith('/api/oauth2/@me')) return new Response(JSON.stringify({ application: { id: 'app-1' }, user: { id: 'user-1' }, scopes: ['identify'] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('{}', { status: 404 });
  };
  const response = await handleDiscordOAuthExchange(request, env, fakeFetch);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Activity authorization required' });
});

test('member role badge helper is module-scoped and has robust unresolved-role fallback', () => {
  const roles = [
    { id: 'role-a', name: 'Design', color: '#123456' },
    { id: 'role-b', name: 'Frontend', color: '#654321' },
  ];
  assert.deepEqual(getMemberRoleBadge({ roles: ['role-b'] }, roles), roles[1]);
  assert.equal(getMemberRoleBadge({ roles: ['missing-role'] }, roles), null);
  assert.equal(getMemberRoleBadge({ roles: [] }, roles), null);
  assert.equal(getMemberRoleBadge(null, roles), null);
});
