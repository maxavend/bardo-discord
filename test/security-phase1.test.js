import test from 'node:test';
import assert from 'node:assert/strict';
import securityWorker from '../src/security-worker.js';
import { createActivitySessionToken, verifyActivitySessionToken } from '../src/auth/session-token.js';
import { ACTIVITY_ACTIONS, verifyActivityAccess } from '../src/auth/activity-access.js';
import { getMemberRoleBadge } from '../src/activity/member-role.js';

const SECRET = 'phase1-test-secret-that-is-long-enough';
const FUTURE = '2099-08-20T23:00:00.000Z';

function contextDb({ target = 'doc-1', guildId = null, permissions = null, board = null, tasks = [] } = {}) {
  const contextPermissions = permissions || (
    target.startsWith('board:')
      ? ['context.read', 'board.read', 'board.write', 'member.read', 'role.read', 'task.write']
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

async function signedRequest(url, { instance = 'inst-1', userId = 'user-1', guildId = null } = {}) {
  const token = await createActivitySessionToken({
    secret: SECRET,
    instanceId: instance,
    userId,
    guildId,
    now: Date.parse('2026-08-20T23:00:00.000Z'),
  });
  return new Request(url, {
    headers: {
      'x-bardo-instance-id': instance,
      Authorization: `Bearer ${token}`,
    },
  });
}

test('Activity session token is bound to instance, rejects tampering and expires', async () => {
  const now = Date.parse('2026-08-20T23:00:00.000Z');
  const token = await createActivitySessionToken({
    secret: SECRET,
    instanceId: 'inst-1',
    userId: 'user-1',
    guildId: 'guild-a',
    expiresInSeconds: 120,
    now,
  });

  const valid = await verifyActivitySessionToken(token, {
    secret: SECRET,
    expectedInstanceId: 'inst-1',
    now: now + 30_000,
  });
  assert.equal(valid.sub, 'user-1');
  assert.equal(valid.guild, 'guild-a');
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

test('private document and Activity-context routes reject UUID/instance-only access', async () => {
  const env = { DB: contextDb(), DISCORD_CLIENT_SECRET: SECRET };
  const document = await securityWorker.fetch(new Request('https://bardo.test/api/documents/doc-1'), env);
  assert.equal(document.status, 401);
  assert.deepEqual(await document.json(), { error: 'Activity authorization required' });

  const context = await securityWorker.fetch(new Request('https://bardo.test/api/activity-context/inst-1'), env);
  assert.equal(context.status, 401);
  assert.deepEqual(await context.json(), { error: 'Activity authorization required' });
});

test('board access denies cross-guild context and normal board polling excludes guild directories', async () => {
  const mismatchEnv = {
    DB: contextDb({
      target: 'board:board-1',
      guildId: 'guild-a',
      board: { id: 'board-1', guildId: 'guild-b' },
    }),
    BARDO_TEST_AUTH_BYPASS: '1',
  };
  const mismatch = await securityWorker.fetch(new Request('https://bardo.test/api/boards/board-1', {
    headers: { 'x-bardo-instance-id': 'inst-1' },
  }), mismatchEnv);
  assert.equal(mismatch.status, 403);

  const env = {
    DB: contextDb({
      target: 'board:board-1',
      guildId: 'guild-a',
      board: { id: 'board-1', guildId: 'guild-a' },
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
