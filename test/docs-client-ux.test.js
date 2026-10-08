// Documentos (cliente): ámbito por canal, tareas sin copias en conflicto,
// búsqueda sin tildes, texto plano, listas numeradas, importaciones fallidas,
// enlaces externos y comandos de tabla.
import test from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';

globalThis.DOMParser ??= class DOMParser {
  parseFromString(html) {
    return domino.createDocument(html, true);
  }
};

const storage = await import('../activity-app/src/docs-storage.js');
const text = await import('../activity-app/src/docs-text.js');
const {copyTextToClipboard} = await import('../activity-app/src/docs-clipboard.js');
const {openExternalUrl} = await import('../activity-app/src/discord-links.js');
const sync = await import('../activity-app/src/production-docs-sync.js');
const {htmlToMarkdown, markdownToHtml} = await import('../activity-app/src/editor/bardo-markdown.js');
const {htmlToPlateValue, plateValueToHtml} = await import('../activity-app/src/editor/bardo-editor-serialization.js');
const importer = await import('../activity-app/src/production-import-normalizer.js');
const {parseDocsLaunchTarget, prefillNewDocTitle} = await import('../activity-app/src/production-bridge.js');
const {friendlyAuthError} = await import('../activity-app/src/production-discord-auth.js');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

function serverDoc(id, body, extra = {}) {
  return {
    id,
    title: extra.title || 'Doc',
    description: '',
    markdown: `# ${extra.title || 'Doc'}\n\n${body}`,
    updatedAt: extra.updatedAt || '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    importStatus: 'ready',
    ...extra,
  };
}

function fakeServer(handler) {
  const calls = [];
  const request = async (path, init = {}) => {
    const call = {path, method: init.method || 'GET', body: init.body};
    calls.push(call);
    return handler(call, calls.length);
  };
  return {calls, request};
}

const stripIds = value => JSON.parse(JSON.stringify(value, (key, val) => (key === 'id' ? undefined : val)));

/* ── A. Almacenamiento por servidor + canal ─────────────────────────────── */

test('las claves de Documentos llevan el servidor y el canal', () => {
  assert.equal(storage.docsScopeFor('g1', 'c1'), 'g1:c1');
  assert.equal(storage.docsScopeFor('g1', null), null);
  assert.equal(storage.scopedDocsKey(storage.DOCS_KEYS.draft, 'g1:c1'), 'bardo.docs.heroui.draft.v1@g1:c1');
  assert.equal(storage.scopedDocsKey(storage.DOCS_KEYS.draft, null), 'bardo.docs.heroui.draft.v1');
  // Canales distintos nunca comparten clave.
  assert.notEqual(
    storage.scopedDocsKey(storage.DOCS_KEYS.pending, 'g1:privado'),
    storage.scopedDocsKey(storage.DOCS_KEYS.pending, 'g1:general'),
  );
});

test('un borrador antiguo sin ámbito se adopta una sola vez y desaparece de la clave global', () => {
  const draft = JSON.stringify({title: 'Mío'});
  const store = memoryStorage({[storage.DOCS_KEYS.draft]: draft});
  assert.equal(storage.adoptLegacyDocsValue(store, storage.DOCS_KEYS.draft, 'g1:c1'), true);
  assert.equal(store.getItem('bardo.docs.heroui.draft.v1@g1:c1'), draft);
  assert.equal(store.getItem(storage.DOCS_KEYS.draft), null);
  // En otro canal ya no aparece.
  assert.equal(storage.adoptLegacyDocsValue(store, storage.DOCS_KEYS.draft, 'g1:c2'), false);
  assert.equal(store.getItem('bardo.docs.heroui.draft.v1@g1:c2'), null);
});

test('prefillNewDocTitle escribe el borrador del canal indicado', () => {
  const store = memoryStorage();
  assert.equal(prefillNewDocTitle('Plan', store, 'draft@g:c'), true);
  assert.equal(JSON.parse(store.getItem('draft@g:c')).title, 'Plan');
  assert.equal(store.getItem(storage.DOCS_KEYS.draft), null);
});

