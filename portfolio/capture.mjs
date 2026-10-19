// Recorre los flujos principales de Bardo con los datos ficticios de Lumen y
// guarda capturas en alta resolución, por flujo y pantalla.
//
//   node portfolio/capture.mjs --dist=<build> [--preview] [--only=03,04]
//        [--devices=desktop,mobile] [--themes=dark,light]
//
// Cada flujo corre en un navegador limpio (datos recién sembrados) con el reloj
// fijado al lunes 19 de octubre de 2026, 09:40 (America/Santiago). Las
// reuniones en vivo avanzan el reloj para que los tiempos sean realistas.
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectErrors, launchBrowser, seededContext, serveStatic} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const PREVIEW = args.preview === 'true';
const DIST = resolve(args.dist || join(HERE, '../activity'));
const OUT = resolve(args.out || (PREVIEW ? join(HERE, '.preview') : join(HERE, 'capturas')));
const ONLY = args.only ? args.only.split(',') : null;
const DEVICES = (args.devices || 'desktop,mobile').split(',');
const THEMES = (args.themes || 'dark,light').split(',');

const DEVICE_LABEL = {desktop: 'escritorio', mobile: 'movil'};
const THEME_LABEL = {dark: 'oscuro', light: 'claro'};
const KICKOFF_FILE = join(HERE, 'mock/archivos/Kickoff · Pagos recurrentes.md');
// Escritura a ritmo humano: con 0 ms entre teclas el editor encadena commits
// síncronos hasta el límite de React (no ocurre a velocidad real).
const TYPE_DELAY = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Escenas: un flujo = una sesión de navegador; cada `shot` es una pantalla.

