import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSIGNEE, setupKanban} from './helpers/kanban.js';
import {CHANNEL} from './helpers/sqlite-d1.js';

const OTHER = '333333333';
const channelPosts = sent => sent.filter(call => call.path === `/channels/${CHANNEL}/messages`);
const dmOpens = sent => sent.filter(call => call.path === '/users/@me/channels');

test('asignar avisa en el canal (mencionando solo al responsable) y por MD, sin bloquear el guardado', async () => {
  const k = await setupKanban();
  const created = await k.createCard({title: 'Preparar demo', assigneeId: ASSIGNEE, assigneeName: 'Ana', dueDate: '2026-10-20'});
  assert.equal(created.status, 201);
  await k.flush();

  const [post] = channelPosts(k.discord.sent);
  assert.deepEqual(post.body.allowed_mentions, {parse: [], users: [ASSIGNEE]});
  const text = JSON.stringify(post.body.components);
  assert.ok(text.includes(`<@${ASSIGNEE}>`));
  assert.ok(text.includes(`bardo:open:kanban-card:${created.json.card.id}`));
  assert.ok(text.includes('20 oct'));

  assert.equal(dmOpens(k.discord.sent)[0].body.recipient_id, ASSIGNEE);
  const dm = k.discord.sent.find(call => call.path === `/channels/dm-${ASSIGNEE}/messages`);
  const dmText = JSON.stringify(dm.body.components);
  assert.ok(dmText.includes('"style":5'), 'el MD usa un botón de enlace');
  assert.ok(dmText.includes(`https://discord.com/channels/`));
  assert.ok(!dmText.includes('custom_id'));

  const card = (await k.call(`/cards/${created.json.card.id}`)).json.card;
  assert.deepEqual(card.notifications, {channel: {status: 'sent', errorCode: null}, dm: {status: 'sent', errorCode: null}});
  assert.ok(card.messageId, 'guarda el mensaje del canal para anclar el hilo');
});

test('guardar no espera a Discord aunque Discord no responda', async () => {
  const k = await setupKanban({respond: ({method}) => (method === 'POST' ? new Promise(() => {}) : null)});
  const created = await k.createCard({title: 'Discord colgado', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  assert.equal(created.status, 201);
  assert.equal(k.discord.sent.length, 1, 'el aviso quedó en curso en segundo plano');
});

test('el MD no incluye la descripción de la tarea', async () => {
  const k = await setupKanban();
  await k.createCard({title: 'Privada', description: 'SECRETO-INTERNO', assigneeId: ASSIGNEE, assigneeName: 'Ana'});
  await k.flush();
  const dm = k.discord.sent.find(call => call.path === `/channels/dm-${ASSIGNEE}/messages`);
  assert.ok(!JSON.stringify(dm.body).includes('SECRETO-INTERNO'));
});

test('asignarse a sí mismo no avisa; reasignar A→B→A avisa una sola vez por persona', async () => {
  const k = await setupKanban();
  const {card} = (await k.createCard({title: 'Sin aviso'})).json;
  await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {assigneeId: ASSIGNEE, assigneeName: 'Ana'}});
  await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {assigneeId: OTHER, assigneeName: 'Beto'}});
  await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {assigneeId: ASSIGNEE, assigneeName: 'Ana'}});
  await k.call(`/cards/${card.id}`, {method: 'PATCH', body: {title: 'Editar no re-avisa'}});
  await k.flush();
  assert.equal(channelPosts(k.discord.sent).length, 2);
  assert.deepEqual(dmOpens(k.discord.sent).map(call => call.body.recipient_id), [ASSIGNEE, OTHER]);
});

