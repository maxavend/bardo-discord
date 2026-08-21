import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve('.');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
const server = createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=join(root,pathname==='/'?'test/e2e/editor-reliability.html':pathname);
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  if(!existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');createReadStream(file).pipe(res);
});
await new Promise((resolveListen)=>server.listen(4174,'127.0.0.1',resolveListen));
function chromePath(){if(process.env.CHROME_PATH&&existsSync(process.env.CHROME_PATH))return process.env.CHROME_PATH;for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){const found=spawnSync('which',[name],{encoding:'utf8'});if(found.status===0&&found.stdout.trim())return found.stdout.trim();}for(const macPath of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium']){if(existsSync(macPath))return macPath;}throw new Error('Chrome/Chromium is required for Phase 5 editor browser checks.');}
function run(chrome,args){return new Promise((resolveRun,reject)=>{const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',(chunk)=>{stdout+=chunk;});child.stderr.on('data',(chunk)=>{stderr+=chunk;});child.on('error',reject);child.on('close',(code)=>code===0?resolveRun(stdout):reject(new Error(stderr||stdout||`Chrome failed with ${code}`)));});}
const chrome=chromePath();
try{
  for(const scenario of ['queue','conflict','retry','ui-error','ui-conflict','exit-dirty']){
    const url=`http://127.0.0.1:4174/test/e2e/editor-reliability.html?scenario=${scenario}`;
    const dom=await run(chrome,['--headless=new','--no-sandbox','--disable-gpu','--virtual-time-budget=2200','--dump-dom',url]);
    if(!dom.includes('data-editor-check="pass"'))throw new Error(`Phase 5 editor browser scenario failed: ${scenario}\n${dom.slice(0,2400)}`);
    console.log(`EDITOR_BROWSER ${scenario} PASS`);
  }
}finally{await new Promise((resolveClose)=>server.close(resolveClose));}
