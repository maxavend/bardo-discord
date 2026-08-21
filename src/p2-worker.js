import { InteractionResponseFlags, InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import securityWorker from './security-worker.js';
import { ACTIVITY_ACTIONS, verifyActivityAccess, verifySessionResource } from './auth/activity-access.js';
import { BARDO_BOARD_PREFIX, priorityLabel, statusLabel } from './kanban.js';
import { findBoard, listBoards, loadBoard, loadTask } from './kanban-db.js';
import { BARDO_EVENT_PREFIX, formatDuration, parseEventTarget } from './event.js';
import { findEvent, linkTaskToEvent, loadEvent } from './event-db.js';
import { createDatabaseSnapshot } from './backup-r2.js';
import { DocumentService } from './services/document-service.js';
import { EventService } from './services/event-service.js';
import { MemberDirectoryService } from './services/member-directory.js';
import { NotificationService } from './services/notifications.js';
import { TaskService } from './services/task-service.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function ephemeral(content) {
  return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: InteractionResponseFlags.EPHEMERAL, allowed_mentions: { parse: [] } } });
}

function actionButton(label, customId) {
  return { type: 1, components: [{ type: 2, style: 1, label, custom_id: customId }] };
}

async function verifyInteraction(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) return null;
  const body = await request.clone().text();
  if (!await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) return null;
  try { return JSON.parse(body); } catch { return null; }
}

function optionList(interaction) {
  const top = interaction.data?.options || [];
  const subcommand = top.find((entry) => Array.isArray(entry.options));
  return { subcommand: subcommand?.name || null, options: subcommand?.options || top };
}

function optionValue(options, name) {
  return options?.find((entry) => entry.name === name)?.value;
}

function resolvedName(interaction, userId) {
  if (!userId) return null;
  const member = interaction.data?.resolved?.members?.[userId];
  const user = interaction.data?.resolved?.users?.[userId];
  return member?.nick || user?.global_name || user?.username || String(userId);
}

function actor(interaction) {
  const user = interaction.member?.user || interaction.user;
  if (!user?.id) return null;
  return { userId: String(user.id), displayName: interaction.member?.nick || user.global_name || user.username || String(user.id), avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null };
}

function waitUntilFor(ctx) {
  return typeof ctx?.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : undefined;
}

function autocompleteResponse(choices) {
  return json({ type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, data: { choices: choices.slice(0, 25) } });
}

function focusedOption(options = [], path = []) {
  for (const entry of options) {
    if (entry.focused) return { entry, path, siblings: options };
    if (Array.isArray(entry.options)) {
      const nested = focusedOption(entry.options, [...path, entry.name]);
      if (nested) return nested;
    }
  }
  return null;
}

async function entityChoices(env, interaction) {
  const guildId = interaction.guild_id;
  if (!guildId) return [];
  const focused = focusedOption(interaction.data?.options || []);
  if (!focused) return [];
  const query = String(focused.entry.value || '').trim();
  const command = interaction.data?.name;
  const subcommand = focused.path[0] || null;
  const name = focused.entry.name;

  if ((command === 'tablero' && subcommand === 'abrir' && name === 'tablero') || (command === 'tarea' && name === 'tablero')) {
    const result = await env.DB.prepare(`SELECT id, name FROM boards WHERE guild_id = ? AND (? = '' OR name LIKE ? COLLATE NOCASE) ORDER BY updated_at DESC LIMIT 25`)
      .bind(guildId, query, `%${query}%`).all();
    return (result.results || []).map((row) => ({ name: String(row.name).slice(0, 100), value: String(row.id).slice(0, 100) }));
  }

  if (command === 'tarea' && name === 'estado') {
    const boardValue = optionValue(focused.siblings, 'tablero');
    const board = boardValue ? await findBoard(env.DB, guildId, boardValue) : null;
    return (board?.columns || []).filter((column) => !query || String(column.label).toLowerCase().includes(query.toLowerCase()))
      .map((column) => ({ name: String(column.label).slice(0, 100), value: String(column.id).slice(0, 100) }));
  }

  if (command === 'evento' && ['abrir', 'duplicar'].includes(subcommand) && name === 'evento') {
    const result = await env.DB.prepare(`SELECT id, title, event_date FROM events WHERE guild_id = ? AND (? = '' OR title LIKE ? COLLATE NOCASE) ORDER BY starts_at DESC LIMIT 25`)
      .bind(guildId, query, `%${query}%`).all();
    return (result.results || []).map((row) => ({ name: `${row.title}${row.event_date ? ` · ${row.event_date}` : ''}`.slice(0, 100), value: String(row.id).slice(0, 100) }));
  }

  if (command === 'documento' && subcommand === 'abrir' && name === 'documento') {
    const documents = await new DocumentService(env).searchForGuild(guildId, query, 25);
    return documents.map((row) => ({ name: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100) }));
  }

  return [];
}