test('sin permiso en el canal y con MD cerrados el estado queda visible y se puede reintentar', async () => {
  let failing = true;
  const k = await setupKanban({
    respond: ({method, path}) => {
      if (!failing || method !== 'POST') return null;
      if (path === `/channels/${CHANNEL}/messages`) return Response.json({code: 50013, message: 'Missing Permissions'}, {status: 403});
      if (path.startsWith('/channels/dm-')) return Response.json({code: 50007, message: 'Cannot send messages to this user'}, {status: 403});
      return null;
    },
  });
  const {card} = (await k.createCard({title: 'Falla', assigneeId: ASSIGNEE, assigneeName: 'Ana'})).json;
  await k.flush();
  let fresh = (await k.call(`/cards/${card.id}`)).json.card;
  assert.deepEqual(fresh.notifications.channel, {status: 'failed', errorCode: 'missing_permissions'});
  assert.deepEqual(fresh.notifications.dm, {status: 'failed', errorCode: 'dm_closed'});

  // El poll ve el cambio de estado aunque nadie editó la tarjeta.
  failing = false;
  const retry = await k.call(`/cards/${card.id}/notify`, {method: 'POST'});
  assert.equal(retry.status, 202);
  await k.flush();
  fresh = (await k.call(`/cards/${card.id}`)).json.card;
  assert.equal(fresh.notifications.channel.status, 'sent');
  assert.equal(fresh.notifications.dm.status, 'sent');

  // Un segundo reintento no reenvía lo ya enviado.
  const before = k.discord.sent.length;
  await k.call(`/cards/${card.id}/notify`, {method: 'POST'});
  await k.flush();
  assert.equal(k.discord.sent.length, before);
});

test('un 429 de Discord queda como rate_limited, sin reintentos automáticos', async () => {
  const k = await setupKanban({
    respond: ({method, path}) => (method === 'POST' && path === `/channels/${CHANNEL}/messages`
      ? Response.json({retry_after: 1}, {status: 429}) : null),
  });
  const {card} = (await k.createCard({title: 'Rate', assigneeId: ASSIGNEE, assigneeName: 'Ana'})).json;
  await k.flush();
  assert.equal(channelPosts(k.discord.sent).length, 1);
  assert.equal((await k.call(`/cards/${card.id}`)).json.card.notifications.channel.errorCode, 'rate_limited');
});

test('acuerdos de reunión → tareas: idempotente, un resumen en el canal y un MD por persona', async () => {
  const k = await setupKanban();
  const items = [
    {sourceRef: 'planner:s1:d1', title: 'Enviar minuta', assigneeId: ASSIGNEE, assigneeName: 'Ana'},
    {sourceRef: 'planner:s1:d2', title: 'Pedir cotización', assigneeId: ASSIGNEE, assigneeName: 'Ana'},
    {sourceRef: 'planner:s1:d3', title: 'Sin responsable'},
  ];
  const first = await k.call('/cards/bulk', {method: 'POST', body: {source: {type: 'planner', sessionId: 's1'}, sessionTitle: 'Daily', cards: items}});
  assert.equal(first.status, 201);
  assert.equal(first.json.created.length, 3);
  await k.flush();
  assert.equal(channelPosts(k.discord.sent).length, 1);
  assert.equal(dmOpens(k.discord.sent).length, 1);
  assert.ok(JSON.stringify(channelPosts(k.discord.sent)[0].body).includes('Daily'));

  const again = await k.call('/cards/bulk', {method: 'POST', body: {source: {type: 'planner', sessionId: 's1'}, cards: items}});
  assert.equal(again.status, 200);
  assert.equal(again.json.created.length, 0);
  assert.equal(again.json.existing.length, 3);
  assert.equal(k.db.row('SELECT COUNT(*) AS n FROM kanban_cards').n, 3);

  const bySource = await k.call('/cards?source=planner:s1');
  assert.deepEqual(bySource.json.cards.map(card => card.sourceRef), ['planner:s1:d1', 'planner:s1:d2', 'planner:s1:d3']);
  const {cards} = await k.board();
  const ordered = cards.sort((a, b) => (a.rank < b.rank ? -1 : 1)).map(card => card.title);
  assert.deepEqual(ordered, ['Enviar minuta', 'Pedir cotización', 'Sin responsable']);

  const wrongPrefix = await k.call('/cards/bulk', {method: 'POST', body: {source: {type: 'planner', sessionId: 's2'}, cards: items}});
  assert.equal(wrongPrefix.json.error, 'invalid_source');
});

