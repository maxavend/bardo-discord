// Motor de sincronización de documentos del frontend (production-docs-sync.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';

globalThis.DOMParser ??= class DOMParser {
  parseFromString(html) {
    return domino.createDocument(html, true);
  }
};

const {
  DOCS_PENDING_KEY,
  HttpError,
  KEEPALIVE_MAX_BYTES,
  createApiRequest,
  createDocsSync,
  fetchDocsLibrary,
  serverDocToLocal,
} = await import('../activity-app/src/production-docs-sync.js');

function memoryStorage({failWrites = false} = {}) {
  const data = new Map();
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
  };
}

function serverDoc(id, markdownBody, extra = {}) {
  return {
    id,
    title: extra.title || 'Doc',
    description: '',
    markdown: `# ${extra.title || 'Doc'}\n\n${markdownBody}`,
    updatedAt: extra.updatedAt || '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    importStatus: extra.importStatus || 'ready',
    ...extra,
  };
}

/** request falso: responde con la cola `responses` y registra las llamadas. */
function fakeServer(handler) {
  const calls = [];
  const request = async (path, init = {}) => {
    const call = {path, method: init.method || 'GET', body: init.body, keepalive: init.keepalive};
    calls.push(call);
    return handler(call, calls.length);
  };
  return {calls, request};
}

