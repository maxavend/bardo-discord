import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import kanbanWorker from './kanban-worker.js';
import { buildDocumentPayload } from './components.js';
import { loadActivityContext, saveActivityContext, saveDocument } from './db.js';
import { createTask, findBoard, listBoards } from './kanban-db.js';
import { paginateMarkdown } from './pagination.js';
import { saveNormalizedBackupToR2 } from './backup-r2.js';
import {
  addDecision,
  addNote,
  createBlock,
  createEvent,
  createItem,
  deleteBlock,
  deleteDecision,
  deleteEvent,
  deleteItem,
  deleteNote,
  duplicateEvent,
  findEvent,
  hasReminderBeenSent,
  linkTaskToEvent,
  listEvents,
  listReminderCandidates,
  loadEvent,
  loadEventFull,
  markReminderSent,
  reorderBlocks,
  reorderItems,
  replaceParticipants,
  setEventStatus,
  setMinuteDocumentId,
  updateBlock,
  updateEvent,
  updateItem,
  updateNote,
} from './event-db.js';
import {
  BARDO_EVENT_PREFIX,
  buildCompactAgenda,
  calculateEventTimeline,
  eventStatusLabel,
  eventTarget,
  formatDuration,
  generateEventMinutesMarkdown,
  parseEventTarget,
  totalEventAgendaMinutes,
} from './event.js';

const EVENTS_API_PREFIX = '/api/events';
const REMINDER_OFFSETS = [1440, 60, 10];
const guildMembersCache = new Map();

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function ephemeral(content) {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function option(options, name) {
  return options?.find((item) => item.name === name)?.value;
}

function eventButton(eventId, label = '📅 Abrir planner') {
  return {
    type: 1,
    components: [{ type: 2, style: 1, label, custom_id: `${BARDO_EVENT_PREFIX}${eventId}` }],
  };
}

function eventMessage(event, content) {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, components: [eventButton(event.id)] },
  });
}

function creatorPerson(interaction) {
  const user = interaction.member?.user || interaction.user;
  if (!user?.id) return null;
  return {
    userId: String(user.id),
    displayName: interaction.member?.nick || user.global_name || user.username || String(user.id),
    avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
  };
}

