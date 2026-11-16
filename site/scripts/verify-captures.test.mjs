import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const verifier = readFileSync(new URL('./verify-captures.mjs', import.meta.url), 'utf8');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bardo-capture-verification-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    env: {...process.env, GIT_AUTHOR_NAME: 'Capture test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Capture test', GIT_COMMITTER_EMAIL: 'test@example.invalid'},
  }).trim();
  const write = (file, contents) => {
    const path = join(root, file);
    mkdirSync(join(path, '..'), {recursive: true});
    writeFileSync(path, contents);
  };
  const commit = () => { git(['add', '.']); git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']); };
  git(['init', '--quiet']);
  write('activity/index.html', '<p>Captured Activity</p>');
  commit();
  const sha = git(['rev-parse', 'HEAD']);
  const manifest = {source: {ref: 'HEAD', sha, activityTree: git(['rev-parse', 'HEAD:activity'])}, captures: {}};
  let image;
  for (const scene of ['03-lector', '05-agenda', '07-resumen', '09-tablero']) {
    manifest.captures[scene] = {};
    for (const theme of ['light', 'dark']) {
      manifest.captures[scene][theme] = {};
      for (const device of ['desktop', 'mobile']) {
        const src = `/capturas/${sha.slice(0, 12)}/${scene}/${device}-${theme}.webp`;
        manifest.captures[scene][theme][device] = {src};
        image = `site/public${src}`;
        write(image, `capture fixture ${scene} ${theme} ${device}`);
      }
    }
  }
  const saveManifest = () => write('site/src/lib/captures.json', JSON.stringify(manifest));
  saveManifest();
  write('site/scripts/verify-captures.mjs', verifier);
  commit();
  const run = mode => spawnSync(process.execPath, ['site/scripts/verify-captures.mjs'], {
    cwd: root, encoding: 'utf8', env: {...process.env, BARDO_CAPTURE_SOURCE: mode || ''},
  });
  return {root, manifest, image, write, commit, saveManifest, run};
}

test('current verifies a fresh source and pinned verifies its exact historical commit and image hashes', t => {
  const {run} = fixture(t);
  const current = run();
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /16 captures verified/);
  const pinned = run('pinned');
  assert.equal(pinned.status, 0, pinned.stderr);
  assert.match(pinned.stdout, /16 historical captures verified/);
  assert.match(pinned.stdout, /screenshots were not refreshed/);
});

test('current still rejects a moved source while pinned explicitly preserves verified historical images', t => {
  const {write, commit, run} = fixture(t);
  write('activity/index.html', '<p>New Activity</p>');
  commit();
  const current = run();
  assert.notEqual(current.status, 0);
  assert.match(current.stderr, /selected ref changed/);
  const pinned = run('pinned');
  assert.equal(pinned.status, 0, pinned.stderr);
});

test('pinned rejects a modified image even when all 16 paths still exist', t => {
  const {image, write, run} = fixture(t);
  write(image, 'changed capture bytes');
  const result = run('pinned');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pinned capture changed/);
});

test('pinned rejects a forged recorded Activity tree', t => {
  const {manifest, saveManifest, run} = fixture(t);
  manifest.source.activityTree = 'f'.repeat(40);
  saveManifest();
  const result = run('pinned');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selected ref changed/);
});

test('pinned requires the recorded commit to exist and never falls back to file existence', t => {
  const {manifest, root, saveManifest, run} = fixture(t);
  // Keep the original capture prefix valid while making the commit unavailable.
  rmSync(join(root, '.git'), {recursive: true, force: true});
  saveManifest();
  assert.ok(manifest.source.sha);
  const result = run('pinned');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires the recorded Git commit/);
});

test('pinned rejects missing images and unknown verification modes', t => {
  const {image, root, run} = fixture(t);
  rmSync(join(root, image));
  assert.match(run('pinned').stderr, /Missing or mismatched capture/);
  assert.match(run('skip').stderr, /BARDO_CAPTURE_SOURCE must be current or pinned/);
});