function legacyQueue(entries) {
  return JSON.stringify({version: 1, entries});
}

test('cola antigua: un documento de OTRO canal no se crea aquí ni aparece en la biblioteca', async () => {
  const pendingKey = `${sync.DOCS_PENDING_KEY}@g1:general`;
  const privateDoc = {id: 'local-privado', title: 'Secreto', description: '', body: '<p>Solo del canal privado</p>'};
  const store = memoryStorage({
    [sync.DOCS_PENDING_KEY]: legacyQueue({'local-privado': {doc: privateDoc, baseUpdatedAt: null, version: 1}}),
  });
  const server = fakeServer(() => { throw new Error('no debería llamar al servidor'); });
  const engine = sync.createDocsSync({request: server.request, storage: store, pendingKey, legacyPendingKey: sync.DOCS_PENDING_KEY});
  engine.registerRemote([serverDoc('d1', 'Hola')]);
  engine.loadPending();

  assert.equal(engine.pending.size, 0, 'no se adopta: no pertenece a este canal');
  assert.equal(engine.parked.size, 1);
  const visible = engine.overlayPending([sync.serverDocToLocal(serverDoc('d1', 'Hola'))]);
  assert.deepEqual(visible.map(doc => doc.id), ['d1'], 'no se muestra en la biblioteca de este canal');
  await engine.flush();
  assert.equal(server.calls.length, 0, 'nunca se hace POST en este canal');
  // Sigue guardada (estacionada) para el canal correcto.
  assert.ok(JSON.parse(store.getItem(sync.DOCS_PENDING_KEY)).entries['local-privado']);
});

test('cola antigua: un documento de ESTE canal se adopta y se guarda con PATCH', async () => {
  const pendingKey = `${sync.DOCS_PENDING_KEY}@g1:general`;
  const edited = {...sync.serverDocToLocal(serverDoc('d1', 'Hola')), body: '<p>Hola editado</p>'};
  const store = memoryStorage({
    [sync.DOCS_PENDING_KEY]: legacyQueue({d1: {doc: edited, baseUpdatedAt: '2026-10-01T00:00:00.000Z', version: 1}}),
  });
  const server = fakeServer(call => ({document: serverDoc('d1', 'Hola editado', {updatedAt: '2026-10-02T00:00:00.000Z'}), call}));
  const engine = sync.createDocsSync({request: server.request, storage: store, pendingKey, legacyPendingKey: sync.DOCS_PENDING_KEY});
  engine.registerRemote([serverDoc('d1', 'Hola')]);
  engine.loadPending();
  assert.equal(engine.pending.size, 1);
  await engine.flush();
  assert.deepEqual(server.calls.map(c => c.method), ['PATCH']);
  assert.equal(engine.pending.size, 0);
  assert.equal(JSON.parse(store.getItem(sync.DOCS_PENDING_KEY)).entries.d1, undefined, 'sale de la cola antigua');
});

test('cola antigua: un 403 la estaciona (no se pierde) y NUNCA se recrea como documento nuevo', async () => {
  const pendingKey = `${sync.DOCS_PENDING_KEY}@g1:general`;
  const edited = {...sync.serverDocToLocal(serverDoc('d1', 'Hola')), body: '<p>Cambio</p>'};
  const store = memoryStorage({
    [sync.DOCS_PENDING_KEY]: legacyQueue({d1: {doc: edited, baseUpdatedAt: null, version: 1}}),
  });
  const events = [];
  const server = fakeServer(() => { throw new sync.HttpError(403, {error: 'forbidden'}); });
  const engine = sync.createDocsSync({
    request: server.request,
    storage: store,
    pendingKey,
    legacyPendingKey: sync.DOCS_PENDING_KEY,
    onRemote: event => events.push(event),
  });
  engine.registerRemote([serverDoc('d1', 'Hola')]);
  engine.loadPending();
  await engine.flush();
  assert.deepEqual(server.calls.map(c => c.method), ['PATCH']);
  assert.ok(!events.some(e => e.type === 'recreated'), 'sin copia nueva en este canal');
  assert.ok(events.some(e => e.type === 'parked'));
  assert.equal(engine.pending.size, 0);
  assert.ok(JSON.parse(store.getItem(sync.DOCS_PENDING_KEY)).entries.d1, 'queda estacionada');
  // Y no se vuelve a encolar desde el store de este canal.
  engine.track({docs: [edited]});
  assert.equal(engine.pending.size, 0);
});