function labelInput(customId, label, { value = '', placeholder = '', required = true, style = 1, maxLength = 200 } = {}) {
  return { type: 18, label, component: { type: 4, custom_id: customId, style, value: String(value || '').slice(0, maxLength), placeholder, required, max_length: maxLength } };
}

function eventCreateModal(defaults = {}) {
  return json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: 'bardo:event:create:v1', title: 'Crear evento',
      components: [
        labelInput('title', 'Nombre', { value: defaults.title, placeholder: 'Weekly de producto', maxLength: 160 }),
        labelInput('date', 'Fecha', { value: defaults.date, placeholder: '2026-08-27', maxLength: 10 }),
        labelInput('time', 'Hora', { value: defaults.time, placeholder: '15:30 o 3:30 pm', maxLength: 20 }),
        labelInput('duration', 'Duración', { value: defaults.duration || '60m', placeholder: '60m, 90m, 3h o 3h30m', maxLength: 20 }),
        labelInput('description', 'Descripción', { value: defaults.description, placeholder: 'Objetivo o contexto de la sesión', required: false, style: 2, maxLength: 1000 }),
      ],
    },
  });
}

function collectModalValues(node, out = {}) {
  if (!node) return out;
  if (Array.isArray(node)) { for (const item of node) collectModalValues(item, out); return out; }
  if (typeof node !== 'object') return out;
  if (node.custom_id && node.value !== undefined) out[node.custom_id] = node.value;
  if (node.component) collectModalValues(node.component, out);
  if (node.components) collectModalValues(node.components, out);
  return out;
}

async function createEventFromInteraction(interaction, env, ctx, values) {
  if (!interaction.guild_id) return ephemeral('Los eventos de Bardo funcionan dentro de un servidor.');
  const person = actor(interaction);
  const event = await new EventService(env).create({
    guildId: interaction.guild_id,
    title: String(values.title || '').trim(), description: String(values.description || '').trim(),
    eventDate: String(values.date || '').trim(), startTime: String(values.time || '').trim(),
    timezone: String(values.timezone || 'UTC').trim(), expectedDuration: values.duration || '60m',
    status: 'scheduled', channelId: interaction.channel_id || null,
    participants: [person, values.participant].filter(Boolean), createdBy: person?.userId || 'unknown',
  }, { guildId: interaction.guild_id, actorUserId: person?.userId, waitUntil: waitUntilFor(ctx) });
  return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `📅 **${event.title}**\n${event.eventDate} · ${event.startTime} · ${event.timezone} · ${formatDuration(event.expectedDuration)}`, components: [actionButton('Abrir planner', `${BARDO_EVENT_PREFIX}${event.id}`)] } });
}

async function handleTaskCommand(interaction, env, ctx) {
  if (!interaction.guild_id) return ephemeral('Las tareas de Bardo funcionan dentro de un servidor.');
  const { options } = optionList(interaction);
  const boardValue = String(optionValue(options, 'tablero') || '').trim();
  const board = await findBoard(env.DB, interaction.guild_id, boardValue);
  if (!board) return ephemeral('No encontré ese tablero. Usa el autocomplete para elegir uno.');
  const assigneeId = optionValue(options, 'responsable') || null;
  try {
    const task = await new TaskService(env).create({
      boardId: board.id,
      title: String(optionValue(options, 'titulo') || '').trim(), description: String(optionValue(options, 'descripcion') || '').trim(),
      status: optionValue(options, 'estado') || undefined, priority: optionValue(options, 'prioridad') || 'medium',
      assigneeId, assigneeName: resolvedName(interaction, assigneeId), labels: String(optionValue(options, 'chips') || '').trim(),
      createdBy: interaction.member?.user?.id || interaction.user?.id || 'unknown',
    }, { guildId: interaction.guild_id, actorUserId: interaction.member?.user?.id || interaction.user?.id, waitUntil: waitUntilFor(ctx) });
    return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `📝 **${task.title}**\nTablero: **${board.name}** · Columna: **${statusLabel(task.status)}** · Prioridad: **${priorityLabel(task.priority)}**${task.assigneeName ? `\nResponsable: **${task.assigneeName}**` : ''}`, components: [actionButton('Abrir tablero', `${BARDO_BOARD_PREFIX}${board.id}`)] } });
  } catch (error) {
    return ephemeral(error instanceof Error ? error.message : 'No pude crear la tarea.');
  }
}

