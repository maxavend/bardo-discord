import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  CHANNEL,
  GUILD,
  USER,
  authHeaders,
  createDiscordFetch,
  createEnv,
  createTestDb,
  insertDocument,
  insertSession,
} from './helpers/sqlite-d1.js';

function getTestKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  return { publicKey: rawPublicKey, privateKey };
}

const KEYS = getTestKeys();

function signedInteraction(payload) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
  const signature = sign(null, message, KEYS.privateKey).toString('hex');
  return new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body,
  });
}

async function setupDb() {
  const db = createTestDb();
  await insertSession(db);
  return db;
}

function workerEnv(db, extra = {}) {
  return { DISCORD_PUBLIC_KEY: KEYS.publicKey, ...createEnv(db), ...extra };
}

test('Worker mantiene 405 para métodos no soportados sin assets', async () => {
  const req = new Request('http://localhost/', { method: 'PUT' });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 405);
});

test('Worker rechaza requests POST sin firma', async () => {
  const req = new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ type: 1 }) });
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 401);
});

test('Worker responde a PING con PONG', async () => {
  const res = await worker.fetch(signedInteraction({ type: 1 }), { DISCORD_PUBLIC_KEY: KEYS.publicKey }, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).type, 1);
});

test('Worker convierte excepciones no controladas en 500 JSON', async () => {
  const db = await setupDb();
  db.prepare = () => { throw new Error('D1 caído'); };
  const req = new Request('http://localhost/api/documents/doc-1/export', { headers: authHeaders() });
  const res = await worker.fetch(req, createEnv(db));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'internal_error');
});

// ---------------------------------------------------------------------------
// /upload-docs

function uploadInteraction(attachment, extra = {}) {
  return {
    type: 2,
    id: 'cmd-interaction-1',
    token: 'token-cmd-1',
    application_id: '1539704001535156254',
    guild_id: GUILD,
    channel_id: CHANNEL,
    member: { user: { id: USER, username: 'maxi' } },
    data: {
      name: 'upload-docs',
      options: [{ name: 'archivo', value: 'att-1' }],
      resolved: { attachments: { 'att-1': { id: 'att-1', url: 'https://cdn.example.com/file', ...attachment } } },
    },
    ...extra,
  };
}

function uploadFetch({ body, status = 200, patchStatus = 200, patches }) {
  return async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('https://cdn.example.com/')) {
      return new Response(body, { status });
    }
    if (url.includes('/webhooks/')) {
      patches.push(JSON.parse(init.body));
      return new Response('{}', { status: patchStatus });
    }
    return new Response('{}', { status: 404 });
  };
}

async function runUpload(db, attachment, fetchOptions) {
  const patches = [];
  let background = null;
  const env = workerEnv(db, { DISCORD_FETCH: uploadFetch({ ...fetchOptions, patches }) });
  const res = await worker.fetch(signedInteraction(uploadInteraction(attachment)), env, {
    waitUntil(promise) { background = promise; },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  assert.ok(background instanceof Promise);
  await background;
  return { patches, text: JSON.stringify(patches) };
}

test('/upload-docs guarda un Markdown con su ACL y publica la tarjeta', async () => {
  const db = await setupDb();
  const { patches } = await runUpload(db, { filename: 'notas.md', size: 30 }, { body: '# Notas\n\nHola mundo' });
  const doc = db.row('SELECT id, title, import_status FROM documents');
  assert.equal(doc.title, 'Notas');
  assert.equal(doc.import_status, 'ready');
  assert.ok(db.row('SELECT 1 AS ok FROM document_channel_access WHERE document_id = ? AND channel_id = ?', doc.id, CHANNEL));
  assert.match(JSON.stringify(patches[0]), new RegExp(`bardo:open:${doc.id}`));
});

test('/upload-docs guarda un PDF con su archivo original de forma atómica (pending)', async () => {
  const db = await setupDb();
  await runUpload(db, { filename: 'informe.pdf', size: 8, content_type: 'application/pdf' }, { body: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]) });
  const doc = db.row('SELECT import_status, source_type, LENGTH(source_blob) AS bytes FROM documents');
  assert.equal(doc.import_status, 'pending');
  assert.equal(doc.source_type, 'pdf');
  assert.equal(doc.bytes, 8);
});

