import {listDocumentChannelAccess} from './db.js';
import {createDiscordPermissionChecker} from './discord-permissions.js';

export async function sessionCanAccessDocument(env, session, documentId) {
  if (!env?.DB || !session?.guildId || !session?.userId || !documentId) return false;

  const channelIds = await listDocumentChannelAccess(env.DB, documentId, session.guildId);
  if (!channelIds.length) return false;

  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  for (const channelId of channelIds) {
    if (await checker.canViewChannel(channelId)) return true;
  }
  return false;
}

export async function filterDocumentsBySessionAccess(env, session, documents) {
  if (!Array.isArray(documents) || !documents.length) return [];
  const checker = createDiscordPermissionChecker(env, session.guildId, session.userId);
  const visible = [];

  for (const document of documents) {
    const channelIds = document.accessChannels || [];
    let allowed = false;
    for (const channelId of channelIds) {
      if (await checker.canViewChannel(channelId)) {
        allowed = true;
        break;
      }
    }
    if (allowed) visible.push(document);
  }

  return visible;
}
