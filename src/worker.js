import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import { extractDocumentTitle, paginateMarkdown } from './pagination.js';
import { exportFileName, generateDocxDocument, generatePdfDocument } from './export-format.js';
import {
  buildDocumentPayload,
  buildDocNewPayload,
  buildDocsListPayload,
  buildErrorPayload,
  buildHelpPayload,
  buildKanbanCardPayload,
  buildKanbanListPayload,
  buildReuNewPayload,
  buildReusListPayload,
  BARDO_OPEN_PREFIX,
  EDIT_DOC_TARGET_PREFIX,
} from './components.js';
import { normalizeDocumentId } from './document-id.js';
import { handleDocsApi, normalizeDocumentImport } from './docs-api.js';
import { normalizeExportFormat, verifyExportToken } from './export-token.js';
import { handlePlannerApi } from './planner-api.js';
import { handleKanbanApi } from './kanban-api.js';
import { handleSettingsApi, settingsDefaults } from './settings-api.js';
import { loadEffectiveSettings } from './settings-db.js';
import { handleDiscordAuthApi, requireDocsSession } from './discord-auth.js';
import { documentRoleForSession, roleCanWrite, sessionCanAccessDocument } from './document-access.js';
import {
  DISCORD_PERMISSION,
  createDiscordPermissionChecker,
  discordUnavailableResponse,
  isDiscordUnavailableError,
} from './discord-permissions.js';
import { getOriginalInteractionMessage } from './discord-bot.js';
import {
  claimKanbanNotification,
  countActiveKanbanCards,
  ensureKanbanBoard,
  finishKanbanNotification,
  insertKanbanCard,
  listKanbanCards,
  loadKanbanBoard,
  loadKanbanStructure,
  rankForPosition,
  setKanbanCardMessageId,
} from './kanban-db.js';
import { notifyAssignment } from './kanban-notify.js';
import { KANBAN_LIMITS, compareCards } from '../activity-app/src/kanban/kanban-shared.js';
import { fileStem, getSourceType, isTextSourceType, sourceLabel, SOURCE_TYPES } from './import-format.js';
import { docxBombReason } from '../activity-app/src/zip-guard.js';
import { REU_DESCRIPTION_MAX, REU_DURATION_MAX_MINUTES, TITLE_MAX } from './limits.js';
import {
  cleanupExpiredRecords,
  grantDocumentChannelAccessStatement,
  grantDocumentGuildAccessStatement,
  insertDocumentStatement,
  listDocumentChannelAccess,
  listDocumentGuildIds,
  loadPersonalDocument,
  listDocumentsForChannel,
  listPlannerSessionsForChannel,
  loadDocument,
  loadDocumentSource,
  LAUNCH_TARGET_PREFIX,
  saveDocsLaunchIntent,
  savePlannerSession,
} from './db.js';

const MAX_STORED_DOCUMENT_BYTES = 1_800_000;
const DOCUMENT_API_PREFIX = '/api/documents/';
const REU_TITLE_MAX = TITLE_MAX;
// Calendar dates for /reu-new are interpreted in the community's time zone,
// not UTC (in Chile, UTC is already "tomorrow" from ~20:00-21:00).
const DEFAULT_TIME_ZONE = 'America/Santiago';

function todayInTimeZone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}

export function isValidIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The single starting bloque of a meeting created with /reu-new. */
export function initialReuBlocks(durationMinutes = 60) {
  const minutes = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
    ? Math.min(Math.round(Number(durationMinutes)), REU_DURATION_MAX_MINUTES)
    : 60;
  return [{
    id: `b-${crypto.randomUUID().slice(0, 8)}`,
    type: 'block',
    title: 'Temas de la reunión',
    durationMinutes: minutes,
    manualDuration: minutes,
    leader: '',
    participants: '',
    introDesc: '',
    subpoints: [],
    decisions: [],
  }];
}

export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
}

