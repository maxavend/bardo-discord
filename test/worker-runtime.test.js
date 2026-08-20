import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';

test('Cloudflare Worker boots with real local bindings, D1 migrations and scheduled handler', async () => {
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

    assert.equal(documentTable?.name, 'documents');
    assert.equal(eventTable?.name, 'events');

    const missingDocument = await server.fetch('/api/documents/phase0-runtime-missing');
    assert.equal(missingDocument.status, 404);

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