async function handleEventCreateCommand(interaction, env, ctx) {
  const { options } = optionList(interaction);
  const title = optionValue(options, 'nombre');
  const date = optionValue(options, 'fecha');
  const time = optionValue(options, 'hora');
  const duration = optionValue(options, 'duracion') || '60m';
  const description = optionValue(options, 'descripcion') || '';
  const timezone = optionValue(options, 'zona') || 'UTC';
  const participantId = optionValue(options, 'participante');
  if (!title || !date || !time) return eventCreateModal({ title, date, time, duration, description });
  const participant = participantId ? { userId: String(participantId), displayName: resolvedName(interaction, participantId) } : null;
  try { return await createEventFromInteraction(interaction, env, ctx, { title, date, time, duration, description, timezone, participant }); }
  catch (error) { return ephemeral(error instanceof Error ? error.message : 'No pude crear el evento.'); }
}

async function handleDocumentOpen(interaction, env) {
  if (!interaction.guild_id) return ephemeral('Los documentos del servidor se abren dentro de un servidor.');
  const { options } = optionList(interaction);
  const documentId = String(optionValue(options, 'documento') || '').trim();
  const row = await env.DB.prepare(`SELECT DISTINCT d.id, d.title FROM documents d JOIN activity_contexts a ON a.document_id = d.id WHERE a.guild_id = ? AND d.id = ? LIMIT 1`)
    .bind(interaction.guild_id, documentId).first();
  if (!row) return ephemeral('No encontré ese documento en este servidor.');
  return json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `📄 **${row.title}**`, components: [actionButton('Abrir documento', `bardo:open:${row.id}`)] } });
}

async function handleInteraction(request, env, ctx) {
  const interaction = await verifyInteraction(request, env);
  if (!interaction) return new Response('Bad request signature.', { status: 401 });
  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    try { return autocompleteResponse(await entityChoices(env, interaction)); }
    catch (error) { console.error('[Bardo] autocomplete failed:', error); return autocompleteResponse([]); }
  }
  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'tarea') return handleTaskCommand(interaction, env, ctx);
  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'evento' && optionList(interaction).subcommand === 'crear') return handleEventCreateCommand(interaction, env, ctx);
  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'documento' && optionList(interaction).subcommand === 'abrir') return handleDocumentOpen(interaction, env);
  if (interaction.type === InteractionType.MODAL_SUBMIT && interaction.data?.custom_id === 'bardo:event:create:v1') {
    try { return await createEventFromInteraction(interaction, env, ctx, collectModalValues(interaction.data?.components)); }
    catch (error) { return ephemeral(error instanceof Error ? error.message : 'No pude crear el evento.'); }
  }
  return securityWorker.fetch(request, env, ctx);
}

function parseParts(pathname, prefix) {
  const raw = pathname.slice(prefix.length).replace(/^\//, '');
  if (!raw) return [];
  try { return raw.split('/').filter(Boolean).map(decodeURIComponent); } catch { return null; }
}

async function activitySession(request, env, action = ACTIVITY_ACTIONS.CONTEXT_READ) {
  return verifyActivityAccess(request, env, { action });
}

function accessGuild(access) {
  return access?.token?.guild || access?.context?.guildId || null;
}

async function handleMemberDirectory(request, env, url) {
  const access = await activitySession(request, env);
  if (!access.ok) return access.response;
  const guildId = accessGuild(access);
  if (!guildId) return json({ error: 'Guild context required' }, 403);
  const query = url.searchParams.get('query') || url.searchParams.get('q') || '';
  if (query.trim().length < 2) return json({ members: [], query, minQueryLength: 2 });
  try {
    const members = await new MemberDirectoryService(env).search({ guildId, query, limit: url.searchParams.get('limit') || 25, includeBots: url.searchParams.get('include_bots') === '1' });
    return json({ members, query });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Member search failed' }, 502);
  }
}

async function handleLegacyGuildMembers(request, env, url, boardId) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.MEMBER_READ, resourceType: 'board', resourceId: boardId });
  if (!access.ok) return access.response;
  const board = await loadBoard(env.DB, boardId);
  if (!board) return json({ error: 'Not found' }, 404);
  const resourceError = verifySessionResource(access, { resourceType: 'board', resourceId: boardId, guildId: board.guildId });
  if (resourceError) return resourceError;
  const query = url.searchParams.get('query') || '';
  if (query.trim().length < 2) return json({ ok: true, members: [] });
  const members = await new MemberDirectoryService(env).search({ guildId: board.guildId, query, limit: 25 });
  return json({ ok: true, members: members.map((member) => ({ id: member.userId, name: member.displayName, username: member.username, avatarUrl: member.avatarUrl, roles: member.roleIds })) });
}