function ephemeral(content) {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

/**
 * Responds with LAUNCH_ACTIVITY and records where the Activity should land.
 * Slash commands (and some mobile clients) don't forward a custom_id, so the
 * Activity reads this short-lived, one-shot intent on boot instead.
 */
async function launchActivityToTarget(env, _ctx, interaction, target) {
  const userId = interaction.member?.user?.id || interaction.user?.id || null;
  if (!env.DB || !userId || !interaction.guild_id || !interaction.channel_id) {
    return ephemeral('No se pudo preparar Bardo. Vuelve a intentarlo desde un canal de un servidor de Discord.');
  }
  try {
    // Persist before Discord can boot the Activity and read the destination.
    await saveDocsLaunchIntent(env.DB, userId, interaction.guild_id, `${LAUNCH_TARGET_PREFIX}${target}`, interaction.channel_id);
  } catch (error) {
    console.error('Error guardando el destino de Bardo:', error);
    return ephemeral('No se pudo abrir Bardo. Inténtalo de nuevo en unos segundos.');
  }
  return jsonResponse({ type: 12 });
}

const MAX_ERROR_DETAIL = 300;

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function attachmentName(attachment) {
  return attachment.filename || attachment.name || '';
}

/** Error con un mensaje en español pensado para mostrarse a la persona. */
function userError(message) {
  return Object.assign(new Error(message), {expose: true});
}

function tooLargeError() {
  return userError('El archivo supera 1,8 MB, el máximo que acepta Bardo. Prueba con un archivo más liviano o divídelo en partes.');
}

function validateAttachment(attachment) {
  const name = attachmentName(attachment);
  const sourceType = getSourceType(name);

  if (!sourceType) {
    if (name.toLowerCase().endsWith('.doc')) {
      throw userError('El formato Word antiguo `.doc` todavía no es compatible. Guárdalo como `.docx` y vuelve a subirlo.');
    }
    throw userError('Bardo no puede leer ese tipo de archivo. Usa uno `.md`, `.markdown`, `.txt`, `.pdf` o `.docx`.');
  }

  // Early rejection only; the real limit is enforced on the downloaded bytes.
  if (Number(attachment.size) > MAX_STORED_DOCUMENT_BYTES) throw tooLargeError();

  return sourceType;
}

/**
 * Downloads the attachment and enforces the size limit on the bytes actually
 * received (the `size` Discord reports is not trusted).
 */
export async function downloadAttachment(attachment, sourceType, fetchImpl = fetch) {
  const response = await fetchImpl(attachment.url);
  if (!response.ok) {
    throw userError(`No se pudo descargar el archivo desde Discord (código ${response.status}). Vuelve a subirlo con \`/doc-upload\`.`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_STORED_DOCUMENT_BYTES) throw tooLargeError();

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_STORED_DOCUMENT_BYTES) throw tooLargeError();
  if (sourceType === SOURCE_TYPES.DOCX) {
    // Nunca se guarda un .docx que se infla al abrirlo: congelaría Bardo a todo el canal.
    const reason = docxBombReason(bytes);
    if (reason) throw userError(reason);
  }

  if (isTextSourceType(sourceType)) {
    return { text: new TextDecoder('utf-8').decode(bytes), byteLength: bytes.byteLength };
  }

  return { bytes, byteLength: bytes.byteLength };
}

function firstPreviewPage(markdown) {
  return paginateMarkdown(markdown).slice(0, 1);
}

function pendingImportPreview(sourceType) {
  const label = sourceLabel(sourceType);
  return `**${label} recibido.**\n\nBardo lo convertirá en un documento la primera vez que pulses **Abrir documento**.`;
}

async function processAndSaveDocument(env, interaction, attachment, explicitTitle) {
  const applicationId = interaction.application_id;
  const token = interaction.token;
  const originalMessageUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;
  const discordFetch = env.DISCORD_FETCH || fetch;
  let saved = false;

  try {
    const sourceType = validateAttachment(attachment);

    if (!env.DB) {
      throw userError('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      throw userError('Bardo solo puede compartir documentos desde un canal de servidor de Discord.');
    }

    const downloaded = await downloadAttachment(attachment, sourceType, discordFetch);
    const discordUser = interaction.member?.user || interaction.user || null;
    const createdBy = discordUser?.id || 'unknown';
    const createdByName = discordUser?.global_name || discordUser?.username || 'Usuario de Discord';
    const documentId = crypto.randomUUID();
    const sourceName = attachmentName(attachment) || null;

    let title;
    let originalMarkdown;
    let pages;

    if (isTextSourceType(sourceType)) {
      originalMarkdown = downloaded.text;
      const extracted = extractDocumentTitle(originalMarkdown, explicitTitle);
      title = extracted.title;
      pages = firstPreviewPage(extracted.body);

      if (pages.length === 0) {
        throw userError('El archivo está vacío. Revisa que tenga contenido y vuelve a subirlo.');
      }
    } else {
      title = (explicitTitle?.trim() || fileStem(sourceName)).slice(0, 200);
      originalMarkdown = `# ${title}\n\n${pendingImportPreview(sourceType)}`;
      pages = [pendingImportPreview(sourceType)];
    }

    const now = new Date().toISOString();
    const document = {
      id: documentId,
      title,
      originalMarkdown,
      pages,
      sourceName,
      sourceType,
      createdAt: now,
      createdBy,
      createdByName,
      updatedAt: now,
      updatedBy: createdBy,
      updatedByName: createdByName,
    };

    const source = isTextSourceType(sourceType)
      ? null
      : {
        bytes: downloaded.bytes,
        mime: sourceType === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        type: sourceType,
      };

    // Document, original file and ACLs are written in one transaction: either
    // the upload is fully stored and shared, or nothing is.
    await env.DB.batch([
      insertDocumentStatement(env.DB, documentId, document, source),
      grantDocumentGuildAccessStatement(env.DB, documentId, interaction.guild_id, createdBy),
      grantDocumentChannelAccessStatement(env.DB, documentId, interaction.guild_id, interaction.channel_id, createdBy),
    ]);
    saved = true;

    const documentPayload = buildDocumentPayload(document, {
      documentId,
      attribution: `Subido por ${createdByName}`,
    });

    const editRes = await discordFetch(originalMessageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentPayload),
    });

    if (!editRes.ok) {
      const errText = await editRes.text().catch(() => '');
      console.error('Discord rejected the document card', editRes.status, errText.slice(0, MAX_ERROR_DETAIL));
      throw new Error(`Discord card update failed (${editRes.status})`);
    }

    console.log(`Documento publicado: ${title} (${documentId}, ${sourceType})`);
  } catch (error) {
    console.error('Error procesando documento en background:', error);
    // Solo los mensajes escritos para la persona llegan a Discord; el detalle técnico queda en el log.
    const detail = error?.expose ? error.message : 'No se pudo procesar el archivo. Inténtalo de nuevo en unos minutos.';
    const message = saved
      ? 'El documento se guardó y ya aparece en **Documentos** de este canal, pero Discord no aceptó la tarjeta del mensaje. No hace falta volver a subirlo.'
      : detail.slice(0, 1500);
    const errorPayload = buildErrorPayload(message, saved ? 'El documento se guardó, pero no se pudo mostrar aquí' : 'No se pudo subir el documento');

    await discordFetch(originalMessageUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorPayload),
    }).catch((err) => console.error('Error enviando mensaje de error a Discord:', err));
  }
}

