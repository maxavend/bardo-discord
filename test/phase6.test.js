import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emitStructuredLog } from '../src/lib/observability.js';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 6 Activity boot keeps adaptive polling and product modules lazy', () => {
  const main = read('src/activity/main.js');
  const polling = read('src/activity/resource-polling.js');
  assert.match(main, /import '\.\/resource-polling\.js'/);
  assert.match(main, /await import\('\.\/board\.js'\)/);
  assert.match(main, /await import\('\.\/event\.js'\)/);
  assert.match(main, /await import\('\.\/app\.js'\)/);
  assert.match(main, /await import\('\.\/planner-member-directory\.js'\)/);
  assert.match(polling, /5_000/);
  assert.match(polling, /12_000/);
  assert.match(polling, /30_000/);
  assert.match(polling, /60_000/);
  assert.match(polling, /If-None-Match/);
  assert.match(polling, /__bardoPlannerData/);
});

test('Planner people are searched remotely, including the first person in an empty list', () => {
  const picker = read('src/activity/planner-member-directory.js');
  const p6 = read('src/p6-entry.js');
  const build = read('scripts/build-activity.js');
  assert.match(picker, /\/api\/member-directory\?query=/);
  assert.match(picker, /RESULT_LIMIT = 25/);
  assert.match(picker, /rememberMember/);
  assert.match(picker, /export function inferCheckboxName/);
  assert.match(picker, /lideran/);
  assert.match(picker, /protagonistas\|presentan/);
  assert.match(picker, /participantes/);
  assert.doesNotMatch(picker, /if \(!firstCheckbox\?\.name\) return/);
  assert.match(p6, /referencedEventPeople/);
  assert.match(p6, /guildMembers/);
  assert.doesNotMatch(p6, /fetchGuildMembers/);
  assert.match(build, /src\/activity\/planner-member-directory\.js/);
});

test('structured logs drop titles, content, user ids and arbitrary fields', async () => {
  const records = [];
  const original = console.log;
  console.log = (line) => records.push(JSON.parse(line));
  try {
    await emitStructuredLog('http.request', {
      requestId: 'req-1',
      route: '/api/documents/:id',
      entityType: 'document',
      status: 200,
      durationMs: 12,
      guildHash: 'abcdef',
      title: 'Documento privado',
      content: 'Contenido privado',
      userId: '123456789012345678',
      arbitrarySecret: 'secret',
    }, { ENVIRONMENT: 'test' });
  } finally {
    console.log = original;
  }
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    event: 'http.request',
    environment: 'test',
    requestId: 'req-1',
    route: '/api/documents/:id',
    entityType: 'document',
    status: 200,
    durationMs: 12,
    guildHash: 'abcdef',
  });
});

test('notification telemetry records outcomes without recipient or entity ids', () => {
  const source = read('src/services/notifications.js');
  const helper = source.slice(source.indexOf('async function deliveryLog'), source.indexOf('async function taskMessage'));
  assert.match(helper, /notification\.delivery/);
  assert.match(helper, /notificationType/);
  assert.match(helper, /deliveryStatus/);
  assert.doesNotMatch(helper, /userId/);
  assert.doesNotMatch(helper, /entityId/);
});

test('Wrangler executes Phase 6 and keeps staging resources isolated and inert', () => {
  const config = JSON.parse(read('wrangler.jsonc'));
  const productionDb = config.d1_databases.find((entry) => entry.binding === 'DB');
  const stagingDb = config.env.staging.d1_databases.find((entry) => entry.binding === 'DB');
  const productionR2 = config.r2_buckets.find((entry) => entry.binding === 'BACKUPS');
  const stagingR2 = config.env.staging.r2_buckets.find((entry) => entry.binding === 'BACKUPS');
  assert.equal(config.main, 'src/p6-entry.js');
  assert.equal(config.env.staging.name, 'bardo-discord-staging');
  assert.notEqual(stagingDb.database_id, productionDb.database_id);
  assert.notEqual(stagingDb.database_name, productionDb.database_name);
  assert.notEqual(stagingR2.bucket_name, productionR2.bucket_name);
  assert.deepEqual(config.env.staging.triggers.crons, []);
  assert.equal(config.env.staging.vars.BARDO_STAGING_RESOURCE_STATE, 'unprovisioned');
});
