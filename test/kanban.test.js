import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARDO_BOARD_PREFIX,
  CHIP_COLOR_PALETTE,
  DEFAULT_KANBAN_COLUMNS,
  KANBAN_PRIORITIES,
  KANBAN_STATUSES,
  MAX_BOARD_CHIPS,
  MAX_BOARD_COLUMNS,
  boardTarget,
  getDeterministicColor,
  normalizeKanbanPriority,
  normalizeKanbanStatus,
  parseBoardTarget,
  parseLabels,
  priorityColor,
  priorityLabel,
  statusLabel,
  validateBoardColumns,
} from '../src/kanban.js';
import {
  createBoard,
  createTask,
  deleteTask,
  findBoard,
  listBoards,
  loadBoardWithTasks,
  loadTask,
  moveTask,
  updateBoardColumns,
  updateBoardSettings,
  updateTask,
} from '../src/kanban-db.js';

test('parseLabels limpia duplicados, espacios y asigna colores a chips', () => {
  const result = parseLabels(' UX, urgente, ux,  Backend ,QA, Diseño, docs, extra ');
  assert.equal(result.length, 7);
  assert.equal(result[0].name, 'UX');
  assert.ok(result[0].color);
  assert.equal(result[1].name, 'urgente');
  assert.equal(result[2].name, 'Backend');
});

test('parseLabels respeta objetos de chips con color personalizado', () => {
  const custom = [
    { name: 'Frontend', color: '#eb459e' },
    { name: 'Bug', color: '#f23f43' },
  ];
  const parsed = parseLabels(custom);
  assert.deepEqual(parsed, custom);
});

test('normalizeKanbanStatus acepta las cuatro columnas y usa fallback', () => {
  assert.equal(normalizeKanbanStatus('doing'), 'doing');
  assert.equal(normalizeKanbanStatus('DONE'), 'done');
  assert.equal(normalizeKanbanStatus('inventado'), 'backlog');
  assert.equal(normalizeKanbanStatus('inventado', null), null);
});

test('normalizeKanbanPriority acepta las cuatro prioridades y usa fallback', () => {
  assert.equal(normalizeKanbanPriority('urgent'), 'urgent');
  assert.equal(normalizeKanbanPriority('HIGH'), 'high');
  assert.equal(normalizeKanbanPriority('medium'), 'medium');
  assert.equal(normalizeKanbanPriority('low'), 'low');
  assert.equal(normalizeKanbanPriority('inventado'), 'medium');
  assert.equal(normalizeKanbanPriority('inventado', null), null);
});

test('board target funciona para custom_id y contexto de Activity', () => {
  const id = 'abc-123';
  assert.equal(parseBoardTarget(`${BARDO_BOARD_PREFIX}${id}`), id);
  assert.equal(boardTarget(id), `board:${id}`);
  assert.equal(parseBoardTarget(boardTarget(id)), id);
  assert.equal(parseBoardTarget('bardo:open:abc-123'), null);
});

test('statusLabel entrega etiquetas legibles', () => {
  assert.equal(statusLabel('backlog'), 'Backlog');
  assert.equal(statusLabel('todo'), 'Por hacer');
  assert.equal(statusLabel('doing'), 'En curso');
  assert.equal(statusLabel('done'), 'Hecho');
});

test('priorityLabel y priorityColor entregan valores adecuados', () => {
  assert.equal(priorityLabel('urgent'), 'Urgente');
  assert.equal(priorityLabel('high'), 'Alta');
  assert.equal(priorityLabel('medium'), 'Media');
  assert.equal(priorityLabel('low'), 'Baja');
  assert.equal(priorityColor('urgent'), '#f23f43');
});

