import { InteractionType, verifyKey } from 'discord-interactions';
import p2Entry from './p2-entry.js';
import { ACTIVITY_ACTIONS, defaultPermissionsForTarget, verifyActivityAccess } from './auth/activity-access.js';
import { loadDocument, saveActivityContext, saveDocument } from './db.js';
import { saveNormalizedBackupToR2 } from './backup-r2.js';
import { paginateMarkdown } from './pagination.js';
import { BARDO_BOARD_PREFIX } from './kanban.js';
import { findBoard, loadBoard, loadTask, deleteTask } from './kanban-db.js';
import { BARDO_EVENT_PREFIX } from './event.js';
import { loadEvent } from './event-db.js';
import { homeTarget } from './home-target.js';
import { EntityLinkService, entityBelongsToGuild, grantDocumentToGuild } from './services/entity-links.js';
import { TaskService } from './services/task-service.js';

const HOME_PERMISSIONS = Object.freeze(Object.values(ACTIVITY_ACTIONS));
const LINKED_TASKS_MARKER = '<!-- bardo:linked-tasks -->';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function accessGuild(access) {
  const contextGuild = access?.context?.guildId ? String(access.context.guildId) : null;
  const tokenGuild = access?.token?.guild ? String(access.token.guild) : null;
  if (contextGuild && tokenGuild && contextGuild !== tokenGuild) return null;
  return tokenGuild || contextGuild || null;
}

async function guildSession(request, env) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.CONTEXT_READ });
  if (!access.ok) return access;
  const guildId = accessGuild(access);
  if (!guildId) return { ok: false, response: json({ error: 'Guild context required' }, 403) };
  return { ...access, guildId };
}

function extractActivityInstanceIds(callbackData) {
  return [callbackData?.interaction?.activity_instance_id, callbackData?.resource?.activity_instance?.id, callbackData?.activity_instance_id, callbackData?.activity_instance?.id, callbackData?.resource?.id, callbackData?.instance_id]
    .filter((value, index, values) => typeof value === 'string' && value && values.indexOf(value) === index);
}

async function verifiedInteraction(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) return null;
  const body = await request.clone().text();
  if (!await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) return null;
  try { return JSON.parse(body); } catch { return null; }
}

export async function launchBardoHome(request, env) {
  const interaction = await verifiedInteraction(request, env);
  if (interaction?.type !== InteractionType.APPLICATION_COMMAND || interaction.data?.name !== 'bardo') return null;
  const guildId = String(interaction.guild_id || '').trim();
  if (!/^\d{17,20}$/.test(guildId) || !env.DB) return json({ type: 4, data: { content: 'Bardo Home se abre dentro de un servidor.', flags: 64 } });
  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;
  const callbackRes = await fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 12 }) });
  if (!callbackRes.ok) return new Response(null, { status: 202 });
  const callbackData = await callbackRes.json().catch(() => null);
  const target = homeTarget(guildId);
  const ids = extractActivityInstanceIds(callbackData);
  await Promise.all(ids.map((instanceId) => saveActivityContext(env.DB, instanceId, target, { guildId, permissions: HOME_PERMISSIONS })));
  return new Response(null, { status: 202 });
}

function targetFor(type, id, guildId) {
  if (type === 'home') return homeTarget(guildId);
  if (type === 'document') return String(id);
  if (type === 'board') return `${BARDO_BOARD_PREFIX}${id}`;
  if (type === 'event') return `${BARDO_EVENT_PREFIX}${id}`;
  return null;
}

export async function handleProductNavigation(request, env) {
  const access = await guildSession(request, env);
  if (!access.ok) return access.response;
  const payload = await request.json().catch(() => null);
  let type = String(payload?.type || '').trim();
  let id = String(payload?.id || '').trim();
  let taskId = null;
  if (type === 'task') {
    const task = await loadTask(env.DB, id);
    const board = task ? await loadBoard(env.DB, task.boardId) : null;
    if (!task || !board || String(board.guildId) !== access.guildId) return json({ error: 'Not found' }, 404);
    taskId = task.id; type = 'board'; id = board.id;
  } else if (type !== 'home') {
    if (!['document', 'board', 'event'].includes(type) || !id || !await entityBelongsToGuild(env.DB, type, id, access.guildId)) return json({ error: 'Not found' }, 404);
  }
  const target = targetFor(type, id, access.guildId);
  if (!target) return json({ error: 'Invalid navigation target' }, 400);
  const permissions = type === 'home' ? HOME_PERMISSIONS : defaultPermissionsForTarget(target);
  await env.DB.prepare('UPDATE activity_contexts SET document_id = ?, guild_id = ?, permissions = ? WHERE instance_id = ?')
    .bind(target, access.guildId, JSON.stringify(permissions), access.instanceId).run();
  const route = type === 'home' ? '/?home=1' : type === 'document' ? `/?document=${encodeURIComponent(id)}` : type === 'board' ? `/?board=${encodeURIComponent(id)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ''}` : `/?event=${encodeURIComponent(id)}`;
  return json({ ok: true, type, id, taskId, route });
}

