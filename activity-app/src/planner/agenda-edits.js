/**
 * Pure agenda edits with undo. Each `remove*` returns the next agenda plus a
 * `removed` record; `restoreRemoved` puts that exact item back where it was
 * (clamped if the list got shorter) unless it is already there, so an undo
 * never duplicates and never reverts other edits made in the meantime.
 */

function blocksOf(plannerState) {
  return Array.isArray(plannerState?.blocks) ? plannerState.blocks : [];
}

function insertAt(list, item, index) {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export function removeBlock(plannerState, blockId) {
  const blocks = blocksOf(plannerState);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return {state: plannerState, removed: null};
  return {
    state: {...plannerState, blocks: blocks.filter((block) => block.id !== blockId)},
    removed: {kind: 'block', block: blocks[index], index},
  };
}

export function removeTopic(plannerState, blockId, pointId) {
  const blocks = blocksOf(plannerState);
  const block = blocks.find((candidate) => candidate.id === blockId);
  const points = Array.isArray(block?.subpoints) ? block.subpoints : [];
  const index = points.findIndex((point) => point.id === pointId);
  if (!block || index < 0) return {state: plannerState, removed: null};
  return {
    state: {
      ...plannerState,
      blocks: blocks.map((candidate) => (candidate.id === blockId
        ? {...candidate, subpoints: points.filter((point) => point.id !== pointId)}
        : candidate)),
    },
    removed: {kind: 'topic', blockId, point: points[index], index},
  };
}

export function removeAgreement(plannerState, blockId, decisionId) {
  const blocks = blocksOf(plannerState);
  const block = blocks.find((candidate) => candidate.id === blockId);
  const decisions = Array.isArray(block?.decisions) ? block.decisions : [];
  const index = decisions.findIndex((decision) => decision.id === decisionId);
  if (!block || index < 0) return {state: plannerState, removed: null};
  return {
    state: {
      ...plannerState,
      blocks: blocks.map((candidate) => (candidate.id === blockId
        ? {...candidate, decisions: decisions.filter((decision) => decision.id !== decisionId)}
        : candidate)),
    },
    removed: {kind: 'agreement', blockId, decision: decisions[index], index},
  };
}

export function restoreRemoved(plannerState, removed) {
  if (!removed) return plannerState;
  const blocks = blocksOf(plannerState);
  if (removed.kind === 'block') {
    if (blocks.some((block) => block.id === removed.block.id)) return plannerState;
    return {...plannerState, blocks: insertAt(blocks, removed.block, removed.index)};
  }
  const listKey = removed.kind === 'topic' ? 'subpoints' : removed.kind === 'agreement' ? 'decisions' : null;
  const item = removed.kind === 'topic' ? removed.point : removed.decision;
  if (!listKey || !item) return plannerState;
  // The bloque was deleted meanwhile: nothing to restore into.
  if (!blocks.some((block) => block.id === removed.blockId)) return plannerState;
  return {
    ...plannerState,
    blocks: blocks.map((block) => {
      if (block.id !== removed.blockId) return block;
      const list = Array.isArray(block[listKey]) ? block[listKey] : [];
      if (list.some((entry) => entry.id === item.id)) return block;
      return {...block, [listKey]: insertAt(list, item, removed.index)};
    }),
  };
}

/** Live-state counterpart for an acuerdo: back into sessionState.decisions once. */
export function restoreSessionAgreement(sessionState, decision) {
  if (!sessionState || !decision) return sessionState;
  const decisions = Array.isArray(sessionState.decisions) ? sessionState.decisions : [];
  if (decisions.some((entry) => entry.id === decision.id)) return sessionState;
  return {...sessionState, decisions: [...decisions, decision]};
}

/** New agenda items always carry an explicit type (never inferred from the title). */
export function createAgendaBlock({id, title = 'Nuevo bloque', durationMinutes = 30, withTopic = true, topicId} = {}) {
  return {
    id,
    type: 'block',
    isBreak: false,
    title,
    durationMinutes,
    leader: '',
    participants: '',
    subpoints: withTopic ? [{id: topicId || `${id}-p1`, title: '', presenter: '', status: 'pending'}] : [],
    decisions: [],
  };
}

export function createBreakBlock({id, durationMinutes = 10} = {}) {
  return {
    id,
    type: 'break',
    isBreak: true,
    title: 'Descanso',
    durationMinutes,
    leader: '',
    participants: '',
    subpoints: [],
    decisions: [],
  };
}
