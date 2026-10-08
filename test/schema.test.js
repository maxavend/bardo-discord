// Replays every migration on a fresh SQLite database and checks that all SQL
// the Worker sends to D1 compiles against the resulting schema. This is what
// `wrangler d1 migrations apply` does on a brand-new database (local dev,
// staging, CI), and it catches columns/tables that no migration creates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import * as db from '../src/db.js';
import {createTestDb, MIGRATIONS_DIR, migrationFiles} from './helpers/sqlite-d1.js';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('todas las migraciones se aplican en orden sobre una base SQLite vacía', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const files = migrationFiles();
  assert.ok(files.length >= 12, 'se esperaban al menos 12 migraciones');
  for (const file of files) {
    assert.doesNotThrow(
      () => sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')),
      `la migración ${file} falla sobre una base nueva`,
    );
  }

  const columns = table => sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  assert.ok(columns('documents').includes('updated_at'));
  assert.ok(columns('documents').includes('updated_by_name'));
  assert.ok(columns('planner_live_sessions').includes('state_json'));
});

test('los nombres de migración son únicos y correlativos', () => {
  const files = migrationFiles();
  const numbers = files.map(file => Number(file.slice(0, 4)));
  numbers.forEach((number, index) => assert.equal(number, index + 1, `numeración rota en ${files[index]}`));
});

function extractPreparedSql(source) {
  const statements = [];
  const pattern = /\.prepare\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  let match;
  while ((match = pattern.exec(source))) {
    const literal = match[1];
    const line = source.slice(0, match.index).split('\n').length;
    statements.push({sql: literal.slice(1, -1), interpolated: literal.startsWith('`') && literal.includes('${'), line});
  }
  return statements;
}

