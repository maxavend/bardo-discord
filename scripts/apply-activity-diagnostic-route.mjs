import {readFileSync, writeFileSync} from 'node:fs';

const filePath = process.argv[2] || 'src/worker.js';
let source = readFileSync(filePath, 'utf8');
const anchor = '    const url = new URL(request.url);\n';
if (!source.includes(anchor)) throw new Error('worker URL anchor not found');

const block = `\n    if (request.method === 'GET' && url.pathname === '/__bardo_diag_activity_20260823') {\n      const response = await fetch('https://discord.com/api/v10/oauth2/applications/@me', {\n        headers: {\n          Authorization: \`Bot \${env.DISCORD_TOKEN || ''}\`,\n          'User-Agent': 'Bardo-Diagnostics/1.0',\n        },\n      });\n      const app = await response.json().catch(() => null);\n      if (!response.ok || !app) {\n        return jsonResponse({ ok:false, discord_status:response.status, has_token:Boolean(env.DISCORD_TOKEN) }, 502);\n      }\n      const flags = BigInt(app.flags_new ?? app.flags ?? 0);\n      const embedded = (flags & (1n << 17n)) !== 0n;\n      const configuredPublicKey = String(env.DISCORD_PUBLIC_KEY || '').trim().toLowerCase();\n      const discordVerifyKey = String(app.verify_key || '').trim().toLowerCase();\n      return jsonResponse({\n        ok:true,\n        application_id:app.id || null,\n        embedded_flag:embedded,\n        flags:flags.toString(),\n        interactions_endpoint_url:app.interactions_endpoint_url || null,\n        redirect_uris:Array.isArray(app.redirect_uris) ? app.redirect_uris : [],\n        guild_install:Boolean(app.integration_types_config?.['0']),\n        user_install:Boolean(app.integration_types_config?.['1']),\n        has_public_key:Boolean(configuredPublicKey),\n        discord_has_verify_key:Boolean(discordVerifyKey),\n        public_key_matches:Boolean(configuredPublicKey && discordVerifyKey && configuredPublicKey === discordVerifyKey),\n        worker_marker:'inline-launch-diag-v3',\n      });\n    }\n`;

if (source.includes("/__bardo_diag_activity_20260823")) {
  source = source.replace(/\n    if \(request\.method === 'GET' && url\.pathname === '\/__bardo_diag_activity_20260823'\) \{[\s\S]*?\n    \}\n(?=\n|    )/, block);
} else {
  source = source.replace(anchor, anchor + block);
}
writeFileSync(filePath, source);
console.log('Temporary Activity diagnostic route wired into Worker');