function resolvedPerson(interaction, userId) {
  if (!userId) return null;
  const member = interaction.data?.resolved?.members?.[userId];
  const user = interaction.data?.resolved?.users?.[userId];
  return {
    userId: String(userId),
    displayName: member?.nick || user?.global_name || user?.username || String(userId),
    avatarUrl: user?.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=64` : null,
  };
}

async function fetchGuildMembers(env, guildId) {
  if (!env.DISCORD_TOKEN || !guildId) return [];
  const cached = guildMembersCache.get(guildId);
  if (cached && Date.now() - cached.at < 60_000) return cached.members;
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
      headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (!response.ok) return cached?.members || [];
    const raw = await response.json();
    const members = (raw || [])
      .filter((member) => !member.user?.bot)
      .map((member) => {
        const user = member.user || {};
        return {
          userId: String(user.id),
          displayName: member.nick || user.global_name || user.username || String(user.id),
          username: user.username || '',
          avatarUrl: member.avatar
            ? `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png?size=64`
            : user.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
              : null,
        };
      });
    guildMembersCache.set(guildId, { at: Date.now(), members });
    return members;
  } catch (error) {
    console.warn('No se pudieron cargar miembros para Events:', error);
    return cached?.members || [];
  }
}

async function handleEventCommand(interaction, env) {
  if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible.');
  if (!interaction.guild_id) return ephemeral('Los eventos de Bardo funcionan dentro de un servidor.');

  const subcommand = interaction.data?.options?.[0];
  const options = subcommand?.options || [];
  const createdBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';

  if (subcommand?.name === 'crear') {
    const participants = [creatorPerson(interaction), resolvedPerson(interaction, option(options, 'participante'))].filter(Boolean);
    try {
      const event = await createEvent(env.DB, {
        id: crypto.randomUUID(),
        guildId: interaction.guild_id,
        title: String(option(options, 'nombre') || '').trim(),
        description: String(option(options, 'descripcion') || '').trim(),
        eventDate: String(option(options, 'fecha') || '').trim(),
        startTime: String(option(options, 'hora') || '').trim(),
        timezone: 'America/Santiago',
        expectedDuration: Number(option(options, 'duracion') || 60),
        status: 'scheduled',
        channelId: interaction.channel_id || null,
        createdBy,
        participants,
      });
      return eventMessage(
        event,
        `📅 **${event.title}**\n${event.eventDate} · ${event.startTime} · ${formatDuration(event.expectedDuration)}\n\nAbre el planner para construir la agenda, asignar protagonistas y agregar materiales.`,
      );
    } catch (error) {
      return ephemeral(error instanceof Error ? error.message : 'No pude crear el evento.');
    }
  }

  if (subcommand?.name === 'abrir') {
    const value = String(option(options, 'evento') || '').trim();
    const event = await findEvent(env.DB, interaction.guild_id, value);
    if (!event) return ephemeral(`No encontré el evento **${value}**.`);
    return eventMessage(event, `📅 **${event.title}**\n${event.eventDate} · ${event.startTime} · ${eventStatusLabel(event.status)}`);
  }

  if (subcommand?.name === 'listar') {
    const events = await listEvents(env.DB, interaction.guild_id, { limit: 20 });
    if (!events.length) return ephemeral('Todavía no hay eventos. Crea uno con **/evento crear**.');
    const lines = events.map((event) => `• **${event.title}** — ${event.eventDate} ${event.startTime} · ${eventStatusLabel(event.status)}`);
    return ephemeral(`📅 **Eventos de este servidor**\n${lines.join('\n')}`);
  }

  if (subcommand?.name === 'duplicar') {
    const value = String(option(options, 'evento') || '').trim();
    const source = await findEvent(env.DB, interaction.guild_id, value);
    if (!source) return ephemeral(`No encontré el evento **${value}**.`);
    const copy = await duplicateEvent(env.DB, source.id, {
      id: crypto.randomUUID(),
      eventDate: String(option(options, 'fecha') || source.eventDate),
      title: String(option(options, 'nombre') || source.title),
      createdBy,
      channelId: interaction.channel_id || source.channelId,
    });
    return eventMessage(copy, `📅 **${copy.title}** duplicado para ${copy.eventDate} · ${copy.startTime}.`);
  }

  return ephemeral('Acción de evento no reconocida.');
}

function extractActivityInstanceIds(callbackData) {
  return [
    callbackData?.interaction?.activity_instance_id,
    callbackData?.resource?.activity_instance?.id,
    callbackData?.activity_instance_id,
    callbackData?.activity_instance?.id,
    callbackData?.resource?.id,
    callbackData?.instance_id,
  ].filter((value, index, values) => typeof value === 'string' && value && values.indexOf(value) === index);
}

async function handleEventComponent(interaction, env) {
  const eventId = parseEventTarget(interaction.data?.custom_id);
  if (!eventId || !env.DB) return ephemeral('No pude abrir este evento.');
  const event = await loadEvent(env.DB, eventId);
  if (!event || (interaction.guild_id && interaction.guild_id !== event.guildId)) return ephemeral('Este evento ya no está disponible.');

  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;
  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 12 }),
    });
    if (!response.ok) {
      console.error('Discord Event Activity callback error:', response.status, await response.text().catch(() => ''));
      return new Response(null, { status: 202 });
    }
    const callbackData = await response.json().catch(() => null);
    const instanceIds = extractActivityInstanceIds(callbackData);
    await Promise.all(instanceIds.map((instanceId) => saveActivityContext(env.DB, instanceId, eventTarget(eventId))));
    return new Response(null, { status: 202 });
  } catch (error) {
    console.error('Error lanzando Event Activity:', error);
    return new Response(null, { status: 202 });
  }
}

async function activityGuild(request, env) {
  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId || !env.DB) return null;
  const context = await loadActivityContext(env.DB, instanceId);
  const contextEventId = parseEventTarget(context?.documentId);
  if (!contextEventId) return null;
  const event = await loadEvent(env.DB, contextEventId);
  return event?.guildId || null;
}

async function verifyEventAccess(request, env, eventId) {
  const guildId = await activityGuild(request, env);
  if (!guildId) return jsonResponse({ error: 'Activity instance required' }, 401);
  const target = await loadEvent(env.DB, eventId);
  if (!target || target.guildId !== guildId) return jsonResponse({ error: 'Activity does not match event guild' }, 403);
  return null;
}

function parseEventApiPath(pathname) {
  const rest = pathname.slice(EVENTS_API_PREFIX.length).replace(/^\//, '');
  if (!rest) return [];
  return rest.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return null; }
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function entityBelongsToEvent(db, type, entityId, eventId) {
  if (!entityId) return true;
  let row = null;
  if (type === 'block') {
    row = await db.prepare('SELECT 1 AS ok FROM event_blocks WHERE id = ? AND event_id = ?').bind(entityId, eventId).first();
  } else if (type === 'item') {
    row = await db.prepare('SELECT 1 AS ok FROM event_items i JOIN event_blocks b ON b.id = i.block_id WHERE i.id = ? AND b.event_id = ?').bind(entityId, eventId).first();
  } else if (type === 'note') {
    row = await db.prepare('SELECT 1 AS ok FROM event_notes WHERE id = ? AND event_id = ?').bind(entityId, eventId).first();
  } else if (type === 'decision') {
    row = await db.prepare('SELECT 1 AS ok FROM event_decisions WHERE id = ? AND event_id = ?').bind(entityId, eventId).first();
  }
  return Boolean(row?.ok);
}

async function validateEventChildRefs(db, eventId, payload = {}) {
  if (payload.blockId && !await entityBelongsToEvent(db, 'block', payload.blockId, eventId)) return 'Block does not belong to event';
  if (payload.itemId && !await entityBelongsToEvent(db, 'item', payload.itemId, eventId)) return 'Item does not belong to event';
  return null;
}

async function handleEventsCollection(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

  if (request.method === 'GET') {
    const contextGuild = await activityGuild(request, env);
    if (!contextGuild) return jsonResponse({ error: 'Activity instance required' }, 401);
    const guildId = url.searchParams.get('guild_id') || contextGuild;
    if (guildId !== contextGuild) return jsonResponse({ error: 'Guild mismatch' }, 403);
    const events = await listEvents(env.DB, guildId, {
      limit: url.searchParams.get('limit') || 60,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      status: url.searchParams.get('status') || undefined,
    });
    return jsonResponse({ events }, 200, { 'Cache-Control': 'private, no-store' });
  }

  if (request.method === 'POST') {
    const guildId = await activityGuild(request, env);
    if (!guildId) return jsonResponse({ error: 'Activity instance required' }, 401);
    const payload = await readJson(request);
    if (!payload) return jsonResponse({ error: 'Invalid JSON payload' }, 400);
    try {
      const event = await createEvent(env.DB, { ...payload, id: crypto.randomUUID(), guildId, createdBy: 'activity' });
      return jsonResponse({ ok: true, event }, 201);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid event' }, 400);
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

async function handleEventApi(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
  const parts = parseEventApiPath(url.pathname);
  if (parts.some((part) => part === null)) return jsonResponse({ error: 'Invalid event route' }, 400);
  if (!parts.length) return handleEventsCollection(request, url, env);

  const eventId = parts[0];
  const event = await loadEvent(env.DB, eventId);
  if (!event) return jsonResponse({ error: 'Event not found' }, 404);

  if (request.method === 'GET' && parts.length === 1) {
    const access = await verifyEventAccess(request, env, eventId);
    if (access) return access;
    const full = await loadEventFull(env.DB, eventId);
    const [guildMembers, boards] = await Promise.all([
      fetchGuildMembers(env, event.guildId),
      listBoards(env.DB, event.guildId, 50),
    ]);
    return jsonResponse({ ...full, guildMembers, boards }, 200, {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  }

  const access = await verifyEventAccess(request, env, eventId);
  if (access) return access;
  const action = parts[1] || null;
  const entityId = parts[2] || null;
  const payload = ['POST', 'PATCH', 'PUT'].includes(request.method) ? await readJson(request) : null;

  try {
    if (request.method === 'PATCH' && !action) return jsonResponse({ ok: true, event: await updateEvent(env.DB, eventId, payload || {}) });
    if (request.method === 'DELETE' && !action) return jsonResponse(await deleteEvent(env.DB, eventId));

    if (action === 'participants' && request.method === 'PUT') {
      return jsonResponse({ ok: true, participants: await replaceParticipants(env.DB, eventId, payload?.participants || []) });
    }

    if (action === 'blocks' && request.method === 'POST' && !entityId) {
      return jsonResponse({ ok: true, block: await createBlock(env.DB, eventId, payload || {}) }, 201);
    }
    if (action === 'blocks' && entityId && request.method === 'PATCH') {
      if (!await entityBelongsToEvent(env.DB, 'block', entityId, eventId)) return jsonResponse({ error: 'Block does not belong to event' }, 404);
      return jsonResponse({ ok: true, block: await updateBlock(env.DB, entityId, payload || {}) });
    }
    if (action === 'blocks' && entityId && request.method === 'DELETE') {
      if (!await entityBelongsToEvent(env.DB, 'block', entityId, eventId)) return jsonResponse({ error: 'Block does not belong to event' }, 404);
      return jsonResponse(await deleteBlock(env.DB, entityId));
    }
    if (action === 'reorder-blocks' && request.method === 'POST') {
      return jsonResponse({ ok: true, blocks: await reorderBlocks(env.DB, eventId, payload?.ids || []) });
    }

    if (action === 'items' && request.method === 'POST' && !entityId) {
      if (!payload?.blockId || !await entityBelongsToEvent(env.DB, 'block', payload.blockId, eventId)) return jsonResponse({ error: 'Block does not belong to event' }, 404);
      return jsonResponse({ ok: true, item: await createItem(env.DB, payload.blockId, payload || {}) }, 201);
    }
    if (action === 'items' && entityId && request.method === 'PATCH') {
      if (!await entityBelongsToEvent(env.DB, 'item', entityId, eventId)) return jsonResponse({ error: 'Item does not belong to event' }, 404);
      return jsonResponse({ ok: true, item: await updateItem(env.DB, entityId, payload || {}) });
    }
    if (action === 'items' && entityId && request.method === 'DELETE') {
      if (!await entityBelongsToEvent(env.DB, 'item', entityId, eventId)) return jsonResponse({ error: 'Item does not belong to event' }, 404);
      return jsonResponse(await deleteItem(env.DB, entityId));
    }
    if (action === 'reorder-items' && request.method === 'POST') {
      if (!payload?.blockId || !await entityBelongsToEvent(env.DB, 'block', payload.blockId, eventId)) return jsonResponse({ error: 'Block does not belong to event' }, 404);
      return jsonResponse({ ok: true, items: await reorderItems(env.DB, payload.blockId, payload?.ids || []) });
    }

    if (action === 'notes' && request.method === 'POST') {
      const refError = await validateEventChildRefs(env.DB, eventId, payload || {});
      if (refError) return jsonResponse({ error: refError }, 404);
      return jsonResponse({ ok: true, note: await addNote(env.DB, eventId, { ...payload, createdBy: payload?.createdBy || 'activity' }) }, 201);
    }
    if (action === 'notes' && entityId && request.method === 'PATCH') {
      if (!await entityBelongsToEvent(env.DB, 'note', entityId, eventId)) return jsonResponse({ error: 'Note does not belong to event' }, 404);
      return jsonResponse({ ok: true, note: await updateNote(env.DB, entityId, payload?.content) });
    }
    if (action === 'notes' && entityId && request.method === 'DELETE') {
      if (!await entityBelongsToEvent(env.DB, 'note', entityId, eventId)) return jsonResponse({ error: 'Note does not belong to event' }, 404);
      return jsonResponse(await deleteNote(env.DB, entityId));
    }

    if (action === 'decisions' && request.method === 'POST') {
      const refError = await validateEventChildRefs(env.DB, eventId, payload || {});
      if (refError) return jsonResponse({ error: refError }, 404);
      return jsonResponse({ ok: true, decision: await addDecision(env.DB, eventId, { ...payload, createdBy: payload?.createdBy || 'activity' }) }, 201);
    }
    if (action === 'decisions' && entityId && request.method === 'DELETE') {
      if (!await entityBelongsToEvent(env.DB, 'decision', entityId, eventId)) return jsonResponse({ error: 'Decision does not belong to event' }, 404);
      return jsonResponse(await deleteDecision(env.DB, entityId));
    }

    if (action === 'tasks' && request.method === 'POST') {
      const refError = await validateEventChildRefs(env.DB, eventId, payload || {});
      if (refError) return jsonResponse({ error: refError }, 404);
      const board = await findBoard(env.DB, event.guildId, payload?.boardId || payload?.board || '');
      if (!board) return jsonResponse({ error: 'Board not found' }, 404);
      const assignee = payload?.assigneeId
        ? (await fetchGuildMembers(env, event.guildId)).find((member) => member.userId === String(payload.assigneeId))
        : null;
      const task = await createTask(env.DB, {
        id: crypto.randomUUID(),
        boardId: board.id,
        title: payload?.title,
        description: payload?.description || '',
        status: payload?.status || 'backlog',
        priority: payload?.priority || 'medium',
        assigneeId: payload?.assigneeId || null,
        assigneeName: assignee?.displayName || payload?.assigneeName || null,
        labels: payload?.labels || ['weekly'],
        createdBy: payload?.createdBy || 'event',
      });
      await linkTaskToEvent(env.DB, {
        eventId,
        blockId: payload?.blockId || null,
        itemId: payload?.itemId || null,
        taskId: task.id,
      });
      return jsonResponse({ ok: true, task, board }, 201);
    }

    if (action === 'start' && request.method === 'POST') return jsonResponse({ ok: true, event: await setEventStatus(env.DB, eventId, 'live') });
    if (action === 'finish' && request.method === 'POST') return jsonResponse({ ok: true, event: await setEventStatus(env.DB, eventId, 'finished') });

    if (action === 'duplicate' && request.method === 'POST') {
      const copy = await duplicateEvent(env.DB, eventId, {
        id: crypto.randomUUID(),
        eventDate: payload?.eventDate || event.eventDate,
        title: payload?.title || event.title,
        createdBy: payload?.createdBy || 'activity',
        channelId: event.channelId,
      });
      return jsonResponse({ ok: true, event: copy }, 201);
    }

    if (action === 'publish' && request.method === 'POST') {
      const result = await publishAgenda(env, await loadEventFull(env.DB, eventId));
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (action === 'minutes' && request.method === 'POST') {
      return jsonResponse(await generateMinutesDocument(env, eventId, payload?.createdBy || 'event'), 201);
    }

    if (action === 'publish-minutes' && request.method === 'POST') {
      const result = await publishMinutes(env, eventId);
      return jsonResponse(result, result.ok ? 200 : 400);
    }
  } catch (error) {
    console.error('Event API error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Event operation failed' }, 400);
  }

  return new Response('Method not allowed', { status: 405 });
}

async function generateMinutesDocument(env, eventId, createdBy) {
  const full = await loadEventFull(env.DB, eventId);
  if (!full) throw new Error('Evento no encontrado.');
  const markdown = generateEventMinutesMarkdown(full);
  const documentId = full.minuteDocumentId || crypto.randomUUID();
  const title = `Minuta · ${full.title}`;
  const document = {
    id: documentId,
    title,
    originalMarkdown: markdown,
    pages: paginateMarkdown(markdown),
    sourceName: `minuta-${full.eventDate}.md`,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  await saveDocument(env.DB, documentId, document);
  await setMinuteDocumentId(env.DB, eventId, documentId);
  await saveNormalizedBackupToR2(env, documentId, {
    ...document,
    sourceType: 'markdown',
    importStatus: 'ready',
  }).catch(() => {});
  return { ok: true, documentId, title, markdown };
}

async function publishAgenda(env, event) {
  if (!env.DISCORD_TOKEN) return { ok: false, error: 'DISCORD_TOKEN no configurado.' };
  if (!event?.channelId) return { ok: false, error: 'El evento no tiene un canal de Discord asociado.' };

  const timeline = calculateEventTimeline(event);
  const assignments = [];
  for (const block of timeline) {
    for (const lead of block.leads || []) assignments.push(`<@${lead.userId}> lidera **${block.title}**`);
    for (const item of block.items || []) {
      for (const speaker of item.speakers || []) assignments.push(`<@${speaker.userId}> presenta **${item.title}**`);
    }
  }

  const agenda = buildCompactAgenda(event);
  const content = [
    `📅 **${event.title}**`,
    `${event.eventDate} · ${event.startTime} · ${formatDuration(totalEventAgendaMinutes(event) || event.expectedDuration)}`,
    event.description ? `\n${event.description}` : null,
    agenda ? `\n${agenda}` : '\nAgenda todavía vacía.',
    assignments.length ? `\n**Tus puntos**\n${[...new Set(assignments)].slice(0, 10).join('\n')}` : null,
  ].filter(Boolean).join('\n').slice(0, 1900);

  const response = await fetch(`https://discord.com/api/v10/channels/${event.channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, components: [eventButton(event.id)] }),
  });
  return response.ok ? { ok: true } : { ok: false, error: `Discord HTTP ${response.status}` };
}