export async function handleHomeSection(request, env, section) {
  const access = await guildSession(request, env);
  if (!access.ok) return access.response;
  const limit = Math.max(1, Math.min(12, Number(new URL(request.url).searchParams.get('limit')) || 5));
  if (section === 'events') {
    const result = await env.DB.prepare(`SELECT id, title, event_date, start_time, starts_at, status FROM events WHERE guild_id = ? AND status != 'cancelled' AND (starts_at IS NULL OR starts_at >= ?) ORDER BY COALESCE(starts_at, event_date || 'T' || start_time) ASC LIMIT ?`).bind(access.guildId, new Date().toISOString(), limit).all();
    return json({ items: result.results || [] });
  }
  if (section === 'tasks') {
    const result = await env.DB.prepare(`SELECT t.id, t.board_id, t.title, COALESCE(t.column_id,t.status) AS status, t.priority, t.due_at, t.updated_at, b.name AS board_name FROM tasks t JOIN boards b ON b.id = t.board_id WHERE b.guild_id = ? AND t.assignee_id = ? AND COALESCE(t.column_id,t.status) != 'done' ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.updated_at DESC LIMIT ?`).bind(access.guildId, access.userId, limit).all();
    return json({ items: result.results || [] });
  }
  if (section === 'documents') {
    const result = await env.DB.prepare(`SELECT DISTINCT d.id, d.title, d.created_at FROM documents d WHERE EXISTS (SELECT 1 FROM document_guild_access g WHERE g.document_id = d.id AND g.guild_id = ?) OR EXISTS (SELECT 1 FROM activity_contexts a WHERE a.document_id = d.id AND a.guild_id = ?) OR EXISTS (SELECT 1 FROM events e WHERE e.minute_document_id = d.id AND e.guild_id = ?) OR EXISTS (SELECT 1 FROM entity_links l WHERE l.guild_id = ? AND ((l.source_type='document' AND l.source_id=d.id) OR (l.target_type='document' AND l.target_id=d.id))) ORDER BY d.created_at DESC LIMIT ?`).bind(access.guildId, access.guildId, access.guildId, access.guildId, limit).all();
    return json({ items: result.results || [] });
  }
  if (section === 'boards') {
    const result = await env.DB.prepare('SELECT id, name, description, updated_at FROM boards WHERE guild_id = ? ORDER BY updated_at DESC LIMIT ?').bind(access.guildId, limit).all();
    return json({ items: result.results || [] });
  }
  return json({ error: 'Unknown Home section' }, 404);
}

export async function handleEntityLinks(request, env, url) {
  const access = await guildSession(request, env);
  if (!access.ok) return access.response;
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  if (!type || !id) return json({ error: 'type and id are required' }, 400);
  try { return json({ links: await new EntityLinkService(env).list(type, id, access.guildId) }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Link lookup failed' }, 403); }
}

function cleanExcerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function validDueAt(value) {
  const dueAt = String(value || '').trim();
  if (!dueAt) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(dueAt)) throw new Error('Fecha límite inválida.');
  return dueAt;
}

export async function handleDocumentTask(request, env, ctx, documentId, taskId = null) {
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.DOCUMENT_READ, resourceType: 'document', resourceId: documentId });
  if (!access.ok) return access.response;
  const guildId = accessGuild(access);
  if (!guildId || !await entityBelongsToGuild(env.DB, 'document', documentId, guildId)) return json({ error: 'Guild document context required' }, 403);
  const links = new EntityLinkService(env);
  if (request.method === 'DELETE' && taskId) {
    const link = await env.DB.prepare(`SELECT 1 AS ok FROM entity_links WHERE guild_id = ? AND source_type='document' AND source_id=? AND target_type='task' AND target_id=? AND relation_type='task_from_document' LIMIT 1`).bind(guildId, documentId, taskId).first();
    const task = link?.ok ? await loadTask(env.DB, taskId) : null;
    if (!task || task.createdAt !== task.updatedAt) return json({ error: 'La tarea ya cambió y no se puede deshacer de forma segura.' }, 409);
    await deleteTask(env.DB, taskId);
    await links.remove('task_from_document', 'document', documentId, 'task', taskId, guildId);
    return json({ ok: true, undone: true });
  }
  if (request.method !== 'POST' || taskId) return new Response('Method not allowed', { status: 405 });
  const payload = await request.json().catch(() => null);
  const board = payload ? await findBoard(env.DB, guildId, payload.boardId || payload.board || '') : null;
  if (!payload || !board) return json({ error: 'Selecciona un tablero de este servidor.' }, 400);
  let dueAt;
  try { dueAt = validDueAt(payload.dueAt); } catch (error) { return json({ error: error.message }, 400); }
  const excerpt = cleanExcerpt(payload.excerpt);
  const description = [String(payload.description || '').trim(), excerpt ? `Contexto del documento: ${excerpt}` : ''].filter(Boolean).join('\n\n').slice(0, 1200);
  let task = null;
  try {
    task = await new TaskService(env).create({ ...payload, boardId: board.id, description, createdBy: access.userId }, { guildId, actorUserId: access.userId, waitUntil: typeof ctx?.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : undefined });
    if (dueAt) {
      await env.DB.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').bind(dueAt, task.id).run();
      task = { ...task, dueAt };
    }
    await links.create({ guildId, sourceType: 'document', sourceId: documentId, targetType: 'task', targetId: task.id, relationType: 'task_from_document', createdBy: access.userId });
    return json({ ok: true, task, board: { id: board.id, name: board.name } }, 201);
  } catch (error) {
    if (task?.id) await deleteTask(env.DB, task.id).catch(() => null);
    return json({ error: error instanceof Error ? error.message : 'No pude crear la tarea.' }, 400);
  }
}

