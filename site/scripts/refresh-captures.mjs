// Capture the exact committed Activity artifact, never the developer's current UI.
// npm --prefix site run refresh:captures -- --ref=origin/main
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser, serveStatic, collectErrors, VIEWPORTS} from '../../portfolio/lib.mjs';
import {DEFAULT_LIVE_SESSION} from '../../activity-app/src/planner/session-runner.js';
import {WEEKLY_ID, NOW_ISO, TIME_ZONE} from '../../portfolio/mock/data.mjs';
import {buildGamerSeed, demo} from './gamer-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ref = process.argv.find(arg => arg.startsWith('--ref='))?.slice(6) || 'origin/main';
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const sha = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
const activityTree = git(['rev-parse', `${sha}:activity`]);
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const previous = only ? JSON.parse(readFileSync(join(root, 'site/src/lib/captures.json'), 'utf8')) : null;
if (previous && previous.source.sha !== sha) throw new Error('Partial refresh requires the same source commit. Run a full refresh for a new revision.');
const scenes = [
  {name: '03-lector', hash: '#doc-doc-spec-kyc', ready: '.doc-body'},
  {name: '05-agenda', hash: '#planner-agenda', ready: '.planner-module-root'},
  {name: '07-resumen', hash: '#planner-recap', ready: '.planner-module-root', recap: true},
  {name: '09-tablero', hash: '#kanban', ready: '.kanban-board'},
];
if (only && !scenes.some(scene => scene.name === only)) throw new Error(`Unknown scene: ${only}`);
const temp = mkdtempSync(join(tmpdir(), 'bardo-site-captures-'));
try {
  execFileSync('git', ['archive', '--output', join(temp, 'activity.tar'), sha, 'activity'], {cwd: root});
  execFileSync('tar', ['-xf', join(temp, 'activity.tar'), '-C', temp]);
} catch (error) { rmSync(temp, {recursive: true, force: true}); throw error; }
const {server} = await serveStatic(join(temp, 'activity'), 0);
const url = `http://127.0.0.1:${server.address().port}`;
const captures = previous?.captures || {};
const source = {ref, sha, activityTree, capturedAt: new Date().toISOString(), fixture: 'site/scripts/gamer-fixture.mjs', fixtureVersion: 'gamer-v1'};
let browser;
try {
  for (const scene of scenes) {
    if (only && scene.name !== only) continue;
    captures[scene.name] = {};
    for (const theme of ['light', 'dark']) {
      captures[scene.name][theme] = {};
      for (const device of ['desktop', 'mobile']) {
        browser = await launchBrowser();
        const context = await browser.newContext({...VIEWPORTS[device], colorScheme: theme, locale: 'es-CL', timezoneId: TIME_ZONE, reducedMotion: 'no-preference'});
        await context.clock.install({time: new Date(NOW_ISO)});
        const seed = buildGamerSeed({theme});
        await context.addInitScript(seed => {
          if (!localStorage.getItem('bardo.portfolio.seeded')) {
            for (const [key, value] of Object.entries(seed.storage)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            localStorage.setItem('bardo.portfolio.seeded', '1');
          }
          for (const [key, value] of Object.entries(seed.globals)) window[key] = value;
        }, seed);
        if (scene.recap) {
          await context.addInitScript(({defaults, weeklyId, now, seed, agreements, members}) => {
            // Complete seed makes this independent of init-script execution order.
            for (const [key, value] of Object.entries(seed.storage)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            localStorage.setItem('bardo.portfolio.seeded', '1');
            const key = 'bardo-planner-session-state-v1';
            const planner = JSON.parse(localStorage.getItem(key));
            planner.eventStatus = 'completed';
            localStorage.setItem(key, JSON.stringify(planner));
            localStorage.setItem('bardo-planner-live-session-v1', JSON.stringify({
              ...defaults, sessionId: 'portfolio-weekly-completed', plannerSessionId: weeklyId, status: 'completed',
              scheduledStartAt: now - 52 * 60000, sessionStartedAt: now - 52 * 60000, sessionEndedAt: now,
              completedBlockIds: planner.blocks.map(block => block.id),
              pointStatuses: Object.fromEntries(planner.blocks.flatMap(block => block.subpoints.map(point => [point.id, 'done']))),
              decisions: agreements.map((agreement, index) => ({id: `capture-agreement-${index}`, content: agreement.text, owner: members[agreement.member].name, blockId: index < 2 ? 'wk-b2' : index === 2 ? 'wk-b3' : 'wk-b4', pointId: ['wk-p3', 'wk-p4', 'wk-p7', 'wk-p8'][index]})),
            }));
          }, {defaults: DEFAULT_LIVE_SESSION, weeklyId: WEEKLY_ID, now: Date.parse(NOW_ISO), seed, agreements: demo.agreements, members: demo.members});
        }
        const page = await context.newPage();
        const errors = collectErrors(page);
        await page.goto(`${url}/?theme=${theme}${scene.hash}`);
        await page.locator(scene.ready).first().waitFor({timeout: 20000});
        if (scene.recap) await page.getByRole('heading', {name: 'Acuerdos (4)', exact: true}).waitFor();
        if (scene.name === '09-tablero') await page.getByRole('button', {name: /Abrir tarea #/}).first().waitFor();
        await context.clock.fastForward('00:02');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const actualTheme = await page.locator('html').getAttribute('data-theme');
        if (actualTheme !== theme) throw new Error(`Wrong theme: ${actualTheme}, expected ${theme}`);
        if (errors.length) throw new Error(errors.join('\n'));
        const path = `capturas/${sha.slice(0, 12)}/gamer-v1/${scene.name}/${device}-${theme}.webp`;
        const target = join(root, 'site/public', path);
        mkdirSync(dirname(target), {recursive: true});
        const png = join(temp, 'shot.png');
        await page.screenshot({path: png, animations: 'disabled', caret: 'hide'});
        execFileSync('cwebp', ['-quiet', '-lossless', '-z', '6', png, '-o', target]);
        const {viewport, deviceScaleFactor} = VIEWPORTS[device];
        captures[scene.name][theme][device] = {src: `/${path}`, width: viewport.width * deviceScaleFactor, height: viewport.height * deviceScaleFactor};
        console.log(`${scene.name} · ${device} · ${theme} · ${sha.slice(0, 7)}`);
        await context.close();
        await browser.close();
        browser = null;
      }
    }
  }
  mkdirSync(join(root, 'site/src/lib'), {recursive: true});
  writeFileSync(join(root, 'site/src/lib/captures.json'), `${JSON.stringify({source, captures}, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  rmSync(temp, {recursive: true, force: true});
}
