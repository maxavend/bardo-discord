// Ajustes en tres niveles.
// - Personal: cada persona (sus mensajes directos).
// - Espacio: el canal (nombre, zona horaria, avisos). Quien gestiona el canal.
// - Servidor: valores por defecto para todos los canales. Quien administra el servidor.
import {requireDocsSession} from './discord-auth.js';
import {
  DISCORD_PERMISSION,
  canUserViewChannel,
  createDiscordPermissionChecker,
  discordUnavailableResponse,
  isDiscordUnavailableError,
} from './discord-permissions.js';
import {apiError, json} from './docs-api.js';
import {loadWorkspaceName, saveWorkspaceName, WORKSPACE_NAME_MAX} from './db.js';
import {botChannelState} from './kanban-api.js';
import {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  loadChannelSettings,
  loadGuildSettings,
  loadUserSettings,
  resolveSettings,
  saveChannelSettings,
  saveDetectedGuildTimeZone,
  saveGuildSettings,
  saveUserSettings,
  USER_THEMES,
} from './settings-db.js';

const PREFIX = '/api/settings';
const MAX_BODY_BYTES = 8 * 1024;

export function settingsDefaults(env) {
  const timeZone = isValidTimeZone(env?.BARDO_TIME_ZONE) ? env.BARDO_TIME_ZONE : DEFAULT_SETTINGS.timeZone;
  return {...DEFAULT_SETTINGS, timeZone};
}

const methodNotAllowed = () => apiError(405, 'method_not_allowed', 'Esta acción no está disponible.');
const has = (payload, key) => Object.prototype.hasOwnProperty.call(payload, key);

async function readBody(request) {
  const text = await request.text().catch(() => '');
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return {error: apiError(413, 'too_large', 'La solicitud es demasiado grande.')};
  }
  try {
    const payload = text.trim() ? JSON.parse(text) : {};
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
    return {payload};
  } catch {
    return {error: apiError(400, 'invalid_json', 'El cuerpo de la solicitud no es JSON válido.')};
  }
}

async function userPermissions(env, session) {
  const bits = await createDiscordPermissionChecker(env, session.guildId, session.userId)
    .computeChannelPermissions(session.channelId)
    .catch(error => {
      if (isDiscordUnavailableError(error)) throw error;
      return 0n;
    });
  const hasBit = bit => (bits & bit) === bit;
  const isAdmin = hasBit(DISCORD_PERMISSION.ADMINISTRATOR);
  return {
    canEditServer: isAdmin || hasBit(DISCORD_PERMISSION.MANAGE_GUILD),
    canEditSpace: isAdmin || hasBit(DISCORD_PERMISSION.MANAGE_GUILD) || hasBit(DISCORD_PERMISSION.MANAGE_CHANNELS),
  };
}

async function botChecks(env, session) {
  if (!String(env.DISCORD_TOKEN || '').trim()) {
    return {available: false, checks: []};
  }
  try {
    const state = await botChannelState(env, session);
    const threadsOk = state.threadsSupported && state.missingThreadPermissions.length === 0;
    return {
      available: true,
      checks: [
        {
          id: 'messages',
          label: 'Publicar avisos en este canal',
          ok: state.canPostMessages,
          detail: state.canPostMessages ? null : 'Falta el permiso «Enviar mensajes» para Bardo en este canal.',
        },
        {
          id: 'threads',
          label: 'Crear hilos para hablar de una tarea',
          ok: threadsOk,
          detail: threadsOk
            ? null
            : !state.threadsSupported
              ? 'Este canal no admite hilos (por ejemplo, es un canal de voz).'
              : `Faltan permisos para Bardo: ${state.missingThreadPermissions.join(', ')}.`,
        },
        {
          id: 'dm',
          label: 'Enviar mensajes directos',
          ok: null,
          detail: 'Si alguien tiene los mensajes directos cerrados, solo verá la mención.',
        },
      ],
    };
  } catch (error) {
    if (isDiscordUnavailableError(error)) return {available: false, checks: [], unavailable: true};
    throw error;
  }
}

async function snapshot(env, session) {
  const [server, space, personal, name, permissions, bot] = await Promise.all([
    loadGuildSettings(env.DB, session.guildId),
    loadChannelSettings(env.DB, session.guildId, session.channelId),
    loadUserSettings(env.DB, session.userId),
    loadWorkspaceName(env.DB, session.guildId, session.channelId),
    userPermissions(env, session),
    botChecks(env, session),
  ]);
  const defaults = settingsDefaults(env);
  return {
    personal,
    space: {...space, name: name || null},
    server,
    defaults,
    effective: resolveSettings(server, space, defaults),
    permissions,
    bot,
  };
}

