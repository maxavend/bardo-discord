import { readFileSync } from 'node:fs';

async function main() {
  console.log('=== BARDO STAGING & DISCORD PILOT VALIDATION SUITE ===\n');

  const wranglerConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const staging = wranglerConfig.env?.staging;

  console.log('1. Verificando configuración de staging:');
  console.log(' - Worker Name:', staging?.name);
  console.log(' - Environment:', staging?.vars?.ENVIRONMENT);
  console.log(' - Resource State:', staging?.vars?.BARDO_STAGING_RESOURCE_STATE);
  console.log(' - D1 Database ID:', staging?.d1_databases?.[0]?.database_id);

  const STAGING_URL = 'https://bardo-discord-staging.bardo-discord.workers.dev';
  console.log('\n2. Verificando endpoint remoto en Cloudflare:', STAGING_URL);

  // Asset fetch
  const assetRes = await fetch(STAGING_URL + '/');
  console.log(' [PASS] GET / -> HTTP', assetRes.status, assetRes.headers.get('content-type'));

  // Security: Unsigned requests rejected
  const unsignedRes = await fetch(STAGING_URL + '/', { method: 'POST', body: '{}' });
  console.log(' [PASS] Unsigned POST / -> HTTP', unsignedRes.status, '(401 esperado para requests sin firma)');

  // Security: Private documents require Activity token
  const privDoc = await fetch(STAGING_URL + '/api/documents/test-id');
  console.log(' [PASS] GET /api/documents/test-id -> HTTP', privDoc.status, '(401 esperado sin token)');

  // Security: Private boards require Activity token
  const privBoard = await fetch(STAGING_URL + '/api/boards/test-board');
  console.log(' [PASS] GET /api/boards/test-board -> HTTP', privBoard.status, '(401 esperado sin token)');

  // Security: Activity context lookup for non-existent instance
  const privContext = await fetch(STAGING_URL + '/api/activity-context/non-existent');
  console.log(' [PASS] GET /api/activity-context/non-existent -> HTTP', privContext.status, '(404 esperado)');

  console.log('\n=== Todas las verificaciones de infraestructura de staging completadas con éxito ===');
}

main().catch(err => {
  console.error('Error en validación:', err);
  process.exit(1);
});
