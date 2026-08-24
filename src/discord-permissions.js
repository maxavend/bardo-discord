const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const DISCORD_PERMISSION = {
  ADMINISTRATOR: 1n << 3n,
  VIEW_CHANNEL: 1n << 10n,
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

async function readDiscord(path, botToken, fetchImpl = fetch) {
  const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
    headers: {Authorization: `Bot ${botToken}`},
  });
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
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

  const canViewChannel = async channelId => {
    if (!botToken || !guildId || !userId || !channelId) return false;

    try {
      const [guild, member, roles] = await Promise.all([loadGuild(), loadMember(), loadRoles()]);
      const channel = await loadChannel(channelId);
      if (!channel || String(channel.guild_id) !== String(guildId)) return false;

      const roleMap = new Map((roles || []).map(role => [String(role.id), role]));
      let permissions = asPermissionBits(roleMap.get(String(guildId))?.permissions);
      for (const roleId of member?.roles || []) {
        permissions |= asPermissionBits(roleMap.get(String(roleId))?.permissions);
      }

      if (String(guild?.owner_id) === String(userId)) return true;
      if ((permissions & DISCORD_PERMISSION.ADMINISTRATOR) === DISCORD_PERMISSION.ADMINISTRATOR) return true;

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

      return (permissions & DISCORD_PERMISSION.VIEW_CHANNEL) === DISCORD_PERMISSION.VIEW_CHANNEL;
    } catch {
      // Authorization must fail closed if Discord cannot be consulted.
      return false;
    }
  };

  return {canViewChannel};
}

export async function canUserViewChannel(env, guildId, userId, channelId) {
  return createDiscordPermissionChecker(env, guildId, userId).canViewChannel(channelId);
}

export {asPermissionBits, applyOverwrite, combineRoleOverwrites, applyCombinedRoleOverwrites};
