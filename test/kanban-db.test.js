// kanban-db.js arma SQL dinámico: cada export se ejecuta aquí contra el
// esquema real de las migraciones (igual que db.js en schema.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as kdb from '../src/kanban-db.js';
import {createTestDb} from './helpers/sqlite-d1.js';

test('cada export de kanban-db.js ejecuta su SQL contra el esquema final', async () => {
  const d1 = createTestDb();
  const board = await kdb.ensureKanbanBoard(d1, 'g1', 'c1', 'u1');
  const {columns} = await kdb.loadKanbanStructure(d1, board.id);
  const [todo, doing] = columns;
  const card = {id: 'card-0001', columnId: todo.id, rank: 'V', title: 'Uno', tagIds: [], subtasks: [], docIds: [], sourceRef: 'planner:s:d'};

  const calls = {
    rowToCard: () => kdb.rowToCard(null),
    loadKanbanBoard: () => kdb.loadKanbanBoard(d1, 'g1', 'c1'),
    ensureKanbanBoard: () => kdb.ensureKanbanBoard(d1, 'g1', 'c1', 'u1'),
    loadKanbanStructure: () => kdb.loadKanbanStructure(d1, board.id),
    insertKanbanCard: () => kdb.insertKanbanCard(d1, board, card, 'u1'),
    listKanbanCards: async () => {
      await kdb.listKanbanCards(d1, board.id);
      await kdb.listKanbanCards(d1, board.id, {sinceRev: 0});
    },
    listArchivedKanbanCards: () => kdb.listArchivedKanbanCards(d1, board.id),
    listKanbanCardsBySource: () => kdb.listKanbanCardsBySource(d1, board.id, 'planner:s:'),
    loadKanbanCard: () => kdb.loadKanbanCard(d1, board.id, card.id),
    loadKanbanCardOwner: () => kdb.loadKanbanCardOwner(d1, card.id),
    loadKanbanCardScope: () => kdb.loadKanbanCardScope(d1, card.id),
    countActiveKanbanCards: () => kdb.countActiveKanbanCards(d1, board.id),
    rankForPosition: () => kdb.rankForPosition(d1, board.id, todo.id, {afterId: card.id}),
    rebalanceKanbanColumn: () => kdb.rebalanceKanbanColumn(d1, board.id, todo.id, 'u1'),
    patchKanbanCard: () => kdb.patchKanbanCard(d1, board.id, card.id, {
      title: 'Dos', description: 'd', priority: 'high', dueDate: '2026-10-20', tagIds: [], subtasks: [], docIds: [],
      assignee: {id: '123456', name: 'Ana'},
    }, null, 'u1'),
    moveKanbanCard: () => kdb.moveKanbanCard(d1, board.id, card.id, doing.id, 'W', 'u1'),
    setKanbanCardArchived: async () => {
      await kdb.setKanbanCardArchived(d1, board.id, card.id, true, 'u1');
      await kdb.setKanbanCardArchived(d1, board.id, card.id, false, 'u1');
    },
    setKanbanCardMessageId: () => kdb.setKanbanCardMessageId(d1, board.id, card.id, 'm1'),
    addKanbanColumn: () => kdb.addKanbanColumn(d1, board.id, 'Nueva', 'u1'),
    renameKanbanColumn: () => kdb.renameKanbanColumn(d1, board.id, todo.id, 'Pendiente', 'u1'),
    setKanbanDoneColumn: () => kdb.setKanbanDoneColumn(d1, board.id, doing.id, 'u1'),
    reorderKanbanColumns: () => kdb.reorderKanbanColumns(d1, board.id, columns.map(column => column.id), 'u1'),
    deleteKanbanColumn: async () => {
      const id = await kdb.addKanbanColumn(d1, board.id, 'Temporal', 'u1');
      await kdb.deleteKanbanColumn(d1, board.id, id, todo.id, 'u1');
    },
    countKanbanCardsInColumn: () => kdb.countKanbanCardsInColumn(d1, board.id, todo.id),
    addKanbanTag: () => kdb.addKanbanTag(d1, board.id, {name: 'Bug', color: 'red'}, 'u1'),
    updateKanbanTag: () => kdb.updateKanbanTag(d1, board.id, 'nope', {name: 'X'}, 'u1'),
    deleteKanbanTag: () => kdb.deleteKanbanTag(d1, board.id, 'nope', 'u1'),
    claimKanbanNotification: () => kdb.claimKanbanNotification(d1, card.id, '123456', 'dm'),
    reclaimKanbanNotification: () => kdb.reclaimKanbanNotification(d1, card.id, '123456', 'dm'),
    finishKanbanNotification: () => kdb.finishKanbanNotification(d1, board.id, card.id, '123456', 'channel', {status: 'sent', messageId: 'm2'}),
    claimKanbanThread: () => kdb.claimKanbanThread(d1, board.id, card.id),
    releaseKanbanThreadClaim: () => kdb.releaseKanbanThreadClaim(d1, board.id, card.id),
    finishKanbanThread: () => kdb.finishKanbanThread(d1, board.id, card.id, 't1'),
  };

  const exported = Object.entries(kdb).filter(([, value]) => typeof value === 'function').map(([name]) => name);
  assert.deepEqual(exported.filter(name => !calls[name]), [], 'añade los nuevos exports de kanban-db.js a este test');
  for (const [name, call] of Object.entries(calls)) {
    await assert.doesNotReject(async () => call(), `${name} falló contra el esquema real`);
  }
});

test('dos tableros simultáneos del mismo canal terminan en uno solo con 3 columnas', async () => {
  const d1 = createTestDb();
  const [a, b] = await Promise.all([
    kdb.ensureKanbanBoard(d1, 'g1', 'c1', 'u1'),
    kdb.ensureKanbanBoard(d1, 'g1', 'c1', 'u2'),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(d1.row('SELECT COUNT(*) AS n FROM kanban_boards').n, 1);
  assert.equal(d1.row('SELECT COUNT(*) AS n FROM kanban_columns').n, 3);
});