function manualTimers() {
  const timers = [];
  return {
    timers,
    setTimer: (fn, ms) => {
      const handle = {fn, ms};
      timers.push(handle);
      return handle;
    },
    clearTimer: handle => {
      const index = timers.indexOf(handle);
      if (index >= 0) timers.splice(index, 1);
    },
    async runNext() {
      const next = timers.shift();
      next?.fn();
      await new Promise(resolve => setTimeout(resolve, 0));
      return next;
    },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('un documento nuevo se crea con POST y la siguiente edición hace PATCH con baseUpdatedAt del servidor', async () => {
  const server = fakeServer(call => {
    if (call.method === 'POST') return {document: {...call.body, updatedAt: '2026-10-07T10:00:00.000Z'}};
    if (call.method === 'PATCH') return {document: {...call.body, updatedAt: '2026-10-07T10:05:00.000Z'}};
    throw new Error('inesperado');
  });
  const events = [];
  const sync = createDocsSync({request: server.request, storage: memoryStorage(), emit: e => events.push(e)});

  const doc = {id: 'local-1', title: 'Nuevo', description: '', body: '<p>hola</p>'};
  sync.track({docs: [doc]});
  await sync.flush();
  assert.equal(server.calls[0].method, 'POST');
  assert.equal(server.calls[0].body.id, 'local-1');
  assert.match(server.calls[0].body.markdown, /^# Nuevo\n\nhola$/);

  sync.track({docs: [{...doc, body: '<p>hola mundo</p>'}]});
  await sync.flush();
  assert.equal(server.calls[1].method, 'PATCH');
  assert.equal(server.calls[1].body.baseUpdatedAt, '2026-10-07T10:00:00.000Z');
  assert.equal(sync.stateFor('local-1').state, 'saved');
  assert.deepEqual(events.filter(e => e.id === 'local-1').map(e => e.state).at(-1), 'saved');
  assert.equal(events[0].scope, 'docs');
});

test('sin cambios de contenido no se envía nada', async () => {
  const server = fakeServer(() => { throw new Error('no debería llamar'); });
  const sync = createDocsSync({request: server.request});
  const item = serverDoc('d1', 'texto');
  sync.registerRemote([item]);
  sync.track({docs: [serverDocToLocal(item)]});
  await sync.flush();
  assert.equal(server.calls.length, 0);
});

test('503 y errores de red se reintentan con backoff y estado offline; 400 no se reintenta', async () => {
  let attempt = 0;
  const server = fakeServer(call => {
    attempt += 1;
    if (attempt === 1) throw new HttpError(503, {error: 'discord_unavailable', retryAfterMs: 1500});
    if (attempt === 2) throw new HttpError(0, {error: 'network'});
    return {document: {...call.body, updatedAt: 'u2'}};
  });
  const timers = manualTimers();
  const events = [];
  const item = serverDoc('d1', 'uno');
  const sync = createDocsSync({request: server.request, emit: e => events.push(e), ...timers});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>dos</p>'}]});
  await sync.flush();
  assert.equal(sync.stateFor('d1').state, 'offline');
  assert.equal(timers.timers[0].ms, 1500, 'respeta retryAfterMs');

  await timers.runNext();
  await tick();
  assert.equal(timers.timers[0].ms, 2000, 'backoff exponencial');
  await timers.runNext();
  await tick();
  assert.equal(server.calls.length, 3);
  assert.equal(sync.stateFor('d1').state, 'saved');

  const bad = fakeServer(() => { throw new HttpError(400, {error: 'invalid', message: 'Contenido inválido'}); });
  const badTimers = manualTimers();
  const badSync = createDocsSync({request: bad.request, ...badTimers});
  badSync.registerRemote([item]);
  badSync.track({docs: [{...serverDocToLocal(item), body: '<p>tres</p>'}]});
  await badSync.flush();
  assert.equal(bad.calls.length, 1);
  assert.equal(badTimers.timers.length, 0);
  assert.equal(badSync.stateFor('d1').state, 'error');
  assert.equal(badSync.stateFor('d1').message, 'Contenido inválido');
});

test('401 detiene la cola sin reintentos y la deja persistida para la próxima sesión', async () => {
  const storage = memoryStorage();
  const server = fakeServer(() => { throw new HttpError(401, {error: 'unauthorized'}); });
  const timers = manualTimers();
  const item = serverDoc('d1', 'uno');
  const sync = createDocsSync({request: server.request, storage, ...timers});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>editado</p>'}]});
  await sync.flush();
  assert.equal(timers.timers.length, 0);
  assert.equal(sync.stateFor('d1').state, 'error');
  assert.match(sync.stateFor('d1').message, /sesión/);
  assert.ok(JSON.parse(storage.getItem(DOCS_PENDING_KEY)).entries.d1);
});

test('409 conflict conserva la versión local (evento conflict) y no vuelve a sobrescribir al servidor', async () => {
  const current = serverDoc('d1', 'versión de otra persona', {updatedAt: 'u-otro'});
  const server = fakeServer(() => { throw new HttpError(409, {error: 'conflict', document: current}); });
  const remoteEvents = [];
  const item = serverDoc('d1', 'base', {updatedAt: 'u-base'});
  const sync = createDocsSync({request: server.request, onRemote: e => remoteEvents.push(e)});
  sync.registerRemote([item]);
  const mine = {...serverDocToLocal(item), body: '<p>mi versión</p>'};
  sync.track({docs: [mine]});
  await sync.flush();

  assert.equal(server.calls[0].body.baseUpdatedAt, 'u-base');
  const conflict = remoteEvents.find(e => e.type === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.localDoc.body, '<p>mi versión</p>');
  assert.match(conflict.serverDoc.body, /versión de otra persona/);
  assert.equal(sync.stateFor('d1').state, 'conflict');

  // Mientras la app no adopte la versión del servidor, no se envía la local.
  sync.track({docs: [{...mine}]});
  await sync.flush();
  assert.equal(server.calls.length, 1);

  // Al adoptar la versión del servidor (lo hace App) no se genera ninguna escritura.
  sync.track({docs: [conflict.serverDoc]});
  await sync.flush();
  assert.equal(server.calls.length, 1, 'adoptar la versión del servidor no genera escrituras');
});

test('la cola pendiente sobrevive a una recarga y se reenvía con la base original antes de usar la copia del servidor', async () => {
  const storage = memoryStorage();
  const item = serverDoc('d1', 'original', {updatedAt: 'u-base'});

  // Sesión 1: editar y "cerrar" sin red.
  const offline = fakeServer(() => { throw new HttpError(0, {error: 'network'}); });
  const s1 = createDocsSync({request: offline.request, storage, ...manualTimers()});
  s1.registerRemote([item]);
  s1.track({docs: [{...serverDocToLocal(item), body: '<p>editado sin red</p>'}]});
  await s1.flush();
  assert.ok(storage.getItem(DOCS_PENDING_KEY));

  // Sesión 2: el servidor sigue con el original.
  const online = fakeServer(call => ({document: {...call.body, updatedAt: 'u-nuevo'}}));
  const s2 = createDocsSync({request: online.request, storage});
  s2.registerRemote([item]);
  s2.loadPending();
  const docs = s2.overlayPending([serverDocToLocal(item)]);
  assert.equal(docs[0].body, '<p>editado sin red</p>', 'la UI muestra la edición local, no la del servidor');
  await s2.flush();
  assert.equal(online.calls[0].method, 'PATCH');
  assert.equal(online.calls[0].body.baseUpdatedAt, 'u-base');
  assert.match(online.calls[0].body.markdown, /editado sin red/);
  assert.deepEqual(JSON.parse(storage.getItem(DOCS_PENDING_KEY)).entries, {});
});

test('documentos nuevos que nunca llegaron al servidor reaparecen tras recargar y se crean', async () => {
  const storage = memoryStorage();
  const s1 = createDocsSync({request: fakeServer(() => { throw new HttpError(503, {}); }).request, storage, ...manualTimers()});
  s1.track({docs: [{id: 'local-x', title: 'Solo local', description: '', body: '<p>a</p>'}]});
  await s1.flush();

  const online = fakeServer(call => ({document: {...call.body, updatedAt: 'u1'}}));
  const s2 = createDocsSync({request: online.request, storage});
  s2.loadPending();
  const docs = s2.overlayPending([]);
  assert.deepEqual(docs.map(d => d.id), ['local-x']);
  await s2.flush();
  assert.equal(online.calls[0].method, 'POST');
});

test('archivados cargados del servidor no se reenvían como nuevos (F5); archivar y restaurar usan los endpoints (F7)', async () => {
  const server = fakeServer(() => ({ok: true}));
  const sync = createDocsSync({request: server.request});
  const archived = serverDoc('a1', 'viejo', {archivedAt: '2026-09-01T00:00:00.000Z'});
  sync.registerRemote([archived], {archived: true});
  const archivedLocal = serverDocToLocal(archived, {archived: true});
  sync.track({docs: [archivedLocal]});
  await sync.flush();
  assert.equal(server.calls.length, 0, 'no hay POST duplicado');

  sync.track({docs: [{...archivedLocal, archived: false}]});
  await sync.flush();
  assert.deepEqual(server.calls.map(c => [c.method, c.path]), [['POST', '/api/docs/a1/restore']]);

  sync.registerRemote([serverDoc('b1', 'b')]);
  sync.track({docs: [{...archivedLocal, archived: false}, {...serverDocToLocal(serverDoc('b1', 'b')), archived: true}]});
  await sync.flush();
  assert.ok(server.calls.some(c => c.method === 'DELETE' && c.path === '/api/docs/b1'));
});

test('tras restaurar, la siguiente edición usa el updatedAt nuevo del servidor (sin conflicto falso)', async () => {
  const server = fakeServer(call => {
    if (call.path.endsWith('/restore')) {
      return {ok: true, restored: true, id: 'a1', document: serverDoc('a1', 'viejo', {updatedAt: '2026-10-07T12:00:00.000Z'})};
    }
    if (call.method === 'PATCH') return {document: {...call.body, updatedAt: '2026-10-07T12:01:00.000Z'}};
    throw new Error('inesperado');
  });
  const sync = createDocsSync({request: server.request, storage: memoryStorage()});
  const archived = serverDoc('a1', 'viejo', {archivedAt: '2026-09-01T00:00:00.000Z'});
  sync.registerRemote([archived], {archived: true});
  const restored = {...serverDocToLocal(archived, {archived: true}), archived: false};
  sync.track({docs: [restored]});
  await sync.flush();

  sync.track({docs: [{...restored, body: '<p>editado después de restaurar</p>'}]});
  await sync.flush();
  const patch = server.calls.find(c => c.method === 'PATCH');
  assert.equal(patch.body.baseUpdatedAt, '2026-10-07T12:00:00.000Z');
  assert.equal(sync.stateFor('a1').state, 'saved');
});

test('POST con id existente (409 exists) con la misma base continúa con PATCH en vez de duplicar', async () => {
  const existing = serverDoc('d1', 'servidor', {updatedAt: 'u-base'});
  const server = fakeServer((call, n) => {
    if (n === 1) throw new HttpError(409, {error: 'exists', document: existing});
    return {document: {...call.body, updatedAt: 'u-2'}};
  });
  const storage = memoryStorage();
  storage.setItem(DOCS_PENDING_KEY, JSON.stringify({version: 1, entries: {
    d1: {doc: {id: 'd1', title: 'Doc', description: '', body: '<p>local</p>'}, baseUpdatedAt: 'u-base', version: 1},
  }}));
  const sync = createDocsSync({request: server.request, storage});
  sync.loadPending();
  await sync.flush();
  assert.deepEqual(server.calls.map(c => c.method), ['POST', 'PATCH']);
  assert.equal(server.calls[1].body.baseUpdatedAt, 'u-base');
});

test('PATCH 404 recrea el documento con POST para no perder el contenido', async () => {
  const server = fakeServer((call, n) => {
    if (n === 1) throw new HttpError(404, {error: 'not_found'});
    return {document: {...call.body, updatedAt: 'u-2'}};
  });
  const item = serverDoc('d1', 'uno');
  const sync = createDocsSync({request: server.request});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>dos</p>'}]});
  await sync.flush();
  assert.deepEqual(server.calls.map(c => c.method), ['PATCH', 'POST']);
  assert.equal(sync.stateFor('d1').state, 'saved');
});

test('si localStorage está lleno la escritura al servidor igual ocurre y se avisa una vez (F12)', async () => {
  const server = fakeServer(call => ({document: {...call.body, updatedAt: 'u1'}}));
  const remoteEvents = [];
  const sync = createDocsSync({request: server.request, storage: memoryStorage({failWrites: true}), onRemote: e => remoteEvents.push(e)});
  sync.track({docs: [{id: 'local-q', title: 'Q', description: '', body: '<p>q</p>'}]});
  sync.track({docs: [{id: 'local-q', title: 'Q', description: '', body: '<p>q2</p>'}]});
  await sync.flush();
  assert.ok(server.calls.length >= 1);
  assert.equal(remoteEvents.filter(e => e.type === 'storage-warning').length, 1);
});

test('documentos con importación pendiente no envían PATCH de contenido', async () => {
  const server = fakeServer(() => ({ok: true}));
  const item = serverDoc('p1', 'placeholder', {importStatus: 'pending', hasSource: true});
  const sync = createDocsSync({request: server.request});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>otra cosa</p>'}]});
  await sync.flush();
  assert.equal(server.calls.length, 0);
});

test('ediciones durante un envío en curso se encolan y se envían después con la base nueva', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = fakeServer(async (call, n) => {
    if (n === 1) await gate;
    return {document: {...call.body, updatedAt: `u-${n}`}};
  });
  const item = serverDoc('d1', 'uno', {updatedAt: 'u-0'});
  const sync = createDocsSync({request: server.request});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>dos</p>'}]});
  const running = sync.flush();
  await tick();
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>tres</p>'}]});
  release();
  await running;
  await sync.flush();
  assert.equal(server.calls.length, 2);
  assert.equal(server.calls[1].body.baseUpdatedAt, 'u-1');
  assert.match(server.calls[1].body.markdown, /tres/);
  assert.equal(sync.stateFor('d1').state, 'saved');
});

test('la biblioteca se reintenta al arrancar respetando retryAfterMs y falla sin lanzar (#3)', async () => {
  const delays = [];
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) return {ok: false, status: 503, json: async () => ({error: 'discord_unavailable', retryAfterMs: 700})};
    if (n === 2) throw new TypeError('Failed to fetch');
    return {ok: true, status: 200, json: async () => ({documents: [{id: 'd1'}]})};
  };
  const ok = await fetchDocsLibrary({fetchImpl, sleep: async ms => { delays.push(ms); }});
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload.documents.map(d => d.id), ['d1']);
  assert.deepEqual(delays, [700, 2000]);

  const down = await fetchDocsLibrary({
    fetchImpl: async () => ({ok: false, status: 503, json: async () => ({})}),
    attempts: 3,
    sleep: async () => {},
  });
  assert.equal(down.ok, false);
  assert.equal(down.error.status, 503);

  const forbidden = await fetchDocsLibrary({fetchImpl: async () => ({ok: false, status: 403, json: async () => ({})}), sleep: async () => { throw new Error('no reintenta 403'); }});
  assert.equal(forbidden.ok, false);
});

