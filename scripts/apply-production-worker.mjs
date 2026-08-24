import {readFileSync, writeFileSync} from 'node:fs';

const filePath = process.argv[2] || 'src/worker.js';
let source = readFileSync(filePath, 'utf8');

// A materialized production Worker already contains every integration below.
// Do not try to reconstruct the legacy remote-callback path on top of it.
if (
  source.includes('return jsonResponse({ type: 12 });') &&
  source.includes('handleDiscordAuthApi') &&
  source.includes('handleDocsApi') &&
  source.includes('persistLaunchContext')
) {
  console.log('Production Worker already contains materialized inline Activity launch; no patch required.');
  process.exit(0);
}

const docsImport = "import { handleDocsApi } from './docs-api.js';\n";
const authImport = "import { handleDiscordAuthApi } from './discord-auth.js';\n";
const importAnchor = "import { normalizeDocumentId } from './document-id.js';\n";
if (!source.includes(importAnchor)) throw new Error('No encontré el ancla de imports de worker.js');
if (!source.includes(docsImport)) source = source.replace(importAnchor, `${importAnchor}${docsImport}`);
if (!source.includes(authImport)) source = source.replace(docsImport, `${docsImport}${authImport}`);

if (!source.includes('  grantDocumentGuildAccess,\n')) {
  const dbAnchor = '  cacheNormalizedDocument,\n';
  if (!source.includes(dbAnchor)) throw new Error('No encontré el import de DB');
  source = source.replace(dbAnchor, `${dbAnchor}  grantDocumentGuildAccess,\n`);
}
if (!source.includes('  saveDocsLaunchIntent,\n')) {
  const dbAnchor = '  saveActivityContext,\n';
  if (!source.includes(dbAnchor)) throw new Error('No encontré saveActivityContext import');
  source = source.replace(dbAnchor, `${dbAnchor}  saveDocsLaunchIntent,\n`);
}

const uploadGrant = `\n    if (interaction.guild_id) {\n      await grantDocumentGuildAccess(env.DB, documentId, interaction.guild_id, createdBy);\n    }\n`;
const uploadAnchor = '    await saveDocument(env.DB, documentId, document);\n';
if (!source.includes(uploadGrant.trim())) {
  if (!source.includes(uploadAnchor)) throw new Error('No encontré saveDocument del upload');
  source = source.replace(uploadAnchor, `${uploadAnchor}${uploadGrant}`);
}

const legacyGuard = `  if (!customId.startsWith(BARDO_OPEN_PREFIX)) {\n    return jsonResponse({\n      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,\n      data: {\n        content: 'Acción no reconocida.',\n        flags: InteractionResponseFlags.EPHEMERAL,\n      },\n    });\n  }\n\n  const documentId = normalizeDocumentId(customId);\n`;
const legacyGuardReplacement = `  const legacyPageInteraction = customId.startsWith('bardo:page:');\n\n  if (!legacyPageInteraction && !customId.startsWith(BARDO_OPEN_PREFIX)) {\n    return jsonResponse({\n      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,\n      data: {\n        content: 'Acción no reconocida.',\n        flags: InteractionResponseFlags.EPHEMERAL,\n      },\n    });\n  }\n\n  const documentId = legacyPageInteraction\n    ? normalizeDocumentId(interaction.message?.id)\n    : normalizeDocumentId(customId);\n`;
if (!source.includes("const legacyPageInteraction = customId.startsWith('bardo:page:')")) {
  if (!source.includes(legacyGuard)) throw new Error('No encontré el guard de component interaction');
  source = source.replace(legacyGuard, legacyGuardReplacement);
}

// Discord invalidates an interaction token if the initial response is not sent
// within 3 seconds. Never do D1 work before LAUNCH_ACTIVITY is acknowledged.
source = source.replace(
  'async function handleComponentInteraction(interaction, env) {',
  'async function handleComponentInteraction(interaction, env, ctx) {',
);
source = source.replace(
  'return handleComponentInteraction(interaction, env);',
  'return handleComponentInteraction(interaction, env, ctx);',
);

const preLaunchDocumentCheck = `  const document = await loadDocument(env.DB, documentId);\n  if (!document) {\n    return jsonResponse({\n      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,\n      data: {\n        content: 'Este documento ya no está disponible.',\n        flags: InteractionResponseFlags.EPHEMERAL,\n      },\n    });\n  }\n\n`;
if (source.includes(preLaunchDocumentCheck)) {
  source = source.replace(preLaunchDocumentCheck, '');
}