test('/upload-docs mide los bytes descargados (no confía en attachment.size)', async () => {
  const db = await setupDb();
  const { text } = await runUpload(db, { filename: 'grande.md', size: 10 }, { body: 'x'.repeat(1_800_001) });
  assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, 0);
  assert.match(text, /supera 1,8 MB/);
});

test('/upload-docs avisa que el documento quedó guardado si Discord rechaza la tarjeta', async () => {
  const db = await setupDb();
  const { patches } = await runUpload(db, { filename: 'notas.md', size: 30 }, { body: '# Notas\n\nHola', patchStatus: 400 });
  assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, 1);
  assert.equal(patches.length, 2);
  assert.match(JSON.stringify(patches[1]), /se guardó y ya aparece en \*\*Documentos\*\*/);
});

test('/upload-docs: la tarjeta dice quién lo subió y nombra el botón real', async () => {
  const db = await setupDb();
  const { text } = await runUpload(db, { filename: 'notas.md', size: 30 }, { body: '# Notas\n\nHola' });
  assert.match(text, /Subido por maxi/);
  assert.match(text, /Pulsa \*\*Abrir documento\*\*/);
  assert.match(text, /"label":"Abrir documento"/);
});

for (const [attachment, message] of [
  [{ filename: 'viejo.doc', size: 10 }, /\.doc/],
  [{ filename: 'foto.png', size: 10 }, /\.md/],
  [{ filename: 'enorme.pdf', size: 5_000_000 }, /supera 1,8 MB/],
]) {
  test(`/upload-docs rechaza al instante y en privado (${attachment.filename}) sin diferir`, async () => {
    const db = await setupDb();
    let deferred = false;
    const res = await worker.fetch(signedInteraction(uploadInteraction(attachment)), workerEnv(db), {
      waitUntil() { deferred = true; },
    });
    const json = await res.json();
    assert.equal(json.type, 4);
    assert.equal(json.data.flags & 64, 64);
    assert.match(json.data.content, message);
    assert.equal(deferred, false);
    assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, 0);
  });
}

test('Worker responde con error ephemeral si /upload-docs no tiene archivo adjunto', async () => {
  const db = await setupDb();
  const res = await worker.fetch(signedInteraction({ type: 2, id: 'x', token: 't', data: { name: 'upload-docs', options: [] } }), workerEnv(db));
  const json = await res.json();
  assert.equal(json.type, 4);
  assert.match(json.data.content, /archivo/);
});

// ---------------------------------------------------------------------------
// /api/documents/* (lector y exportación)

test('Worker expone el documento completo con una sesión válida (sin instance id)', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123', title: 'Documento Test', markdown: '# Documento Test\n\nContenido completo' });
  const res = await worker.fetch(new Request('http://localhost/api/documents/doc-123', { headers: authHeaders() }), createEnv(db));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const json = await res.json();
  assert.equal(json.id, 'doc-123');
  assert.equal(json.markdown, '# Documento Test\n\nContenido completo');
});

test('Worker normaliza bardo:open: también en la API de documentos', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123' });
  const res = await worker.fetch(new Request('http://localhost/api/documents/bardo%3Aopen%3Adoc-123', { headers: authHeaders() }), createEnv(db));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 'doc-123');
});

for (const [format, contentType, extension] of [
  ['markdown', 'text/markdown; charset=utf-8', 'md'],
  ['md', 'text/markdown; charset=utf-8', 'md'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['pdf', 'application/pdf', 'pdf'],
]) {
  test(`Worker exporta ${format} con una sesión válida (sin activity_contexts)`, async () => {
    const db = await setupDb();
    insertDocument(db, { id: 'doc-123', title: 'Documento Test', markdown: '# Documento Test\n\nContenido completo' });
    const res = await worker.fetch(
      new Request(`http://localhost/api/documents/doc-123/export?format=${format}`, { headers: authHeaders() }),
      createEnv(db),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), contentType);
    assert.match(res.headers.get('content-disposition'), new RegExp(`attachment; filename=.*\\.${extension}`));
    const buffer = await res.arrayBuffer();
    if (extension === 'md') assert.equal(new TextDecoder().decode(buffer), '# Documento Test\n\nContenido completo');
    else assert.ok(buffer.byteLength > 500);
  });
}