test('arranque sin conexión: la copia local se registra como estado conocido y no se reenvía (#3)', async () => {
  const server = fakeServer(call => ({document: {...call.body, updatedAt: 'u-2'}}));
  const sync = createDocsSync({request: server.request});
  const cached = [
    {...serverDocToLocal(serverDoc('d1', 'uno', {updatedAt: 'u-1'}))},
    {...serverDocToLocal(serverDoc('d2', 'dos', {updatedAt: 'u-1'})), archived: true},
  ];
  sync.registerCached(cached);
  sync.track({docs: cached});
  await sync.flush();
  assert.equal(server.calls.length, 0, 'nada se recrea ni se borra');

  // Una edición posterior usa como base el updatedAt confirmado que tenía la copia.
  sync.track({docs: [{...cached[0], body: '<p>uno editado</p>'}, cached[1]]});
  await sync.flush();
  assert.equal(server.calls[0].method, 'PATCH');
  assert.equal(server.calls[0].body.baseUpdatedAt, 'u-1');
});

test('flushKeepalive envía de inmediato con keepalive aunque haya una petición normal en curso (#4)', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = fakeServer(async (call, n) => {
    if (n === 1) await gate; // petición normal colgada (la abortaría el cierre)
    return {document: {...call.body, updatedAt: `u-${n}`}};
  });
  const item = serverDoc('d1', 'uno', {updatedAt: 'u-0'});
  const sync = createDocsSync({request: server.request});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>dos</p>'}]});
  const running = sync.flush();
  await tick();
  // El editor encola su último snapshot y pide el envío con keepalive.
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>último texto</p>'}]});
  assert.equal(sync.flushKeepalive(), 1);
  assert.equal(server.calls.length, 2);
  assert.equal(server.calls[1].keepalive, true);
  assert.match(server.calls[1].body.markdown, /último texto/);
  assert.equal(sync.flushKeepalive(), 0, 'no duplica la misma versión');
  release();
  await running;
});