async function handleBoardTaskCreate(request, env, ctx, boardId) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.TASK_WRITE, resourceType: 'board', resourceId: boardId });
  if (!access.ok) return access.response;
  const board = await loadBoard(env.DB, boardId);
  if (!board) return json({ error: 'Not found' }, 404);
  const resourceError = verifySessionResource(access, { resourceType: 'board', resourceId: boardId, guildId: board.guildId });
  if (resourceError) return resourceError;
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  try {
    const task = await new TaskService(env).create({ ...payload, boardId, createdBy: access.userId }, { guildId: board.guildId, actorUserId: access.userId, waitUntil: waitUntilFor(ctx) });
    return json({ ok: true, task }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid task' }, 400); }
}

async function handleTaskUpdate(request, env, ctx, taskId) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.TASK_WRITE });
  if (!access.ok) return access.response;
  const existing = await loadTask(env.DB, taskId);
  if (!existing) return json({ error: 'Not found' }, 404);
  const board = await loadBoard(env.DB, existing.boardId);
  if (!board) return json({ error: 'Not found' }, 404);
  const resourceError = verifySessionResource(access, { resourceType: 'board', resourceId: board.id, guildId: board.guildId });
  if (resourceError) return resourceError;
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  try {
    const task = await new TaskService(env).update(taskId, payload, { guildId: board.guildId, actorUserId: access.userId, waitUntil: waitUntilFor(ctx) });
    return json({ ok: true, task });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid task' }, 400); }
}

