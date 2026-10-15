// Estado del tablero (JS puro, testeable desde Node).
//
// Lo que se ve = estado del servidor + operaciones pendientes aplicadas encima.
// Así la UI responde al instante (optimista) y, cuando una operación falla,
// basta con descartarla para volver a la verdad del servidor.
import {
  compareCards,
  generateKeyBetween,
  isValidRank,
} from './kanban-shared.js';

export function emptyServerState() {
  return {board: null, cards: {}, cursor: null, structureRev: 0};
}

function sortColumns(columns) {
  return [...(columns || [])].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

/** Aplica la respuesta de GET /board (completa o delta). */
export function applyBoardResponse(state, response) {
  if (!response || response.unchanged) return state;
  let next = applyStructure(state, response.board);
  const cards = response.full ? {} : {...next.cards};
  for (const card of response.cards || []) {
    const current = cards[card.id];
    if (current && current.rev > card.rev) continue; // ya tenemos algo más nuevo
    if (card.archivedAt) delete cards[card.id];
    else cards[card.id] = card;
  }
  if (response.full) {
    // Una carga completa no debe borrar tarjetas más nuevas que la foto.
    for (const card of Object.values(next.cards)) {
      if (!cards[card.id] && card.rev > (response.board?.rev ?? 0)) cards[card.id] = card;
    }
  }
  next = {...next, cards, cursor: Math.max(next.cursor ?? 0, response.board?.rev ?? 0)};
  return next;
}

/** Aplica columnas y etiquetas si no son más viejas que las que ya tenemos. */
export function applyStructure(state, board) {
  if (!board) return state;
  if (state.board && board.rev < state.structureRev) return state;
  return {
    ...state,
    board: {
      id: board.id,
      guildId: board.guildId ?? state.board?.guildId ?? null,
      channelId: board.channelId ?? state.board?.channelId ?? null,
      columns: sortColumns(board.columns),
      tags: [...(board.tags || [])],
    },
    structureRev: Math.max(state.structureRev, board.rev ?? 0),
  };
}

/** Aplica una tarjeta devuelta por el servidor (respuesta de una operación). */
export function applyServerCard(state, card) {
  if (!card) return state;
  const current = state.cards[card.id];
  if (current && current.rev > card.rev) return state;
  const cards = {...state.cards};
  if (card.archivedAt) delete cards[card.id];
  else cards[card.id] = card;
  return {...state, cards};
}

export function doneColumnId(board) {
  return board?.columns.find(column => column.isDone)?.id || null;
}

export function defaultColumnId(board) {
  return (board?.columns.find(column => !column.isDone) || board?.columns[0])?.id || null;
}

export function cardsInColumn(cards, columnId) {
  return Object.values(cards).filter(card => card.columnId === columnId).sort(compareCards);
}

export function cardsByColumn(view) {
  const map = new Map((view.board?.columns || []).map(column => [column.id, []]));
  for (const card of Object.values(view.cards)) {
    if (map.has(card.columnId)) map.get(card.columnId).push(card);
  }
  for (const list of map.values()) list.sort(compareCards);
  return map;
}

/**
 * Rank local para una posición. Si los vecinos no sirven (otra persona movió
 * algo entretanto), cae al final de la columna; el servidor decide igual.
 */
export function localRank(cards, columnId, {afterId = null, beforeId = null, excludeId = null} = {}) {
  const list = cardsInColumn(cards, columnId).filter(card => card.id !== excludeId);
  let upper;
  const afterIndex = afterId ? list.findIndex(card => card.id === afterId) : -1;
  const beforeIndex = beforeId ? list.findIndex(card => card.id === beforeId) : -1;
  if (afterIndex !== -1) upper = afterIndex;
  else if (beforeIndex !== -1) upper = beforeIndex - 1;
  else if (afterId === null && beforeId !== null) upper = -1;
  else upper = list.length - 1;
  const upperRank = upper >= 0 ? list[upper].rank : null;
  let lower = upper + 1;
  let lowerRank = lower < list.length ? list[lower].rank : null;
  while (lowerRank !== null && upperRank !== null && lowerRank <= upperRank) {
    lower += 1;
    lowerRank = lower < list.length ? list[lower].rank : null;
  }
  try {
    if ((upperRank === null || isValidRank(upperRank)) && (lowerRank === null || isValidRank(lowerRank))) {
      return generateKeyBetween(upperRank, lowerRank);
    }
  } catch {
    // Ranks inesperados: al final.
  }
  return generateKeyBetween(list.at(-1)?.rank && isValidRank(list.at(-1).rank) ? list.at(-1).rank : null, null);
}

/** Vecinos (arriba/abajo) de una tarjeta tras soltarla en `index` de una columna. */
export function neighborsAt(cards, columnId, index, movingId) {
  const list = cardsInColumn(cards, columnId).filter(card => card.id !== movingId);
  const clamped = Math.max(0, Math.min(index, list.length));
  return {afterId: list[clamped - 1]?.id ?? null, beforeId: list[clamped]?.id ?? null};
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Aplica una operación local. Se usa para la vista optimista (encima del
 * servidor) y, sin Discord, como única fuente de verdad (modo local).
 */
export function applyOp(state, op) {
  const cards = {...state.cards};
  const board = state.board;
  switch (op.type) {
    case 'create': {
      if (cards[op.card.id]) return state;
      const rank = op.card.rank || localRank(cards, op.card.columnId, op);
      const number = Math.max(0, ...Object.values(cards).map(card => card.number || 0)) + 1;
      cards[op.card.id] = {
        number: op.card.number || number,
        description: '', assignee: null, priority: 'normal', dueDate: null, tagIds: [], subtasks: [], docIds: [],
        sourceRef: null, threadId: null, threadPending: false, notifications: {channel: null, dm: null},
        version: 1, rev: -1, completedAt: null, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
        ...op.card,
        rank,
        pending: true,
      };
      return {...state, cards};
    }
    case 'patch': {
      const card = cards[op.id];
      if (!card) return state;
      cards[op.id] = {...card, ...op.fields, pending: true};
      return {...state, cards};
    }
    case 'move': {
      const card = cards[op.id];
      if (!card || !board?.columns.some(column => column.id === op.columnId)) return state;
      const rank = localRank(cards, op.columnId, {afterId: op.afterId, beforeId: op.beforeId, excludeId: op.id});
      const isDone = board.columns.find(column => column.id === op.columnId)?.isDone;
      cards[op.id] = {...card, columnId: op.columnId, rank, completedAt: isDone ? (card.completedAt || nowIso()) : null, pending: true};
      return {...state, cards};
    }
    case 'archive':
      delete cards[op.id];
      return {...state, cards};
    case 'restore':
      if (op.card) cards[op.card.id] = {...op.card, archivedAt: null, pending: true};
      return {...state, cards};
    default:
      return applyStructureOp(state, op);
  }
}

function applyStructureOp(state, op) {
  if (!state.board) return state;
  let columns = state.board.columns.map(column => ({...column}));
  let tags = [...state.board.tags];
  let cards = state.cards;
  switch (op.type) {
    case 'addColumn':
      columns.push({id: op.columnId, name: op.name, position: columns.length, isDone: false, pending: true});
      break;
    case 'renameColumn':
      columns = columns.map(column => (column.id === op.id ? {...column, name: op.name} : column));
      break;
    case 'setDoneColumn':
      columns = columns.map(column => ({...column, isDone: column.id === op.id}));
      cards = Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, {
        ...card, completedAt: card.columnId === op.id ? (card.completedAt || nowIso()) : null,
      }]));
      break;
    case 'reorderColumns': {
      const position = new Map(op.order.map((id, index) => [id, index]));
      columns = columns.map(column => ({...column, position: position.get(column.id) ?? column.position}));
      break;
    }
    case 'deleteColumn': {
      columns = columns.filter(column => column.id !== op.id).map((column, index) => ({...column, position: index}));
      if (op.moveTo) {
        const moving = cardsInColumn(cards, op.id);
        let last = cardsInColumn(cards, op.moveTo).at(-1)?.rank ?? null;
        cards = {...cards};
        for (const card of moving) {
          last = generateKeyBetween(last && isValidRank(last) ? last : null, null);
          cards[card.id] = {...card, columnId: op.moveTo, rank: last};
        }
      }
      break;
    }
    case 'addTag':
      tags.push({id: op.tagId, name: op.name, color: op.color, pending: true});
      break;
    case 'updateTag':
      tags = tags.map(tag => (tag.id === op.id ? {...tag, ...op.fields} : tag));
      break;
    case 'deleteTag':
      tags = tags.filter(tag => tag.id !== op.id);
      cards = Object.fromEntries(Object.entries(cards).map(([id, card]) => [id,
        card.tagIds?.includes(op.id) ? {...card, tagIds: card.tagIds.filter(tagId => tagId !== op.id)} : card]));
      break;
    default:
      return state;
  }
  return {...state, cards, board: {...state.board, columns: sortColumns(columns), tags}};
}

