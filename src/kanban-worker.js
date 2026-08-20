import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import baseWorker from './worker.js';
import { saveActivityContext, loadActivityContext } from './db.js';
import {
  createBoard,
  createTask,
  deleteTask,
  findBoard,
  listBoards,
  loadBoard,
  loadBoardWithTasks,
  loadTask,
  moveTask,
  updateBoardColumns,
  updateBoardSettings,
  updateTask,
} from './kanban-db.js';
import { createDatabaseSnapshot } from './backup-r2.js';
import {
  BARDO_BOARD_PREFIX,
  KANBAN_PRIORITIES,
  KANBAN_STATUSES,
  MAX_BOARD_COLUMNS,
  MAX_BOARD_CHIPS,
  boardTarget,
  normalizeKanbanPriority,
  normalizeKanbanStatus,
  parseBoardTarget,
  parseLabels,
  priorityLabel,
  statusLabel,
} from './kanban.js';

const BOARD_API_PREFIX = '/api/boards/';
const TASK_API_PREFIX = '/api/tasks/';

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function ephemeral(content) {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function getOption(options, name) {
  return options?.find((option) => option.name === name)?.value;
}

function boardButton(boardId) {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: '📋 Abrir tablero',
        custom_id: `${BARDO_BOARD_PREFIX}${boardId}`,
      },
    ],
  };
}

function boardMessage(board, content) {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      components: [boardButton(board.id)],
    },
  });
}

async function verifyInteractionRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !publicKey) return false;
  const rawBody = await request.clone().text();
  return verifyKey(rawBody, signature, timestamp, publicKey);
}

function userDisplayName(interaction, userId) {
  if (!userId) return null;
  const member = interaction.data?.resolved?.members?.[userId];
  const user = interaction.data?.resolved?.users?.[userId];
  return member?.nick || user?.global_name || user?.username || userId;
}

async function handleBoardCommand(interaction, env) {
  if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible.');
  if (!interaction.guild_id) return ephemeral('Los tableros de Bardo funcionan dentro de un servidor.');

  const subcommand = interaction.data?.options?.[0];
  const options = subcommand?.options || [];
  const createdBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';

  if (subcommand?.name === 'crear') {
    const name = String(getOption(options, 'nombre') || '').trim();
    const description = String(getOption(options, 'descripcion') || '').trim();
    if (!name) return ephemeral('El tablero necesita un nombre.');

    try {
      const board = await createBoard(env.DB, {
        id: crypto.randomUUID(),
        guildId: interaction.guild_id,
        name,
        description,
        createdBy,
      });
      return boardMessage(
        board,
        `📋 **${board.name}** creado.${board.description ? `\n${board.description}` : ''}\n\nAgrega tarjetas con **/tarea** y abre el Kanban cuando quieras.`,
      );
    } catch (error) {
      const message = String(error?.message || error);
      if (/unique|constraint/i.test(message)) {
        return ephemeral(`Ya existe un tablero llamado **${name}** en este servidor.`);
      }
      console.error('Error creando tablero:', error);
      return ephemeral('No pude crear el tablero. Inténtalo nuevamente.');
    }
  }

  if (subcommand?.name === 'abrir') {
    const value = String(getOption(options, 'tablero') || '').trim();
    const board = await findBoard(env.DB, interaction.guild_id, value);
    if (!board) return ephemeral(`No encontré el tablero **${value || 'sin nombre'}**.`);
    return boardMessage(
      board,
      `📋 **${board.name}**${board.description ? `\n${board.description}` : ''}`,
    );
  }

  if (subcommand?.name === 'listar') {
    const boards = await listBoards(env.DB, interaction.guild_id, 20);
    if (!boards.length) {
      return ephemeral('Todavía no hay tableros. Crea uno con **/tablero crear**.');
    }
    const lines = boards.map((board, index) => `${index + 1}. **${board.name}**${board.description ? ` — ${board.description}` : ''}`);
    return ephemeral(`📋 **Tableros de este servidor**\n${lines.join('\n')}`);
  }

  return ephemeral('Acción de tablero no reconocida.');
}