test('la cola con ámbito se guarda en la clave del canal, no en la global', async () => {
  const pendingKey = `${sync.DOCS_PENDING_KEY}@g1:general`;
  const store = memoryStorage();
  const server = fakeServer(() => { throw new sync.HttpError(0, {error: 'network'}); });
  const engine = sync.createDocsSync({
    request: server.request,
    storage: store,
    pendingKey,
    legacyPendingKey: sync.DOCS_PENDING_KEY,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  engine.track({docs: [{id: 'local-a', title: 'Nuevo', description: '', body: '<p>x</p>'}]});
  await engine.flush();
  assert.ok(JSON.parse(store.getItem(pendingKey)).entries['local-a']);
  assert.equal(store.getItem(sync.DOCS_PENDING_KEY), null);
});

/* ── E. Tareas del lector sin "copia en conflicto" ─────────────────────── */

function checklistServerDoc(body, updatedAt, extra = {}) {
  return serverDoc('d1', body, {updatedAt, ...extra});
}

test('marcar una tarea con un 409 reaplica solo esa tarea sobre la versión del servidor', async () => {
  const base = checklistServerDoc('- [ ] uno\n- [ ] dos', '2026-10-01T00:00:00.000Z');
  // Mientras tanto otra persona agregó un párrafo.
  const theirs = checklistServerDoc('- [ ] uno\n- [ ] dos\n\nNota de otra persona', '2026-10-01T00:05:00.000Z');
  const events = [];
  const server = fakeServer((call, n) => {
    if (n === 1) throw new sync.HttpError(409, {error: 'conflict', document: theirs});
    return {document: checklistServerDoc(htmlToMarkdown(markdownToHtml(call.body.markdown, 'Doc')), '2026-10-01T00:06:00.000Z')};
  });
  const engine = sync.createDocsSync({request: server.request, onRemote: event => events.push(event)});
  engine.registerRemote([base]);
  const before = sync.serverDocToLocal(base);
  const toggledBody = text.applyChecklistOps(before.body, [{index: 1, done: true}]);
  const after = {...before, body: toggledBody};
  engine.track({docs: [after]});
  assert.equal(engine.noteChecklistToggle('d1', {index: 1, done: true}, before), true);
  await engine.flush();

  assert.deepEqual(server.calls.map(c => c.method), ['PATCH', 'PATCH']);
  assert.ok(!events.some(e => e.type === 'conflict'), 'no se crea copia en conflicto');
  const second = server.calls[1];
  assert.equal(second.body.baseUpdatedAt, '2026-10-01T00:05:00.000Z');
  assert.match(second.body.markdown, /- \[ \] uno\n- \[x\] dos/);
  assert.match(second.body.markdown, /Nota de otra persona/);
  assert.ok(events.some(e => e.type === 'replace'), 'la app adopta la versión combinada');
});

test('si la tarea sigue chocando tras 2 intentos se muestra un error y se adopta la versión del servidor', async () => {
  const base = checklistServerDoc('- [ ] uno', '2026-10-01T00:00:00.000Z');
  let stamp = 1;
  const events = [];
  const statuses = [];
  const server = fakeServer(() => {
    stamp += 1;
    throw new sync.HttpError(409, {error: 'conflict', document: checklistServerDoc(`- [ ] uno\n\nCambio ${stamp}`, `2026-10-01T00:0${stamp}:00.000Z`)});
  });
  const engine = sync.createDocsSync({
    request: server.request,
    onRemote: event => {
      events.push(event);
      if (event.type === 'replace') engine.track({docs: event.docs});
    },
    emit: detail => statuses.push(detail),
  });
  engine.registerRemote([base]);
  const before = sync.serverDocToLocal(base);
  engine.track({docs: [{...before, body: text.applyChecklistOps(before.body, [{index: 0, done: true}])}]});
  engine.noteChecklistToggle('d1', {index: 0, done: true}, before);
  await engine.flush();

  assert.equal(server.calls.length, sync.MAX_CHECKLIST_REBASES + 1);
  assert.ok(!events.some(e => e.type === 'conflict'));
  assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /no pudimos guardar la tarea/);
  assert.equal(engine.pending.size, 0);
});

test('con otras ediciones sin enviar, un 409 sigue el camino normal de conflicto', async () => {
  const base = checklistServerDoc('- [ ] uno', '2026-10-01T00:00:00.000Z');
  const events = [];
  const server = fakeServer(() => {
    throw new sync.HttpError(409, {error: 'conflict', document: checklistServerDoc('Otro', '2026-10-01T00:09:00.000Z')});
  });
  const engine = sync.createDocsSync({request: server.request, onRemote: event => events.push(event)});
  engine.registerRemote([base]);
  const before = sync.serverDocToLocal(base);
  const edited = {...before, title: 'Título cambiado'};
  engine.track({docs: [edited]});
  // La tarea se marca sobre un documento que ya tenía cambios propios.
  assert.equal(engine.noteChecklistToggle('d1', {index: 0, done: true}, edited), false);
  await engine.flush();
  assert.ok(events.some(e => e.type === 'conflict'));
});

test('applyChecklistOps marca por índice y avisa si el ítem ya no existe', () => {
  const html = '<ul class="checklist"><li>a</li><li class="done">b</li></ul>';
  const out = text.applyChecklistOps(html, [{index: 0, done: true}, {index: 1, done: false}]);
  assert.match(out, /<li class="done">a<\/li><li( class="")?>b<\/li>/);
  assert.equal(text.applyChecklistOps(html, [{index: 5, done: true}]), null);
});

/* ── F. Búsqueda ───────────────────────────────────────────────────────── */

test('la búsqueda ignora tildes y mayúsculas y no mira el origen ni autores', () => {
  const docs = [
    {id: 'a', title: 'Reunión de Diseño', description: '', body: '<p>Planificación anual</p>', origin: 'Creado en Bardo', createdByName: 'Ana'},
    {id: 'b', title: 'Año nuevo', description: 'Ideas', body: '<p>Fiesta</p>', origin: 'Subido a Bardo'},
    {id: 'c', title: 'Otro', description: '', body: '<ul><li>Pañuelos</li></ul>'},
  ];
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'reunion').map(d => d.id), ['a']);
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'PLANIFICACION').map(d => d.id), ['a']);
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'año').map(d => d.id), ['b']);
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'panuelos').map(d => d.id), ['c']);
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'bardo'), [], 'no busca en el origen');
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'ana'), [], 'no busca en autores');
  assert.deepEqual(text.filterDocumentsByQuery(docs, 'diseño anual').map(d => d.id), ['a'], 'varias palabras');
  assert.equal(text.filterDocumentsByQuery(docs, '  ').length, 3);
});

