import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createTestHarness } from 'wrangler';

const MIGRATIONS = readdirSync('migrations').filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const PROD_BASELINE = MIGRATIONS.filter((name) => Number(name.slice(0, 4)) <= 8);
const PLAN_MIGRATIONS = MIGRATIONS.filter((name) => Number(name.slice(0, 4)) >= 9);

async function withBlankRuntime(run) {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  await server.listen();
  try {
    const runtime = server.getWorker('bardo-discord');
    const env = await runtime.getEnv();
    await run(env);
  } catch (error) {
    server.debug();
    throw error;
  } finally {
    await server.close();
  }
}

function executableMigrationSql(file) {
  return readFileSync(`migrations/${file}`, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .trim();
}

async function apply(db, files) {
  for (const file of files) {
    const sql = executableMigrationSql(file);
    assert.ok(sql, `${file} must contain executable SQL`);
    await db.exec(sql);
  }
}

async function tableExists(db, name) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
  return row?.name === name;
}

async function columnExists(db, table, column) {
  const row = await db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name=?`).bind(column).first();
  return row?.name === column;
}

test('Phase 7 applies all 15 migrations from an empty D1 and yields the release schema', async () => withBlankRuntime(async (env) => {
  await apply(env.DB, MIGRATIONS);
  for (const table of ['documents', 'activity_contexts', 'boards', 'tasks', 'events', 'notification_preferences', 'notification_deliveries', 'entity_links', 'document_guild_access', 'document_revisions']) {
    assert.equal(await tableExists(env.DB, table), true, `${table} must exist after a fresh migration`);
  }
  assert.equal(await columnExists(env.DB, 'tasks', 'column_id'), true);
  assert.equal(await columnExists(env.DB, 'tasks', 'due_at'), true);
  assert.equal(await columnExists(env.DB, 'documents', 'version'), true);
  assert.equal(await columnExists(env.DB, 'documents', 'updated_at'), true);
}));

test('Phase 7 upgrades representative pre-plan production data (0001-0008) through 0015 without loss', async () => withBlankRuntime(async (env) => {
  await apply(env.DB, PROD_BASELINE);
  const now = '2026-08-20T12:00:00.000Z';
  await env.DB.prepare(`INSERT INTO documents (id,title,original_markdown,pages,source_name,created_at,created_by) VALUES (?,?,?,?,?,?,?)`)
    .bind('prod-doc', 'Documento producción', '# Producción', '["Producción"]', 'prod.md', now, 'user-1').run();
  await env.DB.prepare(`INSERT INTO boards (id,guild_id,name,description,created_by,created_at,updated_at,columns,members) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind('prod-board', 'guild-1', 'Producción', '', 'user-1', now, now, '[{"id":"doing","name":"En curso"}]', '[]').run();
  await env.DB.prepare(`INSERT INTO tasks (id,board_id,title,description,status,assignee_id,assignee_name,labels,position,created_by,created_at,updated_at,priority) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind('prod-task', 'prod-board', 'Tarea existente', '', 'doing', 'user-1', 'User', '[]', 0, 'user-1', now, now, 'high').run();
  await env.DB.prepare(`INSERT INTO events (id,guild_id,title,description,event_date,start_time,timezone,starts_at,duration_minutes,status,channel_id,created_by,minute_document_id,started_at,finished_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind('prod-event', 'guild-1', 'Evento existente', '', '2026-08-25', '10:00', 'America/Santiago', '2026-08-25T14:00:00.000Z', 60, 'scheduled', null, 'user-1', null, null, null, now, now).run();

  await apply(env.DB, PLAN_MIGRATIONS);

  const counts = {};
  for (const table of ['documents', 'boards', 'tasks', 'events']) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
    counts[table] = Number(row.count);
  }
  assert.deepEqual(counts, { documents: 1, boards: 1, tasks: 1, events: 1 });

  const task = await env.DB.prepare('SELECT status, column_id, priority, due_at FROM tasks WHERE id=?').bind('prod-task').first();
  assert.equal(task.status, 'doing');
  assert.equal(task.column_id, 'doing');
  assert.equal(task.priority, 'high');
  assert.equal(task.due_at, null);

  const document = await env.DB.prepare('SELECT title, version, updated_at FROM documents WHERE id=?').bind('prod-doc').first();
  assert.equal(document.title, 'Documento producción');
  assert.equal(Number(document.version), 1);
  assert.equal(document.updated_at, now);

  assert.equal(await tableExists(env.DB, 'notification_deliveries'), true);
  assert.equal(await tableExists(env.DB, 'entity_links'), true);
  assert.equal(await tableExists(env.DB, 'document_guild_access'), true);
  assert.equal(await tableExists(env.DB, 'document_revisions'), true);
}));