test('flushKeepalive respeta el límite de ~60 KB medido en bytes UTF-8 (#4)', async () => {
  const server = fakeServer(call => ({document: {...call.body, updatedAt: 'u1'}}));
  const storage = memoryStorage();
  const sync = createDocsSync({request: server.request, storage});
  // ~40 000 caracteres de 2 bytes = ~80 KB en UTF-8 aunque length < 60 000.
  const big = 'ñ'.repeat(40_000);
  sync.track({docs: [{id: 'local-big', title: 'Grande', description: '', body: `<p>${big}</p>`}]});
  assert.equal(sync.flushKeepalive(), 0);
  assert.equal(server.calls.length, 0);
  assert.ok(JSON.parse(storage.getItem(DOCS_PENDING_KEY)).entries['local-big'], 'queda pendiente para el próximo arranque');
  assert.ok(KEEPALIVE_MAX_BYTES <= 60_000);

  const fetches = [];
  const request = createApiRequest({fetchImpl: async (path, init) => { fetches.push(init); return {ok: true, status: 200, json: async () => ({})}; }});
  await request('/api/docs/x', {method: 'PATCH', body: {markdown: big}, keepalive: true});
  await request('/api/docs/x', {method: 'PATCH', body: {markdown: 'corto'}, keepalive: true});
  assert.deepEqual(fetches.map(f => f.keepalive), [false, true]);
});