/* ── J. Copiar texto ───────────────────────────────────────────────────── */

test('el texto plano conserva párrafos, saltos de línea, listas, tareas y tablas', () => {
  const html = [
    '<h2>Agenda</h2>',
    '<p>Línea uno<br>Línea dos</p>',
    '<p>Otro párrafo</p>',
    '<ol start="3"><li>tres</li><li>cuatro</li></ol>',
    '<ul class="checklist"><li class="done">hecha</li><li>pendiente</li></ul>',
    '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
  ].join('');
  const plain = text.htmlToPlainText(html);
  assert.equal(plain, [
    'Agenda',
    '',
    'Línea uno',
    'Línea dos',
    '',
    'Otro párrafo',
    '',
    '3. tres',
    '4. cuatro',
    '',
    '☑ hecha',
    '☐ pendiente',
    '',
    'A | B',
    '1 | 2',
  ].join('\n'));
  assert.equal(
    text.documentPlainText({title: 'T', description: '', body: '<p>a</p><p>b</p>'}),
    'T\n\na\n\nb',
  );
});

test('copiar usa execCommand si el portapapeles del iframe rechaza el permiso', async () => {
  const appended = [];
  const fakeDoc = {
    body: {appendChild: el => appended.push(el)},
    createElement: () => ({style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() {}, value: ''}),
    execCommand: command => command === 'copy',
  };
  const rejecting = {writeText: async () => { throw new Error('NotAllowedError'); }};
  assert.equal(await copyTextToClipboard('hola', {clipboard: rejecting, doc: fakeDoc}), true);
  assert.equal(appended[0].value, 'hola');
  const accepting = {written: null, async writeText(v) { this.written = v; }};
  assert.equal(await copyTextToClipboard('chao', {clipboard: accepting, doc: fakeDoc}), true);
  assert.equal(accepting.written, 'chao');
  assert.equal(await copyTextToClipboard('x', {clipboard: rejecting, doc: {...fakeDoc, execCommand: () => false}}), false);
});