async function handleEventTaskCreate(request, env, ctx, eventId) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.TASK_WRITE, resourceType: 'event', resourceId: eventId });
  if (!access.ok) return access.response;
  const event = await loadEvent(env.DB, eventId);
  if (!event) return json({ error: 'Not found' }, 404);
  const resourceError = verifySessionResource(access, { resourceType: 'event', resourceId: eventId, guildId: event.guildId });
  if (resourceError) return resourceError;
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  const board = await findBoard(env.DB, event.guildId, payload.boardId || payload.board || '');
  if (!board) return json({ error: 'Tablero no encontrado en este servidor.' }, 400);
  try {
    const task = await new TaskService(env).create({ ...payload, boardId: board.id, createdBy: access.userId }, { guildId: event.guildId, actorUserId: access.userId, waitUntil: waitUntilFor(ctx) });
    await linkTaskToEvent(env.DB, { eventId, blockId: payload.blockId || null, itemId: payload.itemId || null, taskId: task.id });
    return json({ ok: true, task }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid task' }, 400); }
}

async function eventAccess(request, env, eventId, action = ACTIVITY_ACTIONS.EVENT_WRITE) {
  const access = await verifyActivityAccess(request, env, { action, resourceType: 'event', resourceId: eventId });
  if (!access.ok) return access;
  const event = await loadEvent(env.DB, eventId);
  if (!event) return { ok: false, response: json({ error: 'Not found' }, 404) };
  const resourceError = verifySessionResource(access, { resourceType: 'event', resourceId: eventId, guildId: event.guildId });
  return resourceError ? { ok: false, response: resourceError } : { ...access, event };
}

async function handleEventMutation(request, env, ctx, eventId, action) {
  const access = await eventAccess(request, env, eventId);
  if (!access.ok) return access.response;
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  try {
    const service = new EventService(env);
    if (action === 'participants') {
      const participants = await service.replaceParticipants(eventId, payload.participants, { guildId: access.event.guildId, actorUserId: access.userId, waitUntil: waitUntilFor(ctx) });
      return json({ ok: true, participants });
    }
    const event = await service.update(eventId, payload, { guildId: access.event.guildId, actorUserId: access.userId, waitUntil: waitUntilFor(ctx) });
    return json({ ok: true, event });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid event' }, 400); }
}

async function handleEventCollectionCreate(request, env, ctx) {
  const access = await activitySession(request, env, ACTIVITY_ACTIONS.EVENT_WRITE);
  if (!access.ok) return access.response;
  const contextEventId = parseEventTarget(access.context?.documentId);
  const source = contextEventId ? await loadEvent(env.DB, contextEventId) : null;
  const guildId = source?.guildId || accessGuild(access);
  if (!guildId) return json({ error: 'Guild context required' }, 403);
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: 'Invalid JSON payload' }, 400);
  try {
    const event = await new EventService(env).create({ ...payload, guildId, createdBy: access.userId }, { guildId, actorUserId: access.userId, userTimezone: payload.timezone, waitUntil: waitUntilFor(ctx) });
    return json({ ok: true, event }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid event' }, 400); }
}

async function handleNotificationPreferences(request, env) {
  const access = await activitySession(request, env);
  if (!access.ok) return access.response;
  const guildId = accessGuild(access);
  if (!guildId) return json({ error: 'Guild context required' }, 403);
  const service = new NotificationService(env);
  if (request.method === 'GET') return json({ preferences: await service.getPreferences(guildId, access.userId) });
  if (request.method === 'PATCH') {
    const payload = await request.json().catch(() => null);
    if (!payload?.eventType) return json({ error: 'eventType is required' }, 400);
    try { return json({ preference: await service.setPreference({ guildId, userId: access.userId, eventType: payload.eventType, dmEnabled: payload.dmEnabled !== false, reminderOffsetMinutes: payload.reminderOffsetMinutes ?? null }) }); }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid preference' }, 400); }
  }
  return new Response('Method not allowed', { status: 405 });
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/') return handleInteraction(request, env, ctx);
    if (url.pathname === '/api/member-directory' && request.method === 'GET') return handleMemberDirectory(request, env, url);
    if (url.pathname === '/api/notification-preferences') return handleNotificationPreferences(request, env);

    const boardParts = url.pathname.startsWith('/api/boards/') ? parseParts(url.pathname, '/api/boards') : null;
    if (boardParts?.length === 2 && boardParts[1] === 'guild-members' && request.method === 'GET') return handleLegacyGuildMembers(request, env, url, boardParts[0]);
    if (boardParts?.length === 2 && boardParts[1] === 'tasks' && request.method === 'POST') return handleBoardTaskCreate(request, env, ctx, boardParts[0]);

    const taskParts = url.pathname.startsWith('/api/tasks/') ? parseParts(url.pathname, '/api/tasks') : null;
    if (taskParts?.length === 1 && request.method === 'PATCH') return handleTaskUpdate(request, env, ctx, taskParts[0]);

    const eventParts = url.pathname.startsWith('/api/events/') ? parseParts(url.pathname, '/api/events') : null;
    if (eventParts?.length === 2 && eventParts[1] === 'tasks' && request.method === 'POST') return handleEventTaskCreate(request, env, ctx, eventParts[0]);
    if (eventParts?.length === 2 && eventParts[1] === 'participants' && request.method === 'PUT') return handleEventMutation(request, env, ctx, eventParts[0], 'participants');
    if (eventParts?.length === 1 && request.method === 'PATCH') return handleEventMutation(request, env, ctx, eventParts[0], null);
    if (url.pathname === '/api/events' && request.method === 'POST') return handleEventCollectionCreate(request, env, ctx);

    return securityWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    const notifications = new NotificationService(env);
    const jobs = [];
    if (event?.cron === '0 3 * * *') {
      jobs.push(createDatabaseSnapshot(env));
      jobs.push(notifications.enqueueUrgentTaskReminders().then(() => notifications.processDue()));
    }
    if (event?.cron === '*/5 * * * *' || !event?.cron) {
      jobs.push(notifications.enqueueEventReminders().then(() => notifications.processDue()));
    }
    const work = Promise.all(jobs);
    if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work);
    return work;
  },
};