async function sendTaskAssignmentDm(env, { assigneeId, boardName, taskTitle, priority, assignedByName, boardId }) {
  if (!env.DISCORD_TOKEN || !assigneeId) return;
  const cleanAssigneeId = String(assigneeId).trim();
  if (!/^\d{17,20}$/.test(cleanAssigneeId)) return;

  try {
    const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: cleanAssigneeId }),
    });

    if (!channelRes.ok) {
      console.warn('No se pudo crear canal DM con usuario:', channelRes.status);
      return;
    }

    const dmChannel = await channelRes.json();
    if (!dmChannel?.id) return;

    const messageContent = [
      `📋 **Te han asignado una tarea en Bardo Kanban**`,
      `Tablero: **${boardName}**`,
      `Tarea: **${taskTitle}**`,
      `Prioridad: **${priorityLabel(priority)}**`,
      assignedByName ? `Asignado por: **${assignedByName}**` : null,
    ].filter(Boolean).join('\n');

    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: messageContent,
        components: [boardButton(boardId)],
      }),
    });
  } catch (error) {
    console.error('Error enviando notificación DM:', error);
  }
}

async function handleTaskCommand(interaction, env) {
  if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible.');
  if (!interaction.guild_id) return ephemeral('Las tareas de Bardo funcionan dentro de un servidor.');

  const options = interaction.data?.options || [];
  const boardValue = String(getOption(options, 'tablero') || '').trim();
  const title = String(getOption(options, 'titulo') || '').trim();
  const description = String(getOption(options, 'descripcion') || '').trim();
  const assigneeId = getOption(options, 'responsable') || null;
  const labelsInput = String(getOption(options, 'chips') || '').trim();
  const status = normalizeKanbanStatus(getOption(options, 'estado'));
  const priority = normalizeKanbanPriority(getOption(options, 'prioridad'));
  const createdBy = interaction.member?.user?.id || interaction.user?.id || 'unknown';

  const board = await findBoard(env.DB, interaction.guild_id, boardValue);
  if (!board) {
    return ephemeral(`No encontré el tablero **${boardValue}**. Usa **/tablero listar** para ver los disponibles.`);
  }

  try {
    const task = await createTask(env.DB, {
      id: crypto.randomUUID(),
      boardId: board.id,
      title,
      description,
      status,
      priority,
      assigneeId,
      assigneeName: userDisplayName(interaction, assigneeId),
      labels: labelsInput,
      createdBy,
    });

    const labels = parseLabels(labelsInput);
    const details = [
      `📝 **${task.title}**`,
      `Tablero: **${board.name}** · Columna: **${statusLabel(task.status)}** · Prioridad: **${priorityLabel(task.priority)}**`,
      task.assigneeName ? `Responsable: **${task.assigneeName}**` : 'Responsable: sin asignar',
      labels.length ? `Chips: ${labels.map((label) => `\`${label.name || label}\``).join(' ')}` : null,
    ].filter(Boolean);

    if (assigneeId) {
      const creatorName = interaction.member?.nick || interaction.user?.global_name || interaction.user?.username || null;
      sendTaskAssignmentDm(env, {
        assigneeId,
        boardName: board.name,
        taskTitle: task.title,
        priority: task.priority,
        assignedByName: creatorName,
        boardId: board.id,
      }).catch(() => {});
    }

    return boardMessage(board, `${details.join('\n')}\n\nTarea creada.`);
  } catch (error) {
    console.error('Error creando tarea:', error);
    return ephemeral(error instanceof Error ? error.message : 'No pude crear la tarea.');
  }
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

async function handleBoardComponent(interaction, env) {
  const boardId = parseBoardTarget(interaction.data?.custom_id);
  if (!boardId || !env.DB) return ephemeral('No pude abrir este tablero.');

  const board = await loadBoard(env.DB, boardId);
  if (!board || (interaction.guild_id && board.guildId !== interaction.guild_id)) {
    return ephemeral('Este tablero ya no está disponible.');
  }

  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;
  try {
    const callbackRes = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 12 }),
    });

    if (!callbackRes.ok) {
      const errText = await callbackRes.text().catch(() => '');
      console.error('Discord board Activity callback error:', callbackRes.status, errText);
      const appId = interaction.application_id || interaction.data?.application_id;
      if (appId && interaction.token) {
        await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interaction.token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: '⚠️ No se pudo abrir el tablero en este canal/hilo. Verifica que el hilo no esté archivado y que el bot y los miembros tengan activo el permiso **"Usar actividades"** y **"Enviar mensajes en hilos"** en los ajustes del servidor de Discord.',
            flags: 64,
          }),
        }).catch(() => {});
      }
      return new Response(null, { status: 202 });
    }

    const callbackData = await callbackRes.json().catch(() => null);
    const instanceIds = extractActivityInstanceIds(callbackData);
    await Promise.all(instanceIds.map((instanceId) => saveActivityContext(env.DB, instanceId, boardTarget(boardId))));
    return new Response(null, { status: 202 });
  } catch (error) {
    console.error('Error lanzando tablero como Activity:', error);
    return new Response(null, { status: 202 });
  }
}

async function verifyBoardActivityAccess(request, env, boardId) {
  const instanceId = request.headers.get('x-bardo-instance-id')?.trim();
  if (!instanceId) return jsonResponse({ error: 'Activity instance required' }, 401);
  const context = await loadActivityContext(env.DB, instanceId);
  if (!context || parseBoardTarget(context.documentId) !== boardId) {
    return jsonResponse({ error: 'Activity instance does not match board' }, 403);
  }
  return null;
}

const guildMembersCache = new Map();

function formatDiscordMember(m, guildId) {
  if (!m || !m.user) return null;
  const u = m.user;
  const name = m.nick || u.global_name || u.username || 'Usuario';
  const username = u.username || '';

  let avatarUrl = null;
  if (m.avatar) {
    avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${u.id}/avatars/${m.avatar}.png?size=64`;
  } else if (u.avatar) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  }

  return {
    id: String(u.id),
    name,
    username,
    avatarUrl,
    isBot: Boolean(u.bot),
    roles: Array.isArray(m.roles) ? m.roles : [],
  };
}

