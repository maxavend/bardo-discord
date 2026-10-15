import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSIGNEE, OUTSIDER, setupKanban} from './helpers/kanban.js';
import {insertDocument} from './helpers/sqlite-d1.js';

const titlesByColumn = (cards, columnId) => cards
  .filter(card => card.columnId === columnId)
  .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
  .map(card => card.title);

test('el tablero se crea solo, con 3 columnas y una sola "Hecho"', async () => {
  const k = await setupKanban();
  const {board, cards, full} = await k.board();
  assert.deepEqual(board.columns.map(column => column.name), ['Por hacer', 'En curso', 'Hecho']);
  assert.deepEqual(board.columns.map(column => column.isDone), [false, false, true]);
  assert.deepEqual(cards, []);
  assert.equal(full, true);
  // Dos lecturas no duplican el tablero.
  await k.board();
  assert.equal(k.db.row('SELECT COUNT(*) AS n FROM kanban_columns').n, 3);
});

test('crear una tarjeta la numera, la deja en "Por hacer" y otro canal no la ve', async () => {
  const k = await setupKanban();
  const {status, json} = await k.createCard({title: '  Revisar presupuesto  ', priority: 'high', dueDate: '2026-10-20'});
  assert.equal(status, 201);
  assert.equal(json.card.title, 'Revisar presupuesto');
  assert.equal(json.card.number, 1);
  assert.equal(json.card.version, 1);
  const {board} = await k.board();
  assert.equal(json.card.columnId, board.columns[0].id);
  assert.equal((await k.createCard({title: 'Otra'})).json.card.number, 2);

  const other = await k.call('/board', {token: 'token-b'});
  assert.equal(other.status, 200);
  assert.deepEqual(other.json.cards, []);
  assert.equal((await k.call(`/cards/${json.card.id}`, {token: 'token-b'})).status, 404);
  assert.equal((await k.call(`/cards/${json.card.id}`, {method: 'PATCH', token: 'token-b', body: {title: 'x'}})).status, 404);
});

test('crear con id del cliente es idempotente', async () => {
  const k = await setupKanban();
  const id = 'client-card-0001';
  assert.equal((await k.createCard({id, title: 'Uno'})).status, 201);
  const again = await k.createCard({id, title: 'Uno (reintento)'});
  assert.equal(again.status, 200);
  assert.equal(again.json.card.title, 'Uno');
  assert.equal(k.db.row('SELECT COUNT(*) AS n FROM kanban_cards').n, 1);
  assert.equal((await k.call('/cards', {method: 'POST', token: 'token-b', body: {id, title: 'x'}})).status, 409);
});

test('validaciones: título, prioridad, fecha, subtareas y tamaño', async () => {
  const k = await setupKanban();
  assert.equal((await k.createCard({title: '   '})).json.error, 'title_required');
  assert.equal((await k.createCard({title: 'x', priority: 'max'})).json.error, 'invalid_priority');
  assert.equal((await k.createCard({title: 'x', dueDate: '2026-02-30'})).json.error, 'invalid_date');
  const many = Array.from({length: 31}, (_, i) => ({id: `s${i}`, text: 'paso'}));
  assert.equal((await k.createCard({title: 'x', subtasks: many})).json.error, 'subtask_limit');
  assert.equal((await k.createCard({title: 'x', assigneeId: 'no-es-id'})).json.error, 'invalid_assignee');
  const huge = JSON.stringify({title: 'x', description: 'a'.repeat(70 * 1024)});
  assert.equal((await k.call('/cards', {method: 'POST', body: huge})).status, 413);
});

test('PATCH con baseVersion: guarda, sube la versión y responde 409 con la tarjeta actual', async () => {
  const k = await setupKanban();
  const {card} = (await k.createCard({title: 'Original'})).json;
  const first = await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {baseVersion: 1, title: 'Editada'}});
  assert.equal(first.status, 200);
  assert.equal(first.json.card.version, 2);
  const stale = await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {baseVersion: 1, description: 'pisaría'}});
  assert.equal(stale.status, 409);
  assert.equal(stale.json.card.title, 'Editada');
  assert.equal(stale.json.card.description, '');
});

test('mover no cambia la versión: una edición con la versión anterior al movimiento sigue funcionando', async () => {
  const k = await setupKanban();
  const {board} = await k.board();
  const {card} = (await k.createCard({title: 'Mover y editar'})).json;
  const moved = await k.call(`/cards/${card.id}/move`, {method: 'POST', body: {columnId: board.columns[1].id}});
  assert.equal(moved.status, 200);
  assert.equal(moved.json.card.columnId, board.columns[1].id);
  assert.equal(moved.json.card.version, 1);
  const edit = await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {baseVersion: 1, priority: 'urgent'}});
  assert.equal(edit.status, 200);
  assert.equal(edit.json.card.columnId, board.columns[1].id);
});

