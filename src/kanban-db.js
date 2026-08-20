import {
  DEFAULT_KANBAN_COLUMNS,
  normalizeKanbanPriority,
  normalizeKanbanStatus,
  parseLabels,
  validateBoardColumns,
} from './kanban.js';

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapBoard(row) {
  if (!row) return null;
  const rawCols = parseJsonArray(row.columns);
  const columns = validateBoardColumns(rawCols);

  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description || '',
    columns,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    description: row.description || '',
    status: row.status || 'backlog',
    priority: normalizeKanbanPriority(row.priority),
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || null,
    labels: parseLabels(parseJsonArray(row.labels)),
    position: Number(row.position || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createBoard(db, { id, guildId, name, description, columns, createdBy }) {
  const now = new Date().toISOString();
  const cleanName = String(name || '').trim().slice(0, 80);
  const cleanDescription = String(description || '').trim().slice(0, 500);
  if (!cleanName) throw new Error('El tablero necesita un nombre.');

  const validColumns = validateBoardColumns(columns);

  await db.prepare(
    `INSERT INTO boards (id, guild_id, name, description, columns, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, guildId, cleanName, cleanDescription || null, JSON.stringify(validColumns), createdBy, now, now).run();

  return { id, guildId, name: cleanName, description: cleanDescription, columns: validColumns, createdBy, createdAt: now, updatedAt: now };
}

export async function updateBoardColumns(db, boardId, inputColumns) {
  const board = await loadBoard(db, boardId);
  if (!board) return null;

  const validColumns = validateBoardColumns(inputColumns);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE boards SET columns = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(validColumns), now, boardId)
    .run();

  const validStatusIds = new Set(validColumns.map((c) => c.id));
  const tasks = await listTasks(db, boardId);
  const fallbackStatus = validColumns[0].id;

  for (const task of tasks) {
    if (!validStatusIds.has(task.status)) {
      await db
        .prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .bind(fallbackStatus, now, task.id)
        .run();
    }
  }

  return {
    ...board,
    columns: validColumns,
    updatedAt: now,
  };
}

export async function loadBoard(db, boardId) {
  return mapBoard(await db.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first());
}

export async function findBoard(db, guildId, value) {
  const key = String(value || '').trim();
  if (!key) return null;

  const row = await db.prepare(
    `SELECT * FROM boards
     WHERE guild_id = ? AND (id = ? OR name = ? COLLATE NOCASE)
     LIMIT 1`,
  ).bind(guildId, key, key).first();

  return mapBoard(row);
}

export async function listBoards(db, guildId, limit = 20) {
  const result = await db.prepare(
    `SELECT * FROM boards WHERE guild_id = ? ORDER BY updated_at DESC LIMIT ?`,
  ).bind(guildId, limit).all();
  return (result.results || []).map(mapBoard);
}

export async function createTask(db, input) {
  const now = new Date().toISOString();
  const title = String(input.title || '').trim().slice(0, 120);
  if (!title) throw new Error('La tarea necesita un título.');

  const description = String(input.description || '').trim().slice(0, 1200);
  const status = normalizeKanbanStatus(input.status);
  const priority = normalizeKanbanPriority(input.priority);
  const labels = Array.isArray(input.labels) ? input.labels : parseLabels(input.labels);

  const positionRow = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
     FROM tasks WHERE board_id = ? AND status = ?`,
  ).bind(input.boardId, status).first();
  const position = Number(positionRow?.next_position || 0);

  await db.prepare(
    `INSERT INTO tasks (
       id, board_id, title, description, status, priority, assignee_id, assignee_name,
       labels, position, created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.id,
    input.boardId,
    title,
    description || null,
    status,
    priority,
    input.assigneeId || null,
    input.assigneeName || null,
    JSON.stringify(labels),
    position,
    input.createdBy,
    now,
    now,
  ).run();

  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, input.boardId).run();

  return {
    id: input.id,
    boardId: input.boardId,
    title,
    description,
    status,
    priority,
    assigneeId: input.assigneeId || null,
    assigneeName: input.assigneeName || null,
    labels,
    position,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadTask(db, taskId) {
  return mapTask(await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first());
}

export async function listTasks(db, boardId) {
  const result = await db.prepare(
    `SELECT * FROM tasks
     WHERE board_id = ?
     ORDER BY CASE status
       WHEN 'backlog' THEN 0
       WHEN 'todo' THEN 1
       WHEN 'doing' THEN 2
       WHEN 'done' THEN 3
       ELSE 4 END,
       position ASC,
       created_at ASC`,
  ).bind(boardId).all();
  return (result.results || []).map(mapTask);
}

export async function loadBoardWithTasks(db, boardId) {
  const board = await loadBoard(db, boardId);
  if (!board) return null;
  return { ...board, tasks: await listTasks(db, boardId) };
}

export async function moveTask(db, taskId, status) {
  const task = await loadTask(db, taskId);
  if (!task) return null;

  const nextStatus = normalizeKanbanStatus(status, task.status);
  if (nextStatus === task.status) return task;

  const positionRow = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
     FROM tasks WHERE board_id = ? AND status = ?`,
  ).bind(task.boardId, nextStatus).first();
  const nextPosition = Number(positionRow?.next_position || 0);
  const now = new Date().toISOString();

  await db.prepare(
    'UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?',
  ).bind(nextStatus, nextPosition, now, taskId).run();
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, task.boardId).run();

  return { ...task, status: nextStatus, position: nextPosition, updatedAt: now };
}

export async function updateTask(db, taskId, fields = {}) {
  const existing = await loadTask(db, taskId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextTitle = fields.title !== undefined ? String(fields.title || '').trim().slice(0, 120) : existing.title;
  if (!nextTitle) throw new Error('La tarea necesita un título.');

  const nextDescription = fields.description !== undefined ? String(fields.description || '').trim().slice(0, 1200) : existing.description;
  const nextStatus = fields.status !== undefined ? normalizeKanbanStatus(fields.status, existing.status) : existing.status;
  const nextPriority = fields.priority !== undefined ? normalizeKanbanPriority(fields.priority, existing.priority) : existing.priority;
  
  let nextAssigneeId = existing.assigneeId;
  let nextAssigneeName = existing.assigneeName;
  if (fields.assigneeId !== undefined) {
    nextAssigneeId = fields.assigneeId ? String(fields.assigneeId).trim() : null;
  }
  if (fields.assigneeName !== undefined) {
    nextAssigneeName = fields.assigneeName ? String(fields.assigneeName).trim().slice(0, 80) : null;
  }

  let nextLabels = existing.labels;
  if (fields.labels !== undefined) {
    nextLabels = Array.isArray(fields.labels) ? fields.labels : parseLabels(fields.labels);
  }

  let nextPosition = existing.position;
  if (nextStatus !== existing.status) {
    const positionRow = await db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM tasks WHERE board_id = ? AND status = ?`,
    ).bind(existing.boardId, nextStatus).first();
    nextPosition = Number(positionRow?.next_position || 0);
  }

  await db.prepare(
    `UPDATE tasks SET
       title = ?,
       description = ?,
       status = ?,
       priority = ?,
       assignee_id = ?,
       assignee_name = ?,
       labels = ?,
       position = ?,
       updated_at = ?
     WHERE id = ?`,
  ).bind(
    nextTitle,
    nextDescription || null,
    nextStatus,
    nextPriority,
    nextAssigneeId,
    nextAssigneeName,
    JSON.stringify(nextLabels),
    nextPosition,
    now,
    taskId,
  ).run();

  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, existing.boardId).run();

  return {
    ...existing,
    title: nextTitle,
    description: nextDescription,
    status: nextStatus,
    priority: nextPriority,
    assigneeId: nextAssigneeId,
    assigneeName: nextAssigneeName,
    labels: nextLabels,
    position: nextPosition,
    updatedAt: now,
  };
}

export async function deleteTask(db, taskId) {
  const task = await loadTask(db, taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, task.boardId).run();

  return { ok: true, id: taskId, boardId: task.boardId };
}