const SCENES = [
  {
    flow: '00-carga',
    async run({page, url, shot, context}) {
      // El chunk principal llega tarde: se ve la pantalla de carga real.
      await context.route(/\/assets\/App-[^/]+\.js$/, async route => {
        await new Promise(done => setTimeout(done, 4000));
        await route.continue();
      });
      await page.goto(`${url}/#home`, {waitUntil: 'commit'});
      await page.locator('.boot-screen').waitFor();
      await page.waitForTimeout(1200);
      await shot('01-pantalla-de-carga', {settle: false});
    },
  },
  {
    flow: '01-inicio',
    async run({page, url, shot}) {
      await open(page, `${url}/#home`, page.getByRole('heading', {name: 'Lo último en tu espacio'}));
      await shot('01-resumen-del-espacio');
      await page.locator('#home-tasks').scrollIntoViewIfNeeded();
      await page.locator('#home-tasks').evaluate(node => node.closest('section').scrollIntoView({block: 'end'}));
      await shot('02-tareas-asignadas');
    },
  },
  {
    flow: '02-documentos',
    async run({page, url, shot, ff}) {
      await open(page, `${url}/#docs`, page.getByRole('button', {name: /Activos \(8\)/}));
      await shot('01-biblioteca');

      const search = page.getByLabel('Buscar documentos');
      await search.fill('onboarding');
      await page.waitForTimeout(400);
      await shot('02-busqueda');
      await page.getByRole('button', {name: 'Limpiar búsqueda'}).click();

      await page.getByRole('button', {name: /Archivados \(1\)/}).click();
      await shot('03-archivados');
      await page.getByRole('button', {name: /Activos \(8\)/}).click();

      await page.locator('.doc-row').first().getByRole('button', {name: /Más acciones/}).click();
      await shot('04-acciones-del-documento');
      await page.keyboard.press('Escape');

      await page.locator('.doc-row').first().click();
      await page.getByRole('heading', {name: 'Brief · Onboarding v3'}).waitFor();
      await ff('00:05');
      await shot('05-lector');
      await scrollTo(page, page.locator('.doc-reader table, article table').first());
      await shot('06-lector-tabla-y-lista');

      await open(page, `${url}/#doc-doc-hallazgos-entrevistas`, page.getByRole('heading', {name: /Hallazgos · Entrevistas/}));
      await scrollTo(page, page.locator('blockquote').first());
      await shot('07-lector-cita-y-hallazgos');

      await open(page, `${url}/#edit-doc-spec-kyc`, page.locator('[contenteditable="true"]').first());
      await page.waitForTimeout(600);
      await shot('08-editor');

      // Menú de bloques con «/».
      const editable = page.locator('[contenteditable="true"]').first();
      // Clic a la derecha del último ítem: el cursor queda al final sin partir la línea.
      const lastItem = editable.locator('li').last();
      const box = await lastItem.boundingBox();
      await lastItem.click({position: {x: box.width - 6, y: box.height / 2}});
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/');
      await page.locator('.bardo-slash-menu').waitFor();
      await shot('09-menu-de-bloques');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');

      // Documento nuevo: título, descripción, y cuerpo con el menú «/».
      await open(page, `${url}/#new`, page.locator('[contenteditable="true"]').first());
      await page.getByLabel('Título').click();
      await type(page, 'Notas · Crítica de pagos recurrentes');
      await page.keyboard.press('Enter');
      await type(page, 'Preparación para la crítica del miércoles 21 de octubre.');
      await page.keyboard.press('Enter');
      await slash(page, 'subtitulo');
      await type(page, 'Qué queremos validar');
      await page.keyboard.press('Enter');
      await slash(page, 'pendientes');
      await type(page, 'Crear un cobro mensual toma menos de un minuto.');
      await page.keyboard.press('Enter');
      await type(page, 'El aviso previo permite pausar o editar el monto.');
      await page.keyboard.press('Enter');
      await type(page, 'El historial por cliente se entiende sin explicación.');
      await page.waitForTimeout(400);
      await shot('10-documento-nuevo');
      await page.getByRole('button', {name: 'Listo'}).click();
      await page.getByRole('heading', {name: 'Notas · Crítica de pagos recurrentes'}).waitFor();

      // Importar un archivo Markdown.
      await open(page, `${url}/#docs`, page.getByRole('button', {name: /Activos/}));
      await page.locator('input[type="file"]').first().setInputFiles(KICKOFF_FILE);
      await page.getByRole('heading', {name: 'Kickoff · Pagos recurrentes'}).first().waitFor();
      await page.waitForTimeout(600);
      await shot('11-archivo-importado');
      await open(page, `${url}/#docs`, page.getByRole('button', {name: /Activos \(10\)/}));
      await shot('12-biblioteca-actualizada');
    },
  },
  {
    flow: '03-reuniones',
    async run({page, url, shot, ff}) {
      await open(page, `${url}/#planner`, page.getByText('Reuniones (5)'));
      await shot('01-proximas-reuniones');

      await page.locator('.meeting-row').getByRole('button', {name: 'Abrir la reunión Weekly de producto'}).click();
      await page.getByRole('heading', {name: 'Weekly de producto'}).waitFor();
      await ff('00:06');
      await shot('02-agenda');
      await scrollTo(page, page.getByText('Métricas de activación').first());
      await shot('03-agenda-bloques');

      await page.getByRole('button', {name: 'Editar reunión'}).click();
      await page.getByLabel('Nombre de la reunión').waitFor();
      await scrollTop(page);
      await shot('04-editar-agenda');
      await page.getByRole('button', {name: 'Facilita', exact: true}).click();
      await page.getByPlaceholder('Buscar persona…').waitFor();
      await shot('05-elegir-quien-facilita');
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: 'Listo', exact: true}).click();

      // ── Reunión en vivo (10:00) ──
      await ff('20:00');
      await page.getByRole('button', {name: 'Iniciar reunión'}).first().click();
      const dock = page.getByRole('region', {name: 'Controles de la reunión en curso'});
      await dock.waitFor();
      await ff('03:20');
      await scrollTop(page);
      await shot('06-en-vivo-primer-tema');

      await primary(page, 'Siguiente tema');
      await ff('05:10');
      await primary(page, 'Siguiente bloque');
      await ff('07:45');
      await scrollToBlock(page, 'Onboarding v3: revisión del prototipo');
      await shot('07-en-vivo-bloque-activo');

      await addAgreement(page, 'Probar el paso de verificación con 6 personas antes de cerrar el diseño.', 'Camila Rivas', async () => {
        await shot('08-anotar-acuerdo');
      });
      await primary(page, 'Siguiente tema');
      await ff('06:30');
      await addAgreement(page, 'Explicar por qué pedimos la clave del SII antes de mostrar el campo.', 'Josefina Lagos');
      await primary(page, 'Siguiente tema');
      await ff('04:40');
      await scrollToBlock(page, 'Explicar por qué pedimos la clave del SII antes de mostrar el campo.');
      await shot('09-acuerdos-en-el-bloque');

      await dock.getByRole('button', {name: 'Más acciones de la reunión'}).click();
      await shot('10-acciones-en-vivo');
      await page.keyboard.press('Escape');

      await dock.getByRole('button', {name: 'Pausar reunión'}).click();
      await ff('02:00');
      await shot('11-reunion-en-pausa');
      await dock.getByRole('button', {name: 'Reanudar reunión'}).click();

      await primary(page, 'Siguiente bloque');
      await ff('09:00');
      await primary(page, 'Siguiente tema');
      await ff('08:20');
      await scrollToBlock(page, 'Métricas de activación');
      await shot('12-bloque-con-tiempo-excedido');
      await addAgreement(page, 'Medir el abandono por paso del registro antes del release.', 'Ignacia Vera');

      await primary(page, 'Siguiente bloque');
      await ff('06:10');
      await addAgreement(page, 'Compartir el acta en #producto antes de las 13:00.', 'Tomás Fuentes');

      await dock.getByRole('button', {name: 'Más acciones de la reunión'}).click();
      await page.getByRole('menuitem', {name: 'Terminar reunión'}).click();
      const finish = page.getByRole('dialog', {name: '¿Terminar la reunión?'});
      await finish.waitFor();
      await shot('13-confirmar-termino');
      await finish.getByRole('button', {name: 'Terminar reunión'}).click();

      await page.getByRole('button', {name: 'Guardar acta en Documentos'}).waitFor();
      await ff('00:06');
      await scrollTop(page);
      await shot('14-resumen');
      await scrollTo(page, page.getByText(/Acuerdos \(\d+\)/).first(), 'start');
      await shot('15-resumen-acuerdos');

      await page.getByRole('button', {name: 'Crear tareas'}).click();
      const toCards = page.getByRole('dialog', {name: 'Crear tareas desde los acuerdos'});
      await toCards.getByRole('list', {name: 'Acuerdos'}).waitFor();
      await page.waitForTimeout(500);
      await shot('16-acuerdos-a-tareas');
      await toCards.getByRole('button', {name: /^Crear \d+ tareas?$/}).click();
      await toCards.getByRole('button', {name: 'Ir a Tareas'}).waitFor();
      await shot('17-tareas-creadas');
      await page.keyboard.press('Escape');

      await page.getByRole('button', {name: 'Guardar acta en Documentos'}).click();
      await page.waitForURL(/#doc-/);
      await page.waitForTimeout(800);
      await shot('18-acta-en-documentos', {keepToasts: true});

      await open(page, `${url}/#kanban`, page.getByRole('heading', {name: 'Tareas', level: 1}));
      await ff('00:06');
      await shot('19-tablero-con-acuerdos');

      // Nueva reunión.
      await open(page, `${url}/#planner-new`, page.getByLabel('Nombre de la reunión'));
      await page.getByLabel('Nombre de la reunión').fill('1:1 · Sofía y Tomás');
      await page.getByLabel('Objetivo de la reunión').fill('Seguimiento quincenal: prioridades, bloqueos y crecimiento.');
      await ff('00:06');
      await shot('20-nueva-reunion');
    },
  },
  {
    flow: '04-tareas',
    async run({page, url, shot, ff, isMobile}) {
      await open(page, `${url}/#kanban`, page.getByRole('heading', {name: 'Tareas', level: 1}));
      await shot('01-tablero');
      if (isMobile) {
        await page.getByRole('list', {name: 'Tareas en En curso'}).scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await shot('02-tablero-columna-en-curso');
      }

      await filter(page, 'Mías', isMobile);
      await shot('03-filtro-mis-tareas');
      await filter(page, 'Vencidas', isMobile);
      await shot('04-filtro-vencidas');
      await filter(page, 'Todas', isMobile);
      if (isMobile) await page.getByRole('list', {name: 'Tareas en Por hacer'}).scrollIntoViewIfNeeded();

      await page.getByRole('button', {name: /Abrir tarea #15/}).click();
      const dialog = page.getByRole('dialog', {name: /Tarea #15/});
      await dialog.waitFor();
      await page.waitForTimeout(500);
      await shot('05-detalle-de-tarea');
      await dialog.evaluate(node => {
        for (const element of [node, ...node.querySelectorAll('*')]) {
          if (element.scrollHeight > element.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = element.scrollHeight;
        }
      });
      await page.waitForTimeout(400);
      await shot('06-detalle-subtareas-y-documentos');
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
      await page.waitForURL(/#kanban$/);

      await page.getByRole('button', {name: 'Nueva tarea'}).first().click();
      const input = page.getByPlaceholder('¿Qué hay que hacer?');
      await input.waitFor();
      await input.pressSequentially('Guion del test de cobros', {delay: TYPE_DELAY});
      await shot('07-alta-rapida');
      await input.press('Enter');
      await input.press('Escape');
      await ff('00:02');
      await scrollTop(page);

      await page.getByRole('button', {name: 'Más acciones de la tarea #18'}).click();
      await shot('08-mover-tarea');
      await page.keyboard.press('Escape');

      if (!isMobile) {
        const card = page.locator('[data-card-id="card-18"]');
        const target = page.getByRole('list', {name: 'Tareas en En curso'});
        const from = await card.boundingBox();
        const to = await target.boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + 20);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 20, from.y + 30, {steps: 4});
        await page.mouse.move(to.x + to.width / 2, to.y + 140, {steps: 18});
        await page.waitForTimeout(300);
        await shot('09-arrastrar-tarea', {settle: false});
        await page.mouse.up();
        await page.waitForTimeout(500);
        await shot('10-tarea-movida');
      }

      await page.getByRole('button', {name: 'Más opciones del tablero'}).click();
      await page.getByRole('menuitem', {name: /Etiquetas/}).click();
      await page.getByRole('dialog').waitFor();
      await page.waitForTimeout(400);
      await shot('11-etiquetas');
    },
  },
  {
    flow: '05-ajustes',
    async run({page, url, shot}) {
      await open(page, `${url}/#home`, page.getByRole('heading', {name: 'Lo último en tu espacio'}));
      await page.getByRole('button', {name: 'Ajustes'}).click();
      const dialog = page.getByRole('dialog', {name: 'Ajustes'});
      await dialog.waitFor();
      await page.waitForTimeout(500);
      await shot('01-personal');
      await dialog.getByRole('tab', {name: 'Espacio'}).click();
      await page.waitForTimeout(400);
      await shot('02-espacio');
      await dialog.getByRole('tab', {name: 'Servidor'}).click();
      await page.waitForTimeout(400);
      await shot('03-servidor');
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Ayudas de navegación

async function open(page, href, ready) {
  await page.goto(href);
  await ready.waitFor({timeout: 15_000});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function type(page, text) {
  await page.keyboard.type(text, {delay: TYPE_DELAY});
}

async function slash(page, query) {
  await type(page, `/${query}`);
  await page.locator('.bardo-slash-menu').waitFor();
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}

async function scrollTo(page, locator, block = 'center') {
  await locator.evaluate((node, where) => node.scrollIntoView({block: where, behavior: 'instant'}), block);
  await page.waitForTimeout(400);
}

/** Centra el título de un bloque de la agenda (fuera del dock fijo). */
async function scrollToBlock(page, title) {
  await page.evaluate(text => {
    const dock = document.querySelector('[aria-label="Controles de la reunión en curso"]');
    const match = [...document.querySelectorAll('h2, h3, h4, strong, span, p, div')]
      .find(node => node.children.length === 0 && node.textContent.trim() === text && !dock?.contains(node));
    match?.scrollIntoView({block: 'center', behavior: 'instant'});
  }, title);
  await page.waitForTimeout(400);
}

async function scrollTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach(node => { if (node.scrollTop > 0) node.scrollTop = 0; });
  });
  await page.waitForTimeout(300);
}

async function primary(page, label) {
  const dock = page.getByRole('region', {name: 'Controles de la reunión en curso'});
  await dock.getByRole('button', {name: new RegExp(label)}).click();
  await page.waitForTimeout(450);
}

async function addAgreement(page, text, owner, beforeSave) {
  const dock = page.getByRole('region', {name: 'Controles de la reunión en curso'});
  await dock.getByRole('button', {name: 'Más acciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Anotar acuerdo'}).click();
  const dialog = page.getByRole('dialog', {name: 'Nuevo acuerdo'});
  await dialog.getByLabel('Acuerdo').fill(text);
  await dialog.getByText('Elegir responsable').click();
  await page.getByRole('option', {name: new RegExp(owner)}).first().click();
  await page.waitForTimeout(300);
  if (beforeSave) await beforeSave();
  await dialog.getByRole('button', {name: 'Guardar acuerdo'}).click();
  await dialog.waitFor({state: 'hidden'});
  await page.waitForTimeout(300);
}

async function filter(page, label, isMobile) {
  if (isMobile) {
    await page.getByRole('button', {name: /^Filtrar tareas:/}).click();
    await page.getByRole('menuitemradio', {name: label, exact: true}).click();
  } else {
    await page.locator('[aria-label="Filtrar tareas"]').getByRole('button', {name: label, exact: true}).click();
  }
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────────────────────────────────────

const {server, url} = await serveStatic(DIST);
const T0 = Date.now();
const launch = async () => {
  const instance = await launchBrowser();
    return instance;
};
let browser = null;
const report = [];
if (!PREVIEW && !ONLY) rmSync(OUT, {recursive: true, force: true});

for (const scene of SCENES) {
  if (ONLY && !ONLY.some(prefix => scene.flow.startsWith(prefix))) continue;
  for (const device of DEVICES) {
    for (const theme of THEMES) {
      // Un navegador por flujo: aislado de temporizadores pendientes del anterior.
      browser = await launch();
      const context = await seededContext(browser, {device, theme, ...(PREVIEW ? {scale: 1} : {})});
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = collectErrors(page);
      if (args.verbose) {
        page.on('pageerror', error => console.log('  pageerror:', error.message.slice(0, 4000)));
        page.on('console', message => { if (message.type() === 'error' || /LOOP/.test(message.text())) console.log('  console:', message.text().slice(0, 1200)); });
      }
      const shots = [];
      const ff = time => context.clock.fastForward(time);
      const shot = async (screen, {settle = true, keepToasts = false} = {}) => {
        if (settle) {
          if (!keepToasts) await ff('00:06');
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(500);
        }
        const file = join(OUT, scene.flow, screen, `${DEVICE_LABEL[device]}-${THEME_LABEL[theme]}.png`);
        mkdirSync(dirname(file), {recursive: true});
        await page.screenshot({path: file, animations: 'allow', caret: 'initial'});
        shots.push(screen);
        if (args.verbose) console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] · ${scene.flow}/${screen}`);
      };
      const started = Date.now();
      let failure = null;
      try {
        await scene.run({page, context, url, shot, ff, device, theme, isMobile: device === 'mobile'});
      } catch (error) {
        failure = error.message.split('\n')[0];
        const file = join(OUT, '_fallos', `${scene.flow}-${device}-${theme}.png`);
        mkdirSync(dirname(file), {recursive: true});
        await page.screenshot({path: file}).catch(() => {});
      }
      const entry = {flow: scene.flow, device, theme, shots: shots.length, seconds: Math.round((Date.now() - started) / 1000), failure, errors};
      report.push(entry);
      console.log(`${failure ? '✗' : '✓'} ${scene.flow} · ${device} · ${theme} · ${shots.length} capturas${failure ? ` · ${failure}` : ''}${errors.length ? ` · ${errors.length} errores de consola` : ''}`);
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }
}

mkdirSync(OUT, {recursive: true});
// Con --only se conservan los resultados de los demás flujos.
let previous = [];
try { previous = ONLY ? JSON.parse(readFileSync(join(OUT, 'reporte.json'), 'utf8')) : []; } catch {}
const merged = [...previous.filter(entry => !report.some(item => item.flow === entry.flow && item.device === entry.device && item.theme === entry.theme)), ...report]
  .sort((a, b) => `${a.flow}${a.device}${a.theme}`.localeCompare(`${b.flow}${b.device}${b.theme}`));
writeFileSync(join(OUT, 'reporte.json'), JSON.stringify(merged, null, 2));
server.close();
process.exitCode = report.some(entry => entry.failure) ? 1 : 0;
