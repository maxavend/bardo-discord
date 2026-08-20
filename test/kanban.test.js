import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARDO_BOARD_PREFIX,
  boardTarget,
  normalizeKanbanStatus,
  parseBoardTarget,
  parseLabels,
  statusLabel,
} from '../src/kanban.js';

test('parseLabels limpia duplicados, espacios y limita chips', () => {
  assert.deepEqual(
    parseLabels(' UX, urgente, ux,  Backend ,QA, Diseño, docs, extra '),
    ['UX', 'urgente', 'Backend', 'QA', 'Diseño', 'docs'],
  );
});

test('normalizeKanbanStatus acepta las cuatro columnas y usa fallback', () => {
  assert.equal(normalizeKanbanStatus('doing'), 'doing');
  assert.equal(normalizeKanbanStatus('DONE'), 'done');
  assert.equal(normalizeKanbanStatus('inventado'), 'backlog');
  assert.equal(normalizeKanbanStatus('inventado', null), null);
});

test('board target funciona para custom_id y contexto de Activity', () => {
  const id = 'abc-123';
  assert.equal(parseBoardTarget(`${BARDO_BOARD_PREFIX}${id}`), id);
  assert.equal(boardTarget(id), `board:${id}`);
  assert.equal(parseBoardTarget(boardTarget(id)), id);
  assert.equal(parseBoardTarget('bardo:open:abc-123'), null);
});

test('statusLabel entrega etiquetas legibles', () => {
  assert.equal(statusLabel('backlog'), 'Backlog');
  assert.equal(statusLabel('todo'), 'Por hacer');
  assert.equal(statusLabel('doing'), 'En curso');
  assert.equal(statusLabel('done'), 'Hecho');
});