test('cada SQL literal de src/ compila contra el esquema final', () => {
  const sqlite = createTestDb().sqlite;
  const interpolatedOutsideDb = [];
  let checked = 0;

  for (const file of readdirSync(SRC_DIR).filter(name => name.endsWith('.js'))) {
    const source = readFileSync(path.join(SRC_DIR, file), 'utf8');
    for (const statement of extractPreparedSql(source)) {
      if (statement.interpolated) {
        // Dynamic SQL is only allowed in db.js, whose exports are all executed
        // against the real schema by the next test.
        if (file !== 'db.js') interpolatedOutsideDb.push(`${file}:${statement.line}`);
        continue;
      }
      checked += 1;
      assert.doesNotThrow(
        () => sqlite.prepare(statement.sql.replace(/\\'/g, "'")),
        `${file}:${statement.line} no compila: ${statement.sql.replace(/\s+/g, ' ').slice(0, 120)}`,
      );
    }
  }

  assert.ok(checked > 20, `se esperaban más sentencias SQL (encontradas ${checked})`);
  assert.deepEqual(interpolatedOutsideDb, []);
});

test('cada export de db.js ejecuta su SQL contra el esquema final sin errores de columnas', async () => {
  const d1 = createTestDb();
  const doc = {
    title: 'Doc', description: 'd', originalMarkdown: '# Doc\n\nx', pages: ['x'], sourceName: null,
    createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u1', createdByName: 'U', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const planner = {
    id: 's1', guildId: 'g1', channelId: 'c1', title: 'Reu', blocks: [], createdBy: 'u1', updatedBy: 'u1',
  };

  const calls = {
    toString: null,
    insertDocumentStatement: () => d1.batch([db.insertDocumentStatement(d1, 'd2', doc, {bytes: new Uint8Array([1]), type: 'pdf'})]),
    isUniqueConstraintError: () => db.isUniqueConstraintError(new Error('UNIQUE constraint failed')),
    saveDocument: () => db.saveDocument(d1, 'd1', doc),
    saveDocumentSource: () => db.saveDocumentSource(d1, 'd1', {bytes: new Uint8Array([1, 2]), type: 'pdf'}),
    loadDocument: () => db.loadDocument(d1, 'd1'),
    documentExists: () => db.documentExists(d1, 'd1'),
    listDocumentsForChannel: async () => {
      await db.listDocumentsForChannel(d1, 'g1', 'c1');
      await db.listDocumentsForChannel(d1, 'g1', 'c1', {archived: true, summary: true});
    },
    updateDocumentContent: () => db.updateDocumentContent(d1, 'd1', doc, {baseUpdatedAt: 'x'}),
    archiveDocument: () => db.archiveDocument(d1, 'd1'),
    deleteDocumentPermanently: () => db.deleteDocumentPermanently(d1, 'd-none'),
    restoreDocument: () => db.restoreDocument(d1, 'd1'),
    loadDocumentSource: () => db.loadDocumentSource(d1, 'd1'),
    cacheNormalizedDocument: () => db.cacheNormalizedDocument(d1, 'd1', '# x', ['x']),
    grantDocumentGuildAccessStatement: () => db.grantDocumentGuildAccessStatement(d1, 'd1', 'g1').run(),
    grantDocumentGuildAccess: () => db.grantDocumentGuildAccess(d1, 'd1', 'g1'),
    grantDocumentChannelAccessStatement: () => db.grantDocumentChannelAccessStatement(d1, 'd1', 'g1', 'c1').run(),
    grantDocumentChannelAccess: () => db.grantDocumentChannelAccess(d1, 'd1', 'g1', 'c1'),
    listDocumentGuildIds: () => db.listDocumentGuildIds(d1, 'd1'),
    listDocumentChannelAccess: () => db.listDocumentChannelAccess(d1, 'd1', 'g1'),
    documentHasChannelAccess: () => db.documentHasChannelAccess(d1, 'd1', 'g1', 'c1'),
    adoptLegacyDocumentsForGuild: () => db.adoptLegacyDocumentsForGuild(d1, 'g1'),
    hasAnyDocumentGuildAccess: () => db.hasAnyDocumentGuildAccess(d1),
    documentHasGuildAccess: () => db.documentHasGuildAccess(d1, 'd1', 'g1'),
    saveDocsLaunchIntent: () => db.saveDocsLaunchIntent(d1, 'u1', 'g1', 'd1', 'c1'),
    loadRecentDocsLaunchIntent: () => db.loadRecentDocsLaunchIntent(d1, 'u1', 'g1'),
    deleteDocsLaunchIntent: () => db.deleteDocsLaunchIntent(d1, 'u1', 'g1', 'target:planner'),
    saveDocsSession: () => db.saveDocsSession(d1, 'h', {userId: 'u1', guildId: 'g1', createdAt: 'x', expiresAt: 'y'}),
    loadDocsSession: () => db.loadDocsSession(d1, 'h'),
    deleteDocsSession: () => db.deleteDocsSession(d1, 'h'),
    deleteExpiredDocsSessions: () => db.deleteExpiredDocsSessions(d1),
    saveActivityContext: () => db.saveActivityContext(d1, 'i1', 'd1'),
    loadActivityContext: () => db.loadActivityContext(d1, 'i1'),
    savePlannerSession: () => db.savePlannerSession(d1, planner),
    updatePlannerSession: () => db.updatePlannerSession(d1, planner, {baseUpdatedAt: 'x'}),
    loadPlannerSessionOwner: () => db.loadPlannerSessionOwner(d1, 's1'),
    loadPlannerSession: () => db.loadPlannerSession(d1, 's1', 'g1', 'c1'),
    listPlannerSessionsForChannel: () => db.listPlannerSessionsForChannel(d1, 'g1', 'c1'),
    listArchivedPlannerSessionsForChannel: () => db.listArchivedPlannerSessionsForChannel(d1, 'g1', 'c1'),
    restorePlannerSession: () => db.restorePlannerSession(d1, 's1', 'g1', 'c1', 'u1'),
    archivePlannerSession: () => db.archivePlannerSession(d1, 's1', 'g1', 'c1', 'u1'),
    saveLiveSessionState: async () => {
      // Exports run alphabetically, so the meeting may already be deleted.
      await db.savePlannerSession(d1, planner);
      for (const status of ['running', 'paused', 'completed', 'idle', 'interrupted']) {
        await db.saveLiveSessionState(d1, {sessionId: 's1', guildId: 'g1', channelId: 'c1', status, stateJson: '{}'});
      }
    },
    loadLiveSessionState: () => db.loadLiveSessionState(d1, 's1'),
    deletePlannerSessionPermanently: () => db.deletePlannerSessionPermanently(d1, 's1', 'g1', 'c1'),
    cleanupExpiredRecords: () => db.cleanupExpiredRecords(d1),
  };

  const exported = Object.entries(db).filter(([, value]) => typeof value === 'function').map(([name]) => name);
  const missing = exported.filter(name => !calls[name]);
  assert.deepEqual(missing, [], 'añade los nuevos exports de db.js a este test');

  for (const name of exported) {
    await assert.doesNotReject(async () => calls[name](), `${name} falló contra el esquema real`);
  }
});