const anyPreCallbackGrantStart = '\n  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;\n';
const callbackAnchor = '  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;\n';
if (source.includes(anyPreCallbackGrantStart)) {
  const start = source.indexOf(anyPreCallbackGrantStart);
  const end = source.indexOf(callbackAnchor, start);
  if (end < 0) throw new Error('No encontré callback después del bloque guild');
  source = source.slice(0, start) + '\n' + source.slice(end);
}

const callbackContextBlock = `    const callbackData = await callbackRes.json().catch(() => null);\n    const instanceIds = extractActivityInstanceIds(callbackData);\n\n    if (instanceIds.length === 0) {\n      console.error('Discord launched the Activity without a readable instance id.', {\n        interaction: callbackData?.interaction,\n        resource: callbackData?.resource,\n      });\n    } else {\n      await Promise.all(instanceIds.map((instanceId) => saveActivityContext(env.DB, instanceId, documentId)));\n    }\n\n    return new Response(null, { status: 202 });`;

const fastLaunchContextBlock = `    const callbackData = await callbackRes.json().catch(() => null);\n    const instanceIds = extractActivityInstanceIds(callbackData);\n    const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;\n\n    const persistLaunchContext = async () => {\n      const document = await loadDocument(env.DB, documentId);\n      if (!document) {\n        console.error('Bardo launch referenced a missing document.', { documentId });\n        return;\n      }\n\n      if (interaction.guild_id) {\n        // Before guild auth existed, Bardo was configured for a single guild and\n        // legacy rows had no guild metadata. The first signed legacy click is the\n        // trustworthy point at which those rows can be scoped without guessing.\n        const accessSummary = await env.DB.prepare('SELECT COUNT(*) AS count FROM document_guild_access').first();\n        if (Number(accessSummary?.count || 0) === 0) {\n          const legacyAddedAt = new Date().toISOString();\n          await env.DB.prepare('INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by) SELECT d.id, ?, ?, ? FROM documents d WHERE d.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id)')\n            .bind(interaction.guild_id, legacyAddedAt, invokingUserId)\n            .run();\n        }\n\n        await grantDocumentGuildAccess(env.DB, documentId, interaction.guild_id, invokingUserId);\n        await saveDocsLaunchIntent(env.DB, invokingUserId, interaction.guild_id, documentId);\n      }\n\n      if (instanceIds.length === 0) {\n        console.error('Discord launched the Activity without a readable instance id.', {\n          interaction: callbackData?.interaction,\n          resource: callbackData?.resource,\n        });\n        return;\n      }\n\n      await Promise.all(instanceIds.map((instanceId) => saveActivityContext(env.DB, instanceId, documentId)));\n    };\n\n    if (typeof ctx?.waitUntil === 'function') {\n      ctx.waitUntil(persistLaunchContext());\n    } else {\n      await persistLaunchContext();\n    }\n\n    return new Response(null, { status: 202 });`;

if (!source.includes('const persistLaunchContext = async () =>')) {
  if (!source.includes(callbackContextBlock)) {
    throw new Error('No encontré el bloque de contexto posterior a LAUNCH_ACTIVITY');
  }
  source = source.replace(callbackContextBlock, fastLaunchContextBlock);
}

const routeBlock = `\n    const authApiResponse = await handleDiscordAuthApi(request, url, env);\n    if (authApiResponse) return authApiResponse;\n\n    const docsApiResponse = await handleDocsApi(request, url, env);\n    if (docsApiResponse) return docsApiResponse;\n`;
if (!source.includes('const authApiResponse = await handleDiscordAuthApi')) {
  const oldDocsRoute = `\n    const docsApiResponse = await handleDocsApi(request, url, env);\n    if (docsApiResponse) return docsApiResponse;\n`;
  if (source.includes(oldDocsRoute)) {
    source = source.replace(oldDocsRoute, routeBlock);
  } else {
    const urlAnchor = '    const url = new URL(request.url);\n';
    if (!source.includes(urlAnchor)) throw new Error('No encontré el ancla de routing de worker.js');
    source = source.replace(urlAnchor, `${urlAnchor}${routeBlock}`);
  }
}

writeFileSync(filePath, source);
console.log(`Production Docs fast Activity launch + guild auth + legacy compatibility wired into ${filePath}`);