function baseMinutesMarkdown(markdown) {
  return String(markdown || '').split(LINKED_TASKS_MARKER)[0].trim();
}

async function syncMinutesTaskLinks(env, eventId, documentId, guildId, actor, links) {
  await grantDocumentToGuild(env.DB, documentId, guildId, actor);
  const result = await env.DB.prepare(`SELECT t.id, t.title, COALESCE(t.column_id,t.status) AS status, t.assignee_name, t.due_at, b.name AS board_name
    FROM event_task_links l JOIN tasks t ON t.id = l.task_id JOIN boards b ON b.id = t.board_id
    WHERE l.event_id = ? AND b.guild_id = ? ORDER BY t.created_at ASC`).bind(eventId, guildId).all();
  const tasks = result.results || [];
  for (const task of tasks) {
    await links.create({ guildId, sourceType:'task', sourceId:task.id, targetType:'document', targetId:documentId, relationType:'task_references_document', createdBy:actor });
  }
  const document = await loadDocument(env.DB, documentId);
  if (!document) return;
  const taskLines = tasks.length
    ? tasks.map((task) => `- [ ] **${task.title}** — ${task.status}${task.assignee_name ? ` · ${task.assignee_name}` : ''}${task.due_at ? ` · vence ${task.due_at}` : ''} · ${task.board_name} · Bardo task:${task.id}`)
    : ['- No se crearon tareas vinculadas.'];
  const markdown = `${baseMinutesMarkdown(document.originalMarkdown)}\n\n${LINKED_TASKS_MARKER}\n\n## Tareas vinculadas\n\n${taskLines.join('\n')}`.trim();
  const updated = { ...document, originalMarkdown:markdown, pages:paginateMarkdown(markdown) };
  await saveDocument(env.DB, documentId, updated);
  await saveNormalizedBackupToR2(env, documentId, { ...updated, sourceType:'markdown', importStatus:'ready' });
}

async function enrichEventResponse(request, env, response, eventId, action) {
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  const guildId = String((await loadEvent(env.DB, eventId))?.guildId || '');
  if (!guildId) return response;
  const access = await verifyActivityAccess(request, env, { action: ACTIVITY_ACTIONS.CONTEXT_READ });
  const actor = access.ok ? access.userId : 'activity';
  const links = new EntityLinkService(env);
  if (action === 'tasks' && payload?.task?.id) await links.create({ guildId, sourceType: 'event', sourceId: eventId, targetType: 'task', targetId: payload.task.id, relationType: 'event_has_task', createdBy: actor });
  if (action === 'minutes' && payload?.documentId) {
    await links.create({ guildId, sourceType: 'event', sourceId: eventId, targetType: 'document', targetId: payload.documentId, relationType: 'event_has_minutes', createdBy: actor });
    await syncMinutesTaskLinks(env, eventId, payload.documentId, guildId, actor, links);
  }
  return response;
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/') {
      const home = await launchBardoHome(request, env);
      if (home) return home;
    }
    if (url.pathname === '/api/navigation' && request.method === 'POST') return handleProductNavigation(request, env);
    const homeMatch = url.pathname.match(/^\/api\/home\/(events|tasks|documents|boards)$/);
    if (homeMatch && request.method === 'GET') return handleHomeSection(request, env, homeMatch[1]);
    if (url.pathname === '/api/entity-links' && request.method === 'GET') return handleEntityLinks(request, env, url);
    const docTask = url.pathname.match(/^\/api\/documents\/([^/]+)\/tasks(?:\/([^/]+))?$/);
    if (docTask) return handleDocumentTask(request, env, ctx, decodeURIComponent(docTask[1]), docTask[2] ? decodeURIComponent(docTask[2]) : null);
    const eventFlow = url.pathname.match(/^\/api\/events\/([^/]+)\/(tasks|minutes)$/);
    if (eventFlow && request.method === 'POST') {
      const response = await p2Entry.fetch(request, env, ctx);
      return enrichEventResponse(request, env, response, decodeURIComponent(eventFlow[1]), eventFlow[2]);
    }
    return p2Entry.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx = { waitUntil: () => {} }) { return p2Entry.scheduled(event, env, ctx); },
};
