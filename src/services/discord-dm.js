function discordErrorCode(status, body) {
  if (body?.code) return `DISCORD_${body.code}`;
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'DISCORD_UNAVAILABLE';
  return `DISCORD_HTTP_${status}`;
}

export class DiscordDmError extends Error {
  constructor(message, { code, transient = false, privacy = false } = {}) {
    super(message);
    this.name = 'DiscordDmError';
    this.code = code || 'DM_FAILED';
    this.transient = Boolean(transient);
    this.privacy = Boolean(privacy);
  }
}

async function discordJson(url, init, token) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = await response.clone().json().catch(() => null);
  if (!response.ok) {
    const code = discordErrorCode(response.status, body);
    const privacy = response.status === 403 || body?.code === 50007;
    const transient = response.status === 429 || response.status >= 500;
    throw new DiscordDmError('Discord no pudo entregar el DM.', { code, privacy, transient });
  }
  return body;
}

export async function sendDiscordDm(env, { userId, content, components = [] }) {
  const token = env?.DISCORD_TOKEN;
  if (!token) throw new DiscordDmError('DISCORD_TOKEN no está configurado.', { code: 'NO_DISCORD_TOKEN' });
  const id = String(userId || '').trim();
  if (!/^\d{17,20}$/.test(id)) throw new DiscordDmError('El destinatario no es un usuario Discord válido.', { code: 'INVALID_USER_ID' });

  const channel = await discordJson('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: id }),
  }, token);
  if (!channel?.id) throw new DiscordDmError('Discord no devolvió un canal DM.', { code: 'INVALID_DM_CHANNEL', transient: true });

  return discordJson(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: String(content || '').slice(0, 2000),
      ...(components.length ? { components } : {}),
      allowed_mentions: { parse: ['users'] },
    }),
  }, token);
}
