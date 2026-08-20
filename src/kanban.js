export const BARDO_BOARD_PREFIX = 'bardo:board:';
export const BARDO_BOARD_TARGET_PREFIX = 'board:';

export const MAX_BOARD_COLUMNS = 5;
export const MAX_BOARD_CHIPS = 8;

export const DEFAULT_KANBAN_COLUMNS = Object.freeze([
  { id: 'backlog', label: 'Backlog', color: '#8a8e9b' },
  { id: 'todo', label: 'Por hacer', color: '#5865f2' },
  { id: 'doing', label: 'En curso', color: '#f0b232' },
  { id: 'done', label: 'Hecho', color: '#23a55a' },
]);

export const KANBAN_STATUSES = DEFAULT_KANBAN_COLUMNS;

export const KANBAN_PRIORITIES = Object.freeze([
  { id: 'low', label: 'Baja', color: '#8a8e9b', order: 1 },
  { id: 'medium', label: 'Media', color: '#5865f2', order: 2 },
  { id: 'high', label: 'Alta', color: '#f0b232', order: 3 },
  { id: 'urgent', label: 'Urgente', color: '#f23f43', order: 4 },
]);

const STATUS_IDS = new Set(DEFAULT_KANBAN_COLUMNS.map((status) => status.id));
const PRIORITY_IDS = new Set(KANBAN_PRIORITIES.map((priority) => priority.id));

export function validateBoardColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return [...DEFAULT_KANBAN_COLUMNS];
  }

  const valid = [];
  const seenIds = new Set();

  for (const col of columns) {
    if (!col) continue;
    const label = String(col.label || col.name || '').trim().slice(0, 30);
    if (!label) continue;
    const rawId = String(col.id || label.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `col-${valid.length + 1}`).trim().slice(0, 32);
    let id = rawId;
    let counter = 1;
    while (seenIds.has(id)) {
      id = `${rawId}-${counter}`;
      counter += 1;
    }
    seenIds.add(id);

    const color = String(col.color || getDeterministicColor(label)).trim();
    valid.push({ id, label, color });

    if (valid.length >= MAX_BOARD_COLUMNS) break;
  }

  return valid.length > 0 ? valid : [...DEFAULT_KANBAN_COLUMNS];
}

export function normalizeKanbanStatus(value, fallback = 'backlog', allowedStatuses = null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (Array.isArray(allowedStatuses) && allowedStatuses.length > 0) {
    const ids = new Set(allowedStatuses.map((s) => (typeof s === 'string' ? s : s.id)));
    return ids.has(normalized) ? normalized : (allowedStatuses[0]?.id || allowedStatuses[0] || fallback);
  }
  return STATUS_IDS.has(normalized) ? normalized : fallback;
}

export function normalizeKanbanPriority(value, fallback = 'medium') {
  const normalized = String(value || '').trim().toLowerCase();
  return PRIORITY_IDS.has(normalized) ? normalized : fallback;
}

export function priorityLabel(priority) {
  return KANBAN_PRIORITIES.find((item) => item.id === priority)?.label || 'Media';
}

export function priorityColor(priority) {
  return KANBAN_PRIORITIES.find((item) => item.id === priority)?.color || '#5865f2';
}

export const CHIP_COLOR_PALETTE = Object.freeze([
  { id: 'blurple', name: 'Azul', color: '#5865f2' },
  { id: 'emerald', name: 'Verde', color: '#23a55a' },
  { id: 'amber', name: 'Ámbar', color: '#f0b232' },
  { id: 'crimson', name: 'Rojo', color: '#f23f43' },
  { id: 'purple', name: 'Púrpura', color: '#9b59b6' },
  { id: 'pink', name: 'Rosa', color: '#eb459e' },
  { id: 'cyan', name: 'Cian', color: '#00b0f4' },
  { id: 'slate', name: 'Gris', color: '#8a8e9b' },
]);

export function getDeterministicColor(text) {
  if (!text) return CHIP_COLOR_PALETTE[0].color;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CHIP_COLOR_PALETTE.length;
  return CHIP_COLOR_PALETTE[index].color;
}

export function parseLabels(value) {
  if (!value) return [];

  // Si ya es un array de objetos o strings
  if (Array.isArray(value)) {
    const seen = new Set();
    const result = [];
    for (const item of value) {
      if (!item) continue;
      const name = typeof item === 'string' ? item.trim() : String(item.name || '').trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase('es');
      if (seen.has(key)) continue;
      seen.add(key);
      const color = (typeof item === 'object' && item.color) ? item.color : getDeterministicColor(name);
      result.push({ name: name.slice(0, 24), color });
      if (result.length >= 8) break;
    }
    return result;
  }

  // Si es un string separado por comas
  const seen = new Set();
  const labels = [];

  for (const raw of String(value).split(',')) {
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, 24);
    const key = label.toLocaleLowerCase('es');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push({ name: label, color: getDeterministicColor(label) });
    if (labels.length >= 8) break;
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


