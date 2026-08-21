import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { contextWindowFromInteraction, targetMessageFromInteraction } from './discord-context.js';
import { runConversation, runDirectSummary } from './orchestrator.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function verifyInteraction(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp || !env?.DISCORD_PUBLIC_KEY) return null;
  const body = await request.clone().text();
  if (!await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY)) return null;
  try { return JSON.parse(body); } catch { return null; }
}

function optionValue(options = [], name) {
  for (const option of options || []) {
    if (option?.name === name) return option.value;
    if (Array.isArray(option?.options)) {
      const nested = optionValue(option.options, name);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function actor(interaction) {
  const user = interaction?.member?.user || interaction?.user;
  if (!user?.id) return null;
  return {
    userId: String(user.id),
    displayName: interaction?.member?.nick || user.global_name || user.username || String(user.id),
  };
}

function conversationContext(interaction, env, ctx) {
  const person = actor(interaction);
  return {
    interactionId: String(interaction.id || crypto.randomUUID()),
    guildId: String(interaction.guild_id || ''),
    channelId: String(interaction.channel_id || ''),
    userId: person?.userId || '',
    displayName: person?.displayName || 'Usuario',
    timezone: String(env?.BARDO_TIMEZONE || 'America/Santiago'),
    nowIso: new Date().toISOString(),
    environment: String(env?.ENVIRONMENT || 'unknown'),
    waitUntil: typeof ctx?.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : undefined,
  };
}

function deferred() {
  return json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function immediate(content) {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: String(content).slice(0, 1900),
      flags: InteractionResponseFlags.EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });
}

async function editOriginal(interaction, result) {
  const appId = String(interaction.application_id || '').trim();
  const token = String(interaction.token || '').trim();
  if (!appId || !token) return;
  const response = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: String(result?.content || 'No pude completar esa solicitud.').slice(0, 1900),
      components: Array.isArray(result?.components) ? result.components : [],
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) {
    console.error('[Bardo AI] no se pudo editar la respuesta diferida:', response.status);
  }
}

function friendlyError(error) {
  if (error?.code === 'AI_BINDING_MISSING') return 'Bardo AI todavía no tiene configurado Workers AI en este entorno.';
  if (error?.code === 'MESSAGE_HISTORY_FORBIDDEN') return 'No tengo permiso para leer el historial de este canal.';
  if (error?.code === 'DISCORD_TOKEN_MISSING') return 'Bardo no tiene configurado el acceso necesario para leer mensajes.';
  return `No pude completar eso: ${String(error?.message || error || 'error desconocido').slice(0, 600)}`;
}

async function conversationWork(interaction, env, ctx, message) {
  try {
    const context = conversationContext(interaction, env, ctx);
    const result = await runConversation(env, context, message);
    await editOriginal(interaction, result);
  } catch (error) {
    console.error('[Bardo AI] conversation failed:', error);
    await editOriginal(interaction, { content: friendlyError(error) });
  }
}

async function summaryWork(interaction, env, ctx) {
  try {
    const context = conversationContext(interaction, env, ctx);
    let messages;
    try {
      messages = await contextWindowFromInteraction(env, interaction, { limit: 30 });
    } catch (error) {
      const target = targetMessageFromInteraction(interaction);
      if (!target) throw error;
      messages = [target];
    }
    const result = await runDirectSummary(env, context, messages);
    await editOriginal(interaction, result);
  } catch (error) {
    console.error('[Bardo AI] summary failed:', error);
    await editOriginal(interaction, { content: friendlyError(error) });
  }
}

function ownWork(ctx, work) {
  if (typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(work);
    return;
  }
  void work;
}

export async function maybeHandleConversationInteraction(request, env, ctx = { waitUntil: () => {} }) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/') return null;

  const interaction = await verifyInteraction(request, env);
  if (!interaction) return null;
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) return null;

  const person = actor(interaction);
  if (!interaction.guild_id || !person) {
    if (interaction.data?.name === 'bardo' || interaction.data?.name === 'Resumir con Bardo') {
      return immediate('La conversación con Bardo funciona dentro de un servidor de Discord.');
    }
    return null;
  }

  if (interaction.data?.name === 'bardo') {
    const message = String(optionValue(interaction.data?.options, 'mensaje') || '').trim();
    if (!message) return null; // Preserve the existing /bardo Home behavior.
    ownWork(ctx, conversationWork(interaction, env, ctx, message));
    return deferred();
  }

  if (interaction.data?.name === 'Resumir con Bardo' && Number(interaction.data?.type || 0) === 3) {
    ownWork(ctx, summaryWork(interaction, env, ctx));
    return deferred();
  }

  return null;
}

export const _test = { optionValue, actor, conversationContext, friendlyError };
