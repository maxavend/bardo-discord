// Material de portafolio a partir de las capturas: 10 slides 16:9 (PNG + PDF),
// 6 covers y una hoja de contacto numerada. Revisa cada pieza antes de guardarla
// (texto cortado, solapes, imágenes recortadas o deformadas) y falla si algo no cuadra.
//
//   node portfolio/material.mjs --from=<salida de capture.mjs>   # elige las 10 vistas y las copia a capturas/
//   node portfolio/material.mjs                                   # solo slides, covers, PDF y hoja de contacto
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {launchBrowser} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const CAPTURAS = join(HERE, 'capturas');
const SLIDES = join(HERE, 'slides');
const COVERS = join(HERE, 'covers');
const BUILD = join(HERE, '.preview/material');
const KIT = join(HERE, '../brand/logo/kit');
const FONT = join(HERE, '../activity-app/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');

// Marca oficial (brand/logo/kit/GUIA.md)
const C = {lavanda: '#FAF5FF', tinta: '#0A0A0A', violeta: '#8200DB', noche: '#6E11B0', claro: '#C27AFF',
  texto: '#3D3647', suave: '#6B6378', borde: '#E4D8F3', blanco: '#FFFFFF'};

// ─────────────────────────────────────────────────────────────────────────────
// Las 10 vistas esenciales (origen dentro de la salida de capture.mjs)

const VIEWS = [
  {id: '01-inicio', src: '01-inicio/01-resumen-del-espacio', name: 'Inicio'},
  {id: '02-biblioteca', src: '02-documentos/01-biblioteca', name: 'Biblioteca de documentos'},
  {id: '03-lector', src: '02-documentos/05-lector', name: 'Lector'},
  {id: '04-editor', src: '02-documentos/08-editor', name: 'Editor de documentos'},
  {id: '05-agenda', src: '03-reuniones/02-agenda', name: 'Agenda de la reunión'},
  {id: '06-reunion-en-vivo', src: '03-reuniones/07-en-vivo-bloque-activo', name: 'Reunión en vivo'},
  {id: '07-resumen', src: '03-reuniones/14-resumen', name: 'Resumen de la reunión'},
  {id: '08-acuerdos-a-tareas', src: '03-reuniones/16-acuerdos-a-tareas', name: 'Acuerdos a tareas'},
  {id: '09-tablero', src: '04-tareas/01-tablero', name: 'Tablero de tareas'},
  {id: '10-detalle-de-tarea', src: '04-tareas/05-detalle-de-tarea', name: 'Detalle de tarea'},
  {id: '11-reunion-en-curso', src: '03-reuniones/06-en-vivo-primer-tema', name: 'Reunión en curso'},
  {id: '12-tiempo-excedido', src: '03-reuniones/12-bloque-con-tiempo-excedido', name: 'Tiempo excedido'},
];
const VARIANTS = ['escritorio-oscuro', 'escritorio-claro', 'movil-oscuro', 'movil-claro'].flatMap(v => [v, `${v}-pieza`]);

function selectCaptures(from) {
  rmSync(CAPTURAS, {recursive: true, force: true});
  for (const view of VIEWS) {
    const dir = join(CAPTURAS, view.id);
    mkdirSync(dir, {recursive: true});
    let copied = 0;
    for (const variant of VARIANTS) {
      const file = join(from, view.src, `${variant}.png`);
      if (existsSync(file)) { copyFileSync(file, join(dir, `${variant}.png`)); copied++; }
    }
    if (!copied) throw new Error(`Falta la captura ${view.src} en ${from}`);
  }
}

const shot = (id, variant = 'escritorio-oscuro') => pathToFileURL(join(CAPTURAS, id, `${variant}.png`)).href;
const asset = path => pathToFileURL(join(KIT, path)).href;
const logo = (scheme = 'color') => readFileSync(join(KIT, scheme === 'blanco' ? 'variantes/bardo-horizontal-white.svg' : `maestros/bardo-horizontal-${scheme}.svg`), 'utf8')
  .replace(/<title[^>]*>.*?<\/title>/, '').replace(/\swidth="[^"]*"\sheight="[^"]*"/, '');

