import {
  DEFAULT_KANBAN_COLUMNS,
  legacyStatusForColumn,
  normalizeKanbanPriority,
  parseLabels,
  requireKanbanColumn,
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

async function runBatch(db, statements) {
  if (!statements.length) return [];
  if (typeof db.batch === 'function') return db.batch(statements);
  const results = [];
  for (const statement of statements) results.push(await statement.run());
  return results;
}

function mapBoard(row) {
  if (!row) return null;
  const rawCols = parseJsonArray(row.columns);
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description || '',
    columns: validateBoardColumns(rawCols),
    members: parseJsonArray(row.members),
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
    status: row.column_id || row.status || 'backlog',
    legacyStatus: row.status || 'backlog',
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

export class ColumnTasksRequireDestinationError extends Error {
  constructor({ removedColumnIds, affectedCount, destinations, suggestedDestinationId }) {
    super('La columna tiene tareas. Elige a qué columna moverlas antes de eliminarla.');
    this.name = 'ColumnTasksRequireDestinationError';
    this.code = 'COLUMN_HAS_TASKS';
    this.removedColumnIds = removedColumnIds;
    this.affectedCount = affectedCount;
    this.destinations = destinations;
    this.suggestedDestinationId = suggestedDestinationId;
  }
}

async function resolveColumnTransition(db, board, nextColumns, moveTasksTo = null) {
  const previousIds = new Set((board.columns || []).map((column) => column.id));
  const nextIds = new Set(nextColumns.map((column) => column.id));
  const removedColumnIds = [...previousIds].filter((id) => !nextIds.has(id));
  if (!removedColumnIds.length) return { affectedTasks: [], destination: null };

  const tasks = await listTasks(db, board.id);
  const affectedTasks = tasks.filter((task) => removedColumnIds.includes(task.status));
  if (!affectedTasks.length) return { affectedTasks: [], destination: null };

  const destinations = nextColumns.map((column) => ({ id: column.id, label: column.label }));
  const suggestedDestinationId = nextIds.has('backlog') ? 'backlog' : nextColumns[0]?.id || null;
  if (!moveTasksTo) {
    throw new ColumnTasksRequireDestinationError({
      removedColumnIds,
      affectedCount: affectedTasks.length,
      destinations,
      suggestedDestinationId,
    });
  }

  return { affectedTasks, destination: requireKanbanColumn(nextColumns, moveTasksTo) };
}

async function buildTaskMoveStatements(db, boardId, affectedTasks, destination, now) {
  if (!affectedTasks.length || !destination) return [];
  const maxRow = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
     FROM tasks WHERE board_id = ? AND COALESCE(column_id, status) = ?`,
  ).bind(boardId, destination.id).first();
  const start = Number(maxRow?.next_position || 0);
  const legacyStatus = legacyStatusForColumn(destination.id);
  const statements = [];
  affectedTasks.forEach((task, index) => {
    statements.push(db
      .prepare('UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?')
      .bind(legacyStatus, start + index, now, task.id));
    statements.push(db
      .prepare('UPDATE tasks SET column_id = ? WHERE id = ?')
      .bind(destination.id, task.id));
  });
  return statements;
}

export async function createBoard(db, { id, guildId, name, description, columns, members, createdBy }) {
  const now = new Date().toISOString();
  const cleanName = String(name || '').trim().slice(0, 80);
  const cleanDescription = String(description || '').trim().slice(0, 500);
  if (!cleanName) throw new Error('El tablero necesita un nombre.');

  const validColumns = validateBoardColumns(columns);
  const validMembers = Array.isArray(members) ? members : [];
  await db.prepare(
    `INSERT INTO boards (id, guild_id, name, description, columns, members, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, guildId, cleanName, cleanDescription || null, JSON.stringify(validColumns), JSON.stringify(validMembers), createdBy, now, now).run();

  return { id, guildId, name: cleanName, description: cleanDescription, columns: validColumns, members: validMembers, createdBy, createdAt: now, updatedAt: now };
}

export async function updateBoardSettings(db, boardId, { name, description, members, columns }, { moveTasksTo = null } = {}) {
  const board = await loadBoard(db, boardId);
  if (!board) return null;

  const now = new Date().toISOString();
  const cleanName = name !== undefined ? String(name || '').trim().slice(0, 80) : board.name;
  if (name !== undefined && !cleanName) throw new Error('El tablero necesita un nombre.');
  const cleanDescription = description !== undefined ? (description ? String(description).trim().slice(0, 500) : '') : board.description;
  const validMembers = members !== undefined && Array.isArray(members) ? members : board.members || [];
  const validColumns = columns !== undefined && Array.isArray(columns) ? validateBoardColumns(columns) : board.columns || DEFAULT_KANBAN_COLUMNS;
  const transition = columns !== undefined
    ? await resolveColumnTransition(db, board, validColumns, moveTasksTo)
    : { affectedTasks: [], destination: null };

  const statements = [db.prepare(
    `UPDATE boards SET name = ?, description = ?, members = ?, columns = ?, updated_at = ? WHERE id = ?`,
  ).bind(cleanName, cleanDescription || null, JSON.stringify(validMembers), JSON.stringify(validColumns), now, boardId)];
  statements.push(...await buildTaskMoveStatements(db, boardId, transition.affectedTasks, transition.destination, now));
  await runBatch(db, statements);
  return loadBoard(db, boardId);
}

export async function updateBoardColumns(db, boardId, inputColumns, { moveTasksTo = null } = {}) {
  const board = await loadBoard(db, boardId);
  if (!board) return null;
  const validColumns = validateBoardColumns(inputColumns);
  const transition = await resolveColumnTransition(db, board, validColumns, moveTasksTo);
  const now = new Date().toISOString();
  const statements = [db
    .prepare('UPDATE boards SET columns = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(validColumns), now, boardId)];
  statements.push(...await buildTaskMoveStatements(db, boardId, transition.affectedTasks, transition.destination, now));
  await runBatch(db, statements);
  return loadBoard(db, boardId);
}

export async function loadBoard(db, boardId) {
  return mapBoard(await db.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first());
}

export async function findBoard(db, guildId, value) {
  const key = String(value || '').trim();
  if (!key) return null;
  return mapBoard(await db.prepare(
    `SELECT * FROM boards WHERE guild_id = ? AND (id = ? OR name = ? COLLATE NOCASE) LIMIT 1`,
  ).bind(guildId, key, key).first());
}

export async function listBoards(db, guildId, limit = 20) {
  const result = await db.prepare(
    `SELECT * FROM boards WHERE guild_id = ? ORDER BY updated_at DESC LIMIT ?`,
  ).bind(guildId, limit).all();
  return (result.results || []).map(mapBoard);
}

export async function createTask(db, input) {
  const board = await loadBoard(db, input.boardId);
  if (!board) throw new Error('El tablero no existe.');
  const now = new Date().toISOString();
  const title = String(input.title || '').trim().slice(0, 120);
  if (!title) throw new Error('La tarea necesita un título.');

  const description = String(input.description || '').trim().slice(0, 1200);
  const column = requireKanbanColumn(board.columns, input.status, { fallback: board.columns[0]?.id });
  const legacyStatus = legacyStatusForColumn(column.id);
  const priority = normalizeKanbanPriority(input.priority);
  const labels = Array.isArray(input.labels) ? input.labels : parseLabels(input.labels);
  const positionRow = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks
     WHERE board_id = ? AND COALESCE(column_id, status) = ?`,
  ).bind(input.boardId, column.id).first();
  const position = Number(positionRow?.next_position || 0);

  // Keep the historical parameter order first so older adapters/mocks continue to
  // understand the write; column_id is appended as the new authoritative field.
  const insert = db.prepare(
    `INSERT INTO tasks (
       id, board_id, title, description, status, priority, assignee_id, assignee_name,
       labels, position, created_by, created_at, updated_at, column_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.id, input.boardId, title, description || null, legacyStatus, priority,
    input.assigneeId || null, input.assigneeName || null, JSON.stringify(labels), position,
    input.createdBy, now, now, column.id,
  );
  const touch = db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, input.boardId);
  await runBatch(db, [insert, touch]);

  return {
    id: input.id, boardId: input.boardId, title, description, status: column.id,
    legacyStatus, priority, assigneeId: input.assigneeId || null, assigneeName: input.assigneeName || null,
    labels, position, createdBy: input.createdBy, createdAt: now, updatedAt: now,
  };
}

export async function loadTask(db, taskId) {
  return mapTask(await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first());
}

export async function listTasks(db, boardId) {
  const result = await db.prepare(
    `SELECT * FROM tasks WHERE board_id = ?
     ORDER BY COALESCE(column_id, status) ASC, position ASC, created_at ASC`,
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
  const board = await loadBoard(db, task.boardId);
  if (!board) throw new Error('El tablero no existe.');
  const nextColumn = requireKanbanColumn(board.columns, status);
  if (nextColumn.id === task.status) return task;

  const positionRow = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks
     WHERE board_id = ? AND COALESCE(column_id, status) = ?`,
  ).bind(task.boardId, nextColumn.id).first();
  const nextPosition = Number(positionRow?.next_position || 0);
  const now = new Date().toISOString();
  const legacyStatus = legacyStatusForColumn(nextColumn.id);
  const updateLegacy = db.prepare(
    'UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?',
  ).bind(legacyStatus, nextPosition, now, taskId);
  const updateColumn = db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').bind(nextColumn.id, taskId);
  const touch = db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, task.boardId);
  await runBatch(db, [updateLegacy, updateColumn, touch]);

  return { ...task, status: nextColumn.id, legacyStatus, position: nextPosition, updatedAt: now };
}

export async function updateTask(db, taskId, fields = {}) {
  const existing = await loadTask(db, taskId);
  if (!existing) return null;
  const board = await loadBoard(db, existing.boardId);
  if (!board) throw new Error('El tablero no existe.');

  const now = new Date().toISOString();
  const nextTitle = fields.title !== undefined ? String(fields.title || '').trim().slice(0, 120) : existing.title;
  if (!nextTitle) throw new Error('La tarea necesita un título.');
  const nextDescription = fields.description !== undefined ? String(fields.description || '').trim().slice(0, 1200) : existing.description;
  const nextColumn = fields.status !== undefined
    ? requireKanbanColumn(board.columns, fields.status)
    : requireKanbanColumn(board.columns, existing.status);
  const nextLegacyStatus = legacyStatusForColumn(nextColumn.id);
  const nextPriority = fields.priority !== undefined ? normalizeKanbanPriority(fields.priority, existing.priority) : existing.priority;
  let nextAssigneeId = existing.assigneeId;
  let nextAssigneeName = existing.assigneeName;
  if (fields.assigneeId !== undefined) nextAssigneeId = fields.assigneeId ? String(fields.assigneeId).trim() : null;
  if (fields.assigneeName !== undefined) nextAssigneeName = fields.assigneeName ? String(fields.assigneeName).trim().slice(0, 80) : null;
  const nextLabels = fields.labels !== undefined
    ? (Array.isArray(fields.labels) ? fields.labels : parseLabels(fields.labels))
    : existing.labels;

  let nextPosition = existing.position;
  if (nextColumn.id !== existing.status) {
    const positionRow = await db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM tasks
       WHERE board_id = ? AND COALESCE(column_id, status) = ?`,
    ).bind(existing.boardId, nextColumn.id).first();
    nextPosition = Number(positionRow?.next_position || 0);
  }

  const updateLegacy = db.prepare(
    `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, assignee_name = ?,
       labels = ?, position = ?, updated_at = ? WHERE id = ?`,
  ).bind(
    nextTitle, nextDescription || null, nextLegacyStatus, nextPriority, nextAssigneeId, nextAssigneeName,
    JSON.stringify(nextLabels), nextPosition, now, taskId,
  );
  const updateColumn = db.prepare('UPDATE tasks SET column_id = ? WHERE id = ?').bind(nextColumn.id, taskId);
  const touch = db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, existing.boardId);
  await runBatch(db, [updateLegacy, updateColumn, touch]);

  return {
    ...existing, title: nextTitle, description: nextDescription, status: nextColumn.id,
    legacyStatus: nextLegacyStatus, priority: nextPriority, assigneeId: nextAssigneeId,
    assigneeName: nextAssigneeName, labels: nextLabels, position: nextPosition, updatedAt: now,
  };
}

export async function deleteTask(db, taskId) {
  const task = await loadTask(db, taskId);
  if (!task) return null;
  const now = new Date().toISOString();
  const remove = db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId);
  const touch = db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, task.boardId);
  await runBatch(db, [remove, touch]);
  return { ok: true, id: taskId, boardId: task.boardId };
}