/* ── I. Listas numeradas ───────────────────────────────────────────────── */

test('una lista que empieza en 3 se conserva al leer y al guardar', () => {
  const html = markdownToHtml('# T\n\n3. tres\n4. cuatro', 'T');
  assert.equal(html, '<ol start="3"><li>tres</li><li>cuatro</li></ol>');
  assert.equal(htmlToMarkdown(html), '3. tres\n4. cuatro');
  // Por Plate (editor) y de vuelta.
  const value = htmlToPlateValue(html);
  assert.equal(value[0].listRestart, 3);
  assert.equal(htmlToMarkdown(plateValueToHtml(value)), '3. tres\n4. cuatro');
});

test('un paso numerado después de un párrafo mantiene su número', () => {
  const html = markdownToHtml('# T\n\n1. Paso uno\n\nExplicación\n\n2. Paso dos', 'T');
  assert.equal(html, '<ol><li>Paso uno</li></ol>\n<p>Explicación</p>\n<ol start="2"><li>Paso dos</li></ol>');
  const roundTrip = htmlToMarkdown(plateValueToHtml(htmlToPlateValue(html)));
  assert.equal(roundTrip, '1. Paso uno\n\nExplicación\n\n2. Paso dos');
});

test('numeración perezosa (1. 1. 1.) sigue contando y un salto (5.) reinicia', () => {
  assert.equal(markdownToHtml('1. a\n1. b\n1. c'), '<ol><li>a</li><li>b</li><li>c</li></ol>');
  assert.equal(markdownToHtml('1. a\n2. b\n5. c'), '<ol><li>a</li><li>b</li></ol><ol start="5"><li>c</li></ol>');
  assert.equal(markdownToHtml('1. a\n2. b\n\n1. c'), '<ol><li>a</li><li>b</li></ol><ol start="1"><li>c</li></ol>');
});

test('el editor normaliza al abrir: listStart se calcula y respeta el número inicial', async () => {
  const {createSlateEditor} = await import('../activity-app/node_modules/platejs/dist/index.js');
  const {BaseListPlugin} = await import('../activity-app/node_modules/@platejs/list/dist/index.js');
  const value = htmlToPlateValue('<ol start="3"><li>a</li><li>b</li></ol>');
  const editor = createSlateEditor({plugins: [BaseListPlugin], value, shouldNormalizeEditor: true});
  assert.deepEqual(editor.children.map(node => node.listStart), [3, 4]);
  assert.equal(htmlToMarkdown(plateValueToHtml(editor.children)), '3. a\n4. b');
});

/* ── N. Tablas ─────────────────────────────────────────────────────────── */

