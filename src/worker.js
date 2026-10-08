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
  buildReuNewPayload,
  buildReusListPayload,
  BARDO_OPEN_PREFIX,
  EDIT_DOC_TARGET_PREFIX,
} from './components.js';
import { normalizeDocumentId } from './document-id.js';
import { handleDocsApi, normalizeDocumentImport } from './docs-api.js';
import { normalizeExportFormat, verifyExportToken } from './export-token.js';
import { handlePlannerApi } from './planner-api.js';
import { handleDiscordAuthApi, requireDocsSession } from './discord-auth.js';
import { sessionCanAccessDocument } from './document-access.js';
import { discordUnavailableResponse, isDiscordUnavailableError } from './discord-permissions.js';
import { fileStem, getSourceType, isTextSourceType, sourceLabel } from './import-format.js';
import { REU_DESCRIPTION_MAX, REU_DURATION_MAX_MINUTES, TITLE_MAX } from './limits.js';
import {
  cleanupExpiredRecords,
  grantDocumentChannelAccessStatement,
  grantDocumentGuildAccessStatement,
  insertDocumentStatement,
  listDocumentChannelAccess,
  listDocumentGuildIds,
  listDocumentsForChannel,
  listPlannerSessionsForChannel,
  loadActivityContext,
  loadDocument,
  loadDocumentSource,
  LAUNCH_TARGET_PREFIX,
  saveDocsLaunchIntent,
  savePlannerSession,
} from './db.js';

const MAX_STORED_DOCUMENT_BYTES = 1_800_000;
const DOCUMENT_API_PREFIX = '/api/documents/';
const ACTIVITY_CONTEXT_API_PREFIX = '/api/activity-context/';
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
function launchActivityToTarget(env, ctx, interaction, target) {
  const userId = interaction.member?.user?.id || interaction.user?.id || null;
  if (env.DB && userId && interaction.guild_id && target) {
    const save = saveDocsLaunchIntent(env.DB, userId, interaction.guild_id, `${LAUNCH_TARGET_PREFIX}${target}`, interaction.channel_id)
      .catch((error) => console.error('Error guardando el destino de Bardo:', error));
    if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(save);
  }
  // LAUNCH_ACTIVITY must be the initial response, inline, within 3 seconds.
  return jsonResponse({ type: 12 });
}

const BARDO_SECTION_TARGETS = { docs: 'docs', reuniones: 'planner', nuevo: 'new-doc' };
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

function tooLargeError() {
  return new Error('El archivo supera 1,8 MB. Por ahora Bardo limita los documentos a ese tamaño para mantener el almacenamiento gratuito.');
}