// ─────────────────────────────────────────────────────────────────────────────
// Estilos compartidos: fondo plano, sin sombras ni degradados.

const BASE_CSS = `
@font-face{font-family:Bardo;src:url("${pathToFileURL(FONT).href}") format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${C.lavanda}}
body{font-family:Bardo,system-ui,sans-serif;color:${C.tinta};-webkit-font-smoothing:antialiased}
.frame{position:relative;overflow:hidden;background:${C.lavanda}}
.kicker{font-weight:600;color:${C.violeta}}
.title{font-weight:650;letter-spacing:-.02em;line-height:1.08;text-wrap:balance}
.body{color:${C.texto};line-height:1.45;text-wrap:pretty}
.facts{list-style:none;display:grid;gap:14px;color:${C.texto}}
.facts li{display:grid;grid-template-columns:12px 1fr;gap:14px;align-items:baseline}
.facts li::before{content:"";width:10px;height:10px;border-radius:50%;background:${C.violeta};transform:translateY(-1px)}
.visual{display:flex;align-items:center;justify-content:center;gap:40px}
.shot{display:block;max-width:100%;max-height:100%;width:auto;height:auto;border:1px solid ${C.borde};border-radius:14px;background:${C.tinta}}
.shot.phone{border-radius:28px}
.shot.piece,.dark .shot.piece{border:0;border-radius:0;background:transparent}
.logo svg{display:block;height:100%;width:auto}
.frame.dark,.dark{background:${C.tinta};color:${C.blanco}}
.dark .kicker{color:${C.claro}}
.dark .body,.dark .facts{color:#C9C2D4}
.dark .facts li::before{background:${C.claro}}
.dark .shot{border-color:#2A2433;background:${C.blanco}}
.dark .card{border-color:#2A2433}
.dark .card.dark{background:#17131D;border-color:#2A2433}
`;

// Slides 1920×1080: margen 96; columna de texto 96–576; visual 656–1824 × 96–936; pie 1000–1040.
const SLIDE_CSS = `
.frame{width:1920px;height:1080px}
.text{position:absolute;left:96px;top:96px;width:480px;height:840px;display:flex;flex-direction:column;justify-content:center;gap:28px}
.text .kicker{font-size:22px}
.text .title{font-size:60px}
.text .body{font-size:24px}
.text .facts{font-size:20px}
.visual{position:absolute;left:656px;top:96px;width:1168px;height:840px}
.foot{position:absolute;left:96px;right:96px;top:1000px;height:40px;display:flex;align-items:center;justify-content:space-between;color:${C.suave};font-size:16px}
.foot .logo{height:32px}
.foot .caption{font-size:20px;color:${C.texto}}
.frame.violet{background:${C.violeta};color:${C.blanco}}
.closing{position:absolute;inset:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px}
.closing-icon{width:220px;height:220px;display:block}
.closing-logo{height:120px}
.closing-body{font-size:36px;line-height:1.3;text-align:center;max-width:1100px}
`;