function createMockKanbanDb() {
  const boards = new Map();
  const tasks = new Map();

  return {
    boards,
    tasks,
    prepare(query) {
      const q = query.replace(/\s+/g, ' ');
      return {
        bind(...params) {
          return {
            async first() {
              if (q.includes('FROM boards WHERE id = ?')) {
                const [id] = params;
                const b = boards.get(id);
                return b ? { ...b } : null;
              }
              if (q.includes('FROM boards') && query.includes('guild_id = ?')) {
                const [guildId, val1, val2] = params;
                for (const b of boards.values()) {
                  if (b.guild_id === guildId && (b.id === val1 || b.name.toLowerCase() === String(val2).toLowerCase())) {
                    return { ...b };
                  }
                }
                return null;
              }
              if (q.includes('FROM tasks WHERE id = ?')) {
                const [id] = params;
                const t = tasks.get(id);
                return t ? { ...t } : null;
              }
              if (q.includes('MAX(position)')) {
                const [boardId, status] = params;
                let maxPos = -1;
                for (const t of tasks.values()) {
                  if (t.board_id === boardId && t.status === status && t.position > maxPos) {
                    maxPos = t.position;
                  }
                }
                return { next_position: maxPos + 1 };
              }
              return null;
            },
            async all() {
              if (q.includes('FROM tasks WHERE board_id = ?') || (q.includes('FROM tasks') && q.includes('board_id = ?'))) {
                const [boardId] = params;
                const list = [];
                for (const t of tasks.values()) {
                  if (t.board_id === boardId) list.push({ ...t });
                }
                return { results: list };
              }
              if (q.includes('FROM boards WHERE guild_id = ?') || (q.includes('FROM boards') && q.includes('guild_id = ?'))) {
                const [guildId, limit] = params;
                const list = [];
                for (const b of boards.values()) {
                  if (b.guild_id === guildId) list.push({ ...b });
                }
                return { results: list.slice(0, limit) };
              }
              return { results: [] };
            },
            async run() {
              if (q.includes('INSERT INTO boards')) {
                if (params.length === 9) {
                  const [id, guild_id, name, description, columns, members, created_by, created_at, updated_at] = params;
                  boards.set(id, { id, guild_id, name, description, columns, members, created_by, created_at, updated_at });
                } else {
                  const [id, guild_id, name, description, columns, created_by, created_at, updated_at] = params;
                  boards.set(id, { id, guild_id, name, description, columns, members: '[]', created_by, created_at, updated_at });
                }
                return { success: true };
              }
              if (q.includes('INSERT INTO tasks')) {
                const [id, board_id, title, description, status, priority, assignee_id, assignee_name, labels, position, created_by, created_at, updated_at] = params;
                tasks.set(id, { id, board_id, title, description, status, priority, assignee_id, assignee_name, labels, position, created_by, created_at, updated_at });
                return { success: true };
              }
              if (q.includes('UPDATE boards SET columns = ?')) {
                const [columns, updated_at, id] = params;
                const b = boards.get(id);
                if (b) {
                  b.columns = columns;
                  b.updated_at = updated_at;
                }
                return { success: true };
              }
              if (q.includes('UPDATE boards SET name = ?')) {
                const [name, description, members, updated_at, id] = params;
                const b = boards.get(id);
                if (b) {
                  b.name = name;
                  b.description = description;
                  b.members = members;
                  b.updated_at = updated_at;
                }
                return { success: true };
              }
              if (q.includes('UPDATE tasks SET status = ?')) {
                const [status, position, updated_at, id] = params;
                const t = tasks.get(id);
                if (t) {
                  t.status = status;
                  t.position = position;
                  t.updated_at = updated_at;
                }
                return { success: true };
              }
              if (q.includes('UPDATE tasks SET')) {
                const [title, description, status, priority, assignee_id, assignee_name, labels, position, updated_at, id] = params;
                const t = tasks.get(id);
                if (t) {
                  t.title = title;
                  t.description = description;
                  t.status = status;
                  t.priority = priority;
                  t.assignee_id = assignee_id;
                  t.assignee_name = assignee_name;
                  t.labels = labels;
                  t.position = position;
                  t.updated_at = updated_at;
                }
                return { success: true };
              }
              if (q.includes('DELETE FROM tasks WHERE id = ?')) {
                const [id] = params;
                tasks.delete(id);
                return { success: true };
              }
              if (q.includes('UPDATE boards SET updated_at = ?')) {
                const [updated_at, id] = params;
                const b = boards.get(id);
                if (b) b.updated_at = updated_at;
                return { success: true };
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('validateBoardColumns respeta límites de máximo 5 columnas y valores por defecto', () => {
  assert.equal(MAX_BOARD_COLUMNS, 5);
  assert.equal(MAX_BOARD_CHIPS, 8);

  const defaults = validateBoardColumns([]);
  assert.equal(defaults.length, 4);
  assert.equal(defaults[0].id, 'backlog');

  const customCols = [
    { label: 'Ideas', color: '#8a8e9b' },
    { label: 'Diseño', color: '#eb459e' },
    { label: 'Desarrollo', color: '#5865f2' },
    { label: 'QA', color: '#f0b232' },
    { label: 'Lanzado', color: '#23a55a' },
    { label: 'Extra no permitido', color: '#f23f43' },
  ];

  const validated = validateBoardColumns(customCols);
  assert.equal(validated.length, 5);
  assert.equal(validated[0].label, 'Ideas');
  assert.equal(validated[4].label, 'Lanzado');
});

test('Operaciones CRUD completas de Kanban en BD (crear, editar, mover, eliminar)', async () => {
  const db = createMockKanbanDb();

  // Crear tablero
  const board = await createBoard(db, {
    id: 'board-1',
    guildId: 'guild-100',
    name: 'Sprint Team',
    description: 'Tablero principal',
    createdBy: 'user-1',
  });
  assert.equal(board.name, 'Sprint Team');
  assert.equal(board.columns.length, 4);

  // Crear tarea
  const task = await createTask(db, {
    id: 'task-1',
    boardId: 'board-1',
    title: 'Implementar Auth',
    description: 'Usar OAuth2',
    status: 'todo',
    priority: 'urgent',
    assigneeName: 'Alex',
    labels: 'Backend, Segur',
    createdBy: 'user-1',
  });
  assert.equal(task.title, 'Implementar Auth');
  assert.equal(task.priority, 'urgent');
  assert.equal(task.status, 'todo');
  assert.equal(task.labels.length, 2);
  assert.equal(task.labels[0].name, 'Backend');
  assert.equal(task.labels[1].name, 'Segur');

  // Modificar tarea con chips enriquecidos
  const updated = await updateTask(db, 'task-1', {
    title: 'Implementar Auth v2',
    priority: 'high',
    status: 'doing',
    labels: [
      { name: 'Backend', color: '#5865f2' },
      { name: 'Auth', color: '#23a55a' },
      { name: 'Seguridad', color: '#f23f43' },
    ],
  });
  assert.equal(updated.title, 'Implementar Auth v2');
  assert.equal(updated.priority, 'high');
  assert.equal(updated.status, 'doing');
  assert.equal(updated.labels.length, 3);
  assert.equal(updated.labels[1].name, 'Auth');
  assert.equal(updated.labels[1].color, '#23a55a');

  // Modificar columnas del tablero
  const updatedBoard = await updateBoardColumns(db, 'board-1', [
    { id: 'todo', label: 'Por hacer', color: '#5865f2' },
    { id: 'doing', label: 'En curso', color: '#f0b232' },
    { id: 'review', label: 'En revisión', color: '#9b59b6' },
    { id: 'done', label: 'Completado', color: '#23a55a' },
  ]);
  assert.equal(updatedBoard.columns.length, 4);
  assert.equal(updatedBoard.columns[2].label, 'En revisión');

  // Modificar configuración y miembros del tablero
  const updatedSettings = await updateBoardSettings(db, 'board-1', {
    name: 'Sprint 42 Refactor',
    description: 'Tablero principal del sprint',
    members: [
      { id: 'u1', name: 'Max', username: 'maxavend' },
      { id: 'u2', name: 'Paula', username: 'paula' },
    ],
  });
  assert.equal(updatedSettings.name, 'Sprint 42 Refactor');
  assert.equal(updatedSettings.description, 'Tablero principal del sprint');
  assert.equal(updatedSettings.members.length, 2);
  assert.equal(updatedSettings.members[0].name, 'Max');

  // Cargar tablero con tareas
  const boardWithTasks = await loadBoardWithTasks(db, 'board-1');
  assert.equal(boardWithTasks.name, 'Sprint 42 Refactor');
  assert.equal(boardWithTasks.members.length, 2);
  assert.equal(boardWithTasks.tasks.length, 1);
  assert.equal(boardWithTasks.tasks[0].title, 'Implementar Auth v2');

  // Mover tarea
  const moved = await moveTask(db, 'task-1', 'done');
  assert.equal(moved.status, 'done');

  // Eliminar tarea
  const delResult = await deleteTask(db, 'task-1');
  assert.equal(delResult.ok, true);

  const emptyBoard = await loadBoardWithTasks(db, 'board-1');
  assert.equal(emptyBoard.tasks.length, 0);
});