test('comandos de tabla: agregar y quitar filas y columnas', async () => {
  const {createSlateEditor} = await import('../activity-app/node_modules/platejs/dist/index.js');
  const {BaseTablePlugin} = await import('../activity-app/node_modules/@platejs/table/dist/index.js');
  const commands = await import('../activity-app/src/editor/bardo-editor-commands.js');
  const editor = createSlateEditor({
    plugins: [BaseTablePlugin],
    value: [commands.createDefaultTable(), {type: 'p', children: [{text: 'fin'}]}],
  });
  editor.tf.select({path: [0, 1, 0, 0, 0], offset: 0});
  assert.equal(commands.isInTable(editor), true);
  const size = () => [editor.children[0].children.length, editor.children[0].children[0].children.length];
  assert.deepEqual(size(), [2, 2]);
  assert.equal(commands.runTableAction(editor, 'row-below'), true);
  assert.deepEqual(size(), [3, 2]);
  commands.runTableAction(editor, 'column-right');
  assert.deepEqual(size(), [3, 3]);
  commands.runTableAction(editor, 'delete-column');
  assert.deepEqual(size(), [3, 2]);
  commands.runTableAction(editor, 'delete-row');
  assert.deepEqual(size(), [2, 2]);
  // "Eliminar columna" quita la columna del cursor (la primera); la tabla se guarda como tabla.
  const saved = htmlToMarkdown(plateValueToHtml(editor.children));
  assert.match(saved, /^\| {2}\| Encabezado 2 \|\n\| --- \| --- \|/);
  commands.runTableAction(editor, 'delete-table');
  assert.equal(editor.children.some(node => node.type === 'table'), false);
  editor.tf.select({path: [0, 0], offset: 0});
  assert.equal(commands.runTableAction(editor, 'row-below'), false, 'fuera de una tabla no hace nada');
});

test('la barra y el menú "/" usan los mismos nombres de bloques', async () => {
  const {BLOCK_LABELS} = await import('../activity-app/src/editor/bardo-editor-commands.js');
  assert.deepEqual(
    [BLOCK_LABELS.h1, BLOCK_LABELS.ul, BLOCK_LABELS.ol, BLOCK_LABELS.checklist, BLOCK_LABELS.code_block, BLOCK_LABELS.callout, BLOCK_LABELS.spoiler],
    ['Título 1', 'Lista', 'Lista numerada', 'Lista de tareas', 'Bloque de código', 'Nota destacada', 'Desplegable'],
  );
});

/* ── B / C. Documento nuevo y título ───────────────────────────────────── */

test('un documento nuevo vacío no se crea; con contenido sí', () => {
  assert.equal(text.isEmptyDocSnapshot({title: '', description: '', body: '<p><br></p>'}), true);
  assert.equal(text.isEmptyDocSnapshot({title: '  ', description: '', body: '<p></p><p><br></p>'}), true);
  assert.equal(text.isEmptyDocSnapshot({title: 'Acta', description: '', body: ''}), false);
  assert.equal(text.isEmptyDocSnapshot({title: '', description: '', body: '<p>hola</p>'}), false);
  assert.equal(text.isEmptyDocSnapshot({title: '', description: '', body: '<hr>'}), false);
});

test('pegar varias líneas en el título deja una sola línea', () => {
  assert.equal(text.flattenPastedTitle('Acta\r\n  reunión\n\nlunes'), 'Acta reunión lunes');
});

/* ── Contrato 1: tarjeta de /doc-new abre el editor ────────────────────── */

test('destinos de lanzamiento: edit:<id>, documentos y secciones', () => {
  assert.deepEqual(parseDocsLaunchTarget('edit:abc-123'), {type: 'edit', id: 'abc-123'});
  assert.deepEqual(parseDocsLaunchTarget('abc-123'), {type: 'doc', id: 'abc-123'});
  assert.deepEqual(parseDocsLaunchTarget('docs'), {type: 'section', target: 'docs'});
  assert.deepEqual(parseDocsLaunchTarget('new-doc:Plan'), {type: 'section', target: 'new-doc:Plan'});
  assert.deepEqual(parseDocsLaunchTarget('planner-session:9'), {type: 'section', target: 'planner-session:9'});
  assert.deepEqual(parseDocsLaunchTarget('edit:'), {type: 'none'});
  assert.deepEqual(parseDocsLaunchTarget(''), {type: 'none'});
});

/* ── D. Importaciones que no se pueden leer ────────────────────────────── */