const SLIDES_DATA = [
  {slug: 'portada', kicker: 'Portada', title: 'Bardo', body: 'Documentos, reuniones y tareas, sin salir de Discord.',
    visual: {shots: [['01-inicio']]}, cover: true},
  {slug: 'lector', theme: 'dark', kicker: 'Documentos', title: 'Leer sin salir del canal',
    body: 'Un lector para todo lo que el equipo escribe o importa: Markdown, PDF, Word o texto.', visual: {shots: [['03-lector']]}},
  {slug: 'editor', kicker: 'Documentos', title: 'Escribir por bloques',
    body: 'Barra que se adapta al ancho, menú «/» y guardado automático a la vista.', visual: {shots: [['04-editor']]}},
  {slug: 'reunion-en-vivo', theme: 'dark', kicker: 'Reuniones', title: 'La reunión, en vivo',
    body: 'Tema activo y tiempo restante a la vista. Si un bloque se excede, se nota.', visual: {shots: [['12-tiempo-excedido']]}},
  {slug: 'reunion-en-curso', full: true, caption: 'Weekly de producto, en curso', visual: {shots: [['11-reunion-en-curso']]}},
  {slug: 'acuerdos-a-tareas', theme: 'dark', kicker: 'Reuniones', title: 'De acuerdo a tarea',
    body: 'Al cerrar la reunión, cada acuerdo pasa al tablero con su responsable.',
    visual: {shots: [['08-acuerdos-a-tareas', 'escritorio-oscuro-pieza']]}},
  {slug: 'tablero', kicker: 'Tareas', title: 'Un tablero por canal',
    body: 'Etiquetas, prioridades, fechas y subtareas, con avisos en Discord.', visual: {shots: [['09-tablero']]}},
  {slug: 'detalle-de-tarea', theme: 'dark', kicker: 'Tareas', title: 'Cada tarea, completa',
    body: 'Subtareas, documentos enlazados y un hilo en el canal para conversarla.',
    visual: {shots: [['10-detalle-de-tarea', 'escritorio-oscuro-pieza']]}},
  {slug: 'movil', kicker: 'Móvil', title: 'También en el teléfono',
    body: 'La misma Activity, ajustada a la pantalla chica.',
    visual: {shots: [['01-inicio', 'movil-oscuro'], ['06-reunion-en-vivo', 'movil-oscuro'], ['09-tablero', 'movil-oscuro']]}},
  {slug: 'claro-y-oscuro', theme: 'dark', kicker: 'Temas', title: 'Claro y oscuro',
    body: 'Sigue el tema de Discord, con la misma jerarquía en los dos modos.',
    visual: {keep: true, shots: [['02-biblioteca', 'movil-claro'], ['02-biblioteca', 'movil-oscuro']]}},
  {slug: 'marca', kicker: 'Marca', title: 'Transcribo, y punto',
    body: 'La voz se calma, se asienta en un renglón y cierra con punto final.', visual: {brand: true}},
  {slug: 'cierre', theme: 'violet', closing: true, body: 'Documentos, reuniones y tareas, sin salir de Discord.'},
];
const SLIDE_LABELS = {'portada': 'Portada', 'lector': 'Lector', 'editor': 'Editor', 'reunion-en-vivo': 'Reunión en vivo',
  'reunion-en-curso': 'Reunión en curso', 'acuerdos-a-tareas': 'Acuerdos a tareas', 'tablero': 'Tablero',
  'detalle-de-tarea': 'Detalle de tarea', 'movil': 'Móvil', 'claro-y-oscuro': 'Claro y oscuro', 'marca': 'Marca', 'cierre': 'Cierre'};

function shotsHTML(shots, dark = false) {
  // Varias vistas en fila: cada una cabe entera en su parte del ancho (sin encoger solo un eje).
  const max = shots.length > 1 ? ` style="max-width:calc((100% - ${(shots.length - 1) * 40}px) / ${shots.length});flex-shrink:0"` : '';
  return shots.map(([id, variant = 'escritorio-oscuro']) => (dark ? variant.replace('-oscuro', '-claro') : variant)).map(variant => [variant]).map(([variant], k) => [shots[k][0], variant]).map(([id, variant]) =>
    `<img class="shot${variant.startsWith('movil') ? ' phone' : ''}${variant.endsWith('-pieza') ? ' piece' : ''}"${max} src="${shot(id, variant)}" alt="">`).join('');
}

function brandBoard() {
  // Piezas enteras en una grilla de 2 × 2, sin superposiciones.
  return `<div class="brand">
    <div class="card"><div class="logo-lg">${logo('color')}</div></div>
    <div class="card dark"><div class="logo-lg">${logo('oscuro')}</div></div>
    <div class="card"><img class="icon" src="${asset('apple/renders/ios-Default-1024.png')}" alt=""><img class="icon" src="${asset('apple/renders/ios-Dark-1024.png')}" alt=""></div>
    <div class="card swatches">${[[C.violeta, 'Violeta', '#8200DB', C.blanco], [C.tinta, 'Tinta', '#0A0A0A', C.blanco],
      [C.claro, 'Violeta claro', '#C27AFF', C.tinta], [C.blanco, 'Lavanda', '#FAF5FF', C.tinta]]
      .map(([bg, n, hex, fg]) => `<div style="background:${bg === C.blanco ? C.lavanda : bg};color:${fg}"><b>${n}</b><span>${hex}</span></div>`).join('')}</div>
  </div>`;
}