test('Worker no exporta documentos no compartidos con el canal de la sesión', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-otro', channelIds: ['channel-999'] });
  const res = await worker.fetch(new Request('http://localhost/api/documents/doc-otro/export?format=pdf', { headers: authHeaders() }), createEnv(db));
  assert.equal(res.status, 403);
});

test('Worker exige sesión para exportar', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123' });
  const res = await worker.fetch(new Request('http://localhost/api/documents/doc-123/export'), createEnv(db));
  assert.equal(res.status, 401);
});

test('Worker no revela documentos inexistentes sin acceso verificable', async () => {
  const db = await setupDb();
  const res = await worker.fetch(new Request('http://localhost/api/documents/no-existe', { headers: authHeaders() }), createEnv(db));
  assert.equal(res.status, 403);
});

test('POST /api/documents/:id/normalize respeta el estado pending', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'pdf-1', importStatus: 'pending', sourceBlob: new Uint8Array([1, 2]), sourceType: 'pdf' });
  const post = () => worker.fetch(new Request('http://localhost/api/documents/pdf-1/normalize', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: '# PDF\n\nTexto' }),
  }), createEnv(db));
  assert.equal((await post()).status, 200);
  const again = await post();
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, 'already_normalized');
});

test('Worker expone el contexto de activity por instanceId', async () => {
  const db = await setupDb();
  db.run("INSERT INTO activity_contexts (instance_id, document_id, created_at) VALUES ('inst-123', 'doc-123', '2026-08-19T12:00:00.000Z')");
  const res = await worker.fetch(new Request('http://localhost/api/activity-context/inst-123'), { DB: db });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.instanceId, 'inst-123');
  assert.equal(json.documentId, 'doc-123');
});

test('Worker responde 404 para contextos de activity inexistentes', async () => {
  const db = await setupDb();
  const res = await worker.fetch(new Request('http://localhost/api/activity-context/inst-no-existe'), { DB: db });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Botones (LAUNCH_ACTIVITY)

async function clickDocument(db, documentId, { guildId = GUILD, channelId = CHANNEL } = {}) {
  let background = null;
  const res = await worker.fetch(signedInteraction({
    type: 3,
    id: 'interaction-987',
    token: 'token-abc',
    guild_id: guildId,
    channel_id: channelId,
    member: { user: { id: USER } },
    data: { custom_id: `bardo:open:${documentId}` },
  }), workerEnv(db), { waitUntil(promise) { background = promise; } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).type, 12);
  if (background) await background;
}

test('Botón de documento responde LAUNCH_ACTIVITY y guarda el launch intent en segundo plano', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123' });
  await clickDocument(db, 'doc-123');
  assert.equal(db.row('SELECT document_id FROM docs_launch_intents WHERE user_id = ? AND guild_id = ?', USER, GUILD).document_id, 'doc-123');
});

test('Botón no amplía el ACL de un documento de otro servidor ni adopta documentos ajenos', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-ajeno', guildId: 'guild-otro', channelIds: ['chan-otro'] });
  insertDocument(db, { id: 'legacy-suelto', guildId: null, channelIds: [] });
  await clickDocument(db, 'doc-ajeno');
  assert.equal(db.row("SELECT COUNT(*) AS n FROM document_guild_access WHERE document_id = 'doc-ajeno'").n, 1);
  assert.equal(db.row("SELECT COUNT(*) AS n FROM document_channel_access WHERE document_id = 'doc-ajeno'").n, 1);
  assert.equal(db.row("SELECT COUNT(*) AS n FROM document_guild_access WHERE document_id = 'legacy-suelto'").n, 0);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM docs_launch_intents').n, 0);
});

