// Fusión de 3 vías por campo cuando el servidor responde 409 a una edición.
// base = lo que la persona vio al editar; mine = su cambio; theirs = servidor.
// Si el servidor no tocó el campo, se reaplica el cambio; si lo tocó otra
// persona, gana el servidor y se avisa qué campo se perdió.

export const KANBAN_FIELD_LABELS = {
  title: 'el título',
  description: 'la descripción',
  priority: 'la prioridad',
  dueDate: 'la fecha límite',
  tagIds: 'las etiquetas',
  subtasks: 'las subtareas',
  docIds: 'los documentos',
  assignee: 'el responsable',
};

export function cardFieldValue(card, field) {
  if (field === 'assignee') return card?.assignee ? {id: card.assignee.id, name: card.assignee.name} : null;
  return card?.[field] ?? null;
}

function same(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (!Array.isArray(a) && 'id' in a && 'id' in b && Object.keys(a).length <= 2) return a.id === b.id;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return (a ?? null) === (b ?? null);
}

/** Fusiona checklists por id: agrega lo nuevo, quita lo borrado y aplica ediciones propias. */
export function mergeSubtasks(base = [], mine = [], theirs = []) {
  const baseById = new Map(base.map(item => [item.id, item]));
  const mineById = new Map(mine.map(item => [item.id, item]));
  const merged = [];
  for (const item of theirs) {
    const original = baseById.get(item.id);
    const own = mineById.get(item.id);
    if (original && !own) continue; // la persona lo borró
    merged.push(own && original && !same(own, original) ? own : item);
  }
  const theirIds = new Set(theirs.map(item => item.id));
  for (const item of mine) {
    if (!baseById.has(item.id) && !theirIds.has(item.id)) merged.push(item);
  }
  return merged;
}

export function mergeCardConflict(op, serverCard) {
  const retry = {};
  const lost = [];
  for (const [field, mine] of Object.entries(op.fields || {})) {
    const base = op.base?.[field] ?? null;
    const theirs = cardFieldValue(serverCard, field);
    if (same(theirs, mine)) continue;
    if (same(theirs, base)) {
      retry[field] = mine;
    } else if (field === 'subtasks') {
      retry.subtasks = mergeSubtasks(base || [], mine || [], theirs || []);
    } else {
      lost.push(field);
    }
  }
  return {retry, lost};
}

export function describeLostFields(fields) {
  const labels = fields.map(field => KANBAN_FIELD_LABELS[field] || field);
  if (labels.length <= 1) return labels[0] || '';
  return `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
}