function interactionUser(interaction) {
  const user = interaction.member?.user || interaction.user || null;
  return {
    id: user?.id || null,
    name: interaction.member?.nick || user?.global_name || user?.username || 'Usuario de Discord',
  };
}

/**
 * /doc-new [titulo]: creates the (empty) document right away, shared with this
 * guild + channel, and posts a card whose button opens it in the editor.
 */
async function createDocumentFromCommand(interaction, env) {
  if (!env.DB) return ephemeral('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
  if (!interaction.guild_id || !interaction.channel_id) {
    return ephemeral('Usa `/doc-new` dentro de un canal de un servidor de Discord.');
  }

  const titulo = (interaction.data?.options || []).find((opt) => opt.name === 'titulo')?.value;
  const title = String(titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, REU_TITLE_MAX) || 'Sin título';
  const author = interactionUser(interaction);
  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.batch([
      insertDocumentStatement(env.DB, documentId, {
        title,
        description: '',
        // Same shape the editor saves: the title heading and an empty body.
        originalMarkdown: `# ${title}`,
        pages: [],
        sourceName: null,
        createdAt: now,
        createdBy: author.id || 'unknown',
        createdByName: author.name,
        updatedAt: now,
        updatedBy: author.id || 'unknown',
        updatedByName: author.name,
      }),
      grantDocumentGuildAccessStatement(env.DB, documentId, interaction.guild_id, author.id),
      grantDocumentChannelAccessStatement(env.DB, documentId, interaction.guild_id, interaction.channel_id, author.id),
    ]);
  } catch (error) {
    console.error('Error creando documento con /doc-new:', error);
    return ephemeral('No se pudo crear el documento. Inténtalo de nuevo en unos segundos.');
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: buildDocNewPayload({ documentId, title, createdByName: author.name }),
  });
}

function addDaysIso(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "hoy", "mañana" o AAAA-MM-DD → fecha ISO; null si no se pidió; false si no es válida. */
export function parseTaskDueDate(value, timeZone = DEFAULT_TIME_ZONE) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  const today = todayInTimeZone(timeZone);
  if (text === 'hoy') return today;
  if (text === 'mañana' || text === 'manana') return addDaysIso(today, 1);
  return isValidIsoDate(text) ? text : false;
}

/** Ajustes efectivos del canal de la interacción (zona horaria, avisos). */
async function channelSettings(env, interaction) {
  try {
    return await loadEffectiveSettings(env.DB, interaction.guild_id, interaction.channel_id, settingsDefaults(env));
  } catch (error) {
    console.error('No se pudieron leer los ajustes del canal:', error);
    return {...settingsDefaults(env), sources: {}};
  }
}

function interactionActor(interaction) {
  const user = interaction.member?.user || interaction.user || {};
  return { id: user.id || null, name: interaction.member?.nick || user.global_name || user.username || 'Alguien' };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Id del mensaje público de /tarea (el aviso), para anclar el hilo y enlazar el MD. */
async function originalResponseMessageId(env, interaction) {
  if (!interaction.application_id || !interaction.token) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const original = await getOriginalInteractionMessage(env, interaction.application_id, interaction.token);
    if (original.ok && original.data?.id) return original.data.id;
    await delay(400 * (attempt + 1));
  }
  return null;
}

