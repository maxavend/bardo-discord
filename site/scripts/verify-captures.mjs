import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(site, 'src/lib/captures.json'), 'utf8'));
for (const scene of ['03-lector', '05-agenda', '07-resumen', '09-tablero']) {
  for (const theme of ['light', 'dark']) for (const device of ['desktop', 'mobile']) {
    const frame = manifest.captures[scene]?.[theme]?.[device];
    if (!frame || !frame.src.startsWith(`/capturas/${manifest.source.sha.slice(0, 12)}/`) || !existsSync(resolve(site, `public${frame.src}`))) {
      throw new Error(`Missing or mismatched capture: ${scene}/${theme}/${device}. Run npm run refresh:captures.`);
    }
  }
}
let tree;
try { tree = execFileSync('git', ['rev-parse', `${manifest.source.ref}:activity`], {cwd: site, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { /* Source exports without Git still validate every image above. */ }
if (tree && tree !== manifest.source.activityTree) throw new Error('The Activity in the selected ref changed. Regenerate screenshots with npm run refresh:captures.');
console.log(`16 captures verified · ${manifest.source.ref} · ${manifest.source.sha.slice(0, 7)}`);