test('mover entre tarjetas respeta afterId/beforeId y cae al final si los vecinos ya no existen', async () => {
  const k = await setupKanban();
  const {board} = await k.board();
  const todo = board.columns[0].id;
  const a = (await k.createCard({title: 'A'})).json.card;
  const b = (await k.createCard({title: 'B'})).json.card;
  const c = (await k.createCard({title: 'C'})).json.card;
  await k.call(`/cards/${c.id}/move`, {method: 'POST', body: {columnId: todo, afterId: a.id, beforeId: b.id}});
  let {cards} = await k.board();
  assert.deepEqual(titlesByColumn(cards, todo), ['A', 'C', 'B']);
  await k.call(`/cards/${a.id}/move`, {method: 'POST', body: {columnId: todo, afterId: null, beforeId: 'desaparecida'}});
  await k.call(`/cards/${b.id}/move`, {method: 'POST', body: {columnId: todo, afterId: null, beforeId: c.id}});
  ({cards} = await k.board());
  assert.deepEqual(titlesByColumn(cards, todo), ['A', 'B', 'C']);
  await k.call(`/cards/${a.id}/move`, {method: 'POST', body: {columnId: todo, afterId: 'desaparecida'}});
  ({cards} = await k.board());
  assert.deepEqual(titlesByColumn(cards, todo), ['B', 'C', 'A']);
  assert.equal((await k.call(`/cards/${a.id}/move`, {method: 'POST', body: {columnId: 'nope'}})).json.error, 'column_not_found');
});

test('mover a "Hecho" marca completedAt y sacarla lo limpia', async () => {
  const k = await setupKanban();
  const {board} = await k.board();
  const {card} = (await k.createCard({title: 'Terminar'})).json;
  const done = await k.call(`/cards/${card.id}/move`, {method: 'POST', body: {columnId: board.columns[2].id}});
  assert.ok(done.json.card.completedAt);
  const back = await k.call(`/cards/${card.id}/move`, {method: 'POST', body: {columnId: board.columns[0].id}});
  assert.equal(back.json.card.completedAt, null);
});

test('sync por rev: sin cambios responde unchanged; con cambios solo lo nuevo y los archivados como tombstone', async () => {
  const k = await setupKanban();
  const one = (await k.createCard({title: 'Uno'})).json.card;
  await k.createCard({title: 'Dos'});
  const {board} = await k.board();
  const unchanged = await k.call(`/board?since=${board.rev}`);
  assert.deepEqual(unchanged.json, {unchanged: true, rev: board.rev});

  await k.call(`/cards/${one.id}/archive`, {method: 'POST'});
  const delta = (await k.call(`/board?since=${board.rev}`)).json;
  assert.equal(delta.full, false);
  assert.deepEqual(delta.cards.map(card => card.title), ['Uno']);
  assert.ok(delta.cards[0].archivedAt);
  assert.ok(delta.board.rev > board.rev);
  // Un rev del futuro (base reiniciada) fuerza una carga completa.
  assert.equal((await k.call('/board?since=999999')).json.full, true);
});

test('archivar bloquea ediciones (410) y restaurar las permite de nuevo', async () => {
  const k = await setupKanban();
  const {card} = (await k.createCard({title: 'Archivar'})).json;
  await k.call(`/cards/${card.id}/archive`, {method: 'POST'});
  const patch = await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {title: 'x'}});
  assert.equal(patch.status, 410);
  assert.equal((await k.call(`/cards/${card.id}/move`, {method: 'POST', body: {columnId: card.columnId}})).status, 410);
  const archived = await k.call('/cards?archived=1');
  assert.deepEqual(archived.json.cards.map(item => item.id), [card.id]);
  await k.call(`/cards/${card.id}/restore`, {method: 'POST'});
  assert.equal((await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {title: 'Volvió'}})).status, 200);
});

test('columnas: máximo 6, renombrar, una sola "Hecho" y borrar moviendo sus tarjetas', async () => {
  const k = await setupKanban();
  for (const name of ['Revisión', 'Bloqueado', 'QA']) {
    assert.equal((await k.call('/columns', {method: 'POST', body: {name}})).status, 201);
  }
  assert.equal((await k.call('/columns', {method: 'POST', body: {name: 'Séptima'}})).json.error, 'column_limit');
  let {board} = await k.board();
  const [todo, doing, done, review] = board.columns;
  assert.equal(review.name, 'Revisión');

  await k.call(`/columns/${doing.id}`, {method: 'PATCH', body: {name: 'Haciendo'}});
  assert.equal((await k.call(`/columns/${done.id}`, {method: 'PATCH', body: {isDone: false}})).json.error, 'done_required');
  assert.equal((await k.call(`/columns/${done.id}`, {method: 'DELETE'})).json.error, 'done_required');

  const card = (await k.createCard({title: 'Va a revisión', columnId: review.id})).json.card;
  await k.call(`/columns/${review.id}`, {method: 'PATCH', body: {isDone: true}});
  ({board} = await k.board());
  assert.deepEqual(board.columns.filter(column => column.isDone).map(column => column.id), [review.id]);
  assert.ok((await k.call(`/cards/${card.id}`)).json.card.completedAt);

  assert.equal((await k.call(`/columns/${todo.id}`, {method: 'DELETE'})).status, 200, 'columna vacía se borra sin destino');
  const target = board.columns.find(column => column.name === 'Haciendo');
  assert.equal((await k.call(`/columns/${review.id}`, {method: 'PATCH', body: {isDone: false}})).json.error, 'done_required');
  await k.call(`/columns/${done.id}`, {method: 'PATCH', body: {isDone: true}});
  assert.equal((await k.call(`/columns/${review.id}`, {method: 'DELETE'})).json.error, 'move_target_required');
  const removed = await k.call(`/columns/${review.id}?moveTo=${target.id}`, {method: 'DELETE'});
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json.board.columns.map(column => column.position), [0, 1, 2, 3]);
  const moved = (await k.call(`/cards/${card.id}`)).json.card;
  assert.equal(moved.columnId, target.id);
  assert.equal(moved.completedAt, null);
});