test('Botón de un documento legado sin ACL lo asigna al servidor y canal de la tarjeta', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'legacy-1', guildId: null, channelIds: [] });
  await clickDocument(db, 'legacy-1');
  assert.ok(db.row("SELECT 1 AS ok FROM document_guild_access WHERE document_id = 'legacy-1' AND guild_id = ?", GUILD));
  assert.ok(db.row("SELECT 1 AS ok FROM document_channel_access WHERE document_id = 'legacy-1' AND channel_id = ?", CHANNEL));
});

test('Botón de un documento ya compartido no lo abre a otro canal', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123' });
  await clickDocument(db, 'doc-123', { channelId: 'channel-otro' });
  assert.equal(db.row("SELECT COUNT(*) AS n FROM document_channel_access WHERE document_id = 'doc-123'").n, 1);
});

test('Worker prioriza responder LAUNCH_ACTIVITY aunque el documento haya sido eliminado', async () => {
  const db = await setupDb();
  await clickDocument(db, 'no-existe');
});

test('Worker responde con LAUNCH_ACTIVITY (type 12) a botones bardo:open:planner y bardo:open:new-doc', async () => {
  const db = await setupDb();
  for (const customId of ['bardo:open:planner', 'bardo:open:new-doc', 'bardo:open:planner-session:xyz-123']) {
    const res = await worker.fetch(signedInteraction({
      type: 3, id: `btn-${customId}`, guild_id: GUILD, channel_id: CHANNEL,
      member: { user: { id: USER } }, data: { custom_id: customId },
    }), workerEnv(db));
    assert.equal((await res.json()).type, 12);
  }
});

test('Worker delega assets GET cuando existe el binding ASSETS', async () => {
  const env = { ASSETS: { async fetch() { return new Response('asset-ok', { status: 200 }); } } };
  const res = await worker.fetch(new Request('http://localhost/assets/index.js'), env);
  assert.equal(await res.text(), 'asset-ok');
});

// ---------------------------------------------------------------------------
// Comandos de texto

function textLength(components) {
  let total = 0;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') total += node.content.length;
    for (const child of node.components || []) visit(child);
  };
  components.forEach(visit);
  return total;
}

test('/doc-new crea el documento en el servidor (ACL de servidor y canal) y publica su tarjeta de edición', async () => {
  const db = await setupDb();
  const res = await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-doc-new', token: 't', guild_id: GUILD, channel_id: CHANNEL,
    member: { user: { id: USER, username: 'maxi', global_name: 'Maxi' } },
    data: { name: 'doc-new', options: [{ name: 'titulo', value: 'Borrador Sprint' }] },
  }), workerEnv(db));
  const json = await res.json();
  assert.equal(json.type, 4);

  const doc = db.row('SELECT id, title, original_markdown, created_by, created_by_name, import_status FROM documents');
  assert.equal(doc.title, 'Borrador Sprint');
  assert.equal(doc.original_markdown, '# Borrador Sprint');
  assert.equal(doc.created_by, USER);
  assert.equal(doc.created_by_name, 'Maxi');
  assert.equal(doc.import_status, 'ready');
  assert.ok(db.row('SELECT 1 AS ok FROM document_guild_access WHERE document_id = ? AND guild_id = ?', doc.id, GUILD));
  assert.ok(db.row('SELECT 1 AS ok FROM document_channel_access WHERE document_id = ? AND channel_id = ?', doc.id, CHANNEL));

  const button = json.data.components[0].components.at(-1).components[0];
  assert.equal(button.custom_id, `bardo:open:edit:${doc.id}`);
  assert.equal(button.label, 'Abrir documento');
});