const BRAND_CSS = `
.brand{width:100%;height:100%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:24px}
.card{background:${C.blanco};border:1px solid ${C.borde};border-radius:20px;display:flex;align-items:center;justify-content:center;gap:28px;padding:40px}
.card.dark{background:${C.tinta};border-color:${C.tinta}}
.logo-lg{height:96px;max-width:100%}.logo-lg svg{height:100%;width:auto;display:block}
.icon{height:240px;width:240px}
.swatches{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:150px;align-content:center;gap:16px;padding:40px}
.swatches div{border-radius:12px;padding:18px;display:flex;flex-direction:column;justify-content:flex-end;font-size:18px;border:1px solid ${C.borde};min-height:0}
.swatches span{opacity:.8;font-size:14px}
`;

function slideHTML(s, i, total) {
  if (s.full) {
    // Una vista a casi todo el cuadro: sin columna de texto, solo el logo y una línea al pie.
    return `<section class="frame slide" data-n="${i + 1}">
      <div class="visual block" style="left:64px;top:64px;width:1792px;height:904px">${shotsHTML(s.visual.shots)}</div>
      <div class="foot block"><div class="logo">${logo('color')}</div><span class="t caption">${s.caption}</span></div>
    </section>`;
  }
  if (s.closing) {
    return `<section class="frame slide violet" data-n="${i + 1}">
      <div class="closing block"><img class="closing-icon" src="${asset('apple/renders/ios-Dark-1024.png')}" alt="">
        <div class="logo closing-logo">${logo('blanco')}</div><p class="t closing-body">${s.body}</p></div>
    </section>`;
  }
  const facts = s.facts ? `<ul class="facts">${s.facts.map(f => `<li class="t">${f}</li>`).join('')}</ul>` : '';
  const dark = s.theme === 'dark';
  const head = s.cover
    ? `<div class="logo cover-logo">${logo(dark ? 'oscuro' : 'color')}</div>`
    : `<div class="kicker t">${s.kicker}</div><h1 class="title t">${s.title}</h1>`;
  const v = s.visual;
  const visual = v.brand ? brandBoard() : shotsHTML(v.shots, dark && !v.keep);
  const bodyStyle = s.cover ? ` style="font-size:34px;color:${dark ? C.blanco : C.tinta};line-height:1.25"` : '';
  return `<section class="frame slide${dark ? ' dark' : ''}" data-n="${i + 1}">
    <div class="text block">${head}<p class="body t"${bodyStyle}>${s.body}</p>${facts}</div>
    <div class="visual block">${visual}</div>
    <div class="foot block"><div class="logo">${logo(dark ? 'oscuro' : 'color')}</div></div>
  </section>`;
}

const COVER_SLIDE_CSS = `.cover-logo{height:84px}`;

