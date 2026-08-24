import {readFileSync, writeFileSync} from 'node:fs';

const filePath = process.argv[2] || 'src/worker.js';
let source = readFileSync(filePath, 'utf8');

const startMarker = '  const callbackUrl = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback?with_response=true`;';
const endMarker = '\n}\n\nfunction parseDocumentApiPath';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  if (source.includes('return jsonResponse({ type: 12 });')) {
    console.log(`Inline Activity launch already wired into ${filePath}`);
    process.exit(0);
  }
  throw new Error('No encontré el bloque de callback remoto de LAUNCH_ACTIVITY');
}

const replacement = `  const invokingUserId = interaction.member?.user?.id || interaction.user?.id || null;\n\n  const persistLaunchContext = async () => {\n    try {\n      const document = await loadDocument(env.DB, documentId);\n      if (!document) {\n        console.error('Bardo launch referenced a missing document.', { documentId });\n        return;\n      }\n\n      if (interaction.guild_id) {\n        const accessSummary = await env.DB.prepare('SELECT COUNT(*) AS count FROM document_guild_access').first();\n        if (Number(accessSummary?.count || 0) === 0) {\n          const legacyAddedAt = new Date().toISOString();\n          await env.DB.prepare('INSERT INTO document_guild_access (document_id, guild_id, added_at, added_by) SELECT d.id, ?, ?, ? FROM documents d WHERE d.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM document_guild_access a WHERE a.document_id = d.id)')\n            .bind(interaction.guild_id, legacyAddedAt, invokingUserId)\n            .run();\n        }\n\n        await grantDocumentGuildAccess(env.DB, documentId, interaction.guild_id, invokingUserId);\n        await saveDocsLaunchIntent(env.DB, invokingUserId, interaction.guild_id, documentId);\n      }\n    } catch (error) {\n      console.error('Error persisting Bardo Activity launch context:', error);\n    }\n  };\n\n  if (typeof ctx?.waitUntil === 'function') {\n    ctx.waitUntil(persistLaunchContext());\n  } else {\n    void persistLaunchContext();\n  }\n\n  // Discord HTTP interactions support responding inline. LAUNCH_ACTIVITY must be\n  // the initial response and must arrive within 3 seconds. Returning it directly\n  // avoids an unnecessary second network hop to Discord's callback endpoint.\n  return jsonResponse({ type: 12 });`;

source = source.slice(0, start) + replacement + source.slice(end);

writeFileSync(filePath, source);
console.log(`Inline LAUNCH_ACTIVITY response wired into ${filePath}`);
