import { createTask as createTaskRecord, loadBoard, loadTask, updateTask as updateTaskRecord } from '../kanban-db.js';
import { NotificationService } from './notifications.js';

function snowflake(value) {
  const id = String(value || '').trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

export class TaskService {
  constructor(env) {
    this.env = env;
    this.db = env.DB;
    this.notifications = new NotificationService(env);
  }

  async create(input, context = {}) {
    const board = await loadBoard(this.db, input.boardId);
    if (!board) throw new Error('Tablero no encontrado.');
    if (context.guildId && String(context.guildId) !== String(board.guildId)) throw new Error('El tablero pertenece a otro servidor.');
    const columnId = input.status || input.columnId || board.columns?.[0]?.id;
    if (!columnId) throw new Error('El tablero no tiene una columna disponible.');

    const task = await createTaskRecord(this.db, {
      id: input.id || crypto.randomUUID(),
      boardId: board.id,
      title: input.title,
      description: input.description || '',
      status: columnId,
      priority: input.priority || 'medium',
      assigneeId: input.assigneeId || null,
      assigneeName: input.assigneeName || null,
      labels: input.labels || [],
      createdBy: input.createdBy || context.actorUserId || 'unknown',
    });

    const assigneeId = snowflake(task.assigneeId);
    if (assigneeId) {
      await this.notifications.enqueue({
        guildId: board.guildId,
        userId: assigneeId,
        eventType: 'task.assigned',
        entityType: 'task',
        entityId: task.id,
        actorUserId: context.actorUserId || input.createdBy || null,
        dedupeKey: `task.assigned:${task.id}:${assigneeId}:${task.updatedAt || task.createdAt || 'created'}`,
      }, { waitUntil: context.waitUntil });
    }
    return task;
  }

  async update(taskId, fields, context = {}) {
    const before = await loadTask(this.db, taskId);
    if (!before) return null;
    const board = await loadBoard(this.db, before.boardId);
    if (!board) throw new Error('Tablero no encontrado.');
    if (context.guildId && String(context.guildId) !== String(board.guildId)) throw new Error('La tarea pertenece a otro servidor.');

    const updated = await updateTaskRecord(this.db, taskId, fields);
    if (!updated) return null;
    const previousAssignee = snowflake(before.assigneeId);
    const nextAssignee = snowflake(updated.assigneeId);
    if (nextAssignee && nextAssignee !== previousAssignee) {
      await this.notifications.enqueue({
        guildId: board.guildId,
        userId: nextAssignee,
        eventType: previousAssignee ? 'task.reassigned' : 'task.assigned',
        entityType: 'task',
        entityId: updated.id,
        actorUserId: context.actorUserId || null,
        dedupeKey: `${previousAssignee ? 'task.reassigned' : 'task.assigned'}:${updated.id}:${nextAssignee}:${updated.updatedAt || Date.now()}`,
      }, { waitUntil: context.waitUntil });
    }
    return updated;
  }
}