function page(css, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Covers: mismo sistema (fondo plano, logo, título, una vista entera).
// Texto arriba, visual abajo; márgenes = 6 % del ancho.

const COVERS_DATA = [
  {file: '01-cover-16x9', label: '16:9 · Inicio', w: 1920, h: 1080, title: 'Documentos, reuniones y tareas, sin salir de Discord.', shots: [['01-inicio']], row: true},
  {file: '02-cover-16x9-reuniones', label: '16:9 · Reuniones', theme: 'dark', w: 1920, h: 1080, title: 'Reuniones que terminan en acuerdos y tareas.', shots: [['06-reunion-en-vivo']], row: true},
  {file: '03-cover-1x1', label: '1:1 · Tablero', theme: 'dark', w: 1600, h: 1600, title: 'Un tablero por canal, dentro de Discord.', shots: [['09-tablero']]},
  {file: '04-cover-1x1-marca', label: '1:1 · Marca', w: 1600, h: 1600, title: 'Transcribo, y punto.', icon: true},
  {file: '05-cover-4x3', label: '4:3 · Lector', theme: 'dark', w: 1600, h: 1200, title: 'Leer y escribir sin salir de la conversación.', shots: [['03-lector']]},
  {file: '06-cover-4x5', label: '4:5 · Móvil', w: 1600, h: 2000, title: 'En el canal, también desde el teléfono.', shots: [['01-inicio', 'movil-oscuro'], ['08-acuerdos-a-tareas', 'movil-oscuro']]},
];

function coverHTML(c) {
  const dark = c.theme === 'dark';
  const L = logo(dark ? 'oscuro' : 'color');
  const m = Math.round(c.w * 0.06);
  const fs = Math.round(c.w * 0.045);
  const visual = c.icon
    ? `<img class="icon-xl" src="${asset('apple/renders/ios-Default-1024.png')}" alt=""><img class="icon-xl" src="${asset('apple/renders/ios-Dark-1024.png')}" alt="">`
    : shotsHTML(c.shots, dark);
  if (c.row) {
    // 16:9: texto a la izquierda, visual a la derecha (la grilla de las slides).
    return `<section class="frame cover${dark ? ' dark' : ''}" style="width:${c.w}px;height:${c.h}px">
      <div class="text block" style="position:absolute;left:96px;top:96px;width:480px;height:888px;display:flex;flex-direction:column;justify-content:center;gap:32px">
        <div class="logo" style="height:76px">${L}</div><h1 class="title t" style="font-size:52px">${c.title}</h1></div>
      <div class="visual block" style="position:absolute;left:656px;top:96px;width:1168px;height:888px">${visual}</div></section>`;
  }
  const headH = Math.round(fs * 1.25 + fs * 0.6 + fs * 1.08 * (c.title.length > 26 ? 2 : 1) + 8);
  return `<section class="frame cover${dark ? ' dark' : ''}" style="width:${c.w}px;height:${c.h}px">
    <div class="text block" style="position:absolute;left:${m}px;top:${m}px;right:${m}px;height:${headH}px;display:flex;flex-direction:column;gap:${Math.round(fs * 0.6)}px">
      <div class="logo" style="height:${Math.round(fs * 1.25)}px">${L}</div>
      <h1 class="title t" style="font-size:${fs}px;max-width:${Math.round((c.w - 2 * m) * 0.8)}px">${c.title}</h1></div>
    <div class="visual block" style="position:absolute;left:${m}px;right:${m}px;top:${m + headH + Math.round(m * 0.5)}px;bottom:${m}px">${visual}</div></section>`;
}

const COVER_CSS = `.icon-xl{height:min(100%,640px);aspect-ratio:1;display:block}`;

// ─────────────────────────────────────────────────────────────────────────────
// Revisión dentro de la página: falla ante cualquier problema de composición.

async function qa(pageObj, label) {
  return pageObj.evaluate(label => {
    const problems = [];
    const frame = document.querySelector('.frame').getBoundingClientRect();
    const inside = (r, pad = 0) => r.left >= frame.left - pad && r.top >= frame.top - pad && r.right <= frame.right + pad && r.bottom <= frame.bottom + pad;
    for (const el of document.querySelectorAll('.t')) {
      // El texto realmente dibujado (no la caja), para no confundir trazos de letra con cortes.
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const clips = getComputedStyle(el).overflow !== 'visible';
      if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) problems.push(`texto cortado: «${el.textContent.slice(0, 40)}»`);
      if (!inside(r)) problems.push(`texto fuera del cuadro: «${el.textContent.slice(0, 40)}»`);
      const parent = el.closest('.block').getBoundingClientRect();
      if (r.bottom > parent.bottom + 1 || r.right > parent.right + 1 || r.top < parent.top - 1 || r.left < parent.left - 1) problems.push(`texto desborda su columna: «${el.textContent.slice(0, 40)}»`);
    }
    const blocks = [...document.querySelectorAll('.block')];
    for (const b of blocks) {
      if (b.scrollHeight > b.clientHeight + 1) problems.push(`contenido desborda ${b.className}`);
    }
    for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
      const r1 = blocks[a].getBoundingClientRect(), r2 = blocks[b].getBoundingClientRect();
      if (r1.left < r2.right && r2.left < r1.right && r1.top < r2.bottom && r2.top < r1.bottom) problems.push(`bloques encimados: ${blocks[a].className} / ${blocks[b].className}`);
    }
    const imgs = [...document.querySelectorAll('.visual img')];
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      if (!img.complete || !img.naturalWidth) { problems.push(`imagen no cargó: ${img.src.split('/').slice(-2).join('/')}`); continue; }
      const ratio = img.naturalWidth / img.naturalHeight, shown = r.width / r.height;
      if (Math.abs(ratio - shown) / ratio > 0.01) problems.push(`imagen deformada o recortada: ${img.src.split('/').slice(-2).join('/')}`);
      const box = img.closest('.visual').getBoundingClientRect();
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) problems.push(`imagen fuera de su caja: ${img.src.split('/').slice(-2).join('/')}`);
    }
    for (let a = 0; a < imgs.length; a++) for (let b = a + 1; b < imgs.length; b++) {
      const r1 = imgs[a].getBoundingClientRect(), r2 = imgs[b].getBoundingClientRect();
      if (r1.left < r2.right - 1 && r2.left < r1.right - 1 && r1.top < r2.bottom - 1 && r2.top < r1.bottom - 1) problems.push('imágenes encimadas');
    }
    if (!document.fonts.check('24px Bardo')) problems.push('la fuente Inter no cargó');
    return problems.map(p => `${label}: ${p}`);
  }, label);
}

