// Reglas de Tareas compartidas por la Activity y el Worker (src/kanban-*.js
// importa este archivo), así el orden y los límites no pueden divergir.

export const KANBAN_LIMITS = Object.freeze({
  columns: 6,
  tags: 8,
  subtasks: 30,
  docs: 5,
  activeCards: 500,
  title: 200,
  description: 2000,
  columnName: 40,
  tagName: 24,
  subtaskText: 200,
  assigneeName: 100,
});

export const KANBAN_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const KANBAN_PRIORITY_LABELS = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const KANBAN_TAG_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];

export const DEFAULT_KANBAN_COLUMNS = [
  {name: 'Por hacer', isDone: false},
  {name: 'En curso', isDone: false},
  {name: 'Hecho', isDone: true},
];

// ---------------------------------------------------------------------------
// Orden fraccional: claves base 62 que se comparan como strings (igual que
// ORDER BY en SQLite). Insertar entre dos tarjetas nunca reescribe las demás.

export const RANK_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const MAX_RANK_LENGTH = 48;

function midpoint(a, b) {
  if (b !== null) {
    let n = 0;
    while ((a[n] || '0') === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? RANK_DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? RANK_DIGITS.indexOf(b[0]) : RANK_DIGITS.length;
  if (digitB - digitA > 1) return RANK_DIGITS[Math.round((digitA + digitB) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return RANK_DIGITS[digitA] + midpoint(a.slice(1), null);
}

export function isValidRank(rank) {
  return typeof rank === 'string'
    && rank.length > 0
    && !rank.endsWith('0')
    && [...rank].every(char => RANK_DIGITS.includes(char));
}

/** Clave estrictamente entre `a` y `b` (null = sin límite por ese lado). */
export function generateKeyBetween(a = null, b = null) {
  if (a !== null && !isValidRank(a)) throw new RangeError(`Rank inválido: ${a}`);
  if (b !== null && !isValidRank(b)) throw new RangeError(`Rank inválido: ${b}`);
  if (a !== null && b !== null && a >= b) throw new RangeError(`${a} >= ${b}`);
  return midpoint(a ?? '', b);
}

/** `n` claves cortas y equiespaciadas, para reordenar una columna completa. */
export function rebalancedKeys(n) {
  if (n <= 0) return [];
  let width = 1;
  while (RANK_DIGITS.length ** width < (n + 1) * 2) width += 1;
  const space = RANK_DIGITS.length ** width;
  const keys = [];
  for (let i = 1; i <= n; i += 1) {
    let value = Math.floor((i * space) / (n + 1));
    let encoded = '';
    for (let w = 0; w < width; w += 1) {
      encoded = RANK_DIGITS[value % RANK_DIGITS.length] + encoded;
      value = Math.floor(value / RANK_DIGITS.length);
    }
    // El sufijo evita claves terminadas en '0' (inválidas para midpoint).
    keys.push(`${encoded}V`);
  }
  return keys;
}

export function compareCards(a, b) {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Validación de campos (el Worker la aplica; la Activity la usa para no
// ofrecer valores que el servidor rechazaría).

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeSubtasks(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const subtasks = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const text = String(item.text ?? '').trim().slice(0, KANBAN_LIMITS.subtaskText);
    let id = String(item.id ?? '').trim().slice(0, 64);
    if (!text) continue;
    if (!id || seen.has(id)) id = `st-${subtasks.length}-${text.length}-${seen.size}`;
    seen.add(id);
    subtasks.push({id, text, done: Boolean(item.done)});
  }
  return subtasks.length > KANBAN_LIMITS.subtasks ? false : subtasks;
}

export function normalizeIdList(value, max) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean).map(item => item.slice(0, 128)))];
  return ids.length > max ? false : ids;
}

/** Tareas abiertas: no archivadas y fuera de la columna "Hecho". */
export function isOpenCard(card, doneColumnId) {
  return !card.archivedAt && card.columnId !== doneColumnId;
}

export function isOverdue(card, todayIso) {
  return Boolean(card.dueDate) && card.dueDate < todayIso;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatDueDate(dueDate, today) {
  if (!dueDate) return '';
  if (dueDate === today) return 'Hoy';
  if (dueDate === addDays(today, 1)) return 'Mañana';
  if (dueDate === addDays(today, -1)) return 'Ayer';
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const sameYear = year === Number(today.slice(0, 4));
  return new Intl.DateTimeFormat('es-CL', {day: 'numeric', month: 'short', ...(sameYear ? {} : {year: 'numeric'})}).format(date);
}
