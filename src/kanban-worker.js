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
  findBoard,
  listBoards,
  loadBoard,
  loadBoardWithTasks,
  loadTask,
  moveTask,
} from './kanban-db.js';
import {
  BARDO_BOARD_PREFIX,
  KANBAN_STATUSES,
  boardTarget,
  normalizeKanbanStatus,
  parseBoardTarget,
  parseLabels,
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
      assigneeId,
      assigneeName: userDisplayName(interaction, assigneeId),
      labels: labelsInput,
      createdBy,
    });

    const labels = parseLabels(labelsInput);
    const details = [
      `📝 **${task.title}**`,
      `Tablero: **${board.name}** · ${statusLabel(task.status)}`,
      task.assigneeName ? `Responsable: **${task.assigneeName}**` : 'Responsable: sin asignar',
      labels.length ? `Chips: ${labels.map((label) => `\`${label}\``).join(' ')}` : null,
    ].filter(Boolean);

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
      console.error('Discord board Activity callback error:', callbackRes.status, await callbackRes.text().catch(() => ''));
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

async function handleBoardApi(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
  const encodedId = url.pathname.slice(BOARD_API_PREFIX.length).split('/')[0];
  if (!encodedId) return jsonResponse({ error: 'Board id required' }, 400);
  let boardId;
  try { boardId = decodeURIComponent(encodedId); } catch { return jsonResponse({ error: 'Invalid board id' }, 400); }

  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const board = await loadBoardWithTasks(env.DB, boardId);
  if (!board) return jsonResponse({ error: 'Board not found' }, 404);
  return jsonResponse(board, 200, {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

async function handleTaskApi(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
  const encodedId = url.pathname.slice(TASK_API_PREFIX.length).split('/')[0];
  if (!encodedId) return jsonResponse({ error: 'Task id required' }, 400);
  let taskId;
  try { taskId = decodeURIComponent(encodedId); } catch { return jsonResponse({ error: 'Invalid task id' }, 400); }

  if (request.method !== 'PATCH') return new Response('Method not allowed', { status: 405 });
  const task = await loadTask(env.DB, taskId);
  if (!task) return jsonResponse({ error: 'Task not found' }, 404);
  const accessError = await verifyBoardActivityAccess(request, env, task.boardId);
  if (accessError) return accessError;

  let payload;
  try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON payload' }, 400); }
  const status = normalizeKanbanStatus(payload?.status, null);
  if (!status || !KANBAN_STATUSES.some((item) => item.id === status)) {
    return jsonResponse({ error: 'Invalid task status' }, 400);
  }

  const updated = await moveTask(env.DB, taskId, status);
  return jsonResponse({ ok: true, task: updated });
}

async function maybeHandleKanbanInteraction(request, env) {
  let interaction;
  try { interaction = await request.clone().json(); } catch { return null; }

  const isBoardCommand = interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'tablero';
  const isTaskCommand = interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'tarea';
  const isBoardComponent = interaction.type === InteractionType.MESSAGE_COMPONENT && String(interaction.data?.custom_id || '').startsWith(BARDO_BOARD_PREFIX);
  if (!isBoardCommand && !isTaskCommand && !isBoardComponent) return null;

  if (!(await verifyInteractionRequest(request, env))) {
    return new Response('Invalid request signature', { status: 401 });
  }

  if (isBoardCommand) return handleBoardCommand(interaction, env);
  if (isTaskCommand) return handleTaskCommand(interaction, env);
  return handleBoardComponent(interaction, env);
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

    if (request.method === 'POST') {
      const kanbanResponse = await maybeHandleKanbanInteraction(request, env);
      if (kanbanResponse) return kanbanResponse;
    }

    return baseWorker.fetch(request, env, ctx);
  },
};