async function createTaskFromCommand(interaction, env, ctx) {
  if (!env.DB) return ephemeral('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
  if (!interaction.guild_id || !interaction.channel_id) {
    return ephemeral('Usa `/tarea` dentro de un canal de un servidor de Discord.');
  }
  const options = interaction.data?.options || [];
  const title = String(options.find(opt => opt.name === 'titulo')?.value || '').trim().slice(0, TITLE_MAX);
  if (!title) return ephemeral('Escribe qué hay que hacer en `titulo`.');
  const fecha = options.find(opt => opt.name === 'fecha')?.value;
  const settings = await channelSettings(env, interaction);
  const dueDate = parseTaskDueDate(fecha, settings.timeZone);
  if (dueDate === false) {
    return ephemeral(`La fecha «${fecha}» no es válida. Usa AAAA-MM-DD (por ejemplo 2026-10-15), «hoy» o «mañana».`);
  }

  const actor = interactionActor(interaction);
  const assigneeId = options.find(opt => opt.name === 'responsable')?.value || null;
  let assignee = null;
  if (assigneeId) {
    const user = interaction.data?.resolved?.users?.[assigneeId] || {};
    const member = interaction.data?.resolved?.members?.[assigneeId] || {};
    if (user.bot) return ephemeral('Elige a una persona como responsable, no a un bot.');
    assignee = { id: String(assigneeId), name: (member.nick || user.global_name || user.username || 'Miembro').slice(0, 100) };
    if (assignee.id !== String(actor.id)) {
      // Discord incluye los permisos del miembro en el canal; si no, se calculan.
      const viewBit = DISCORD_PERMISSION.VIEW_CHANNEL;
      let canView;
      try {
        canView = member.permissions !== undefined
          ? (BigInt(member.permissions) & viewBit) === viewBit
          : await createDiscordPermissionChecker(env, interaction.guild_id, assignee.id).canViewChannel(interaction.channel_id);
      } catch (error) {
        if (isDiscordUnavailableError(error)) return ephemeral('Discord no respondió al revisar permisos. Inténtalo de nuevo en unos segundos.');
        throw error;
      }
      if (!canView) return ephemeral(`<@${assignee.id}> no puede ver este canal. Elige a alguien que sí pueda.`);
    }
  }

  let board;
  let card;
  let created;
  let column;
  try {
    board = await ensureKanbanBoard(env.DB, interaction.guild_id, interaction.channel_id, actor.id || 'unknown');
    const { columns } = await loadKanbanStructure(env.DB, board.id);
    column = columns.find(item => !item.isDone) || columns[0];
    if (await countActiveKanbanCards(env.DB, board.id) >= KANBAN_LIMITS.activeCards) {
      return ephemeral(`El tablero de este canal llegó al máximo de ${KANBAN_LIMITS.activeCards} tareas activas. Archiva en Bardo las que ya no necesites y vuelve a intentarlo.`);
    }
    const { rank } = await rankForPosition(env.DB, board.id, column.id);
    ({ card, created } = await insertKanbanCard(env.DB, board, {
      id: crypto.randomUUID(),
      columnId: column.id,
      rank,
      title,
      assignee,
      dueDate,
      sourceRef: `command:${interaction.id}`,
    }, actor.id || 'unknown'));
  } catch (error) {
    console.error('Error creando tarea con /tarea:', error);
    return ephemeral('No se pudo crear la tarea. Inténtalo de nuevo en unos segundos.');
  }

  const assignedToOther = Boolean(card.assignee && String(card.assignee.id) !== String(actor.id));
  // Con los avisos en el canal activos, la respuesta pública ES el aviso: se
  // registra para no duplicarlo. El MD lo decide notifyAssignment.
  const mentionInChannel = assignedToOther && settings.taskChannelNotices;
  if (created && mentionInChannel) {
    await claimKanbanNotification(env.DB, card.id, card.assignee.id, 'channel', { status: 'sent' });
  }
  if (created) {
    ctx.waitUntil((async () => {
      const messageId = await originalResponseMessageId(env, interaction);
      if (messageId && mentionInChannel) {
        await finishKanbanNotification(env.DB, board.id, card.id, card.assignee.id, 'channel', { status: 'sent', messageId });
      } else if (messageId) {
        await setKanbanCardMessageId(env.DB, board.id, card.id, messageId);
      }
      if (assignedToOther) await notifyAssignment(env, { board, card: { ...card, messageId }, actor, channelNotice: false });
    })().catch(error => console.error('Kanban /tarea follow-up failed', error)));
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: buildKanbanCardPayload({ card, columnName: column?.name, actorName: actor.name, verb: 'creó', mention: mentionInChannel }),
  });
}

async function listTasksFromCommand(interaction, env) {
  if (!env.DB) return ephemeral('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
  if (!interaction.guild_id || !interaction.channel_id) {
    return ephemeral('Usa `/tareas` dentro de un canal de un servidor de Discord.');
  }
  const mine = Boolean((interaction.data?.options || []).find(opt => opt.name === 'mias')?.value);
  const userId = interactionActor(interaction).id;
  try {
    const board = await loadKanbanBoard(env.DB, interaction.guild_id, interaction.channel_id);
    if (!board) return jsonResponse({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: buildKanbanListPayload({ mine }) });
    const [{ columns }, cards] = await Promise.all([loadKanbanStructure(env.DB, board.id), listKanbanCards(env.DB, board.id)]);
    const openColumns = columns.filter(column => !column.isDone);
    const position = new Map(openColumns.map((column, index) => [column.id, index]));
    const open = cards
      .filter(card => position.has(card.columnId) && (!mine || card.assignee?.id === userId))
      .sort((a, b) => (position.get(a.columnId) - position.get(b.columnId)) || compareCards(a, b));
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: buildKanbanListPayload({ cards: open, columns: openColumns, mine, total: open.length }),
    });
  } catch (error) {
    console.error('Error listando tareas:', error);
    return ephemeral('No se pudieron cargar las tareas de este canal. Inténtalo de nuevo en unos segundos.');
  }
}