async function publishMinutes(env, eventId) {
  const event = await loadEventFull(env.DB, eventId);
  if (!event?.channelId) return { ok: false, error: 'El evento no tiene canal asociado.' };
  let documentId = event.minuteDocumentId;
  if (!documentId) documentId = (await generateMinutesDocument(env, eventId, 'event')).documentId;

  const refreshed = await loadEventFull(env.DB, eventId);
  const markdown = generateEventMinutesMarkdown(refreshed);
  const document = {
    id: documentId,
    title: `Minuta · ${refreshed.title}`,
    originalMarkdown: markdown,
    pages: paginateMarkdown(markdown),
    sourceName: `minuta-${refreshed.eventDate}.md`,
    createdAt: refreshed.finishedAt || new Date().toISOString(),
    createdBy: refreshed.createdBy,
  };
  await saveDocument(env.DB, documentId, document);
  await saveNormalizedBackupToR2(env, documentId, { ...document, sourceType: 'markdown', importStatus: 'ready' }).catch(() => {});

  const payload = buildDocumentPayload(document, { applicationId: null, documentId });
  const response = await fetch(`https://discord.com/api/v10/channels/${refreshed.channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.ok ? { ok: true, documentId } : { ok: false, error: `Discord HTTP ${response.status}` };
}

async function sendReminderMessage(env, event, offsetMinutes) {
  if (!env.DISCORD_TOKEN || !event.channelId) return false;
  const full = await loadEventFull(env.DB, event.id);
  const label = offsetMinutes === 1440 ? 'mañana' : offsetMinutes === 60 ? 'en 1 hora' : 'en 10 minutos';
  const mentions = offsetMinutes <= 10
    ? (full.participants || []).slice(0, 20).map((person) => `<@${person.userId}>`).join(' ')
    : '';
  const content = [
    `📅 **${full.title}** comienza ${label}.`,
    `${full.eventDate} · ${full.startTime}`,
    mentions || null,
  ].filter(Boolean).join('\n');
  const response = await fetch(`https://discord.com/api/v10/channels/${full.channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, components: [eventButton(full.id)] }),
  });
  return response.ok;
}