test('reordenar columnas exige la lista completa', async () => {
  const k = await setupKanban();
  const {board} = await k.board();
  const ids = board.columns.map(column => column.id);
  assert.equal((await k.call('/columns/reorder', {method: 'POST', body: {order: ids.slice(0, 2)}})).status, 409);
  const reordered = await k.call('/columns/reorder', {method: 'POST', body: {order: [...ids].reverse()}});
  assert.deepEqual(reordered.json.board.columns.map(column => column.name), ['Hecho', 'En curso', 'Por hacer']);
});

test('etiquetas: máximo 8, nombre único y borrar la quita de las tarjetas', async () => {
  const k = await setupKanban();
  const created = await k.call('/tags', {method: 'POST', body: {name: 'Bug', color: 'red'}});
  assert.equal(created.status, 201);
  const tagId = created.json.tagId;
  assert.equal((await k.call('/tags', {method: 'POST', body: {name: 'bug', color: 'blue'}})).json.error, 'tag_exists');
  assert.equal((await k.call('/tags', {method: 'POST', body: {name: 'X', color: 'neon'}})).json.error, 'invalid_color');
  for (let i = 0; i < 7; i += 1) await k.call('/tags', {method: 'POST', body: {name: `T${i}`}});
  assert.equal((await k.call('/tags', {method: 'POST', body: {name: 'Novena'}})).json.error, 'tag_limit');

  const card = (await k.createCard({title: 'Con etiqueta', tagIds: [tagId, 'inexistente']})).json.card;
  assert.deepEqual(card.tagIds, [tagId]);
  await k.call(`/tags/${tagId}`, {method: 'DELETE'});
  assert.deepEqual((await k.call(`/cards/${card.id}`)).json.card.tagIds, []);
});

test('documentos enlazados deben estar compartidos en el canal', async () => {
  const k = await setupKanban();
  insertDocument(k.db, {id: 'doc-aqui'});
  insertDocument(k.db, {id: 'doc-otro', channelIds: ['channel-b']});
  const ok = await k.createCard({title: 'Con doc', docIds: ['doc-aqui']});
  assert.deepEqual(ok.json.card.docIds, ['doc-aqui']);
  assert.equal((await k.createCard({title: 'x', docIds: ['doc-otro']})).json.error, 'doc_not_in_channel');
  assert.equal((await k.createCard({title: 'x', docIds: ['1', '2', '3', '4', '5', '6']})).json.error, 'doc_limit');
});

test('el responsable debe poder ver el canal', async () => {
  const k = await setupKanban();
  const denied = await k.createCard({title: 'Privada', assigneeId: OUTSIDER, assigneeName: 'Fuera'});
  assert.equal(denied.status, 422);
  assert.equal(denied.json.error, 'assignee_no_access');
  const ok = await k.createCard({title: 'Para Ana', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  assert.deepEqual(ok.json.card.assignee, {id: ASSIGNEE, name: 'Ana'});
});

test('limite de 500 tarjetas activas por tablero', async () => {
  const k = await setupKanban();
  const {board} = await k.board();
  const now = new Date().toISOString();
  for (let i = 0; i < 500; i += 1) {
    k.db.run(`INSERT INTO kanban_cards (id, board_id, column_id, number, rank, title, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, 'x', ?, 'u', ?, 'u')`, `bulk-${i}`, board.id, board.columns[0].id, 1000 + i, `V${i}`, now, now);
  }
  assert.equal((await k.createCard({title: 'Una más'})).json.error, 'board_full');
});

test('sin sesión responde 401 y una ruta desconocida 404', async () => {
  const k = await setupKanban();
  assert.equal((await k.call('/board', {token: 'inexistente'})).status, 401);
  assert.equal((await k.call('/nada')).status, 404);
  assert.equal((await k.call('/cards/x/y/z')).status, 404);
});