async function handleCommandInteraction(interaction, env, ctx) {
  const commandName = interaction.data?.name;

  if (commandName === 'doc-upload' || commandName === 'upload-docs') {
    const options = interaction.data?.options || [];
    const archivoOption = options.find((opt) => opt.name === 'archivo');
    const tituloOption = options.find((opt) => opt.name === 'titulo');

    const attachmentId = archivoOption?.value;
    const resolvedAttachment = interaction.data?.resolved?.attachments?.[attachmentId];
    const explicitTitle = tituloOption?.value;

    if (!resolvedAttachment) {
      return ephemeral('No se encontró el archivo adjunto. Vuelve a usar `/doc-upload` y elige un archivo.');
    }

    // Everything that can be checked without downloading is answered right
    // away (ephemeral, only for the person) instead of a public "pensando…"
    // message that later turns into an error.
    if (!env.DB) return ephemeral('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Sube documentos desde un canal de un servidor de Discord.');
    }
    try {
      validateAttachment(resolvedAttachment);
    } catch (error) {
      return ephemeral(error instanceof Error ? error.message : 'No se pudo leer el archivo.');
    }

    ctx.waitUntil(processAndSaveDocument(env, interaction, resolvedAttachment, explicitTitle));

    return jsonResponse({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  if (commandName === 'doc-new') {
    return createDocumentFromCommand(interaction, env);
  }

  if (commandName === 'reu-new') {
    if (!env.DB) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Usa `/reu-new` dentro de un canal de un servidor de Discord.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const options = interaction.data?.options || [];
    const titulo = options.find((opt) => opt.name === 'titulo')?.value?.trim()?.slice(0, REU_TITLE_MAX);
    const fecha = options.find((opt) => opt.name === 'fecha')?.value?.trim();
    const hora = options.find((opt) => opt.name === 'hora')?.value?.trim();
    const duracion = options.find((opt) => opt.name === 'duracion')?.value;
    const descripcion = (options.find((opt) => opt.name === 'descripcion')?.value?.trim() || '')
      .slice(0, REU_DESCRIPTION_MAX);

    if (fecha && !isValidIsoDate(fecha)) {
      return ephemeral(`La fecha «${fecha}» no es válida. Usa el formato AAAA-MM-DD, por ejemplo 2026-10-15.`);
    }
    if (hora && !isValidTime(hora)) {
      return ephemeral(`La hora «${hora}» no es válida. Usa el formato HH:MM de 24 horas, por ejemplo 15:30.`);
    }

    const hostId = interaction.member?.user?.id || interaction.user?.id || null;
    const hostName = interaction.member?.nick || interaction.member?.user?.global_name || interaction.member?.user?.username || interaction.user?.username || 'Organizador';

    const now = new Date().toISOString();
    const targetDuration = typeof duracion === 'number' && duracion > 0 ? Math.min(duracion, REU_DURATION_MAX_MINUTES) : 60;
    const session = {
      id: crypto.randomUUID(),
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      title: titulo || 'Nueva reunión',
      hostId,
      hostName,
      date: fecha || todayInTimeZone((await channelSettings(env, interaction)).timeZone),
      startTime: hora || '10:00',
      targetDuration,
      description: descripcion,
      mentions: '',
      // One bloque so the meeting can be started right away (a meeting with
      // no bloques cannot start) and its length matches the requested duracion.
      blocks: initialReuBlocks(targetDuration),
      status: 'scheduled',
      createdAt: now,
      createdBy: hostId || 'unknown',
      updatedAt: now,
      updatedBy: hostId || 'unknown',
    };

    try {
      await savePlannerSession(env.DB, session);
    } catch (err) {
      console.error('Error guardando planner session:', err);
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'No se pudo crear la reunión. Inténtalo de nuevo en unos segundos.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const payload = buildReuNewPayload({ session });
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: payload,
    });
  }

  if (commandName === 'reus') {
    if (!env.DB) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Usa `/reus` dentro de un canal de un servidor de Discord.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    let sessions = [];
    try {
      sessions = await listPlannerSessionsForChannel(env.DB, interaction.guild_id, interaction.channel_id, 20);
    } catch (err) {
      console.error('Error consultando reuniones de canal:', err);
    }

    const payload = buildReusListPayload({ sessions });
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: payload,
    });
  }

  if (commandName === 'tarea') {
    return createTaskFromCommand(interaction, env, ctx);
  }

  if (commandName === 'tareas') {
    return listTasksFromCommand(interaction, env);
  }

  if (commandName === 'bardo') {
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Usa `/bardo` dentro de un canal de un servidor de Discord.');
    }
    return launchActivityToTarget(env, ctx, interaction, 'home');
  }

  if (commandName === 'docs') {
    if (!env.DB) return ephemeral('Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Usa `/docs` dentro de un canal de un servidor de Discord.');
    }
    let documents = [];
    try {
      documents = await listDocumentsForChannel(env.DB, interaction.guild_id, interaction.channel_id, { limit: 10, summary: true });
    } catch (err) {
      console.error('Error consultando documentos del canal:', err);
      return ephemeral('No se pudieron cargar los documentos de este canal. Inténtalo de nuevo en unos segundos.');
    }
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: buildDocsListPayload({ documents }),
    });
  }

  if (commandName === 'ayuda') {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: buildHelpPayload(),
    });
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Bardo no reconoce el comando /${commandName}. Usa \`/ayuda\` para ver los comandos disponibles.`,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

/**
 * Records where a document button was clicked so the Activity can open it.
 * ACLs are only *established* for legacy documents that have none: a document
 * already shared with some guild/channel is never widened by a click.
 */
export async function persistDocumentLaunchContext(db, interaction, documentId, invokingUserId, { intent = documentId } = {}) {
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId) return;

  const document = await loadDocument(db, documentId);
  if (!document) {
    console.error('Bardo launch referenced a missing document.', { documentId });
    return;
  }

  // Un documento personal no tiene ACL de servidor a propósito: abrir su
  // enlace nunca lo asigna a un canal (el acceso lo decide su dueño).
  const personal = await loadPersonalDocument(db, documentId);
  const guildIds = personal ? [] : await listDocumentGuildIds(db, documentId);
  const statements = [];

  if (personal) {
    // Solo se recuerda el destino del lanzamiento.
  } else if (!guildIds.length) {
    // Legacy document without any ACL: the guild where its card lives adopts it.
    statements.push(grantDocumentGuildAccessStatement(db, documentId, guildId, invokingUserId));
    if (channelId) {
      statements.push(grantDocumentChannelAccessStatement(db, documentId, guildId, channelId, invokingUserId));
    }
  } else if (!guildIds.includes(guildId)) {
    console.warn('Bardo launch from a guild without access to the document.', { documentId, guildId });
    return;
  } else if (channelId) {
    // A legacy document has no channel ACL yet, so its first component launch
    // establishes the original channel. Once it has one, merely opening the
    // Activity must not expand its audience to another channel.
    const sharedChannels = await listDocumentChannelAccess(db, documentId, guildId);
    if (!sharedChannels.length) {
      statements.push(grantDocumentChannelAccessStatement(db, documentId, guildId, channelId, invokingUserId));
    }
  }

  if (statements.length) await db.batch(statements);

  if (channelId) {
    await saveDocsLaunchIntent(db, invokingUserId, guildId, intent, channelId);
  }
}

