const DISCORD_API = 'https://discord.com/api/v10';

function safeLimit(value, fallback = 30) {
  return Math.max(1, Math.min(50, Number(value) || fallback));
}

function cleanContent(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .trim()
    .slice(0, 1600);
}

async function discordRequest(env, path) {
  if (!env?.DISCORD_TOKEN) {
    const error = new Error('DISCORD_TOKEN no está configurado para leer mensajes.');
    error.code = 'DISCORD_TOKEN_MISSING';
    throw error;
  }
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });
  if (!response.ok) {
    const error = new Error(`Discord API respondió HTTP ${response.status}.`);
    error.code = response.status === 403 ? 'MESSAGE_HISTORY_FORBIDDEN' : response.status === 429 ? 'RATE_LIMITED' : `DISCORD_HTTP_${response.status}`;
    throw error;
  }
  return response.json();
}

export async function fetchChannelMessages(env, { channelId, before = null, limit = 30 } = {}) {
  const channel = String(channelId || '').trim();
  if (!/^\d{17,20}$/.test(channel)) throw new Error('Canal de Discord inválido.');
  const params = new URLSearchParams({ limit: String(safeLimit(limit)) });
  if (before && /^\d{17,20}$/.test(String(before))) params.set('before', String(before));
  const data = await discordRequest(env, `/channels/${channel}/messages?${params.toString()}`);
  return (Array.isArray(data) ? data : [])
    .map((message) => ({
      id: String(message.id || ''),
      timestamp: message.timestamp || null,
      authorId: String(message.author?.id || ''),
      authorName: message.member?.nick || message.author?.global_name || message.author?.username || 'Usuario',
      bot: Boolean(message.author?.bot),
      content: cleanContent(message.content),
    }))
    .filter((message) => message.id && message.content)
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

export function targetMessageFromInteraction(interaction) {
  const targetId = String(interaction?.data?.target_id || '').trim();
  const raw = targetId ? interaction?.data?.resolved?.messages?.[targetId] : null;
  if (!raw) return null;
  return {
    id: targetId,
    timestamp: raw.timestamp || null,
    authorId: String(raw.author?.id || ''),
    authorName: raw.member?.nick || raw.author?.global_name || raw.author?.username || 'Usuario',
    bot: Boolean(raw.author?.bot),
    content: cleanContent(raw.content),
  };
}

export function renderMessagesForModel(messages = [], { maxChars = 18000 } = {}) {
  const lines = [];
  let used = 0;
  for (const message of messages) {
    const line = `[${message.timestamp || 'sin fecha'}] ${message.authorName || 'Usuario'}: ${cleanContent(message.content)}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return [
    '<discord_messages untrusted="true">',
    ...lines,
    '</discord_messages>',
  ].join('\n');
}

export async function contextWindowFromInteraction(env, interaction, { limit = 30 } = {}) {
  const target = targetMessageFromInteraction(interaction);
  const before = target?.id || null;
  let messages = await fetchChannelMessages(env, {
    channelId: interaction?.channel_id,
    before,
    limit: target ? Math.max(1, safeLimit(limit) - 1) : safeLimit(limit),
  });
  if (target?.content) messages.push(target);
  return messages;
}

export const _test = { cleanContent, safeLimit };