test('un 409 con una versión que este cliente ya envió no crea copia en conflicto (#4)', async () => {
  let n = 0;
  const server = fakeServer(call => {
    n += 1;
    if (n === 1) {
      // El keepalive llegó antes: el servidor ya tiene "dos" con updatedAt u-1.
      throw new HttpError(409, {error: 'conflict', document: serverDoc('d1', 'dos', {updatedAt: 'u-1'})});
    }
    return {document: {...call.body, updatedAt: 'u-2'}};
  });
  const remoteEvents = [];
  const item = serverDoc('d1', 'uno', {updatedAt: 'u-0'});
  const sync = createDocsSync({request: server.request, onRemote: e => remoteEvents.push(e)});
  sync.registerRemote([item]);
  sync.track({docs: [{...serverDocToLocal(item), body: '<p>dos</p>'}]});
  await sync.flush();
  assert.equal(remoteEvents.filter(e => e.type === 'conflict').length, 0);
  assert.equal(sync.stateFor('d1').state, 'saved');
});

test('POST cuya respuesta se perdió: el reintento con 409 exists adopta la versión y hace PATCH (#7)', async () => {
  let n = 0;
  const server = fakeServer(call => {
    n += 1;
    if (n === 1) throw new HttpError(0, {error: 'network'}); // llegó al servidor, respuesta perdida
    if (n === 2) throw new HttpError(409, {error: 'exists', document: {...serverDoc('local-n', 'primera'), title: 'Nuevo', markdown: '# Nuevo\n\nprimera', updatedAt: 'u-1'}});
    return {document: {...call.body, updatedAt: 'u-2'}};
  });
  const timers = manualTimers();
  const remoteEvents = [];
  const sync = createDocsSync({request: server.request, onRemote: e => remoteEvents.push(e), ...timers});
  const doc = {id: 'local-n', title: 'Nuevo', description: '', body: '<p>primera</p>'};
  sync.track({docs: [doc]});
  await sync.flush();
  // El usuario sigue escribiendo.
  sync.track({docs: [{...doc, body: '<p>primera y más</p>'}]});
  await timers.runNext();
  await tick();
  assert.deepEqual(server.calls.map(c => c.method), ['POST', 'POST', 'PATCH']);
  assert.equal(server.calls[2].body.baseUpdatedAt, 'u-1');
  assert.equal(remoteEvents.filter(e => e.type === 'conflict').length, 0);
  assert.equal(sync.stateFor('local-n').state, 'saved');
});