export function applyOps(state, ops) {
  return ops.reduce(applyOp, state);
}

// ---------------------------------------------------------------------------
// Filtros de la vista

export function todayIso(now = new Date(), timeZone = 'America/Santiago') {
  try {
    return new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function filterCards(cards, {filter = 'all', userId = null, tagId = null, query = '', today = todayIso(), doneId = null} = {}) {
  const text = query.trim().toLowerCase();
  return Object.fromEntries(Object.entries(cards).filter(([, card]) => {
    if (filter === 'mine' && card.assignee?.id !== userId) return false;
    if (filter === 'overdue' && !(card.dueDate && card.dueDate < today && card.columnId !== doneId)) return false;
    if (tagId && !card.tagIds?.includes(tagId)) return false;
    if (text && !`#${card.number} ${card.title} ${card.description} ${card.assignee?.name || ''}`.toLowerCase().includes(text)) return false;
    return true;
  }));
}

/** Tareas abiertas asignadas a una persona, por fecha límite (para Inicio). */
export function assignedOpenCards(view, userId, limit = 4) {
  if (!userId || !view.board) return [];
  const doneId = doneColumnId(view.board);
  return Object.values(view.cards)
    .filter(card => card.assignee?.id === userId && card.columnId !== doneId)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.number - b.number)
    .slice(0, limit);
}
