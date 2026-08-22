import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';
import { defaultPermissionsForTarget } from '../src/auth/activity-access.js';
import { saveActivityContext } from '../src/db.js';
import { boardTarget } from '../src/kanban.js';
import { eventTarget } from '../src/event.js';
import { createBoard, createTask } from '../src/kanban-db.js';
import { createBlock, createEvent, createItem } from '../src/event-db.js';
import p6Entry from '../src/p6-entry.js';

const GUILD = '123456789012345678';
const INSTANCE = 'phase6-instance';

async function withRuntime(run) {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  await server.listen();
  try {
    const runtime = server.getWorker('bardo-discord');
    await runtime.applyD1Migrations('DB');
    const env = await runtime.getEnv();
    env.BARDO_TEST_AUTH_BYPASS = '1';
    await run(env);
  } catch (error) {
    server.debug();
    throw error;
  } finally {
    await server.close();
  }
}

function request(path, etag = null) {
  const headers = { 'x-bardo-instance-id': INSTANCE, Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  return new Request(`https://bardo.test${path}`, { headers });
}

async function createBoardFixture(env) {
  await createBoard(env.DB, {
    id: 'board-1', guildId: GUILD, name: 'Producto', description: 'Roadmap', createdBy: 'test-user',
  });
  await createTask(env.DB, {
    id: 'task-1', boardId: 'board-1', title: 'Optimizar Bardo', status: 'todo', priority: 'high', createdBy: 'test-user',
  });
}

test('Phase 6 board GET omits server directory and revalidates with ETag/304', async () => withRuntime(async (env) => {
  await createBoardFixture(env);
  await saveActivityContext(env.DB, INSTANCE, boardTarget('board-1'), {
    guildId: GUILD,
    permissions: defaultPermissionsForTarget(boardTarget('board-1')),
  });

  const first = await p6Entry.fetch(request('/api/boards/board-1'), env, { waitUntil() {} });
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const payload = await first.json();
  assert.equal(payload.name, 'Producto');
  assert.equal(payload.tasks.length, 1);
  assert.equal('guildMembers' in payload, false);
  assert.equal('guildRoles' in payload, false);

  const second = await p6Entry.fetch(request('/api/boards/board-1', etag), env, { waitUntil() {} });
  assert.equal(second.status, 304);
  assert.equal(second.headers.get('etag'), etag);
}));

test('Phase 6 planner GET sends only people already referenced and revalidates with ETag/304', async () => withRuntime(async (env) => {
  await createBoardFixture(env);
  await createEvent(env.DB, {
    id: 'event-1', guildId: GUILD, title: 'Weekly', eventDate: '2026-08-28', startTime: '10:00',
    timezone: 'America/Santiago', expectedDuration: 60, createdBy: 'test-user',
    participants: [{ userId: '100000000000000001', displayName: 'Participante' }],
  });
  const block = await createBlock(env.DB, 'event-1', {
    title: 'Diseño', durationMinutes: 20, type: 'discussion',
    leads: [{ userId: '100000000000000002', displayName: 'Lead' }],
  });
  await createItem(env.DB, block.id, {
    title: 'Demo', durationMinutes: 10,
    speakers: [{ userId: '100000000000000003', displayName: 'Speaker' }],
  });
  await saveActivityContext(env.DB, INSTANCE, eventTarget('event-1'), {
    guildId: GUILD,
    permissions: defaultPermissionsForTarget(eventTarget('event-1')),
  });

  const first = await p6Entry.fetch(request('/api/events/event-1'), env, { waitUntil() {} });
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const payload = await first.json();
  assert.deepEqual(payload.guildMembers.map((member) => member.userId).sort(), [
    '100000000000000001',
    '100000000000000002',
    '100000000000000003',
  ]);
  assert.equal(payload.boards.length, 1);

  const second = await p6Entry.fetch(request('/api/events/event-1', etag), env, { waitUntil() {} });
  assert.equal(second.status, 304);
  assert.equal(second.headers.get('etag'), etag);
}));
