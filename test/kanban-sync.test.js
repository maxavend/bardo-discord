// Motor de Tareas de la Activity contra la API real del Worker (SQLite):
// cola optimista, agrupación de ediciones, conflictos entre dos personas y
// operaciones que sobreviven a quedarse sin conexión.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createKanbanEngine, KANBAN_PENDING_KEY, localStarterState} from '../activity-app/src/kanban/kanban-sync.js';
import {mergeCardConflict, mergeSubtasks} from '../activity-app/src/kanban/kanban-merge.js';
import {applyOps, filterCards} from '../activity-app/src/kanban/kanban-store.js';
import {handleKanbanApi} from '../src/kanban-api.js';
import {setupKanban} from './helpers/kanban.js';
import {TOKEN, insertSession} from './helpers/sqlite-d1.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    data,
  };
}

/** Reloj y temporizadores falsos: las ediciones esperan 800 ms sin sleeps reales. */
function fakeTimers() {
  let clock = 1_000_000;
  let timers = [];
  let seq = 0;
  return {
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({id, at: clock + ms, fn});
      return id;
    },
    clearTimer: id => { timers = timers.filter(timer => timer.id !== id); },
    async advance(ms = 0) {
      clock += ms;
      for (let round = 0; round < 50; round += 1) {
        const due = timers.filter(timer => timer.at <= clock);
        timers = timers.filter(timer => timer.at > clock);
        for (const timer of due) timer.fn();
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        if (!due.length && !timers.some(timer => timer.at <= clock)) {
          // Deja terminar las peticiones en curso (varias vueltas de la cola).
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!timers.some(timer => timer.at <= clock)) break;
        }
      }
    },
  };
}

/** Avanza el reloj y espera a que la cola del motor quede vacía (o sin conexión). */
async function settle(timers, engine, ms = 0) {
  await timers.advance(ms);
  for (let i = 0; i < 500; i += 1) {
    const {pendingCount, status} = engine.getSnapshot();
    if (!pendingCount || status === 'offline') return;
    await new Promise(resolve => setTimeout(resolve, 1));
    await timers.advance(0);
  }
}

async function setup() {
  const k = await setupKanban();
  await insertSession(k.db, {token: 'token-2', userId: 'user-456', username: 'Otra'});
  const calls = [];
  const fetchFor = (token, offline) => async (path, init = {}) => {
    if (offline.value) throw new TypeError('Failed to fetch');
    calls.push(`${init.method || 'GET'} ${path}`);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const request = new Request(`https://bardo.test${path}`, {...init, headers});
    return handleKanbanApi(request, new URL(request.url), k.env, k.ctx);
  };
  const makeEngine = ({token = TOKEN, storage = memoryStorage(), timers = fakeTimers(), notices = []} = {}) => {
    const offline = {value: false};
    const engine = createKanbanEngine({
      remote: true, storage, fetchImpl: fetchFor(token, offline),
      now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
      onNotice: notice => notices.push(notice.message),
    });
    return {engine, timers, storage, offline, notices};
  };
  return {k, calls, makeEngine};
}

const viewCards = engine => Object.values(engine.getSnapshot().view.cards);

test('crear se ve al instante y se confirma en el servidor; varias ediciones salen en un solo PATCH', async () => {
  const {k, calls, makeEngine} = await setup();
  const {engine, timers} = makeEngine();
  await engine.load();
  const column = engine.getSnapshot().view.board.columns[0].id;

  const id = engine.createCard({title: 'Optimista', columnId: column});
  assert.equal(viewCards(engine)[0].title, 'Optimista', 'visible antes de responder');
  await settle(timers, engine);
  assert.equal(k.db.row('SELECT title FROM kanban_cards').title, 'Optimista');

  engine.patchCard(id, {title: 'Uno'});
  engine.patchCard(id, {description: 'Dos'});
  engine.patchCard(id, {title: 'Tres'});
  assert.equal(viewCards(engine)[0].title, 'Tres');
  await timers.advance(100);
  assert.equal(calls.filter(call => call.startsWith('PATCH')).length, 0, 'espera a que se deje de escribir');
  await settle(timers, engine, 1000);
  assert.equal(calls.filter(call => call.startsWith('PATCH')).length, 1);
  const row = k.db.row('SELECT title, description, version FROM kanban_cards');
  assert.deepEqual({...row}, {title: 'Tres', description: 'Dos', version: 2});
  assert.equal(engine.getSnapshot().pendingCount, 0);
});