test('PATCH 403 recrea el trabajo como documento nuevo una sola vez (#8)', async () => {
  const server = fakeServer(call => {
    if (call.method === 'PATCH') throw new HttpError(403, {error: 'forbidden'});
    return {document: {...call.body, updatedAt: 'u-new'}};
  });
  const remoteEvents = [];
  const item = serverDoc('gone', 'original');
  const sync = createDocsSync({request: server.request, onRemote: e => remoteEvents.push(e)});
  sync.registerRemote([item]);
  const edited = {...serverDocToLocal(item), body: '<p>mi trabajo</p>'};
  sync.track({docs: [edited]});
  await sync.flush();

  const recreated = remoteEvents.find(e => e.type === 'recreated');
  assert.ok(recreated);
  assert.equal(recreated.oldId, 'gone');
  assert.notEqual(recreated.newId, 'gone');
  assert.deepEqual(server.calls.map(c => c.method), ['PATCH', 'POST']);
  assert.equal(server.calls[1].body.id, recreated.newId);
  assert.match(server.calls[1].body.markdown, /mi trabajo/);
  assert.equal(sync.pending.has('gone'), false);

  // El documento viejo sigue en el store hasta que App lo reemplace: no se reencola.
  sync.track({docs: [{...edited}, {...recreated.doc}]});
  await sync.flush();
  assert.equal(server.calls.filter(c => c.method === 'PATCH').length, 1);

  // Si la copia recreada también recibe 403, no se encadenan más copias.
  const deny = fakeServer(() => { throw new HttpError(403, {error: 'forbidden'}); });
  const events2 = [];
  const sync2 = createDocsSync({request: deny.request, onRemote: e => events2.push(e)});
  sync2.registerRemote([item]);
  sync2.track({docs: [edited]});
  await sync2.flush();
  assert.equal(events2.filter(e => e.type === 'recreated').length, 1);
  assert.equal(deny.calls.length, 2, 'un PATCH y un POST, sin bucles');
});