async function render(browser, html, out, {w, h, scale = 2, label}) {
  mkdirSync(BUILD, {recursive: true});
  const file = join(BUILD, `${label.replace(/\W+/g, '-')}.html`);
  writeFileSync(file, html);
  const context = await browser.newContext({viewport: {width: w, height: h === 'auto' ? 1000 : h}, deviceScaleFactor: scale});
  const pg = await context.newPage();
  await pg.goto(pathToFileURL(file).href);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForFunction(() => [...document.images].every(i => i.complete));
  const problems = await qa(pg, label);
  const height = h === 'auto' ? await pg.evaluate(() => Math.ceil(document.querySelector('.frame').getBoundingClientRect().height)) : h;
  if (out) await pg.screenshot({path: out, clip: {x: 0, y: 0, width: w, height}, fullPage: h === 'auto'});
  await context.close();
  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (args.from) selectCaptures(resolve(args.from));
  for (const view of VIEWS) if (!existsSync(join(CAPTURAS, view.id, 'escritorio-oscuro.png'))) throw new Error(`Falta capturas/${view.id}`);
  for (const dir of [SLIDES, COVERS]) { rmSync(dir, {recursive: true, force: true}); mkdirSync(dir, {recursive: true}); }

  const browser = await launchBrowser();
  const problems = [];
  const items = [];
  try {
    // Slides
    const css = SLIDE_CSS + BRAND_CSS + COVER_SLIDE_CSS;
    const slides = SLIDES_DATA.map((s, i) => slideHTML(s, i, SLIDES_DATA.length));
    for (const [i, html] of slides.entries()) {
      const name = `${String(i + 1).padStart(2, '0')}-${SLIDES_DATA[i].slug}.png`;
      const out = join(SLIDES, name);
      problems.push(...await render(browser, page(css, html), out, {w: 1920, h: 1080, label: `slide ${i + 1}`}));
      items.push({group: 'Slides', label: SLIDE_LABELS[SLIDES_DATA[i].slug], file: out});
    }
    // PDF con las 10 slides
    const pdfHtml = page(css + '@page{size:1920px 1080px;margin:0}.slide{break-after:page}', slides.join(''));
    const pdfFile = join(BUILD, 'deck.html');
    writeFileSync(pdfFile, pdfHtml);
    const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}});
    const pg = await ctx.newPage();
    await pg.goto(pathToFileURL(pdfFile).href);
    await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({path: join(SLIDES, 'bardo-caso-de-estudio.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true});
    await ctx.close();

    // Covers
    for (const c of COVERS_DATA) {
      const out = join(COVERS, `${c.file}.png`);
      problems.push(...await render(browser, page(BRAND_CSS + COVER_CSS, coverHTML(c)), out, {w: c.w, h: c.h, label: `cover ${c.file}`}));
      items.push({group: 'Covers', label: c.label, file: out, ratio: c.w / c.h});
    }

    // Vista general: las 10 slides en dos columnas, con su nombre
    const overview = `<section class="frame"><div class="overview block"><h1 class="t">Bardo · slides</h1><div class="pair">${
      items.filter(it => it.group === 'Slides').map(it => `<figure><figcaption class="t">${it.label}</figcaption><img src="${pathToFileURL(it.file).href}" alt=""></figure>`).join('')}</div></div></section>`;
    const overviewCss = `.frame{width:3520px;height:auto;padding:96px;background:#EFE8F7}.overview{display:flex;flex-direction:column;gap:56px}
      .overview h1{font-size:44px;font-weight:650}.pair{display:grid;grid-template-columns:1fr 1fr;gap:64px 48px}
      figure{display:flex;flex-direction:column;gap:14px}figcaption{font-size:26px;color:${C.texto}}
      .pair img{width:100%;display:block;border-radius:10px;border:1px solid ${C.borde}}`;
    problems.push(...await render(browser, page(overviewCss, overview), join(HERE, 'vista-general-slides.png'), {w: 3520, h: 'auto', scale: 1, label: 'vista general'}));

    // Hoja de contacto numerada: capturas, slides y covers
    const caps = VIEWS.map(v => ({group: 'Capturas', label: v.name, file: join(CAPTURAS, v.id, 'escritorio-oscuro.png')}));
    const all = [...caps, ...items];
    let n = 0;
    const section = group => `<h2 class="t">${group}</h2><div class="grid">${all.filter(it => it.group === group).map(it => {
      n++;
      return `<figure><div class="thumb"><img src="${pathToFileURL(it.file).href}" alt=""></div><figcaption class="t"><b>${n}</b> ${it.label}</figcaption></figure>`;
    }).join('')}</div>`;
    const sheetCss = `.frame{width:2400px;height:auto;padding:96px}.sheet{display:flex;flex-direction:column;gap:28px;height:100%}
      .sheet header{display:flex;align-items:center;gap:28px}.sheet header .logo{height:56px}.sheet header span{font-size:28px;color:${C.suave}}
      h2{font-size:30px;font-weight:650;margin-top:12px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:28px}
      figure{display:flex;flex-direction:column;gap:10px;min-width:0}.thumb{height:240px;display:flex;align-items:center;justify-content:center;background:${C.blanco};border:1px solid ${C.borde};border-radius:12px;padding:12px}
      .thumb img{max-width:100%;max-height:100%;display:block;border-radius:4px}
      figcaption{font-size:20px;color:${C.texto};white-space:nowrap;overflow:hidden}figcaption b{display:inline-grid;place-items:center;min-width:34px;height:34px;border-radius:17px;background:${C.violeta};color:#fff;font-size:17px;margin-right:8px;padding:0 8px}`;
    const sheet = `<section class="frame"><div class="sheet block"><header><div class="logo">${logo('color')}</div><span class="t">Material de portafolio · ${all.length} piezas</span></header>
      ${section('Capturas')}${section('Slides')}${section('Covers')}</div></section>`;
    const sheetOut = join(HERE, 'hoja-de-contacto.png');
    problems.push(...await render(browser, page(sheetCss, sheet), sheetOut, {w: 2400, h: 'auto', scale: 1, label: 'hoja de contacto'}));
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Sin problemas: ${SLIDES_DATA.length} slides, PDF, ${COVERS_DATA.length} covers, vista general y hoja de contacto.`);
  }
}

await main();
