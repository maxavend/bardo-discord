import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const entrySource = readFileSync('src/conversation-entry.js', 'utf8');
const staging = config.env?.staging;
const production = config.env?.production;

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

assert(config.main === 'src/conversation-entry.js', 'wrangler must execute src/conversation-entry.js');
assert(entrySource.includes("from './p6-entry.js'"), 'conversation entry must preserve the certified Phase 6 runtime');
assert(config.vars?.ENVIRONMENT === 'production', 'root environment must identify as production');
assert(config.ai?.binding === 'AI', 'root environment must expose the Workers AI binding');
assert(staging?.ai?.binding === 'AI', 'staging must expose the Workers AI binding');
assert(production?.ai?.binding === 'AI', 'production must expose the Workers AI binding');
assert(staging?.name === 'bardo-discord-staging', 'staging worker name must be isolated');
assert(staging?.vars?.ENVIRONMENT === 'staging', 'staging must expose ENVIRONMENT=staging');
assert(production?.vars?.ENVIRONMENT === 'production', 'production must expose ENVIRONMENT=production');
assert(Boolean(rootDb && stagingDb && productionDb), 'DB binding must exist for root, staging and production');
assert(Boolean(rootR2 && stagingR2 && productionR2), 'BACKUPS binding must exist for root, staging and production');
assert(stagingDb?.database_name !== rootDb?.database_name, 'staging D1 name must differ from production');
assert(stagingDb?.database_id !== rootDb?.database_id, 'staging D1 id must never equal production');
assert(stagingR2?.bucket_name !== rootR2?.bucket_name, 'staging R2 bucket must never equal production');
assert(productionDb?.database_id === rootDb?.database_id, 'explicit production D1 must match the established production binding');
assert(productionR2?.bucket_name === rootR2?.bucket_name, 'explicit production R2 must match the established production binding');
assert(Array.isArray(staging?.triggers?.crons) && staging.triggers.crons.length === 0, 'staging must not send scheduled reminders by default');
assert(staging?.vars?.BARDO_STAGING_RESOURCE_STATE === 'unprovisioned', 'staging remote resources must stay explicitly unprovisioned until a separate provisioning action');

const evidence = {
  entry: config.main,
  aiBinding: config.ai?.binding || null,
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
    resourceState: staging?.vars?.BARDO_STAGING_RESOURCE_STATE,
  },
};

mkdirSync('.artifacts', { recursive: true });
writeFileSync('.artifacts/environment-isolation.json', `${JSON.stringify(evidence, null, 2)}\n`);
if (!process.exitCode) console.log('[env] staging/production isolation contract: PASS');
