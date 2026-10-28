import {listDocumentChannelAccess, loadPersonalDocument} from './db.js';
import {createDiscordPermissionChecker} from './discord-permissions.js';

/**
 * Qué puede hacer la sesión con un documento:
 * - 'channel': está compartido en el canal de la sesión y la persona ve el canal.
 * - 'owner': es un documento personal suyo.
 * - 'editor' / 'viewer': documento personal ajeno con el enlace activo.
 * - null: no puede abrirlo.
 * Un documento personal nunca se abre por canal, aunque alguien comparta su id.
 */
export async function documentRoleForSession(env, session, documentId) {
  if (!env?.DB || !session?.guildId || !session?.userId || !documentId) return null;

  const personal = await loadPersonalDocument(env.DB, documentId);
  if (personal) {
    if (personal.ownerId === String(session.userId)) return 'owner';
    if (personal.linkAccess === 'edit') return 'editor';
    if (personal.linkAccess === 'read') return 'viewer';
    return null;
  }

  if (!session.channelId) return null;
  const channelIds = await listDocumentChannelAccess(env.DB, documentId, session.guildId);
  if (!channelIds.includes(session.channelId)) return null;

  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  return (await checker.canViewChannel(session.channelId)) ? 'channel' : null;
}

/** Puede cambiar el contenido (todos menos quien solo lee). */
export const roleCanWrite = role => role === 'channel' || role === 'owner' || role === 'editor';

export async function sessionCanAccessDocument(env, session, documentId) {
  return Boolean(await documentRoleForSession(env, session, documentId));
}

export async function filterDocumentsBySessionAccess(env, session, documents) {
  if (!session?.channelId || !Array.isArray(documents) || !documents.length) return [];
  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  // Every candidate is checked against the same current Discord channel. Do
  // the remote permission lookup once, then apply the local ACL in memory.
  if (!(await checker.canViewChannel(session.channelId))) return [];
  return documents.filter(document => (document.accessChannels || []).includes(session.channelId));
}
