// Avisos de asignación de Tareas. Corren en ctx.waitUntil después de guardar:
// la Activity nunca espera a Discord. El outbox (kanban_notifications) hace
// que cada persona reciba a lo más un aviso por tarjeta y por canal de aviso.
import {
  buildKanbanBulkAssignedPayload,
  buildKanbanCardPayload,
  buildKanbanDmPayload,
} from './components.js';
import {postChannelMessage, sendDirectMessage} from './discord-bot.js';
import {loadEffectiveSettings, loadUserSettings} from './settings-db.js';
import {settingsDefaults} from './settings-api.js';
import {
  claimKanbanNotification,
  finishKanbanNotification,
  reclaimKanbanNotification,
} from './kanban-db.js';

function resultFields(result) {
  return result.ok
    ? {status: 'sent', messageId: result.data?.id || null}
    : {status: 'failed', errorCode: result.code || 'failed'};
}

async function sendChannelNotice(env, {board, card, actor, columnName, claim}) {
  const assigneeId = card.assignee.id;
  if (!(await claim(card.id, assigneeId, 'channel'))) return null;
  const result = await postChannelMessage(env, board.channelId,
    buildKanbanCardPayload({card, columnName, actorName: actor.name}));
  await finishKanbanNotification(env.DB, board.id, card.id, assigneeId, 'channel', resultFields(result));
  return result.ok ? result.data?.id || null : null;
}

async function sendDmNotice(env, {board, cards, actor, messageId, channelName, claim}) {
  const assigneeId = cards[0].assignee.id;
  const owned = [];
  for (const card of cards) {
    if (await claim(card.id, assigneeId, 'dm')) owned.push(card);
  }
  if (!owned.length) return;
  const result = await sendDirectMessage(env, assigneeId, buildKanbanDmPayload({
    cards: owned,
    guildId: board.guildId,
    channelId: board.channelId,
    messageId: messageId || owned[0].messageId || null,
    actorName: actor.name,
    channelName,
  }));
  for (const card of owned) {
    await finishKanbanNotification(env.DB, board.id, card.id, assigneeId, 'dm', resultFields(result));
  }
}

/** Qué avisos permite el canal (Ajustes del espacio / servidor). */
async function noticeSettings(env, board) {
  try {
    return await loadEffectiveSettings(env.DB, board.guildId, board.channelId, settingsDefaults(env));
  } catch (error) {
    console.error('Kanban notice settings failed', error);
    return {taskChannelNotices: true, taskDmNotices: true};
  }
}

/** La persona puede haber pedido no recibir mensajes directos de Bardo. */
async function wantsDirectMessages(env, userId) {
  try {
    return (await loadUserSettings(env.DB, userId)).taskDmNotices;
  } catch {
    return true;
  }
}

const firstClaim = env => (cardId, assigneeId, kind) => claimKanbanNotification(env.DB, cardId, assigneeId, kind);
const retryClaim = env => (cardId, assigneeId, kind) => reclaimKanbanNotification(env.DB, cardId, assigneeId, kind);

/**
 * Avisa en el canal (mencionando) y por MD a quien recibe la tarea.
 * `channelNotice: false` cuando el aviso de canal ya existe (respuesta de /tarea).
 */
export async function notifyAssignment(env, {board, card, actor, columnName = null, channelName = null, channelNotice = true, retry = false}) {
  if (!env?.DB || !card?.assignee?.id || String(card.assignee.id) === String(actor?.id)) return;
  const claim = retry ? retryClaim(env) : firstClaim(env);
  try {
    const settings = await noticeSettings(env, board);
    const messageId = channelNotice && settings.taskChannelNotices
      ? await sendChannelNotice(env, {board, card, actor, columnName, claim})
      : card.messageId;
    if (settings.taskDmNotices && await wantsDirectMessages(env, card.assignee.id)) {
      await sendDmNotice(env, {board, cards: [card], actor, messageId, channelName, claim});
    }
  } catch (error) {
    console.error('Kanban assignment notice failed', error);
  }
}

async function sendBulkDms(env, {board, assigned, actor, messageId, channelName}) {
  const byAssignee = new Map();
  for (const card of assigned) {
    const list = byAssignee.get(card.assignee.id) || [];
    list.push(card);
    byAssignee.set(card.assignee.id, list);
  }
  // Secuencial y acotado: los MD tienen límites de frecuencia más estrictos.
  for (const [assigneeId, list] of [...byAssignee.entries()].slice(0, 10)) {
    if (!(await wantsDirectMessages(env, assigneeId))) continue;
    await sendDmNotice(env, {board, cards: list, actor, messageId, channelName, claim: firstClaim(env)});
  }
}

/** Tareas creadas desde una reunión: un resumen en el canal y un MD por persona. */
export async function notifyBulkAssignment(env, {board, cards, actor, sessionTitle = null, channelName = null}) {
  if (!env?.DB || !cards?.length) return;
  try {
    const settings = await noticeSettings(env, board);
    const assigned = cards.filter(card => card.assignee?.id && String(card.assignee.id) !== String(actor?.id));
    if (!settings.taskChannelNotices) {
      // Sin avisos en el canal: solo los MD (si el canal y cada persona los permiten).
      if (settings.taskDmNotices) await sendBulkDms(env, {board, assigned, actor, messageId: null, channelName});
      return;
    }
    const claimed = [];
    for (const card of assigned) {
      if (await claimKanbanNotification(env.DB, card.id, card.assignee.id, 'channel')) claimed.push(card);
    }
    const result = await postChannelMessage(env, board.channelId, buildKanbanBulkAssignedPayload({cards, sessionTitle, actorName: actor.name}));
    for (const card of claimed) {
      await finishKanbanNotification(env.DB, board.id, card.id, card.assignee.id, 'channel', resultFields(result));
    }
    const messageId = result.ok ? result.data?.id : null;
    if (settings.taskDmNotices) await sendBulkDms(env, {board, assigned, actor, messageId, channelName});
  } catch (error) {
    console.error('Kanban bulk notice failed', error);
  }
}