async function fetchGuildMembersFromDiscord(env, guildId, query = '') {
  if (!env?.DISCORD_TOKEN) {
    console.warn('[Bardo] Falta DISCORD_TOKEN en las variables de entorno/secretos del Worker.');
    return { ok: false, error: 'NO_TOKEN', members: [] };
  }
  if (!guildId) return { ok: false, error: 'NO_GUILD_ID', members: [] };
  const cleanGuildId = String(guildId).trim();
  if (!/^\d{17,20}$/.test(cleanGuildId)) return { ok: false, error: 'INVALID_GUILD_ID', members: [] };

  if (query && query.trim()) {
    try {
      const q = encodeURIComponent(query.trim());
      const searchRes = await fetch(`https://discord.com/api/v10/guilds/${cleanGuildId}/members/search?query=${q}&limit=50`, {
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
        },
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const formatted = (data || []).map((m) => formatDiscordMember(m, cleanGuildId)).filter(Boolean);
        return { ok: true, members: formatted };
      } else {
        const errText = await searchRes.text().catch(() => '');
        console.warn(`[Bardo] Error buscando miembros en Discord API (${searchRes.status}):`, errText);
      }
    } catch (err) {
      console.warn('[Bardo] Error buscando miembros en Discord API:', err);
    }
  }

  const cached = guildMembersCache.get(cleanGuildId);
  const now = Date.now();
  if (cached && (now - cached.timestamp < 60000)) {
    return { ok: true, members: cached.members };
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${cleanGuildId}/members?limit=1000`, {
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Bardo] Discord API error (${res.status}) obteniendo miembros para guild ${cleanGuildId}:`, errText);
      if (res.status === 403) {
        return { ok: false, error: 'INTENT_REQUIRED', members: cached ? cached.members : [] };
      }
      return { ok: false, error: `HTTP_${res.status}`, members: cached ? cached.members : [] };
    }

    const rawMembers = await res.json();
    const formatted = (rawMembers || [])
      .map((m) => formatDiscordMember(m, cleanGuildId))
      .filter(Boolean)
      .filter((m) => !m.isBot);

    guildMembersCache.set(cleanGuildId, { timestamp: now, members: formatted });
    return { ok: true, members: formatted };
  } catch (error) {
    console.error('[Bardo] Error fetching guild members from Discord API:', error);
    return { ok: false, error: error.message, members: cached ? cached.members : [] };
  }
}

