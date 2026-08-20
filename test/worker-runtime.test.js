import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';

test('Cloudflare Worker boots with Phase 1 migrations, protects private routes and dispatches scheduled work', async () => {
  const server = createTestHarness({
    workers: [{ configPath: './wrangler.jsonc' }],
  });

  await server.listen();

  try {
    const runtime = server.getWorker('bardo-discord');
    await runtime.applyD1Migrations('DB');

    const env = await runtime.getEnv();
    const documentTable = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'")
      .first();
    const eventTable = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
      .first();
    const activityColumns = await env.DB.prepare('PRAGMA table_info(activity_contexts)').all();
    const taskColumns = await env.DB.prepare('PRAGMA table_info(tasks)').all();

    assert.equal(documentTable?.name, 'documents');
    assert.equal(eventTable?.name, 'events');
    assert.ok((activityColumns.results || []).some((column) => column.name === 'permissions'));
    assert.ok((activityColumns.results || []).some((column) => column.name === 'expires_at'));
    assert.ok((taskColumns.results || []).some((column) => column.name === 'column_id'));

    const missingIdentity = await server.fetch('/api/documents/phase1-runtime-private');
    assert.equal(missingIdentity.status, 401);
    const privateBody = await missingIdentity.json();
    assert.equal(privateBody.error, 'Activity authorization required');

    await runtime.scheduled({
      cron: '*/5 * * * *',
      scheduledTime: new Date('2026-08-20T23:00:00.000Z'),
    });
  } catch (error) {
    server.debug();
    throw error;
  } finally {
    await server.close();
  }
});
