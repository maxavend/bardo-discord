/**
 * «Compartir enlace»: abre el diálogo de Discord para compartir un enlace a la
 * Activity que, al abrirlo, lleva directo a un documento, una reunión o una
 * tarea (`custom_id` bardo:open:…, el mismo formato de los botones «Abrir»).
 * Quien lo abre solo llega si puede verlo en Discord; si no, Bardo le dice que
 * no tiene acceso, sin revelar dónde está.
 */
import {toast} from './lib/toast.js';

// Discord muestra el mensaje junto al enlace; un título larguísimo lo ensucia.
const MAX_TITLE = 80;

export const SHARE_TARGETS = {
  doc: id => id,
  meeting: id => `planner-session:${id}`,
  task: id => `kanban-card:${id}`,
};

const SHARE_MESSAGES = {
  doc: title => `Te comparto el documento «${title}» en Bardo.`,
  meeting: title => `Te comparto la reunión «${title}» en Bardo.`,
  task: title => `Te comparto la tarea «${title}» en Bardo.`,
};

function shortTitle(title) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim() || 'Sin título';
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean;
}

/**
 * Abre el diálogo de compartir. Devuelve 'sent', 'copied', 'cancelled',
 * 'unavailable' (fuera de Discord) o 'error'.
 */
export async function shareBardoLink(kind, {id, title}, {sdk = globalThis.window?.__BARDO_DISCORD_SDK__} = {}) {
  const target = SHARE_TARGETS[kind]?.(id);
  if (!target || !id) return 'error';
  if (!sdk?.commands?.shareLink) return 'unavailable';
  try {
    const result = await sdk.commands.shareLink({
      message: SHARE_MESSAGES[kind](shortTitle(title)),
      custom_id: `bardo:open:${target}`,
    });
    if (!result?.success) return 'cancelled';
    return result.didSendMessage ? 'sent' : 'copied';
  } catch (error) {
    console.warn('Bardo: Discord no pudo compartir el enlace', error);
    return 'error';
  }
}

/** Igual que shareBardoLink, y avisa del resultado con un toast. */
export async function shareBardoLinkWithFeedback(kind, item) {
  const outcome = await shareBardoLink(kind, item);
  if (outcome === 'sent') toast('Enlace enviado.');
  else if (outcome === 'copied') toast('Enlace copiado.');
  else if (outcome === 'unavailable') toast('Para compartir un enlace, abre Bardo en Discord.');
  else if (outcome === 'error') toast('No se pudo compartir el enlace. Inténtalo de nuevo.');
  return outcome;
}
