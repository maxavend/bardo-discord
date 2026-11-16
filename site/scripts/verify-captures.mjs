import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(site, 'src/lib/captures.json'), 'utf8'));
const sourceMode = process.env.BARDO_CAPTURE_SOURCE || 'current';
if (!['current', 'pinned'].includes(sourceMode)) throw new Error('BARDO_CAPTURE_SOURCE must be current or pinned.');
const pinned = sourceMode === 'pinned';
const sourceRef = pinned ? manifest.source.sha : manifest.source.ref;
const git = args => execFileSync('git', args, {cwd: site, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const files = [];
for (const scene of ['03-lector', '05-agenda', '07-resumen', '09-tablero']) {
  for (const theme of ['light', 'dark']) for (const device of ['desktop', 'mobile']) {
    const frame = manifest.captures[scene]?.[theme]?.[device];
    if (!frame || !frame.src.startsWith(`/capturas/${manifest.source.sha.slice(0, 12)}/`) || !existsSync(resolve(site, `public${frame.src}`))) {
      throw new Error(`Missing or mismatched capture: ${scene}/${theme}/${device}. Run npm run refresh:captures.`);
    }
    files.push(`public${frame.src}`);
  }
}
let tree;
try {
  if (pinned && (!/^[a-f0-9]{40}$/.test(sourceRef)
    || git(['rev-parse', '--verify', '--end-of-options', `${sourceRef}^{commit}`]) !== sourceRef)) {
    throw new Error('The recorded capture source must be an available, exact commit SHA.');
  }
  tree = git(['rev-parse', '--verify', '--end-of-options', `${sourceRef}:activity`]);
} catch (error) {
  if (pinned) throw new Error('Pinned capture verification requires the recorded Git commit and Activity tree.', {cause: error});
  // Source exports without Git still validate every image above.
}
if (tree && tree !== manifest.source.activityTree) throw new Error('The Activity in the selected ref changed. Regenerate screenshots with npm run refresh:captures.');
if (pinned) {
  // Security-only rebuilds may keep historical screenshots. Require their
  // bytes to match the committed images; existence alone is insufficient.
  for (const file of files) {
    let committed;
    try { committed = git(['rev-parse', '--verify', '--end-of-options', `HEAD:site/${file}`]); }
    catch { throw new Error(`Pinned capture is not committed: ${file}`); }
    if (git(['hash-object', '--no-filters', '--', file]) !== committed) throw new Error(`Pinned capture changed: ${file}`);
  }
  console.log(`16 historical captures verified · pinned ${sourceRef} · Activity tree and committed image hashes match; screenshots were not refreshed`);
} else {
  console.log(`16 captures verified · ${sourceRef} · ${manifest.source.sha.slice(0, 7)}`);
}