function validateAttachment(attachment) {
  const name = attachmentName(attachment);
  const sourceType = getSourceType(name);

  if (!sourceType) {
    if (name.toLowerCase().endsWith('.doc')) {
      throw new Error('El formato Word antiguo `.doc` todavía no es compatible. Guárdalo como `.docx` y vuelve a subirlo.');
    }
    throw new Error('Usa un archivo `.md`, `.markdown`, `.txt`, `.pdf` o `.docx`.');
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
    throw new Error(`Discord devolvió HTTP ${response.status} al leer el archivo.`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_STORED_DOCUMENT_BYTES) throw tooLargeError();

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_STORED_DOCUMENT_BYTES) throw tooLargeError();

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
  return `**${label} recibido.**\n\nBardo convertirá su contenido al formato de Documentos la primera vez que pulses **Abrir documento**.`;
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
      throw new Error('La base de datos de Bardo no está disponible.');
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      throw new Error('Bardo solo puede compartir documentos desde un canal de servidor de Discord.');
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
        throw new Error('El archivo está vacío.');
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
        mime: attachment.content_type || (sourceType === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
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
      throw new Error(`Error al actualizar el mensaje en Discord: ${editRes.status} ${errText.slice(0, MAX_ERROR_DETAIL)}`);
    }

    console.log(`Documento publicado: ${title} (${documentId}, ${sourceType})`);
  } catch (error) {
    console.error('Error procesando documento en background:', error);
    const detail = error instanceof Error ? error.message : 'Error desconocido.';
    const message = saved
      ? `El documento se guardó y ya aparece en **Documentos** de este canal, pero Discord no aceptó la tarjeta del mensaje. No hace falta volver a subirlo.\n\n${detail.slice(0, MAX_ERROR_DETAIL)}`
      : detail.slice(0, 1500);
    const errorPayload = buildErrorPayload(message);

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
  if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible. Inténtalo de nuevo en unos minutos.');
  if (!interaction.guild_id || !interaction.channel_id) {
    return ephemeral('Los documentos se crean dentro de un canal de un servidor de Discord.');
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
    if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible. Inténtalo de nuevo en unos minutos.');
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Los documentos se suben desde un canal de un servidor de Discord.');
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
          content: 'La base de datos de Bardo no está disponible.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Las reuniones de Bardo solo se pueden crear dentro de un canal de servidor de Discord.',
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
      date: fecha || todayInTimeZone(env.BARDO_TIME_ZONE || DEFAULT_TIME_ZONE),
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
          content: 'No se pudo crear la reunión en la base de datos.',
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
          content: 'La base de datos de Bardo no está disponible.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    if (!interaction.guild_id || !interaction.channel_id) {
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Las reuniones de Bardo solo están disponibles dentro de un canal de servidor.',
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

  if (commandName === 'bardo') {
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Bardo se abre dentro de un canal de un servidor de Discord.');
    }
    const seccion = (interaction.data?.options || []).find((opt) => opt.name === 'seccion')?.value;
    return launchActivityToTarget(env, ctx, interaction, BARDO_SECTION_TARGETS[seccion] || 'docs');
  }

  if (commandName === 'docs') {
    if (!env.DB) return ephemeral('La base de datos de Bardo no está disponible.');
    if (!interaction.guild_id || !interaction.channel_id) {
      return ephemeral('Los documentos de Bardo solo están disponibles dentro de un canal de servidor.');
    }
    let documents = [];
    try {
      documents = await listDocumentsForChannel(env.DB, interaction.guild_id, interaction.channel_id, { limit: 10, summary: true });
    } catch (err) {
      console.error('Error consultando documentos del canal:', err);
      return ephemeral('No se pudieron cargar los documentos de este canal. Intenta de nuevo en unos segundos.');
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
      content: `Comando desconocido: ${commandName}`,
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

  const guildIds = await listDocumentGuildIds(db, documentId);
  const statements = [];

  if (!guildIds.length) {
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
        content: 'Acción no reconocida.',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;

  // Non-document routes like planner, new document, the library, etc.
  const target = customId.slice(BARDO_OPEN_PREFIX.length);
  const isSpecialTarget = target === 'docs' || target.startsWith('planner') || target.startsWith('new-doc');

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
    return ephemeral('No pude abrir este documento.');
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
async function authorizeDocumentRequest(request, env, documentId) {
  const auth = await requireDocsSession(request, env);
  if (auth.error) return { error: auth.error };

  if (!(await sessionCanAccessDocument(env, auth.session, documentId))) {
    return { error: jsonResponse({ error: 'forbidden', message: 'Este documento no está compartido en este canal de Discord.' }, 403) };
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
      : jsonResponse({ error: 'database_unavailable', message: 'La base de datos de Bardo no está disponible.' }, 503);
  }

  if (token) {
    // Signed link opened outside Discord: the token replaces the session.
    const grant = format
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
      ...PRIVATE_HEADERS,
    },
  });
}

async function handleDocumentNormalizeApi(request, documentId, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'database_unavailable' }, 503);
  }

  const access = await authorizeDocumentRequest(request, env, documentId);
  if (access.error) return access.error;

  const document = await loadDocument(env.DB, documentId);
  if (!document) {
    return jsonResponse({ error: 'not_found', message: 'No se encontró el documento.' }, 404);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json', message: 'El cuerpo de la solicitud no es JSON válido.' }, 400);
  }

  return normalizeDocumentImport(env, access.session, document, payload);
}

async function handleActivityContextApi(url, env) {
  if (!env.DB) {
    return jsonResponse({ error: 'database_unavailable' }, 503);
  }

  const encodedId = url.pathname.slice(ACTIVITY_CONTEXT_API_PREFIX.length);
  if (!encodedId) {
    return jsonResponse({ error: 'instance_required' }, 400);
  }

  let instanceId;
  try {
    instanceId = decodeURIComponent(encodedId);
  } catch {
    return jsonResponse({ error: 'invalid_instance' }, 400);
  }

  const context = await loadActivityContext(env.DB, instanceId);
  if (!context) {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  return jsonResponse(
    {
      instanceId: context.instanceId,
      documentId: context.documentId,
      createdAt: context.createdAt,
    },
    200,
    PRIVATE_HEADERS,
  );
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
      content: 'Interacción no soportada.',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  const authApiResponse = await handleDiscordAuthApi(request, url, env);
  if (authApiResponse) return authApiResponse;

  const docsApiResponse = await handleDocsApi(request, url, env);
  if (docsApiResponse) return docsApiResponse;

  const plannerApiResponse = await handlePlannerApi(request, url, env);
  if (plannerApiResponse) return plannerApiResponse;

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

  if (request.method === 'GET' && url.pathname.startsWith(ACTIVITY_CONTEXT_API_PREFIX)) {
    return handleActivityContextApi(url, env);
  }

  if (request.method === 'POST') {
    return handleDiscordInteraction(request, env, ctx);
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && env.ASSETS) {
    return env.ASSETS.fetch(request);
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