export async function sendEventReminders(env) {
  if (!env.DB || !env.DISCORD_TOKEN) return { sent: 0 };
  const now = Date.now();
  const before = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const events = await listReminderCandidates(env.DB, before, 100);
  let sent = 0;

  for (const event of events) {
    const starts = Date.parse(event.startsAt || '');
    if (!Number.isFinite(starts)) continue;
    const diff = (starts - now) / 60000;
    if (diff < 0) continue;

    let offset = null;
    if (diff <= 10) offset = 10;
    else if (diff <= 60) offset = 60;
    else if (diff <= 1440) offset = 1440;
    if (!offset || !REMINDER_OFFSETS.includes(offset)) continue;
    if (await hasReminderBeenSent(env.DB, event.id, offset)) continue;

    if (await sendReminderMessage(env, event, offset)) {
      await markReminderSent(env.DB, event.id, offset);
      sent += 1;
    }
  }
  return { sent };
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);

    if (url.pathname === EVENTS_API_PREFIX || url.pathname.startsWith(`${EVENTS_API_PREFIX}/`)) {
      return handleEventApi(request, url, env);
    }

    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '')) {
      const rawBody = await request.text();
      let interaction;
      try { interaction = JSON.parse(rawBody); } catch { interaction = null; }
      const isEventCommand = interaction?.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'evento';
      const isEventComponent = interaction?.type === InteractionType.MESSAGE_COMPONENT
        && String(interaction.data?.custom_id || '').startsWith(BARDO_EVENT_PREFIX);

      if (isEventCommand || isEventComponent) {
        const signature = request.headers.get('x-signature-ed25519');
        const timestamp = request.headers.get('x-signature-timestamp');
        if (!signature || !timestamp) return new Response('Invalid request signature headers', { status: 401 });
        if (!env.DISCORD_PUBLIC_KEY) return new Response('Internal Server Error: Missing Public Key', { status: 500 });
        if (!await verifyKey(rawBody, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
          return new Response('Invalid request signature', { status: 401 });
        }
        if (isEventCommand) return handleEventCommand(interaction, env);
        return handleEventComponent(interaction, env);
      }

      const forwarded = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: rawBody,
      });
      return kanbanWorker.fetch(forwarded, env, ctx);
    }

    return kanbanWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    const jobs = [sendEventReminders(env)];
    if (event?.cron === '0 3 * * *' && typeof kanbanWorker.scheduled === 'function') {
      jobs.push(kanbanWorker.scheduled(event, env, ctx));
    }
    const work = Promise.all(jobs);
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
  },
};
