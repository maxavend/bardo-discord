import {listDocumentChannelAccess} from './db.js';
import {createDiscordPermissionChecker} from './discord-permissions.js';

export async function sessionCanAccessDocument(env, session, documentId) {
  if (!env?.DB || !session?.guildId || !session?.userId || !documentId) return false;
  if (!session.channelId) return false;

  const channelIds = await listDocumentChannelAccess(env.DB, documentId, session.guildId);
  if (!channelIds.includes(session.channelId)) return false;

  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  return checker.canViewChannel(session.channelId);
}

export async function filterDocumentsBySessionAccess(env, session, documents) {
  if (!session?.channelId || !Array.isArray(documents) || !documents.length) return [];
  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  // Every candidate is checked against the same current Discord channel. Do
  // the remote permission lookup once, then apply the local ACL in memory.
  if (!(await checker.canViewChannel(session.channelId))) return [];
  return documents.filter(document => (document.accessChannels || []).includes(session.channelId));
}
