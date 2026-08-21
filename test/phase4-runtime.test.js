import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';
import { ACTIVITY_ACTIONS, defaultPermissionsForTarget } from '../src/auth/activity-access.js';
import { saveActivityContext, saveDocument, loadActivityContext, loadDocument } from '../src/db.js';
import { createBoard, createTask, loadTask } from '../src/kanban-db.js';
import { createBlock, createEvent, createItem, linkTaskToEvent } from '../src/event-db.js';
import { eventTarget } from '../src/event.js';
import { homeTarget } from '../src/home-target.js';
import { EntityLinkService, grantDocumentToGuild } from '../src/services/entity-links.js';
import p4Entry, { handleDocumentTask, handleHomeSection, handleProductNavigation } from '../src/p4-entry.js';

const GUILD = '123456789012345678';
const OTHER_GUILD = '323456789012345678';
const INSTANCE = 'phase4-instance';

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
  } finally { await server.close(); }
}

function request(path, { method = 'GET', body } = {}) {
  return new Request(`https://bardo.test${path}`, {
    method,
    headers: { 'x-bardo-instance-id': INSTANCE, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fixture(env) {
  const document = { title:'Documento fuente', originalMarkdown:'# Documento fuente\n\nDecidir el alcance.', pages:['Decidir el alcance.'], sourceName:'fuente.md', createdAt:new Date().toISOString(), createdBy:'test-user' };
  await saveDocument(env.DB, 'doc-1', document);
  await grantDocumentToGuild(env.DB, 'doc-1', GUILD, 'test-user');
  await createBoard(env.DB, { id:'board-1', guildId:GUILD, name:'Producto', description:'', createdBy:'test-user' });
  await createBoard(env.DB, { id:'board-other', guildId:OTHER_GUILD, name:'Otro', description:'', createdBy:'other' });
  await createEvent(env.DB, { id:'event-1', guildId:GUILD, title:'Weekly', eventDate:'2026-08-28', startTime:'15:30', timezone:'America/Santiago', expectedDuration:60, createdBy:'test-user' });
  await saveActivityContext(env.DB, INSTANCE, 'doc-1', { guildId:GUILD, permissions:defaultPermissionsForTarget('doc-1') });
}

test('Phase 4 migrations create entity graph, durable document grants and task due date', async () => withRuntime(async (env) => {
  const links = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_links'").first();
  const grants = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_guild_access'").first();
  const due = await env.DB.prepare("SELECT name FROM pragma_table_info('tasks') WHERE name='due_at'").first();
  assert.equal(links?.name, 'entity_links');
  assert.equal(grants?.name, 'document_guild_access');
  assert.equal(due?.name, 'due_at');
}));

test('entity links are idempotent and reject cross-guild relationships', async () => withRuntime(async (env) => {
  await fixture(env);
  await createTask(env.DB, { id:'task-1', boardId:'board-1', title:'Acción', status:'todo', createdBy:'test-user' });
  await createTask(env.DB, { id:'task-other', boardId:'board-other', title:'Ajena', status:'todo', createdBy:'other' });
  const service = new EntityLinkService(env);
  const first = await service.create({ guildId:GUILD, sourceType:'event', sourceId:'event-1', targetType:'task', targetId:'task-1', relationType:'event_has_task', createdBy:'test-user' });
  const second = await service.create({ guildId:GUILD, sourceType:'event', sourceId:'event-1', targetType:'task', targetId:'task-1', relationType:'event_has_task', createdBy:'test-user' });
  assert.equal(first.id, second.id);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM entity_links WHERE relation_type='event_has_task'").first();
  assert.equal(Number(count.count), 1);
  await assert.rejects(() => service.create({ guildId:GUILD, sourceType:'event', sourceId:'event-1', targetType:'task', targetId:'task-other', relationType:'event_has_task', createdBy:'test-user' }), /mismo servidor/);
}));

test('navigation switches the Activity target only after same-guild validation', async () => withRuntime(async (env) => {
  await fixture(env);
  let response = await handleProductNavigation(request('/api/navigation', { method:'POST', body:{ type:'board', id:'board-1' } }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).route, '/?board=board-1');
  assert.equal((await loadActivityContext(env.DB, INSTANCE)).documentId, 'bardo:board:board-1');

  response = await handleProductNavigation(request('/api/navigation', { method:'POST', body:{ type:'board', id:'board-other' } }), env);
  assert.equal(response.status, 404);
  assert.equal((await loadActivityContext(env.DB, INSTANCE)).documentId, 'bardo:board:board-1');

  await saveActivityContext(env.DB, INSTANCE, homeTarget(GUILD), { guildId:GUILD, permissions:Object.values(ACTIVITY_ACTIONS) });
  response = await handleProductNavigation(request('/api/navigation', { method:'POST', body:{ type:'document', id:'doc-1' } }), env);
  assert.equal(response.status, 200);
  assert.equal((await loadActivityContext(env.DB, INSTANCE)).documentId, 'doc-1');
}));

test('Document → Task persists limited context, due date, backlink and safe undo', async () => withRuntime(async (env) => {
  await fixture(env);
  const created = await handleDocumentTask(request('/api/documents/doc-1/tasks', { method:'POST', body:{ boardId:'board-1', title:'Definir alcance', dueAt:'2026-08-29', excerpt:'A'.repeat(900) } }), env, { waitUntil() {} }, 'doc-1');
  assert.equal(created.status, 201);
  const payload = await created.json();
  const row = await env.DB.prepare('SELECT due_at, description FROM tasks WHERE id = ?').bind(payload.task.id).first();
  assert.equal(row.due_at, '2026-08-29');
  assert.ok(row.description.includes('Contexto del documento:'));
  assert.ok(row.description.length < 700);
  const link = await env.DB.prepare("SELECT relation_type FROM entity_links WHERE source_id='doc-1' AND target_id=?").bind(payload.task.id).first();
  assert.equal(link.relation_type, 'task_from_document');

  const undone = await handleDocumentTask(request(`/api/documents/doc-1/tasks/${payload.task.id}`, { method:'DELETE' }), env, {}, 'doc-1', payload.task.id);
  assert.equal(undone.status, 200);
  assert.equal(await loadTask(env.DB, payload.task.id), null);
}));

test('Home sections are scoped to the verified guild and current user', async () => withRuntime(async (env) => {
  await fixture(env);
  await createTask(env.DB, { id:'mine', boardId:'board-1', title:'Mi tarea', status:'todo', assigneeId:'test-user', assigneeName:'Test', createdBy:'test-user' });
  await createTask(env.DB, { id:'not-mine', boardId:'board-1', title:'Otra tarea', status:'todo', assigneeId:'someone-else', assigneeName:'Other', createdBy:'test-user' });
  await saveActivityContext(env.DB, INSTANCE, homeTarget(GUILD), { guildId:GUILD, permissions:Object.values(ACTIVITY_ACTIONS) });
  const response = await handleHomeSection(request('/api/home/tasks?limit=5'), env, 'tasks');
  assert.equal(response.status, 200);
  const titles = (await response.json()).items.map((item) => item.title);
  assert.deepEqual(titles, ['Mi tarea']);
  const documents = await handleHomeSection(request('/api/home/documents?limit=5'), env, 'documents');
  assert.deepEqual((await documents.json()).items.map((item) => item.id), ['doc-1']);
}));

test('Event → Task keeps point origin and minutes regenerate an idempotent live-task section', async () => withRuntime(async (env) => {
  await fixture(env);
  const block = await createBlock(env.DB, 'event-1', { title:'Decisiones', durationMinutes:20, type:'decision' });
  const item = await createItem(env.DB, block.id, { title:'Definir owner' });
  await saveActivityContext(env.DB, INSTANCE, eventTarget('event-1'), { guildId:GUILD, permissions:defaultPermissionsForTarget(eventTarget('event-1')) });

  let response = await p4Entry.fetch(request('/api/events/event-1/tasks', { method:'POST', body:{ boardId:'board-1', title:'Asignar owner', blockId:block.id, itemId:item.id, assigneeId:'test-user', assigneeName:'Test' } }), env, { waitUntil() {} });
  assert.equal(response.status, 201);
  const task = (await response.json()).task;
  const origin = await env.DB.prepare('SELECT block_id, item_id FROM event_task_links WHERE task_id = ?').bind(task.id).first();
  assert.equal(origin.block_id, block.id);
  assert.equal(origin.item_id, item.id);
  assert.equal((await env.DB.prepare("SELECT relation_type FROM entity_links WHERE source_id='event-1' AND target_id=?").bind(task.id).first()).relation_type, 'event_has_task');

  response = await p4Entry.fetch(request('/api/events/event-1/minutes', { method:'POST', body:{} }), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const minuteId = (await response.json()).documentId;
  let minute = await loadDocument(env.DB, minuteId);
  assert.equal((minute.originalMarkdown.match(/<!-- bardo:linked-tasks -->/g) || []).length, 1);
  assert.match(minute.originalMarkdown, /Asignar owner/);
  assert.match(minute.originalMarkdown, /Bardo task:/);
  assert.equal((await env.DB.prepare("SELECT relation_type FROM entity_links WHERE source_type='task' AND source_id=? AND target_id=?").bind(task.id, minuteId).first()).relation_type, 'task_references_document');

  await env.DB.prepare("UPDATE tasks SET column_id='done' WHERE id=?").bind(task.id).run();
  response = await p4Entry.fetch(request('/api/events/event-1/minutes', { method:'POST', body:{} }), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  minute = await loadDocument(env.DB, minuteId);
  assert.equal((minute.originalMarkdown.match(/<!-- bardo:linked-tasks -->/g) || []).length, 1);
  assert.match(minute.originalMarkdown, /— done/);
  const linkCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM entity_links WHERE target_id=? AND relation_type='task_references_document'").bind(minuteId).first();
  assert.equal(Number(linkCount.count), 1);
}));