const guildRolesCache = new Map();

async function fetchGuildRolesFromDiscord(env, guildId) {
  if (!env?.DISCORD_TOKEN || !guildId) return [];
  const cleanGuildId = String(guildId).trim();
  if (!/^\d{17,20}$/.test(cleanGuildId)) return [];

  const cached = guildRolesCache.get(cleanGuildId);
  const now = Date.now();
  if (cached && (now - cached.timestamp < 60000)) {
    return cached.roles;
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${cleanGuildId}/roles`, {
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
      },
    });

    if (!res.ok) {
      console.warn(`[Bardo] Discord API error (${res.status}) obteniendo roles para guild ${cleanGuildId}`);
      return cached ? cached.roles : [];
    }

    const rawRoles = await res.json();
    const formatted = (rawRoles || [])
      .filter((r) => r.name !== '@everyone' && !r.managed)
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
        position: r.position,
      }))
      .sort((a, b) => b.position - a.position);

    guildRolesCache.set(cleanGuildId, { timestamp: now, roles: formatted });
    return formatted;
  } catch (err) {
    console.error('[Bardo] Error fetching guild roles from Discord API:', err);
    return cached ? cached.roles : [];
  }
}

export async function sendUrgentTaskReminders(env) {
  if (!env?.DB || !env?.DISCORD_TOKEN) return { sentCount: 0 };
  try {
    const { results } = await env.DB.prepare(`
      SELECT t.id, t.title, t.priority, t.status, t.assignee_id, t.assignee_name, t.board_id, b.name as board_name
      FROM tasks t
      JOIN boards b ON t.board_id = b.id
      WHERE t.priority = 'urgent'
        AND t.status != 'done'
        AND t.assignee_id IS NOT NULL
    `).all();

    if (!Array.isArray(results) || results.length === 0) {
      return { sentCount: 0 };
    }

    const byAssignee = new Map();
    for (const task of results) {
      const uid = String(task.assignee_id);
      if (!byAssignee.has(uid)) {
        byAssignee.set(uid, []);
      }
      byAssignee.get(uid).push(task);
    }

    let sentCount = 0;
    for (const [assigneeId, tasks] of byAssignee.entries()) {
      try {
        const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
          method: 'POST',
          headers: {
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recipient_id: assigneeId }),
        });

        if (!channelRes.ok) continue;
        const dmChannel = await channelRes.json();
        if (!dmChannel?.id) continue;

        const taskListLines = tasks.map((t) => `• **${t.title}** (Tablero: **${t.board_name}**)`);
        const content = [
          `🚨 **Recordatorio de Bardo: Tareas Urgentes Pendientes**`,
          `¡Hola! Tienes **${tasks.length}** tarea${tasks.length > 1 ? 's' : ''} urgente${tasks.length > 1 ? 's' : ''} pendiente${tasks.length > 1 ? 's' : ''} por terminar:`,
          '',
          ...taskListLines,
          '',
          `¡Ánimo con tus pendientes! Haz clic abajo para abrir tu tablero.`,
        ].join('\n');

        const primaryBoardId = tasks[0].board_id;
        await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            components: [boardButton(primaryBoardId)],
          }),
        });
        sentCount += 1;
      } catch (err) {
        console.warn(`[Bardo] Error enviando recordatorio urgente a ${assigneeId}:`, err);
      }
    }
    return { sentCount };
  } catch (err) {
    console.error('[Bardo] Error en sendUrgentTaskReminders:', err);
    return { sentCount: 0, error: err.message };
  }
}

async function handleBoardApi(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
  const pathWithoutPrefix = url.pathname.slice(BOARD_API_PREFIX.length);
  const parts = pathWithoutPrefix.split('/').filter(Boolean);
  const encodedId = parts[0];
  if (!encodedId) return jsonResponse({ error: 'Board id required' }, 400);
  let boardId;
  try { boardId = decodeURIComponent(encodedId); } catch { return jsonResponse({ error: 'Invalid board id' }, 400); }

  if (request.method === 'GET' && parts.length === 1) {
    const board = await loadBoardWithTasks(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);

    const guildId = url.searchParams.get('guild_id') || board.guildId;
    if (guildId && !board.guildId && env.DB) {
      await env.DB.prepare('UPDATE boards SET guild_id = ? WHERE id = ?').bind(guildId, boardId).run().catch(() => {});
      board.guildId = guildId;
    }

    let guildMembers = [];
    let guildRoles = [];
    let guildError = null;
    if (guildId) {
      const [membersRes, rolesRes] = await Promise.all([
        fetchGuildMembersFromDiscord(env, guildId),
        fetchGuildRolesFromDiscord(env, guildId),
      ]);
      guildMembers = membersRes.members || [];
      guildRoles = rolesRes || [];
      if (!membersRes.ok) guildError = membersRes.error;
    }

    return jsonResponse({
      ...board,
      guildId,
      guildMembers,
      guildRoles,
      guildError,
    }, 200, {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  }

  if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-members') {
    const board = await loadBoard(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);
    const query = url.searchParams.get('q') || '';
    const guildId = url.searchParams.get('guild_id') || board.guildId;
    if (guildId && !board.guildId && env.DB) {
      await env.DB.prepare('UPDATE boards SET guild_id = ? WHERE id = ?').bind(guildId, boardId).run().catch(() => {});
    }
    const res = await fetchGuildMembersFromDiscord(env, guildId, query);
    return jsonResponse({ ok: res.ok, members: res.members || [], error: res.error || null }, 200);
  }

  if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-roles') {
    const board = await loadBoard(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);
    const guildId = url.searchParams.get('guild_id') || board.guildId;
    const roles = await fetchGuildRolesFromDiscord(env, guildId);
    return jsonResponse({ ok: true, roles }, 200);
  }

  if (request.method === 'POST' && parts.length === 2 && parts[1] === 'tasks') {
    const board = await loadBoard(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);
    const accessError = await verifyBoardActivityAccess(request, env, boardId);
    if (accessError) return accessError;

    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON payload' }, 400); }

    const title = String(payload?.title || '').trim();
    if (!title) return jsonResponse({ error: 'El título es requerido' }, 400);

    const task = await createTask(env.DB, {
      id: crypto.randomUUID(),
      boardId,
      title,
      description: payload?.description || '',
      status: payload?.status || 'backlog',
      priority: payload?.priority || 'medium',
      assigneeId: payload?.assigneeId || null,
      assigneeName: payload?.assigneeName || null,
      labels: payload?.labels || [],
      createdBy: 'activity',
    });

    if (task.assigneeId) {
      sendTaskAssignmentDm(env, {
        assigneeId: task.assigneeId,
        boardName: board.name,
        taskTitle: task.title,
        priority: task.priority,
        assignedByName: null,
        boardId: board.id,
      }).catch(() => {});
    }

    return jsonResponse({ ok: true, task }, 201);
  }

  if (request.method === 'PATCH' && parts.length === 1) {
    const board = await loadBoard(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);
    const accessError = await verifyBoardActivityAccess(request, env, boardId);
    if (accessError) return accessError;

    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON payload' }, 400); }

    const updated = await updateBoardSettings(env.DB, boardId, {
      name: payload?.name,
      description: payload?.description,
      members: payload?.members,
      columns: payload?.columns,
    });
    return jsonResponse({ ok: true, board: updated });
  }

  if ((request.method === 'PATCH' || request.method === 'PUT') && parts.length === 2 && parts[1] === 'columns') {
    const board = await loadBoard(env.DB, boardId);
    if (!board) return jsonResponse({ error: 'Board not found' }, 404);
    const accessError = await verifyBoardActivityAccess(request, env, boardId);
    if (accessError) return accessError;

    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON payload' }, 400); }

    if (!Array.isArray(payload?.columns)) {
      return jsonResponse({ error: 'Se requiere un array de columnas' }, 400);
    }

    if (payload.columns.length > MAX_BOARD_COLUMNS) {
      return jsonResponse({ error: `Máximo ${MAX_BOARD_COLUMNS} columnas por tablero` }, 400);
    }

    const updated = await updateBoardColumns(env.DB, boardId, payload.columns);
    return jsonResponse({ ok: true, board: updated });
  }

  return new Response('Method not allowed', { status: 405 });
}

async function handleTaskApi(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
  const encodedId = url.pathname.slice(TASK_API_PREFIX.length).split('/')[0];
  if (!encodedId) return jsonResponse({ error: 'Task id required' }, 400);
  let taskId;
  try { taskId = decodeURIComponent(encodedId); } catch { return jsonResponse({ error: 'Invalid task id' }, 400); }

  const task = await loadTask(env.DB, taskId);
  if (!task) return jsonResponse({ error: 'Task not found' }, 404);
  const accessError = await verifyBoardActivityAccess(request, env, task.boardId);
  if (accessError) return accessError;

  if (request.method === 'PATCH') {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON payload' }, 400); }

    const updated = await updateTask(env.DB, taskId, payload);

    if (payload?.assigneeId && payload.assigneeId !== task.assigneeId) {
      const board = await loadBoard(env.DB, task.boardId);
      if (board) {
        sendTaskAssignmentDm(env, {
          assigneeId: payload.assigneeId,
          boardName: board.name,
          taskTitle: updated.title,
          priority: updated.priority,
          assignedByName: null,
          boardId: board.id,
        }).catch(() => {});
      }
    }

    return jsonResponse({ ok: true, task: updated });
  }

  if (request.method === 'DELETE') {
    const deleted = await deleteTask(env.DB, taskId);
    return jsonResponse({ ok: true, task: deleted });
  }

  return new Response('Method not allowed', { status: 405 });
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(BOARD_API_PREFIX)) {
      return handleBoardApi(request, url, env);
    }
    if (url.pathname.startsWith(TASK_API_PREFIX)) {
      return handleTaskApi(request, url, env);
    }

    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '')) {
      const signature = request.headers.get('x-signature-ed25519');
      const timestamp = request.headers.get('x-signature-timestamp');
      if (!signature || !timestamp) return new Response('Invalid request signature headers', { status: 401 });

      const rawBody = await request.text();
      const publicKey = env.DISCORD_PUBLIC_KEY;
      if (!publicKey) return new Response('Internal Server Error: Missing Public Key', { status: 500 });

      const isValidRequest = await verifyKey(rawBody, signature, timestamp, publicKey);
      if (!isValidRequest) return new Response('Invalid request signature', { status: 401 });

      let interaction;
      try {
        interaction = JSON.parse(rawBody);
      } catch {
        return new Response('Invalid JSON payload', { status: 400 });
      }

      if (interaction.type === InteractionType.PING) {
        return jsonResponse({ type: InteractionResponseType.PONG });
      }

      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const cmd = interaction.data?.name;
        if (cmd === 'tablero') return handleBoardCommand(interaction, env);
        if (cmd === 'tarea') return handleTaskCommand(interaction, env);
      }

      if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        const customId = String(interaction.data?.custom_id || '');
        if (customId.startsWith(BARDO_BOARD_PREFIX)) {
          return handleBoardComponent(interaction, env);
        }
      }

      // Delegar interacción ya validada al baseWorker creando un nuevo request con el cuerpo original
      const forwardedRequest = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: rawBody,
      });
      return baseWorker.fetch(forwardedRequest, env, ctx);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx = { waitUntil: () => {} }) {
    console.log(`Cron trigger iniciado (${event?.cron || 'scheduled'})`);
    const tasksPromise = Promise.all([
      createDatabaseSnapshot(env),
      sendUrgentTaskReminders(env),
    ]);
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(tasksPromise);
    } else {
      await tasksPromise;
    }
  },
};