test('archivos ilegibles dan un error en español y se reportan; los de red no', async () => {
  const failures = [];
  const docs = [
    {id: 'pdf-roto', importStatus: 'pending', hasSource: true, sourceType: 'docx', title: 'Roto'},
    {id: 'sin-red', importStatus: 'pending', hasSource: true, sourceType: 'pdf', title: 'Red'},
  ];
  const fetchImpl = async path => {
    if (path.includes('sin-red')) throw new TypeError('Failed to fetch');
    return {ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('esto no es un docx').buffer};
  };
  const ready = await importer.normalizePendingImports(docs, {
    request: async () => { throw new Error('no debería normalizar'); },
    fetchImpl,
    getHeaders: () => ({}),
    onFailure: (doc, error) => failures.push({id: doc.id, code: error.code, message: error.userMessage}),
  });
  assert.deepEqual(ready, []);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].id, 'pdf-roto');
  assert.equal(failures[0].code, 'unreadable');
  assert.match(failures[0].message, /No pudimos leer este documento Word/);
});

test('un PDF sin texto (escaneado) no se convierte en un documento con una nota', async () => {
  const {PDFDocument} = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const file = {name: 'escaneo.pdf', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  await assert.rejects(importer.convertDocumentFile(file), error => error.code === 'no_text' && /escaneo/.test(error.userMessage));
});

test('mensajes de importación: contraseña, .doc, tamaño y texto en Windows-1252', async () => {
  const password = importer.toImportError(Object.assign(new Error('No password given'), {name: 'PasswordException'}), 'PDF');
  assert.equal(password.code, 'password');
  assert.match(password.userMessage, /contraseña/);
  await assert.rejects(importer.convertDocumentFile({name: 'viejo.doc', size: 10}), /\.docx/);
  await assert.rejects(
    importer.convertDocumentFile({name: 'enorme.pdf', size: importer.MAX_LOCAL_UPLOAD_BYTES + 1}),
    error => error.code === 'too_large',
  );
  const latin1 = Uint8Array.from([0x41, 0xf1, 0x6f, 0x20, 0x63, 0x61, 0x6d, 0x69, 0xf3, 0x6e]); // "Año camión"
  assert.equal(importer.decodeTextFile(latin1), 'Año camión');
  assert.equal(importer.decodeTextFile(new TextEncoder().encode('Año camión')), 'Año camión');
});

/* ── L. Enlaces externos ───────────────────────────────────────────────── */

test('los enlaces se abren con openExternalLink de Discord y solo si son http(s)', async () => {
  const opened = [];
  const sdk = {commands: {openExternalLink: async ({url}) => { opened.push(url); return {opened: true}; }}};
  assert.equal(await openExternalUrl('https://ejemplo.cl/a', {sdk}), true);
  assert.deepEqual(opened, ['https://ejemplo.cl/a']);
  assert.equal(await openExternalUrl('javascript:alert(1)', {sdk}), false);
  const declined = {commands: {openExternalLink: async () => ({opened: false})}};
  assert.equal(await openExternalUrl('https://ejemplo.cl', {sdk: declined}), false);
  const windows = [];
  assert.equal(await openExternalUrl('https://ejemplo.cl', {sdk: null, openWindow: (...args) => windows.push(args)}), true);
  assert.equal(windows[0][1], '_blank');
});

/* ── Mensajes de error en español ──────────────────────────────────────── */

test('errores de red y del servidor se muestran en español', () => {
  assert.equal(sync.userFacingError(new sync.HttpError(0, {error: 'network'})), sync.NETWORK_ERROR_MESSAGE);
  assert.equal(
    sync.userFacingError(new sync.HttpError(403, {error: 'forbidden', message: 'Este documento no está compartido en este canal de Discord.'})),
    'Este documento no está compartido en este canal de Discord.',
  );
  assert.match(sync.userFacingError(new sync.HttpError(502, {error: 'x'})), /no responde/);
  assert.equal(sync.userFacingError(new TypeError('Failed to fetch'), 'Respaldo'), 'Respaldo');
  assert.doesNotMatch(friendlyAuthError(new Error('RPC_ERROR: something')), /RPC/);
  assert.match(friendlyAuthError(Object.assign(new Error('x'), {code: 'timeout'})), /tardó demasiado/);
});
