import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=resolve('.'); const outDir=resolve('.artifacts/ui'); await mkdir(outDir,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const server=createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const file=join(root,pathname==='/'?'test/visual/fixture.html':pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}if(!existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');createReadStream(file).pipe(res);});
await new Promise((resolveListen)=>server.listen(4173,'127.0.0.1',resolveListen));
function chromePath(){for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){const found=spawnSync('which',[name],{encoding:'utf8'});if(found.status===0&&found.stdout.trim())return found.stdout.trim();}throw new Error('Chrome/Chromium is required for Phase 3 browser evidence.');}
const chrome=chromePath();
function run(args){return new Promise((resolveRun,reject)=>{const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',(chunk)=>{stdout+=chunk;});child.stderr.on('data',(chunk)=>{stderr+=chunk;});child.on('error',reject);child.on('close',(code)=>code===0?resolveRun(stdout):reject(new Error(stderr||stdout||`Chrome failed with ${code}`)));});}
function hash(buffer){return createHash('sha256').update(buffer).digest('hex').slice(0,16);}
function diagnostics(dom){const body=dom.match(/<body[^>]*>/i)?.[0]||'<body unavailable>';return body.slice(0,1400);}
function bodyAttribute(dom,name){return dom.match(new RegExp(`${name}="([^"]+)"`,'i'))?.[1]||null;}
const expectedPath=resolve('test/visual/baseline-signatures.json');
const expected=existsSync(expectedPath)?JSON.parse(await readFile(expectedPath,'utf8')):{};
const signatures={};
const pngHashes={};
// PNGs remain human-review evidence. Regression pass/fail uses deterministic DOM geometry/style signatures.
const common=['--headless=new','--no-sandbox','--disable-gpu','--disable-lcd-text','--font-render-hinting=none','--virtual-time-budget=1000'];
const contractViewport='--window-size=768,900';
try{
  for(const view of ['docs','kanban','planner']){
    for(const width of [390,768,1440]){
      const key=`${view}-${width}`;
      const shot=join(outDir,`${key}.png`);
      const url=`http://127.0.0.1:4173/test/visual/fixture.html?view=${view}`;
      const viewport=`--window-size=${width},900`;
      const dom=await run([...common,viewport,'--dump-dom',url]);
      if(!dom.includes('data-visual-ready="true"'))throw new Error(`Visual fixture did not settle for ${key}: ${diagnostics(dom)}`);
      if(!dom.includes('data-ui-check="pass"'))throw new Error(`Layout contract did not pass for ${key}: ${diagnostics(dom)}`);
      if(!dom.includes('data-a11y-check="pass"'))throw new Error(`Accessibility fixture contract failed for ${key}: ${diagnostics(dom)}`);
      const signature=bodyAttribute(dom,'data-visual-signature');
      if(!signature)throw new Error(`Visual signature is missing for ${key}: ${diagnostics(dom)}`);
      signatures[key]=signature;
      console.log(`VISUAL_SIGNATURE ${key} ${signature}`);
      if(expected[key]&&expected[key]!==signature)throw new Error(`Visual regression: ${key} expected signature ${expected[key]} got ${signature}`);
      await run([...common,'--hide-scrollbars',viewport,`--screenshot=${shot}`,url]);
      pngHashes[key]=hash(await readFile(shot));
      console.log(`VISUAL_PNG_HASH ${key} ${pngHashes[key]}`);
    }
  }
  const reduced=await run([...common,contractViewport,'--force-prefers-reduced-motion','--dump-dom','http://127.0.0.1:4173/test/visual/fixture.html?view=planner']);
  if(!reduced.includes('data-ui-check="pass"')||!reduced.includes('data-visual-ready="true"'))throw new Error(`Reduced-motion browser contract failed: ${diagnostics(reduced)}`);
  const contrast=await run([...common,contractViewport,'--force-high-contrast','--dump-dom','http://127.0.0.1:4173/test/visual/fixture.html?view=kanban']);
  if(!contrast.includes('data-ui-check="pass"')||!contrast.includes('data-a11y-check="pass"')||!contrast.includes('data-visual-ready="true"'))throw new Error(`High-contrast browser contract failed: ${diagnostics(contrast)}`);
  await writeFile(join(outDir,'visual-signatures.json'),JSON.stringify(signatures,null,2));
  await writeFile(join(outDir,'png-hashes.json'),JSON.stringify(pngHashes,null,2));
}finally{await new Promise((resolveClose)=>server.close(resolveClose));}