test('/doc-new sin título crea "Sin título" y fuera de un servidor responde efímero sin crear nada', async () => {
  const db = await setupDb();
  await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-doc-new-2', token: 't', guild_id: GUILD, channel_id: CHANNEL, member: { user: { id: USER } },
    data: { name: 'doc-new', options: [] },
  }), workerEnv(db));
  assert.equal(db.row('SELECT title FROM documents').title, 'Sin título');

  const dm = await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-doc-new-3', token: 't', user: { id: USER }, data: { name: 'doc-new', options: [] },
  }), workerEnv(db));
  const json = await dm.json();
  assert.equal(json.data.flags & 64, 64);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, 1);
});

test('Botón "Abrir documento" de /doc-new: lanza la Activity y la lleva al editor de ese documento', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-nuevo', title: 'Nuevo' });
  let background = null;
  const res = await worker.fetch(signedInteraction({
    type: 3, id: 'btn-edit', token: 't', guild_id: GUILD, channel_id: CHANNEL,
    member: { user: { id: USER } }, data: { custom_id: 'bardo:open:edit:doc-nuevo' },
  }), workerEnv(db), { waitUntil(promise) { background = promise; } });
  assert.equal((await res.json()).type, 12);
  await background;
  assert.equal(
    db.row('SELECT document_id FROM docs_launch_intents WHERE user_id = ? AND guild_id = ?', USER, GUILD).document_id,
    'target:edit:doc-nuevo',
  );

  const library = await worker.fetch(new Request('http://localhost/api/docs', { headers: authHeaders() }), createEnv(db));
  const payload = await library.json();
  assert.equal(payload.launchTarget, 'edit:doc-nuevo');
  assert.equal(payload.contextDocumentId, 'doc-nuevo');
  // One-shot: a later launch from the app launcher is not re-routed.
  const again = await (await worker.fetch(new Request('http://localhost/api/docs', { headers: authHeaders() }), createEnv(db))).json();
  assert.equal(again.launchTarget, null);
});

test('Botón de edición de un documento de otro servidor no da acceso ni destino', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-ajeno', guildId: 'guild-otro', channelIds: ['chan-otro'] });
  let background = null;
  await worker.fetch(signedInteraction({
    type: 3, id: 'btn-edit-x', token: 't', guild_id: GUILD, channel_id: CHANNEL,
    member: { user: { id: USER } }, data: { custom_id: 'bardo:open:edit:doc-ajeno' },
  }), workerEnv(db), { waitUntil(promise) { background = promise; } });
  await background;
  assert.equal(db.row("SELECT COUNT(*) AS n FROM document_channel_access WHERE document_id = 'doc-ajeno'").n, 1);
  const payload = await (await worker.fetch(new Request('http://localhost/api/docs', {
    headers: authHeaders(undefined, { 'x-bardo-custom-id': 'bardo:open:edit:doc-ajeno' }),
  }), createEnv(db))).json();
  assert.equal(payload.launchTarget, null);
  assert.equal(payload.contextDocumentId, null);
});

test('/reu-new guarda la reunión y su tarjeta nunca supera el límite de Discord', async () => {
  const db = await setupDb();
  const res = await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-reu-new', token: 't', guild_id: GUILD, channel_id: CHANNEL,
    member: { user: { id: USER, username: 'Max' } },
    data: {
      name: 'reu-new',
      options: [
        { name: 'titulo', value: 'T'.repeat(500) },
        { name: 'fecha', value: '2026-09-15' },
        { name: 'hora', value: '11:30' },
        { name: 'duracion', value: 45 },
        { name: 'descripcion', value: 'D'.repeat(6000) },
      ],
    },
  }), workerEnv(db));
  const json = await res.json();
  assert.equal(json.type, 4);
  assert.match(json.data.components[0].components.at(-1).components[0].custom_id, /^bardo:open:planner-session:/);
  assert.ok(textLength(json.data.components) < 4000, `texto de la tarjeta: ${textLength(json.data.components)}`);
  const saved = db.row('SELECT title, description, target_duration, blocks_json FROM planner_sessions');
  assert.equal(saved.title.length, 200);
  assert.equal(saved.description.length, 1500);
  assert.equal(saved.target_duration, 45);
  // Se puede iniciar de inmediato: un bloque inicial que dura lo pedido.
  const blocks = JSON.parse(saved.blocks_json);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, 'Temas de la reunión');
  assert.equal(blocks[0].type, 'block');
  assert.equal(blocks[0].durationMinutes, 45);
});

