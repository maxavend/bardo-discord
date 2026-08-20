export const BARDO_BOARD_PREFIX = 'bardo:board:';
export const BARDO_BOARD_TARGET_PREFIX = 'board:';

export const KANBAN_STATUSES = Object.freeze([
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'doing', label: 'En curso' },
  { id: 'done', label: 'Hecho' },
]);

const STATUS_IDS = new Set(KANBAN_STATUSES.map((status) => status.id));

export function normalizeKanbanStatus(value, fallback = 'backlog') {
  const normalized = String(value || '').trim().toLowerCase();
  return STATUS_IDS.has(normalized) ? normalized : fallback;
}

export function parseLabels(value) {
  if (!value) return [];

  const seen = new Set();
  const labels = [];

  for (const raw of String(value).split(',')) {
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, 24);
    const key = label.toLocaleLowerCase('es');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= 6) break;
  }

  return labels;
}

export function boardTarget(boardId) {
  return `${BARDO_BOARD_TARGET_PREFIX}${boardId}`;
}

export function parseBoardTarget(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith(BARDO_BOARD_PREFIX)) {
    return normalized.slice(BARDO_BOARD_PREFIX.length) || null;
  }
  if (normalized.startsWith(BARDO_BOARD_TARGET_PREFIX)) {
    return normalized.slice(BARDO_BOARD_TARGET_PREFIX.length) || null;
  }
  return null;
}

export function statusLabel(status) {
  return KANBAN_STATUSES.find((item) => item.id === status)?.label || 'Backlog';
}
