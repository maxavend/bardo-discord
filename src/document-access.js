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
  const visible = [];

  for (const document of documents) {
    const channelIds = document.accessChannels || [];
    if (channelIds.includes(session.channelId) && await checker.canViewChannel(session.channelId)) {
      visible.push(document);
    }
  }

  return visible;
}