test('hilo por tarjeta: cuelga del mensaje del aviso y es idempotente', async () => {
  const k = await setupKanban();
  const {card} = (await k.createCard({title: 'Hablarlo', assigneeId: ASSIGNEE, assigneeName: 'Ana'})).json;
  await k.flush();
  const messageId = (await k.call(`/cards/${card.id}`)).json.card.messageId;

  const opened = await k.call(`/cards/${card.id}/thread`, {method: 'POST'});
  assert.equal(opened.status, 200);
  assert.ok(opened.json.card.threadId);
  const threadCall = k.discord.sent.find(call => call.path.endsWith('/threads'));
  assert.equal(threadCall.path, `/channels/${CHANNEL}/messages/${messageId}/threads`);
  assert.equal(threadCall.body.name, '#1 · Hablarlo');
  await k.flush();
  const starter = k.discord.sent.find(call => call.path === `/channels/${opened.json.card.threadId}/messages`);
  assert.ok(starter.body.content.includes(`<@${ASSIGNEE}>`));

  const threadsBefore = k.discord.sent.filter(call => call.path.endsWith('/threads')).length;
  const again = await k.call(`/cards/${card.id}/thread`, {method: 'POST'});
  assert.equal(again.json.card.threadId, opened.json.card.threadId);
  assert.equal(k.discord.sent.filter(call => call.path.endsWith('/threads')).length, threadsBefore);
});

test('hilo sin mensaje previo crea un hilo público en el canal', async () => {
  const k = await setupKanban();
  const {card} = (await k.createCard({title: 'Sin aviso previo'})).json;
  const opened = await k.call(`/cards/${card.id}/thread`, {method: 'POST'});
  assert.equal(opened.status, 200);
  const threadCall = k.discord.sent.find(call => call.path.endsWith('/threads'));
  assert.equal(threadCall.path, `/channels/${CHANNEL}/threads`);
  assert.equal(threadCall.body.type, 11);
});

test('hilos: canal de voz → 409; bot sin permisos → 403 con la lista; 429 → 503', async () => {
  const voice = await setupKanban({channelType: 2});
  const voiceCard = (await voice.createCard({title: 'Voz'})).json.card;
  assert.equal((await voice.call(`/cards/${voiceCard.id}/thread`, {method: 'POST'})).json.error, 'threads_unsupported');
  assert.equal((await voice.call('/board?capabilities=1')).json.capabilities.threadsSupported, false);

  const noPerms = await setupKanban({permissions: '1024'});
  const noPermsCard = (await noPerms.createCard({title: 'Permisos'})).json.card;
  const denied = await noPerms.call(`/cards/${noPermsCard.id}/thread`, {method: 'POST'});
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.json.missing, ['Enviar mensajes', 'Crear hilos públicos', 'Enviar mensajes en hilos']);
  const caps = (await noPerms.call('/board?capabilities=1')).json.capabilities;
  assert.equal(caps.canCreateThreads, false);
  assert.equal(caps.canPostMessages, false);

  const limited = await setupKanban({
    respond: ({method, path}) => (method === 'POST' && path.endsWith('/threads') ? Response.json({retry_after: 2}, {status: 429}) : null),
  });
  const limitedCard = (await limited.createCard({title: 'Rate'})).json.card;
  const busy = await limited.call(`/cards/${limitedCard.id}/thread`, {method: 'POST'});
  assert.equal(busy.status, 503);
  assert.equal((await limited.call(`/cards/${limitedCard.id}`)).json.card.threadPending, false, 'libera el reclamo para reintentar');
});
