import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const artifactDir = resolve(root, '.artifacts/release');
mkdirSync(artifactDir, { recursive: true });

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const wrangler = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'));

const automatic = {
  explicitDeployCommands:
    String(packageJson.scripts?.['deploy:staging'] || '').includes('--env staging') &&
    String(packageJson.scripts?.['deploy:production'] || '').includes('--env production') &&
    String(packageJson.scripts?.deploy || '').includes('bloqueado'),
  phase6EntryActive: wrangler.main === 'src/p6-entry.js',
  stagingIsolated:
    wrangler.env?.staging?.name === 'bardo-discord-staging' &&
    wrangler.env?.staging?.d1_databases?.[0]?.database_name === 'bardo-db-staging' &&
    wrangler.env?.staging?.r2_buckets?.[0]?.bucket_name === 'bardo-backups-staging' &&
    Array.isArray(wrangler.env?.staging?.triggers?.crons) &&
    wrangler.env.staging.triggers.crons.length === 0,
  productionEnvironmentExplicit: wrangler.env?.production?.name === 'bardo-discord',
  rollbackRunbookPresent: existsSync(resolve(root, 'docs/release-runbook.md')),
  phase7TestsWired:
    String(packageJson.scripts?.['test:unit'] || '').includes('test/phase7-release.test.js') &&
    String(packageJson.scripts?.['test:worker'] || '').includes('test/phase7-runtime.test.js'),
};

const external = {
  stagingResourcesProvisioned: process.env.BARDO_STAGING_RESOURCES_PROVISIONED === '1',
  stagingMigrationsValidated: process.env.BARDO_STAGING_MIGRATIONS_VALIDATED === '1',
  discordPilotValidated: process.env.BARDO_DISCORD_PILOT_VALIDATED === '1',
  humanReleaseApproved: process.env.BARDO_HUMAN_RELEASE_APPROVED === '1',
};

const automaticFailures = Object.entries(automatic).filter(([, ok]) => !ok).map(([name]) => name);
const externalPending = Object.entries(external).filter(([, ok]) => !ok).map(([name]) => name);
const releaseReady = automaticFailures.length === 0 && externalPending.length === 0;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  state: releaseReady ? 'RELEASE_READY' : 'RELEASE_BLOCKED',
  automatic,
  external,
  automaticFailures,
  externalPending,
  note: releaseReady
    ? 'All automated and human-authorized release gates are evidenced.'
    : 'Automated hardening may pass while remote staging, real Discord pilot and/or human approval remain explicit release gates.',
};

writeFileSync(resolve(artifactDir, 'release-readiness.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[release] automatic=${automaticFailures.length ? `FAIL:${automaticFailures.join(',')}` : 'PASS'}`);
console.log(`[release] external=${externalPending.length ? `PENDING:${externalPending.join(',')}` : 'PASS'}`);
console.log(`[release] state=${report.state}`);

if (automaticFailures.length) process.exit(1);
if (process.argv.includes('--require-release-ready') && !releaseReady) process.exit(2);
