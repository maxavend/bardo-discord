import {readFileSync, writeFileSync} from 'node:fs';

const filePath = process.argv[2] || 'src/worker.js';
let source = readFileSync(filePath, 'utf8');

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

const clickGrant = `\n  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;\n  if (interaction.guild_id) {\n    if (legacyPageInteraction) {\n      const legacyAccessSummary = await env.DB.prepare('SELECT COUNT(*) AS count FROM document_guild_access').first();\n      if (Number(legacyAccessSummary?.count || 0) === 0) {\n        const legacyAddedAt = new Date().toISOString();\n        await env.DB.prepare('INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by) SELECT d.id, ?, ?, ? FROM documents d WHERE d.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id)')\n          .bind(interaction.guild_id, legacyAddedAt, invokingUserId)\n          .run();\n      }\n    }\n    await grantDocumentGuildAccess(env.DB, documentId, interaction.guild_id, invokingUserId);\n    await saveDocsLaunchIntent(env.DB, invokingUserId, interaction.guild_id, documentId);\n  }\n\n`;
const callbackAnchor = '  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;\n';
if (!source.includes('await saveDocsLaunchIntent(env.DB, invokingUserId')) {
  if (source.includes('const invokingUserId = interaction.member?.user?.id')) {
    const oldClickGrant = `\n  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;\n  if (interaction.guild_id) {\n    await grantDocumentGuildAccess(env.DB, documentId, interaction.guild_id, invokingUserId);\n  }\n\n`;
    if (!source.includes(oldClickGrant)) throw new Error('No encontré bloque guild anterior');
    source = source.replace(oldClickGrant, clickGrant);
  } else {
    if (!source.includes(callbackAnchor)) throw new Error('No encontré callback de component interaction');
    source = source.replace(callbackAnchor, `${clickGrant}${callbackAnchor}`);
  }
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
console.log(`Production Docs guild auth + legacy document compatibility wired into ${filePath}`);