test('/reu-new sin duración crea el bloque inicial de 60 minutos', async () => {
  const db = await setupDb();
  await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-reu-new-2', token: 't', guild_id: GUILD, channel_id: CHANNEL,
    member: { user: { id: USER, username: 'Max' } },
    data: { name: 'reu-new', options: [{ name: 'titulo', value: 'Daily' }] },
  }), workerEnv(db));
  const saved = db.row('SELECT target_duration, blocks_json FROM planner_sessions');
  assert.equal(saved.target_duration, 60);
  const [block] = JSON.parse(saved.blocks_json);
  assert.equal(block.durationMinutes, 60);
  assert.ok(block.id);
});

test('Worker responde a /reus listando reuniones del canal', async () => {
  const db = await setupDb();
  const res = await worker.fetch(signedInteraction({
    type: 2, id: 'cmd-reus', token: 't', guild_id: GUILD, channel_id: CHANNEL, member: { user: { id: USER } },
    data: { name: 'reus' },
  }), workerEnv(db));
  const json = await res.json();
  assert.equal(json.data.components[0].components.at(-1).components[0].custom_id, 'bardo:open:planner');
});

// ---------------------------------------------------------------------------
// Cron

test('scheduled() limpia solo registros vencidos y nunca documentos ni reuniones', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-viejo', createdAt: '2020-01-01T00:00:00.000Z' });
  await insertSession(db, { token: 'vencido', expiresAt: '2020-01-01T00:00:00.000Z' });
  db.run("INSERT INTO docs_launch_intents (user_id, guild_id, document_id, created_at) VALUES ('u-old', 'g', 'doc-viejo', '2020-01-01T00:00:00.000Z')");
  db.run("INSERT INTO docs_launch_intents (user_id, guild_id, document_id, created_at) VALUES ('u-new', 'g', 'doc-viejo', ?)", new Date().toISOString());
  db.run("INSERT INTO activity_contexts (instance_id, document_id, created_at) VALUES ('i-old', 'doc-viejo', '2020-01-01T00:00:00.000Z')");
  db.run(
    `INSERT INTO planner_sessions (id, guild_id, channel_id, title, date, start_time, target_duration, blocks_json,
       status, created_at, created_by, updated_at, updated_by)
     VALUES ('reu-vieja', ?, ?, 'Vieja', '2020-01-01', '10:00', 60, '[]', 'completed', '2020-01-01', 'u', '2020-01-01', 'u')`,
    GUILD, CHANNEL,
  );

  const waits = [];
  await worker.scheduled({ cron: '0 3 * * *' }, { DB: db }, { waitUntil: promise => waits.push(promise) });
  await Promise.all(waits);

  assert.equal(db.row('SELECT COUNT(*) AS n FROM docs_sessions').n, 1);
  assert.deepEqual(db.rows('SELECT user_id FROM docs_launch_intents').map(row => row.user_id), ['u-new']);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM activity_contexts').n, 0);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM documents').n, 1);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM planner_sessions').n, 1);
});

test('wrangler.jsonc solo declara crons con trabajo en scheduled()', async () => {
  const { readFileSync } = await import('node:fs');
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const crons = JSON.parse(config.match(/"crons"\s*:\s*(\[[^\]]*\])/)[1]);
  assert.deepEqual(crons, ['0 3 * * *']);
  assert.equal(typeof worker.scheduled, 'function');
});

test('Discord caído al verificar permisos devuelve 503 también en /api/documents', async () => {
  const db = await setupDb();
  insertDocument(db, { id: 'doc-123' });
  const res = await worker.fetch(
    new Request('http://localhost/api/documents/doc-123/export?format=md', { headers: authHeaders() }),
    createEnv(db, { DISCORD_FETCH: createDiscordFetch({ fail: 503 }) }),
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'discord_unavailable');
});
