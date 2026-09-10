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

  const computeChannelPermissions = async channelId => {
    if (!botToken || !guildId || !userId || !channelId) return 0n;

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

  const canViewChannel = async channelId => {
    try {
      const permissions = await computeChannelPermissions(channelId);
      return (permissions & DISCORD_PERMISSION.VIEW_CHANNEL) === DISCORD_PERMISSION.VIEW_CHANNEL;
    } catch {
      return false;
    }
  };

  const canManageChannel = async channelId => {
    try {
      const permissions = await computeChannelPermissions(channelId);
      const isManage = (permissions & DISCORD_PERMISSION.ADMINISTRATOR) !== 0n
        || (permissions & DISCORD_PERMISSION.MANAGE_CHANNELS) !== 0n
        || (permissions & DISCORD_PERMISSION.MANAGE_EVENTS) !== 0n;
      return isManage;
    } catch {
      return false;
    }
  };

  const getChannelContext = async channelId => {
    if (!botToken || !guildId || !channelId) {
      return { roles: [], members: [], permissions: { canView: false, canManage: false, isHost: false } };
    }

    try {
      const [guild, roles, channel, permissions] = await Promise.all([
        loadGuild().catch(() => null),
        loadRoles().catch(() => []),
        loadChannel(channelId).catch(() => null),
        computeChannelPermissions(channelId).catch(() => 0n),
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
      } catch {
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
    } catch {
      return { roles: [], members: [], permissions: { canView: false, canManage: false, isHost: false } };
    }
  };

  return {
    canViewChannel,
    canManageChannel,
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
