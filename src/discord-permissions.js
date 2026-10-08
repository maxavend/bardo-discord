const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const DISCORD_PERMISSION = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  MANAGE_EVENTS: 1n << 33n,
};

function asPermissionBits(value) {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

function applyOverwrite(permissions, overwrite) {
  if (!overwrite) return permissions;
  const deny = asPermissionBits(overwrite.deny);
  const allow = asPermissionBits(overwrite.allow);
  return (permissions & ~deny) | allow;
}

function combineRoleOverwrites(overwrites, roleIds) {
  let allow = 0n;
  let deny = 0n;
  const roles = new Set(roleIds || []);

  for (const overwrite of overwrites || []) {
    if (String(overwrite?.type) !== '0' || !roles.has(String(overwrite?.id))) continue;
    allow |= asPermissionBits(overwrite.allow);
    deny |= asPermissionBits(overwrite.deny);
  }

  return {allow, deny};
}

function applyCombinedRoleOverwrites(permissions, combined) {
  return (permissions & ~combined.deny) | combined.allow;
}

const PERMISSION_CACHE_TTL_MS = 60_000;
const DEFAULT_RETRY_AFTER_MS = 2_000;

/**
 * Discord could not answer (rate limit, 5xx or network failure). This is NOT a
 * permission denial: callers must surface it as a retryable 503 instead of a
 * 403, otherwise a transient Discord hiccup looks like "no access" and the
 * client drops the write.
 */
export class DiscordUnavailableError extends Error {
  constructor(message, {status = null, retryAfterMs = DEFAULT_RETRY_AFTER_MS, cause} = {}) {
    super(message);
    this.name = 'DiscordUnavailableError';
    this.code = 'discord_unavailable';
    this.status = status;
    this.retryAfterMs = Math.max(0, Math.round(Number(retryAfterMs) || DEFAULT_RETRY_AFTER_MS));
    if (cause) this.cause = cause;
  }
}

export function isDiscordUnavailableError(error) {
  return error instanceof DiscordUnavailableError || error?.code === 'discord_unavailable';
}

export function discordUnavailableResponse(error) {
  const retryAfterMs = error?.retryAfterMs || DEFAULT_RETRY_AFTER_MS;
  return new Response(JSON.stringify({
    error: 'discord_unavailable',
    message: 'Discord no respondió al verificar tus permisos. Reintentando…',
    retryAfterMs,
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    },
  });
}

async function retryAfterFromResponse(response) {
  const header = Number(response.headers?.get?.('retry-after'));
  let bodySeconds = NaN;
  try {
    const payload = await response.clone().json();
    bodySeconds = Number(payload?.retry_after);
  } catch {
    // Discord sometimes answers 5xx with HTML; fall back to the header/default.
  }
  const seconds = Number.isFinite(bodySeconds) && bodySeconds > 0
    ? bodySeconds
    : (Number.isFinite(header) && header > 0 ? header : NaN);
  return Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}

async function readDiscord(path, botToken, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
      headers: {Authorization: `Bot ${botToken}`},
    });
  } catch (cause) {
    throw new DiscordUnavailableError('Discord API network failure', {cause});
  }
  if (response.status === 429 || response.status >= 500) {
    throw new DiscordUnavailableError(`Discord API ${response.status}`, {
      status: response.status,
      retryAfterMs: await retryAfterFromResponse(response),
    });
  }
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Per-isolate cache of computed channel permissions. Keyed by the fetch
// implementation so tests (which inject DISCORD_FETCH) never share entries.
const permissionCaches = new WeakMap();

function permissionCacheFor(fetchImpl) {
  let cache = permissionCaches.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    permissionCaches.set(fetchImpl, cache);
  }
  return cache;
}

export function clearDiscordPermissionCache(fetchImpl = fetch) {
  permissionCaches.delete(fetchImpl);
}