async function handleComponentInteraction(interaction, env, ctx) {
  const customId = interaction.data?.custom_id || '';

  const legacyPageInteraction = customId.startsWith('bardo:page:');

  if (!legacyPageInteraction && !customId.startsWith(BARDO_OPEN_PREFIX)) {
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Este botón ya no funciona. Usa `/bardo` para abrir Bardo.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;

  // Non-document routes like planner, new document, the library, etc.
  const target = customId.slice(BARDO_OPEN_PREFIX.length);
  const isSpecialTarget = target === 'home' || target === 'docs' || target.startsWith('planner') || target.startsWith('new-doc')
    || target === 'kanban' || target.startsWith('kanban-card:');

  if (isSpecialTarget) {
    // Saved as a launch intent too: some Discord mobile clients don't forward
    // the custom_id, and a stale document intent must not win over this click.
    return launchActivityToTarget(env, ctx, interaction, target);
  }

  // "bardo:open:edit:<id>" (card of /doc-new): same launch as a document
  // button, but the Activity lands in the editor of that document.
  const editTarget = target.startsWith(EDIT_DOC_TARGET_PREFIX) ? target : null;
  const documentId = legacyPageInteraction
    ? normalizeDocumentId(interaction.message?.id)
    : editTarget
      ? normalizeDocumentId(target.slice(EDIT_DOC_TARGET_PREFIX.length))
      : normalizeDocumentId(customId);
  if (!documentId || !env.DB) {
    return ephemeral('No se pudo abrir este documento. Usa `/docs` para ver los documentos del canal.');
  }

  const persistLaunchContext = async () => {
    try {
      await persistDocumentLaunchContext(env.DB, interaction, documentId, invokingUserId, {
        intent: editTarget ? `${LAUNCH_TARGET_PREFIX}${EDIT_DOC_TARGET_PREFIX}${documentId}` : documentId,
      });
    } catch (error) {
      console.error('Error persisting Bardo Activity launch context:', error);
    }
  };

  if (typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(persistLaunchContext());
  } else {
    void persistLaunchContext();
  }

  // Discord HTTP interactions support responding inline. LAUNCH_ACTIVITY must be
  // the initial response and must arrive within 3 seconds. Returning it directly
  // avoids an unnecessary second network hop to Discord's callback endpoint.
  return jsonResponse({ type: 12 });
}

function parseDocumentApiPath(pathname) {
  if (!pathname.startsWith(DOCUMENT_API_PREFIX)) return null;

  const rest = pathname.slice(DOCUMENT_API_PREFIX.length);
  const [encodedId, action, extra] = rest.split('/');
  if (!encodedId || extra) return null;

  let rawId;
  try {
    rawId = decodeURIComponent(encodedId);
  } catch {
    return null;
  }

  const documentId = normalizeDocumentId(rawId);
  if (!documentId) return null;

  return { documentId, action: action || null };
}

/**
 * Same authorization as /api/docs: a valid Bardo session whose Discord
 * channel the document is shared with (and that the user can still view).
 * The Activity instance id is no longer required (it was never persisted).
 */
async function authorizeDocumentRequest(request, env, documentId, { write = false } = {}) {
  const auth = await requireDocsSession(request, env);
  if (auth.error) return { error: auth.error };

  const role = await documentRoleForSession(env, auth.session, documentId);
  if (!role) {
    return { error: jsonResponse({ error: 'forbidden', message: 'Este documento no está compartido en este canal de Discord.' }, 403) };
  }
  if (write && !roleCanWrite(role)) {
    return { error: jsonResponse({ error: 'read_only', message: 'Puedes leer este documento, pero no editarlo.' }, 403) };
  }

  return { session: auth.session };
}

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Always a download: ASCII fallback name for old browsers plus the exact
 * UTF-8 name (tildes, ñ) in `filename*`.
 */
export function attachmentDisposition(fileName) {
  const ascii = String(fileName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  // RFC 5987: encodeURIComponent leaves ' ( ) * unescaped, but they are not
  // valid attr-chars in filename*.
  const encoded = encodeURIComponent(fileName)
    .replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Error page for signed download links: they are opened in the system
 * browser, outside Bardo, so the person gets a readable page, not JSON.
 */
function downloadErrorPage(status, title, message) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>Bardo · Descarga</title></head>`
    + `<body style="font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;line-height:1.5;color:#1f2328">`
    + `<h1 style="font-size:1.25rem">${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...PRIVATE_HEADERS },
  });
}

