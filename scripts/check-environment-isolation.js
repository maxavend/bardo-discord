import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const staging = config.env?.staging;
const production = config.env?.production;
const UNPROVISIONED_D1_ID = '00000000-0000-0000-0000-000000000000';

function assert(condition, message) {
  if (!condition) {
    console.error(`[env] ${message}`);
    process.exitCode = 1;
  }
}

const rootDb = config.d1_databases?.find((entry) => entry.binding === 'DB');
const rootR2 = config.r2_buckets?.find((entry) => entry.binding === 'BACKUPS');
const stagingDb = staging?.d1_databases?.find((entry) => entry.binding === 'DB');
const stagingR2 = staging?.r2_buckets?.find((entry) => entry.binding === 'BACKUPS');
const productionDb = production?.d1_databases?.find((entry) => entry.binding === 'DB');
const productionR2 = production?.r2_buckets?.find((entry) => entry.binding === 'BACKUPS');
const stagingResourceState = staging?.vars?.BARDO_STAGING_RESOURCE_STATE;

assert(config.main === 'src/p6-entry.js', 'wrangler must execute src/p6-entry.js');
assert(config.vars?.ENVIRONMENT === 'production', 'root environment must identify as production');
assert(staging?.name === 'bardo-discord-staging', 'staging worker name must be isolated');
assert(staging?.vars?.ENVIRONMENT === 'staging', 'staging must expose ENVIRONMENT=staging');
assert(production?.vars?.ENVIRONMENT === 'production', 'production must expose ENVIRONMENT=production');
assert(Boolean(rootDb && stagingDb && productionDb), 'DB binding must exist for root, staging and production');
assert(stagingDb?.database_name !== rootDb?.database_name, 'staging D1 name must differ from production');
assert(stagingDb?.database_id !== rootDb?.database_id, 'staging D1 id must never equal production');
assert(productionDb?.database_id === rootDb?.database_id, 'explicit production D1 must match the established production binding');
if (rootR2 || stagingR2 || productionR2) {
  assert(Boolean(rootR2 && stagingR2 && productionR2), 'BACKUPS binding must exist for root, staging and production when R2 is configured');
  assert(stagingR2?.bucket_name !== rootR2?.bucket_name, 'staging R2 bucket must never equal production');
  assert(productionR2?.bucket_name === rootR2?.bucket_name, 'explicit production R2 must match the established production binding');
}
assert(Array.isArray(staging?.triggers?.crons) && staging.triggers.crons.length === 0, 'staging must not send scheduled reminders by default');
assert(['unprovisioned', 'provisioned'].includes(stagingResourceState), 'staging resource state must be explicitly unprovisioned or provisioned');
if (stagingResourceState === 'unprovisioned') {
  assert(stagingDb?.database_id === UNPROVISIONED_D1_ID, 'unprovisioned staging must keep the zero D1 placeholder');
}
if (stagingResourceState === 'provisioned') {
  assert(Boolean(stagingDb?.database_id) && stagingDb.database_id !== UNPROVISIONED_D1_ID, 'provisioned staging must use a real non-placeholder D1 id');
}

const evidence = {
  entry: config.main,
  production: {
    worker: config.name,
    database: rootDb?.database_name,
    backups: rootR2?.bucket_name,
    cronCount: config.triggers?.crons?.length || 0,
  },
  staging: {
    worker: staging?.name,
    database: stagingDb?.database_name,
    backups: stagingR2?.bucket_name,
    cronCount: staging?.triggers?.crons?.length || 0,
    resourceState: stagingResourceState,
  },
};

mkdirSync('.artifacts', { recursive: true });
writeFileSync('.artifacts/environment-isolation.json', `${JSON.stringify(evidence, null, 2)}\n`);
if (!process.exitCode) console.log('[env] staging/production isolation contract: PASS');