export function createDiscordPermissionChecker(env, guildId, userId) {
  const botToken = env?.DISCORD_TOKEN?.trim();
  const fetchImpl = env?.DISCORD_FETCH || fetch;
  const cache = new Map();

  const cached = (key, loader) => {
    if (!cache.has(key)) cache.set(key, loader());
    return cache.get(key);
  };

  const loadGuild = () => cached('guild', () => readDiscord(`/guilds/${encodeURIComponent(guildId)}`, botToken, fetchImpl));
  const loadMember = () => cached('member', () => readDiscord(
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
    botToken,
    fetchImpl,
  ));
  const loadRoles = () => cached('roles', () => readDiscord(`/guilds/${encodeURIComponent(guildId)}/roles`, botToken, fetchImpl));
  const loadChannel = channelId => cached(`channel:${channelId}`, () => readDiscord(
    `/channels/${encodeURIComponent(channelId)}`,
    botToken,
    fetchImpl,
  ));

  const permissionCache = permissionCacheFor(fetchImpl);
  const cacheTtlMs = Number.isFinite(Number(env?.DISCORD_PERMISSION_CACHE_TTL_MS))
    ? Number(env.DISCORD_PERMISSION_CACHE_TTL_MS)
    : PERMISSION_CACHE_TTL_MS;

  const computeChannelPermissions = async channelId => {
    if (!botToken || !guildId || !userId || !channelId) return 0n;

    const cacheKey = `${botToken}:${guildId}:${userId}:${channelId}`;
    const hit = permissionCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.permissions;

    const permissions = await computeChannelPermissionsUncached(channelId);
    if (cacheTtlMs > 0) {
      permissionCache.set(cacheKey, {permissions, expiresAt: Date.now() + cacheTtlMs});
      if (permissionCache.size > 5_000) permissionCache.delete(permissionCache.keys().next().value);
    }
    return permissions;
  };

  const computeChannelPermissionsUncached = async channelId => {
    const [guild, member, roles] = await Promise.all([loadGuild(), loadMember(), loadRoles()]);
    const channel = await loadChannel(channelId);
    if (!channel || String(channel.guild_id) !== String(guildId)) return 0n;

    const isOwner = String(guild?.owner_id) === String(userId);
    if (isOwner) return ~0n; // Owner has all permissions

    const roleMap = new Map((roles || []).map(role => [String(role.id), role]));
    let permissions = asPermissionBits(roleMap.get(String(guildId))?.permissions);
    for (const roleId of member?.roles || []) {
      permissions |= asPermissionBits(roleMap.get(String(roleId))?.permissions);
    }

    if ((permissions & DISCORD_PERMISSION.ADMINISTRATOR) === DISCORD_PERMISSION.ADMINISTRATOR) {
      return ~0n;
    }

    let permissionOverwrites = channel.permission_overwrites || [];
    if (!permissionOverwrites.length && channel.parent_id) {
      const parent = await loadChannel(channel.parent_id);
      permissionOverwrites = parent?.permission_overwrites || [];
    }

    const everyoneOverwrite = permissionOverwrites.find(
      overwrite => String(overwrite?.type) === '0' && String(overwrite?.id) === String(guildId),
    );
    permissions = applyOverwrite(permissions, everyoneOverwrite);

    const roleOverwrites = combineRoleOverwrites(permissionOverwrites, member?.roles);
    permissions = applyCombinedRoleOverwrites(permissions, roleOverwrites);

    const memberOverwrite = permissionOverwrites.find(
      overwrite => String(overwrite?.type) === '1' && String(overwrite?.id) === String(userId),
    );
    permissions = applyOverwrite(permissions, memberOverwrite);

    return permissions;
  };

  // Definitive answers (403/404 from Discord, foreign channel…) fail closed.
  // Transient failures (429/5xx/network) are rethrown as DiscordUnavailableError
  // so the API can answer 503 and the client retries instead of losing writes.
  const permissionsOrZero = async channelId => {
    try {
      return await computeChannelPermissions(channelId);
    } catch (error) {
      if (isDiscordUnavailableError(error)) throw error;
      return 0n;
    }
  };

  const canViewChannel = async channelId => {
    const permissions = await permissionsOrZero(channelId);
    return (permissions & DISCORD_PERMISSION.VIEW_CHANNEL) === DISCORD_PERMISSION.VIEW_CHANNEL;
  };

  const canManageChannel = async channelId => {
    const permissions = await permissionsOrZero(channelId);
    return (permissions & DISCORD_PERMISSION.ADMINISTRATOR) !== 0n
      || (permissions & DISCORD_PERMISSION.MANAGE_CHANNELS) !== 0n
      || (permissions & DISCORD_PERMISSION.MANAGE_EVENTS) !== 0n;
  };

  // Moderation of shared documents (permanent deletion) mirrors Discord's own
  // message moderation: Manage Messages or Manage Channels (Admin implies both).
  const canModerateDocuments = async channelId => {
    const permissions = await permissionsOrZero(channelId);
    return (permissions & DISCORD_PERMISSION.ADMINISTRATOR) !== 0n
      || (permissions & DISCORD_PERMISSION.MANAGE_CHANNELS) !== 0n
      || (permissions & DISCORD_PERMISSION.MANAGE_MESSAGES) !== 0n;
  };

  const getChannelContext = async channelId => {
    if (!botToken || !guildId || !channelId) {
      return { roles: [], members: [], permissions: { canView: false, canManage: false, isHost: false } };
    }

    // Best effort, except when Discord itself is unavailable (429/5xx): that
    // must surface as a retryable 503 instead of an empty context.
    const softFail = fallback => error => {
      if (isDiscordUnavailableError(error)) throw error;
      return fallback;
    };

    try {
      const [guild, roles, channel, permissions] = await Promise.all([
        loadGuild().catch(softFail(null)),
        loadRoles().catch(softFail([])),
        loadChannel(channelId).catch(softFail(null)),
        computeChannelPermissions(channelId).catch(softFail(0n)),
      ]);

      const canView = (permissions & DISCORD_PERMISSION.VIEW_CHANNEL) === DISCORD_PERMISSION.VIEW_CHANNEL;
      const isOwner = String(guild?.owner_id) === String(userId);
      const canManage = isOwner
        || (permissions & DISCORD_PERMISSION.ADMINISTRATOR) !== 0n
        || (permissions & DISCORD_PERMISSION.MANAGE_CHANNELS) !== 0n
        || (permissions & DISCORD_PERMISSION.MANAGE_EVENTS) !== 0n;

      const formattedRoles = (roles || [])
        .filter(r => r.id !== guildId && !r.managed)
        .map(r => ({
          id: r.id,
          type: 'role',
          name: r.name,
          tag: `@${r.name}`,
          color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#5865F2',
          position: r.position || 0,
        }))
        .sort((a, b) => b.position - a.position);

      // Best effort fetching members with access to channel
      let members = [];
      try {
        const guildMembers = await readDiscord(
          `/guilds/${encodeURIComponent(guildId)}/members?limit=100`,
          botToken,
          fetchImpl,
        );
        if (Array.isArray(guildMembers)) {
          members = guildMembers.map(m => {
            const user = m.user || {};
            const displayName = m.nick || user.global_name || user.username || 'Miembro';
            return {
              id: user.id,
              type: 'user',
              username: user.username,
              globalName: displayName,
              tag: `@${displayName}`,
              avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
              roles: m.roles || [],
            };
          });
        }
      } catch (error) {
        if (isDiscordUnavailableError(error)) throw error;
        // If members intent is restricted, members can be augmented by client
        members = [];
      }

      return {
        guildId,
        channelId,
        channelName: channel?.name || null,
        roles: formattedRoles,
        members,
        permissions: {
          canView,
          canManage,
          isHost: canManage,
          isOwner,
        },
      };
    } catch (error) {
      if (isDiscordUnavailableError(error)) throw error;
      return { roles: [], members: [], permissions: { canView: false, canManage: false, isHost: false } };
    }
  };

  return {
    canViewChannel,
    canManageChannel,
    canModerateDocuments,
    computeChannelPermissions,
    getChannelContext,
  };
}

export async function canUserViewChannel(env, guildId, userId, channelId) {
  return createDiscordPermissionChecker(env, guildId, userId).canViewChannel(channelId);
}

export async function getUserChannelContext(env, guildId, userId, channelId) {
  return createDiscordPermissionChecker(env, guildId, userId).getChannelContext(channelId);
}

export {asPermissionBits, applyOverwrite, combineRoleOverwrites, applyCombinedRoleOverwrites};
