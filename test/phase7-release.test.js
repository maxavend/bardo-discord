import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const MIGRATION_BLOBS = {
  '0001_create_documents.sql': '2de8fea70f698148149053dd11dd52c8c6fcdbcc',
  '0002_create_activity_contexts.sql': '3cdb184cffa518df296906a6b1c9a930d6f7fe14',
  '0003_add_import_sources.sql': '850c820f75816b812abdd3323137041abaca8a0f',
  '0004_create_kanban.sql': '06d6b676bce3b07fa9d6170b0d6fa9b3d673a868',
  '0005_add_task_priority.sql': 'eed084909915a2d3a0b5b0726385d435d979a1c4',
  '0006_add_board_columns.sql': 'a3afbf24a7d02d93a90f1eac21c0fb8627a67b38',
  '0007_add_board_members.sql': 'ab846219f34a7b1ac606cf57114322a5227857e3',
  '0008_create_events.sql': '5d08b5845420ab80e277c376f2516d372e857c41',
  '0009_activity_context_authorization.sql': '874692e0e54ff4229c05734d67e2b29ba98feb10',
  '0010_add_task_column_id.sql': 'e4650b9302a030c1da08c939c58bc1d51a5a8b43',
  '0011_create_notifications.sql': '453a36318652b5521d32fe35c87c3e64f921a542',
  '0012_create_entity_links.sql': 'bb40b76be304acc54d1787b643bd134747a8aad7',
  '0013_add_task_due_at.sql': 'de58381968ff722efeb48fe378e770bd3852ca60',
  '0014_document_guild_access.sql': '3a01344a2dffb84dac975a4ea47c0ee5653c7ebe',
  '0015_document_version_history.sql': '3bb9eb77fad10c92cdec95501c1c6410974e114a',
};

test('Phase 7 freezes all historical migrations instead of editing applied history', () => {
  const files = readdirSync('migrations').filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  assert.deepEqual(files, Object.keys(MIGRATION_BLOBS));
  for (const [file, expected] of Object.entries(MIGRATION_BLOBS)) {
    const actual = execFileSync('git', ['hash-object', `migrations/${file}`], { encoding: 'utf8' }).trim();
    assert.equal(actual, expected, `${file} changed; use a new forward-only migration instead`);
  }
});

test('release commands require an explicit target environment', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.deploy, /bloqueado/);
  assert.match(pkg.scripts['deploy:staging'], /wrangler deploy --env staging/);
  assert.match(pkg.scripts['deploy:production'], /wrangler deploy --env production/);
});

test('Phase 7 keeps the central security regression suite and new migration gate in CI', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:worker'], /security-phase1\.test\.js/);
  assert.match(pkg.scripts['test:worker'], /phase7-runtime\.test\.js/);
  assert.match(pkg.scripts['test:unit'], /phase7-release\.test\.js/);
  assert.match(pkg.scripts['check:release'], /release-readiness\.js/);
});

test('release gate cannot silently claim RELEASE_READY without remote and human evidence', () => {
  const source = read('scripts/release-readiness.js');
  assert.match(source, /BARDO_STAGING_RESOURCES_PROVISIONED/);
  assert.match(source, /BARDO_STAGING_MIGRATIONS_VALIDATED/);
  assert.match(source, /BARDO_DISCORD_PILOT_VALIDATED/);
  assert.match(source, /BARDO_HUMAN_RELEASE_APPROVED/);
  assert.match(source, /RELEASE_BLOCKED/);
  assert.match(source, /--require-release-ready/);
});

test('release runbook documents forward-only recovery and explicit abort conditions', () => {
  const runbook = read('docs/release-runbook.md');
  assert.match(runbook, /forward-only/i);
  assert.match(runbook, /compensating migration|migraci[oó]n compensatoria/i);
  assert.match(runbook, /backup/i);
  assert.match(runbook, /rollback/i);
  assert.match(runbook, /Discord/i);
  assert.match(runbook, /ABORT/i);
});