async function handleDocumentExportApi(request, url, documentId, env) {
  const requestedFormat = url.searchParams.get('format');
  const format = requestedFormat ? normalizeExportFormat(requestedFormat) : 'md';
  const token = url.searchParams.get('t');

  if (!env.DB) {
    return token
      ? downloadErrorPage(503, 'Bardo no está disponible', 'Inténtalo de nuevo en unos minutos.')
      : jsonResponse({ error: 'database_unavailable', message: 'Bardo no está disponible en este momento. Inténtalo de nuevo en unos minutos.' }, 503);
  }

  let grant = null;
  if (token) {
    // Signed link opened outside Discord: the token replaces the session.
    grant = format
      ? await verifyExportToken(env, token, { docId: documentId, format })
      : { ok: false, reason: 'invalid' };
    if (!grant.ok) {
      return grant.reason === 'expired'
        ? downloadErrorPage(410, 'El enlace de descarga expiró', 'Los enlaces duran 5 minutos. Vuelve a Bardo en Discord y pulsa de nuevo «Descargar».')
        : downloadErrorPage(403, 'Este enlace de descarga no es válido', 'Vuelve a Bardo en Discord y pulsa de nuevo «Descargar».');
    }
  } else {
    const access = await authorizeDocumentRequest(request, env, documentId);
    if (access.error) return access.error;
    if (!format) {
      return jsonResponse({ error: 'invalid_format', message: 'Elige un formato de descarga válido: Markdown, Word o PDF.' }, 400);
    }
  }

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return token
      ? downloadErrorPage(404, 'Este documento ya no existe', 'Puede que alguien lo haya eliminado.')
      : jsonResponse({ error: 'not_found', message: 'No se encontró el documento.' }, 404);
  }
  // El permiso se revisa de nuevo al descargar: si el documento dejó de estar
  // compartido en ese canal o la persona perdió acceso, el enlace ya no sirve.
  if (grant && !(await sessionCanAccessDocument(env, grant, documentId))) {
    return downloadErrorPage(403, 'Ya no tienes acceso a este documento', 'Vuelve a Bardo en Discord para ver qué documentos puedes abrir.');
  }

  const baseName = exportFileName(document.title || document.sourceName || 'documento');

  if (format === 'original') {
    const source = await loadDocumentSource(env.DB, documentId);
    if (!source) {
      return token
        ? downloadErrorPage(404, 'El archivo original ya no está disponible', 'Bardo solo guarda el original mientras el documento se procesa o si cabe junto al texto.')
        : jsonResponse({ error: 'source_not_found', message: 'El archivo original ya no está disponible.' }, 404);
    }
    const extension = source.type ? `.${String(source.type).replace(/[^a-z0-9]/gi, '')}` : '';
    const fileName = document.sourceName || `${baseName}${extension}`;
    return new Response(source.bytes, {
      status: 200,
      headers: {
        'Content-Type': source.mime,
        'Content-Length': String(source.bytes.byteLength),
        'Content-Disposition': attachmentDisposition(fileName),
        ...PRIVATE_HEADERS,
      },
    });
  }

  if (format === 'docx') {
    const fileName = `${baseName}.docx`;
    const docxBytes = await generateDocxDocument(document);
    return new Response(docxBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(docxBytes.byteLength),
        'Content-Disposition': attachmentDisposition(fileName),
        ...PRIVATE_HEADERS,
      },
    });
  }

  if (format === 'pdf') {
    const fileName = `${baseName}.pdf`;
    const pdfBytes = await generatePdfDocument(document);
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
        'Content-Disposition': attachmentDisposition(fileName),
        ...PRIVATE_HEADERS,
      },
    });
  }

  const fileName = `${baseName}.md`;
  return new Response(document.originalMarkdown || '', {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': attachmentDisposition(fileName),
      ...PRIVATE_HEADERS,
    },
  });
}

async function handleDocumentApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'database_unavailable' }, 503);
  }

  const access = await authorizeDocumentRequest(request, env, documentId);
  if (access.error) return access.error;

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'not_found', message: 'No se encontró el documento.' }, 404);
  }

  return jsonResponse(
    {
      id: document.id || documentId,
      title: document.title,
      markdown: document.originalMarkdown,
      sourceName: document.sourceName,
      sourceType: document.sourceType,
      sourceMime: document.sourceMime,
      importStatus: document.importStatus,
      hasSource: document.hasSource,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      createdByName: document.createdByName,
      updatedByName: document.updatedByName,
    },
    200,
    PRIVATE_HEADERS,
  );
}

async function handleDocumentSourceApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'database_unavailable' }, 503);
  }

  const access = await authorizeDocumentRequest(request, env, documentId);
  if (access.error) return access.error;

  const source = await loadDocumentSource(env.DB, documentId);
  if (!source) {
    return jsonResponse({ error: 'source_not_found', message: 'El archivo original ya no está disponible.' }, 404);
  }

  return new Response(source.bytes, {
    status: 200,
    headers: {
      'Content-Type': source.mime,
      'Content-Length': String(source.bytes.byteLength),
      'Content-Disposition': 'attachment',
      'Content-Security-Policy': 'sandbox',
      ...PRIVATE_HEADERS,
    },
  });
}

async function handleDocumentNormalizeApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'database_unavailable' }, 503);
  }

  const access = await authorizeDocumentRequest(request, env, documentId, { write: true });
  if (access.error) return access.error;

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'not_found', message: 'No se encontró el documento.' }, 404);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json', message: 'No se pudo leer la solicitud. Inténtalo de nuevo.' }, 400);
  }

  return normalizeDocumentImport(env, access.session, document, payload);
}