test('dos personas editan campos distintos de la misma tarjeta: no se pierde nada', async () => {
  const {k, makeEngine} = await setup();
  const a = makeEngine();
  const b = makeEngine({token: 'token-2'});
  await a.engine.load();
  const id = a.engine.createCard({title: 'Compartida', columnId: a.engine.getSnapshot().view.board.columns[0].id});
  await settle(a.timers, a.engine);
  await b.engine.load();

  a.engine.patchCard(id, {title: 'Título de A'});
  b.engine.patchCard(id, {description: 'Descripción de B'});
  await settle(a.timers, a.engine, 1000);
  await settle(b.timers, b.engine, 1000); // B recibe 409 y reaplica su campo sobre la versión nueva
  await settle(b.timers, b.engine, 0);
  const row = k.db.row('SELECT title, description FROM kanban_cards');
  assert.deepEqual({...row}, {title: 'Título de A', description: 'Descripción de B'});
  assert.deepEqual(b.notices, []);
});

test('si las dos cambian el mismo campo, gana el servidor y se avisa', async () => {
  const {k, makeEngine} = await setup();
  const a = makeEngine();
  const b = makeEngine({token: 'token-2'});
  await a.engine.load();
  const id = a.engine.createCard({title: 'Original', columnId: a.engine.getSnapshot().view.board.columns[0].id});
  await settle(a.timers, a.engine);
  await b.engine.load();

  a.engine.patchCard(id, {title: 'De A'});
  b.engine.patchCard(id, {title: 'De B'});
  await settle(a.timers, a.engine, 1000);
  await settle(b.timers, b.engine, 1000);
  assert.equal(k.db.row('SELECT title FROM kanban_cards').title, 'De A');
  assert.match(b.notices[0], /Otra persona cambió el título de #1/);
  assert.equal(viewCards(b.engine)[0].title, 'De A');
});

test('mover mientras hay una edición pendiente: ambas cosas se guardan', async () => {
  const {k, makeEngine} = await setup();
  const {engine, timers} = makeEngine();
  await engine.load();
  const [todo, doing] = engine.getSnapshot().view.board.columns;
  const id = engine.createCard({title: 'Mover', columnId: todo.id});
  await settle(timers, engine);
  engine.patchCard(id, {priority: 'urgent'});
  engine.moveCard(id, doing.id);
  assert.equal(viewCards(engine)[0].columnId, doing.id);
  await settle(timers, engine, 1000);
  const row = k.db.row('SELECT column_id, priority FROM kanban_cards');
  assert.deepEqual({...row}, {column_id: doing.id, priority: 'urgent'});
});

test('sin conexión: los cambios quedan guardados y se envían al volver, incluso tras recargar', async () => {
  const {k, makeEngine} = await setup();
  const storage = memoryStorage();
  const first = makeEngine({storage});
  await first.engine.load();
  first.offline.value = true;
  first.engine.createCard({title: 'Hecha sin red', columnId: first.engine.getSnapshot().view.board.columns[0].id});
  await settle(first.timers, first.engine);
  assert.equal(first.engine.getSnapshot().status, 'offline');
  assert.ok(storage.getItem(KANBAN_PENDING_KEY), 'la operación quedó en el almacenamiento local');
  assert.equal(k.db.row('SELECT COUNT(*) AS n FROM kanban_cards').n, 0);

  // "Recarga" la Activity: otro motor con el mismo almacenamiento.
  const second = makeEngine({storage});
  assert.equal(viewCards(second.engine)[0].title, 'Hecha sin red', 'se ve desde la copia local');
  await second.engine.load();
  await settle(second.timers, second.engine);
  assert.equal(k.db.row('SELECT title FROM kanban_cards').title, 'Hecha sin red');
  assert.equal(storage.getItem(KANBAN_PENDING_KEY), null);
});

test('el poll trae lo que hizo otra persona y respeta lo pendiente propio', async () => {
  const {makeEngine} = await setup();
  const a = makeEngine();
  const b = makeEngine({token: 'token-2'});
  await a.engine.load();
  await b.engine.load();
  const column = a.engine.getSnapshot().view.board.columns[0].id;
  a.engine.createCard({title: 'De A', columnId: column});
  await settle(a.timers, a.engine);
  b.engine.createCard({title: 'De B (pendiente)', columnId: column});
  await b.engine.poll();
  const titles = viewCards(b.engine).map(card => card.title).sort();
  assert.deepEqual(titles, ['De A', 'De B (pendiente)']);
});

test('un error de validación descarta el cambio, vuelve al servidor y explica por qué', async () => {
  const {makeEngine} = await setup();
  const {engine, timers, notices} = makeEngine();
  await engine.load();
  for (let i = 0; i < 6; i += 1) engine.addColumn(`Extra ${i}`);
  await settle(timers, engine);
  assert.equal(engine.getSnapshot().view.board.columns.length, 6);
  assert.match(notices[0], /hasta 6 columnas/);
});

test('modo local (sin Discord): todo se aplica y persiste sin red', () => {
  const storage = memoryStorage();
  const engine = createKanbanEngine({remote: false, storage});
  const column = engine.getSnapshot().view.board.columns[0].id;
  const id = engine.createCard({title: 'Local', columnId: column});
  engine.patchCard(id, {subtasks: [{id: 's1', text: 'Paso', done: false}]});
  const reloaded = createKanbanEngine({remote: false, storage});
  const card = Object.values(reloaded.getSnapshot().view.cards)[0];
  assert.equal(card.title, 'Local');
  assert.equal(card.subtasks.length, 1);
  assert.equal(card.pending, false);
});

test('fusión de subtareas por id: suma lo nuevo, quita lo borrado y respeta las ediciones ajenas', () => {
  const base = [{id: 'a', text: 'A', done: false}, {id: 'b', text: 'B', done: false}];
  const mine = [{id: 'a', text: 'A', done: true}, {id: 'c', text: 'C', done: false}]; // marqué A, borré B, agregué C
  const theirs = [{id: 'a', text: 'A', done: false}, {id: 'b', text: 'B editada', done: false}, {id: 'd', text: 'D', done: false}];
  assert.deepEqual(mergeSubtasks(base, mine, theirs).map(item => `${item.id}:${item.done}`), ['a:true', 'd:false', 'c:false']);
  const {retry, lost} = mergeCardConflict(
    {fields: {title: 'Mío', priority: 'high'}, base: {title: 'Base', priority: 'normal'}},
    {title: 'Suyo', priority: 'normal'},
  );
  assert.deepEqual(retry, {priority: 'high'});
  assert.deepEqual(lost, ['title']);
});

test('filtros: mías, vencidas (sin contar "Hecho") y etiqueta', () => {
  let state = localStarterState();
  const [todo, , done] = state.board.columns;
  state = applyOps(state, [
    {type: 'create', card: {id: 'c1', title: 'Mía vencida', columnId: todo.id, assignee: {id: 'me', name: 'Yo'}, dueDate: '2026-01-01', tagIds: ['t1']}},
    {type: 'create', card: {id: 'c2', title: 'Ajena', columnId: todo.id, assignee: {id: 'otra', name: 'Otra'}}},
    {type: 'create', card: {id: 'c3', title: 'Vencida pero hecha', columnId: done.id, dueDate: '2026-01-01'}},
  ]);
  const ids = options => Object.keys(filterCards(state.cards, {today: '2026-10-15', doneId: done.id, ...options})).sort();
  assert.deepEqual(ids({filter: 'mine', userId: 'me'}), ['c1']);
  assert.deepEqual(ids({filter: 'overdue'}), ['c1']);
  assert.deepEqual(ids({tagId: 't1'}), ['c1']);
  assert.deepEqual(ids({}), ['c1', 'c2', 'c3']);
});
