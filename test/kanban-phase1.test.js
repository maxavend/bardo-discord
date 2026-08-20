import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestHarness } from 'wrangler';
import {
  ColumnTasksRequireDestinationError,
  createBoard,
  createTask,
  loadBoardWithTasks,
  updateBoardColumns,
} from '../src/kanban-db.js';

test('custom Kanban columns are authoritative end-to-end in real local D1', async () => {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
  await server.listen();
  try {
    const runtime = server.getWorker('bardo-discord');
    await runtime.applyD1Migrations('DB');
    const env = await runtime.getEnv();

    await createBoard(env.DB, {
      id: 'phase1-board',
      guildId: '123456789012345678',
      name: 'Phase 1 Board',
      columns: [
        { id: 'ideas', label: 'Ideas', color: '#8a8e9b' },
        { id: 'design', label: 'Diseño', color: '#eb459e' },
        { id: 'qa', label: 'QA', color: '#f0b232' },
        { id: 'done', label: 'Hecho', color: '#23a55a' },
      ],
      createdBy: 'user-1',
    });

    const task = await createTask(env.DB, {
      id: 'phase1-task',
      boardId: 'phase1-board',
      title: 'Validar custom column',
      status: 'design',
      priority: 'medium',
      createdBy: 'user-1',
    });
    assert.equal(task.status, 'design');

    const raw = await env.DB.prepare('SELECT status, column_id FROM tasks WHERE id = ?').bind('phase1-task').first();
    assert.equal(raw.column_id, 'design');
    assert.equal(raw.status, 'backlog');

    await assert.rejects(
      createTask(env.DB, {
        id: 'invalid-task',
        boardId: 'phase1-board',
        title: 'Invalid target',
        status: 'invented-column',
        createdBy: 'user-1',
      }),
      (error) => error?.code === 'INVALID_KANBAN_COLUMN',
    );

    const nextColumns = [
      { id: 'ideas', label: 'Ideas', color: '#8a8e9b' },
      { id: 'qa', label: 'QA', color: '#f0b232' },
      { id: 'done', label: 'Hecho', color: '#23a55a' },
    ];

    await assert.rejects(
      updateBoardColumns(env.DB, 'phase1-board', nextColumns),
      (error) => error instanceof ColumnTasksRequireDestinationError && error.affectedCount === 1,
    );

    await updateBoardColumns(env.DB, 'phase1-board', nextColumns, { moveTasksTo: 'qa' });
    const board = await loadBoardWithTasks(env.DB, 'phase1-board');
    assert.equal(board.columns.some((column) => column.id === 'design'), false);
    assert.equal(board.tasks[0].status, 'qa');
  } finally {
    await server.close();
  }
});
