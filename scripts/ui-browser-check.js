import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve('.');
const outDir = resolve('.artifacts/ui');
await mkdir(outDir, { recursive: true });
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png' };
const server = createServer((req,res)=>{ const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname); const file=join(root, pathname==='/'?'test/visual/fixture.html':pathname); if(!file.startsWith(root)){res.writeHead(403).end();return;} if(!existsSync(file)){res.writeHead(404).end();return;} res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream'); createReadStream(file).pipe(res); });
await new Promise((resolveListen)=>server.listen(4173,'127.0.0.1',resolveListen));

function chromePath(){ for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){ const found=spawnSync('which',[name],{encoding:'utf8'}); if(found.status===0&&found.stdout.trim()) return found.stdout.trim(); } throw new Error('Chrome/Chromium is required for Phase 3 browser evidence.'); }
function run(args){ const result=spawnSync(chromePath(),args,{encoding:'utf8',maxBuffer:20*1024*1024}); if(result.status!==0) throw new Error(`${result.stderr||result.stdout||'Chrome failed'}`); return result.stdout; }
function hash(buffer){ return createHash('sha256').update(buffer).digest('hex').slice(0,16); }
const expectedPath=resolve('test/visual/baseline-hashes.json');
const expected=existsSync(expectedPath)?JSON.parse(await readFile(expectedPath,'utf8')):{};
const actual={};
try {
  for(const view of ['docs','kanban','planner']){
    for(const width of [390,768,1440]){
      const key=`${view}-${width}`; const shot=join(outDir,`${key}.png`); const url=`http://127.0.0.1:4173/test/visual/fixture.html?view=${view}`;
      run(['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars',`--window-size=${width},900`,`--screenshot=${shot}`,url]);
      actual[key]=hash(await readFile(shot));
      console.log(`VISUAL_HASH ${key} ${actual[key]}`);
      if(expected[key]&&expected[key]!==actual[key]) throw new Error(`Visual regression: ${key} expected ${expected[key]} got ${actual[key]}`);
    }
    const dom=run(['--headless=new','--no-sandbox','--disable-gpu','--dump-dom',`http://127.0.0.1:4173/test/visual/fixture.html?view=${view}`]);
    if(!dom.includes('data-ui-check="pass"')) throw new Error(`Layout overflow contract failed for ${view}`);
    if(!dom.includes('data-a11y-check="pass"')) throw new Error(`Accessibility fixture contract failed for ${view}`);
  }
  const reduced=run(['--headless=new','--no-sandbox','--disable-gpu','--force-prefers-reduced-motion','--dump-dom','http://127.0.0.1:4173/test/visual/fixture.html?view=planner']);
  if(!reduced.includes('data-ui-check="pass"')) throw new Error('Reduced-motion browser contract failed.');
  await writeFile(join(outDir,'hashes.json'),JSON.stringify(actual,null,2));
} finally { server.close(); }