async function handleDiscordInteraction(request, env, ctx) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');

  if (!signature || !timestamp) {
    return new Response('Invalid request signature headers', { status: 401 });
  }

  const rawBody = await request.text();
  const publicKey = env.DISCORD_PUBLIC_KEY;

  if (!publicKey) {
    console.error('DISCORD_PUBLIC_KEY is not configured');
    return new Response('Internal Server Error: Missing Public Key', { status: 500 });
  }

  const isValidRequest = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValidRequest) {
    return new Response('Invalid request signature', { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON payload', { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommandInteraction(interaction, env, ctx);
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponentInteraction(interaction, env, ctx);
  }

  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Bardo no puede responder a esta acción. Usa `/ayuda` para ver lo que puede hacer.',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

// Solo Discord (web, escritorio y el proxy de Activities) puede mostrar Bardo
// dentro de una página. Arranca en modo reporte: registra sin bloquear hasta
// confirmar que ningún cliente de Discord queda fuera; CSP_FRAME_MODE=enforce
// lo vuelve obligatorio.
const FRAME_ANCESTORS = "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com";
const CSP_REPORT_PATH = '/api/csp-report';

export function withFramePolicy(response, env) {
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;
  const framed = new Response(response.body, response);
  const enforce = env?.CSP_FRAME_MODE === 'enforce';
  framed.headers.set(enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    `${FRAME_ANCESTORS}; report-uri ${CSP_REPORT_PATH}; report-to csp`);
  framed.headers.set('Reporting-Endpoints', `csp="${CSP_REPORT_PATH}"`);
  framed.headers.set('X-Content-Type-Options', 'nosniff');
  framed.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // El HTML se revalida siempre: es lo que apunta a los assets del build nuevo.
  framed.headers.set('Cache-Control', 'no-cache');
  return framed;
}

/** Reportes de CSP del navegador: solo se registran (campos acotados) para revisarlos con `wrangler tail`. */
async function handleCspReport(request) {
  const text = (await request.text().catch(() => '')).slice(0, 8_192);
  let reports = [];
  try {
    const parsed = JSON.parse(text);
    reports = Array.isArray(parsed) ? parsed.map(item => item?.body || item) : [parsed?.['csp-report'] || parsed];
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const report of reports.slice(0, 5)) {
    const field = name => String(report?.[name] ?? report?.[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? '').slice(0, 200);
    console.warn('CSP report', JSON.stringify({
      directive: field('effective-directive') || field('violated-directive'),
      blocked: field('blocked-uri') || field('blockedURL'),
      document: field('document-uri') || field('documentURL'),
      disposition: field('disposition'),
    }));
  }
  return new Response(null, { status: 204 });
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === CSP_REPORT_PATH) {
    return request.method === 'POST' ? handleCspReport(request) : new Response(null, { status: 405 });
  }

  const authApiResponse = await handleDiscordAuthApi(request, url, env);
  if (authApiResponse) return authApiResponse;

  const docsApiResponse = await handleDocsApi(request, url, env);
  if (docsApiResponse) return docsApiResponse;

  const plannerApiResponse = await handlePlannerApi(request, url, env);
  if (plannerApiResponse) return plannerApiResponse;

  const kanbanApiResponse = await handleKanbanApi(request, url, env, ctx);
  if (kanbanApiResponse) return kanbanApiResponse;

  const settingsApiResponse = await handleSettingsApi(request, url, env);
  if (settingsApiResponse) return settingsApiResponse;

  if (url.pathname.startsWith(DOCUMENT_API_PREFIX)) {
    const route = parseDocumentApiPath(url.pathname);
    if (!route) return jsonResponse({ error: 'invalid_route', message: 'La dirección del documento no es válida.' }, 400);

    if (request.method === 'GET' && route.action === null) {
      return handleDocumentApi(request, route.documentId, env);
    }

    if (request.method === 'GET' && (route.action === 'export' || route.action === 'download')) {
      if (!url.searchParams.get('t')) return handleDocumentExportApi(request, url, route.documentId, env);
      // Signed links are opened in the system browser: whatever fails, show a
      // readable Spanish page instead of a raw JSON error.
      try {
        return await handleDocumentExportApi(request, url, route.documentId, env);
      } catch (error) {
        console.error('Error exportando documento (enlace firmado):', error);
        return downloadErrorPage(500, 'No pudimos preparar la descarga', 'Vuelve a Bardo en Discord e inténtalo de nuevo en unos segundos.');
      }
    }

    if (request.method === 'GET' && route.action === 'source') {
      return handleDocumentSourceApi(request, route.documentId, env);
    }

    if (request.method === 'POST' && route.action === 'normalize') {
      return handleDocumentNormalizeApi(request, route.documentId, env);
    }

    return jsonResponse({ error: 'method_not_allowed', message: 'Esta acción no está disponible.' }, 405);
  }

  if (request.method === 'POST') {
    return handleDiscordInteraction(request, env, ctx);
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && env.ASSETS) {
    return withFramePolicy(await env.ASSETS.fetch(request), env);
  }

  return new Response('Method not allowed', { status: 405 });
}

export default {
  async fetch(request, env, ctx = { waitUntil: () => {} }) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      if (isDiscordUnavailableError(error)) return discordUnavailableResponse(error);
      console.error('Unhandled Bardo Worker error:', error);
      return jsonResponse(
        { error: 'internal_error', message: 'Bardo tuvo un problema al procesar la solicitud. Inténtalo de nuevo.' },
        500,
        PRIVATE_HEADERS,
      );
    }
  },

  /**
   * Daily cron ("0 3 * * *"): removes only records that are expired by
   * definition (auth sessions, launch intents, old Activity contexts).
   * Documents, ACLs and meetings are never touched.
   */
  async scheduled(controller, env, ctx) {
    if (!env?.DB) return;
    const work = cleanupExpiredRecords(env.DB)
      .then(result => console.log('Bardo cleanup', result))
      .catch(error => console.error('Bardo cleanup failed', error));
    if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work);
    await work;
  },
};
