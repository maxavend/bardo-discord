const cache = new Map();
const CACHE_TTL_MS = 20_000;
const CACHE_MAX = 100;

function trimCache() {
  if (cache.size <= CACHE_MAX) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of entries.slice(0, cache.size - CACHE_MAX)) cache.delete(key);
}

function avatarUrl(member, guildId) {
  const user = member?.user || {};
  if (member?.avatar) return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${member.avatar}.png?size=64`;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  return null;
}

async function discordRequest(env, path) {
  if (!env?.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN no está configurado.');
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });
  if (!response.ok) {
    const error = new Error(`Discord API respondió HTTP ${response.status}.`);
    error.code = response.status === 429 ? 'RATE_LIMITED' : `DISCORD_HTTP_${response.status}`;
    throw error;
  }
  return response.json();
}

function roleLabelFor(roleIds, roles = []) {
  const ids = new Set((roleIds || []).map(String));
  const candidates = roles
    .filter((role) => role?.id && role?.name !== '@everyone' && ids.has(String(role.id)))
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0));
  return candidates[0]?.name || null;
}

export class MemberDirectoryService {
  constructor(env) {
    this.env = env;
  }

  async search({ guildId, query, limit = 25, includeBots = false } = {}) {
    const guild = String(guildId || '').trim();
    const cleanQuery = String(query || '').trim().replace(/^@/, '');
    if (!/^\d{17,20}$/.test(guild)) throw new Error('Guild inválido.');
    if (cleanQuery.length < 2) return [];
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 25));
    const key = `${guild}:${cleanQuery.toLocaleLowerCase()}:${safeLimit}:${includeBots ? 1 : 0}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.members;

    const [membersRaw, rolesRaw] = await Promise.all([
      discordRequest(this.env, `/guilds/${guild}/members/search?query=${encodeURIComponent(cleanQuery)}&limit=${safeLimit}`),
      discordRequest(this.env, `/guilds/${guild}/roles`).catch(() => []),
    ]);

    const members = (Array.isArray(membersRaw) ? membersRaw : [])
      .filter((member) => includeBots || !member?.user?.bot)
      .slice(0, safeLimit)
      .map((member) => {
        const user = member.user || {};
        const roleIds = Array.isArray(member.roles) ? member.roles.map(String) : [];
        return {
          userId: String(user.id || ''),
          displayName: member.nick || user.global_name || user.username || 'Usuario',
          username: user.username || '',
          avatarUrl: avatarUrl(member, guild),
          roleIds,
          roleLabel: roleLabelFor(roleIds, rolesRaw),
          isBot: Boolean(user.bot),
          source: 'discord_search',
        };
      })
      .filter((member) => member.userId);

    cache.set(key, { at: Date.now(), members });
    trimCache();
    return members;
  }
}