/** Cada campo de aviso acepta true, false o null ("heredar del nivel de arriba"). */
function cleanFields(payload, {allowName = false, allowInherit = true}) {
  const fields = {};
  if (has(payload, 'timeZone')) {
    const timeZone = payload.timeZone;
    if (timeZone === null && allowInherit) fields.timeZone = null;
    else if (!isValidTimeZone(timeZone)) return {error: apiError(422, 'invalid_time_zone', 'Esa zona horaria no existe. Elige una de la lista.')};
    else fields.timeZone = timeZone;
  }
  for (const key of ['taskChannelNotices', 'taskDmNotices']) {
    if (!has(payload, key)) continue;
    const value = payload[key];
    if (value === null && allowInherit) fields[key] = null;
    else if (typeof value !== 'boolean') return {error: apiError(422, 'invalid_value', 'Ese valor no es válido.')};
    else fields[key] = value;
  }
  if (allowName && has(payload, 'name')) {
    const name = String(payload.name ?? '').replace(/\s+/g, ' ').trim();
    if (name.length > WORKSPACE_NAME_MAX) {
      return {error: apiError(422, 'name_too_long', `El nombre puede tener hasta ${WORKSPACE_NAME_MAX} caracteres.`)};
    }
    fields.name = name;
  }
  return {fields};
}

async function routeSettingsApi(request, url, env) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return null;
  const section = url.pathname.slice(PREFIX.length).replace(/^\//, '');
  if (!['', 'personal', 'space', 'server', 'detected-time-zone'].includes(section)) {
    return apiError(404, 'invalid_route', 'Esta dirección de Ajustes no existe.');
  }

  const auth = await requireDocsSession(request, env);
  if (auth.error) return auth.error;
  const {session} = auth;
  if (!session.guildId || !session.channelId) return apiError(403, 'channel_required', 'Abre Bardo desde un canal de Discord.');
  if (!(await canUserViewChannel(env, session.guildId, session.userId, session.channelId))) {
    return apiError(403, 'forbidden', 'No tienes acceso a este canal en Discord.');
  }

  if (section === '') {
    if (request.method !== 'GET') return methodNotAllowed();
    return json(await snapshot(env, session));
  }

  // Solo lo personal (el tema al abrir Bardo), sin consultar permisos ni el bot.
  if (section === 'personal' && request.method === 'GET') {
    return json({personal: await loadUserSettings(env.DB, session.userId)});
  }

  if (section === 'detected-time-zone') {
    // La primera persona que abre Bardo en un servidor sin zona horaria la define
    // con la de su dispositivo. Nunca pisa una ya elegida.
    if (request.method !== 'POST') return methodNotAllowed();
    const body = await readBody(request);
    if (body.error) return body.error;
    if (!isValidTimeZone(body.payload.timeZone)) return apiError(422, 'invalid_time_zone', 'Zona horaria no válida.');
    const saved = await saveDetectedGuildTimeZone(env.DB, session.guildId, body.payload.timeZone, session.userId);
    return json({saved});
  }

  if (request.method !== 'PATCH') return methodNotAllowed();
  const body = await readBody(request);
  if (body.error) return body.error;

  if (section === 'personal') {
    const fields = {};
    if (has(body.payload, 'taskDmNotices')) {
      if (typeof body.payload.taskDmNotices !== 'boolean') return apiError(422, 'invalid_value', 'Ese valor no es válido.');
      fields.taskDmNotices = body.payload.taskDmNotices;
    }
    if (has(body.payload, 'theme')) {
      if (!USER_THEMES.includes(body.payload.theme)) return apiError(422, 'invalid_theme', 'Ese tema no existe.');
      fields.theme = body.payload.theme;
    }
    if (!Object.keys(fields).length) return apiError(422, 'invalid_value', 'Ese valor no es válido.');
    await saveUserSettings(env.DB, session.userId, fields);
    // Cambiar solo el tema no necesita el resto de los ajustes (permisos, bot).
    if (!('taskDmNotices' in fields)) return json({personal: await loadUserSettings(env.DB, session.userId)});
    return json(await snapshot(env, session));
  }

  const permissions = await userPermissions(env, session);
  if (section === 'space') {
    if (!permissions.canEditSpace) {
      return apiError(403, 'space_settings_forbidden', 'Solo quien gestiona este canal en Discord puede cambiar los ajustes del espacio.');
    }
    const parsed = cleanFields(body.payload, {allowName: true});
    if (parsed.error) return parsed.error;
    const {name, ...fields} = parsed.fields;
    if (name !== undefined) await saveWorkspaceName(env.DB, session.guildId, session.channelId, name, session.userId);
    if (Object.keys(fields).length) await saveChannelSettings(env.DB, session.guildId, session.channelId, fields, session.userId);
    return json(await snapshot(env, session));
  }

  if (!permissions.canEditServer) {
    return apiError(403, 'server_settings_forbidden', 'Solo quien administra el servidor en Discord puede cambiar estos ajustes.');
  }
  const parsed = cleanFields(body.payload, {allowInherit: true});
  if (parsed.error) return parsed.error;
  if (Object.keys(parsed.fields).length) await saveGuildSettings(env.DB, session.guildId, parsed.fields, session.userId);
  return json(await snapshot(env, session));
}

export async function handleSettingsApi(request, url, env) {
  try {
    return await routeSettingsApi(request, url, env);
  } catch (error) {
    if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
    throw error;
  }
}
