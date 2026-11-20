// Abrir un canal desde fuera de Discord (web o app de escritorio). Ambas tienen
// una identidad de Discord ya verificada (el «principal») y obtienen el mismo
// token por canal que usa la Activity, con las mismas comprobaciones de siempre.
import {mintChannelSession} from './discord-auth.js';
import {readRequestText, RequestBodyTooLargeError} from './request-body.js';
import {canUserViewChannel, isDiscordUnavailableError} from './discord-permissions.js';
import {overRateLimit, webError, webJson} from './web-auth.js';
import {userGuildForContent} from './web-channels.js';
import {summarizeChannelContent} from './web-channel-content.js';

// Ids de Discord (y los de los fixtures de prueba): nunca llegan sin codificar a una URL.
export const ID_PATTERN = /^[\w-]{1,64}$/;
// Cada apertura consulta a Discord sin caché, y el límite del bot es compartido.
const CHANNEL_OPENS_PER_MINUTE = 30;

export function principalUser(principal) {
  return {
    id: principal.userId,
    username: principal.username,
    global_name: principal.username,
    avatar: principal.avatar,
  };
}

/** Resumen de qué hay en cada canal visible de un servidor. */
export async function handleChannelContent(url, env, principal) {
  const guildId = url.searchParams.get('guild_id') || '';
  if (!ID_PATTERN.test(guildId)) return webError(400, 'invalid_guild', 'Ese servidor no es válido. Elige otro.');
  try {
    const guild = await userGuildForContent(env, guildId, principal.userId);
    if (!guild) return webError(403, 'guild_forbidden', 'Este servidor no está disponible para tu cuenta.');
    const channels = await summarizeChannelContent(env.DB, guildId, guild.channels.map(channel => channel.id));
    return webJson({guildId, channels});
  } catch (error) {
    if (isDiscordUnavailableError(error)) throw error;
    console.warn('Bardo: resumen de contenido no disponible');
    return webError(503, 'content_unavailable', 'No pudimos consultar el contenido. Puedes abrir los canales o intentar de nuevo.');
  }
}

/**
 * Emite un token para un canal. `link` ata el token a lo que lo originó, para
 * revocarlo junto con ello: {webSessionHash} o {appGrantId}.
 */
export async function handleChannelSession(request, env, principal, {ttlMs, link}) {
  if (overRateLimit(`channel-session:${principal.userId}`, CHANNEL_OPENS_PER_MINUTE)) {
    return webError(429, 'rate_limited', 'Abriste muchos canales seguidos. Espera un minuto y vuelve a intentarlo.');
  }
  let payload;
  try {
    payload = JSON.parse(await readRequestText(request, 8 * 1024));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return webError(413, 'payload_too_large', 'La solicitud es demasiado grande.');
    return webError(400, 'invalid_json', 'No pudimos leer la solicitud. Inténtalo de nuevo.');
  }
  const guildId = typeof payload?.guildId === 'string' ? payload.guildId.trim() : '';
  const channelId = typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
  if (!ID_PATTERN.test(guildId) || !ID_PATTERN.test(channelId)) {
    return webError(400, 'invalid_channel', 'Ese canal no es válido. Elige otro.');
  }
  // Sin caché: abrir un canal siempre refleja los permisos actuales de Discord.
  const canView = await canUserViewChannel({...env, DISCORD_PERMISSION_CACHE_TTL_MS: 0}, guildId, principal.userId, channelId);
  if (!canView) return webError(403, 'channel_forbidden', 'No tienes acceso a este canal de Discord.');

  const principalExpiry = Date.parse(principal.expiresAt);
  const expiresAt = new Date(Math.min(principalExpiry, Date.now() + ttlMs)).toISOString();
  const {token} = await mintChannelSession(env, {
    userId: principal.userId,
    username: principal.username,
    avatar: principal.avatar,
    guildId,
    channelId,
    expiresAt,
    webSessionHash: link.webSessionHash || null,
    appGrantId: link.appGrantId || null,
  });
  return webJson({bardo_token: token, expires_at: expiresAt, guild_id: guildId, channel_id: channelId, user: principalUser(principal)});
}
