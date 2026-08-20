import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceParticipantsAtomic,
  reorderBlocksAtomic,
  reorderItemsAtomic,
} from '../src/event-integrity.js';

function integrityDb({ blockIds = ['block-a', 'block-b'], itemIds = ['item-a', 'item-b'], failBatch = false } = {}) {
  const state = { batchCalls: [], directRuns: 0 };
  const db = {
    state,
    prepare(query) {
      return {
        bind(...params) {
          return {
            query,
            params,
            async first() {
              if (query.includes('FROM event_blocks WHERE id = ? AND event_id = ?')) {
                return blockIds.includes(params[0]) ? { id: params[0] } : null;
              }
              return null;
            },
            async all() {
              if (query.includes('SELECT id FROM event_blocks WHERE event_id = ?')) {
                return { results: blockIds.map((id) => ({ id })) };
              }
              if (query.includes('SELECT id FROM event_items WHERE block_id = ?')) {
                return { results: itemIds.map((id) => ({ id })) };
              }
              if (query.includes('FROM event_participants')) return { results: [] };
              if (query.includes('SELECT * FROM event_blocks')) return { results: [] };
              if (query.includes('SELECT * FROM event_items')) return { results: [] };
              return { results: [] };
            },
            async run() {
              state.directRuns += 1;
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements) {
      state.batchCalls.push(statements.map((statement) => ({ query: statement.query, params: statement.params })));
      if (failBatch) throw new Error('simulated D1 batch failure');
      return statements.map(() => ({ success: true }));
    },
  };
  return db;
}

test('participant replacement validates first and executes delete+inserts+touch as one D1 batch', async () => {
  const db = integrityDb();
  await replaceParticipantsAtomic(db, 'event-1', [
    { userId: 'u1', displayName: 'Max' },
    { userId: 'u2', displayName: 'Paula', role: 'optional' },
    { userId: 'u1', displayName: 'Duplicado ignorado' },
  ]);

  assert.equal(db.state.batchCalls.length, 1);
  assert.equal(db.state.directRuns, 0);
  const batch = db.state.batchCalls[0];
  assert.equal(batch.length, 4);
  assert.match(batch[0].query, /DELETE FROM event_participants/);
  assert.match(batch[1].query, /INSERT INTO event_participants/);
  assert.match(batch[2].query, /INSERT INTO event_participants/);
  assert.match(batch[3].query, /UPDATE events SET updated_at/);
});

test('block reorder rejects incomplete/duplicate identity sets before any write', async () => {
  const incomplete = integrityDb();
  await assert.rejects(
    reorderBlocksAtomic(incomplete, 'event-1', ['block-a']),
    /exactamente los bloques/i,
  );
  assert.equal(incomplete.state.batchCalls.length, 0);
  assert.equal(incomplete.state.directRuns, 0);

  const duplicate = integrityDb();
  await assert.rejects(
    reorderBlocksAtomic(duplicate, 'event-1', ['block-a', 'block-a']),
    /duplicados/i,
  );
  assert.equal(duplicate.state.batchCalls.length, 0);
});

test('item reorder validates ownership and commits all positions atomically', async () => {
  const db = integrityDb();
  await reorderItemsAtomic(db, 'event-1', 'block-a', ['item-b', 'item-a']);
  assert.equal(db.state.batchCalls.length, 1);
  const batch = db.state.batchCalls[0];
  assert.equal(batch.length, 3);
  assert.match(batch[0].query, /UPDATE event_items SET position/);
  assert.equal(batch[0].params[0], 0);
  assert.equal(batch[0].params[2], 'item-b');
  assert.equal(batch[1].params[0], 1);
  assert.equal(batch[1].params[2], 'item-a');
});

test('critical multi-write surfaces D1 batch failure and never falls back to partial direct writes', async () => {
  const db = integrityDb({ failBatch: true });
  await assert.rejects(
    replaceParticipantsAtomic(db, 'event-1', [{ userId: 'u1', displayName: 'Max' }]),
    /simulated D1 batch failure/,
  );
  assert.equal(db.state.batchCalls.length, 1);
  assert.equal(db.state.directRuns, 0);
});
