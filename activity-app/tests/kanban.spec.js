import {test, expect} from '@playwright/test';

// Tareas (Kanban) de punta a punta en modo local (localStorage).
const MEMBERS = ['Juan Carlos', 'Max Avendaño', 'Anderson', 'Paula Molina'];

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

const isNarrow = page => (page.viewportSize()?.width ?? 1280) < 768;

test.beforeEach(async ({page}) => {
  await page.addInitScript(members => {
    window.__bardoChannelContext = {
      roles: [],
      members: members.map((name, index) => ({id: `u${index}`, username: name.toLowerCase().replace(/ /g, '.'), globalName: name})),
    };
    window.__BARDO_USER__ = {id: 'u1', username: 'max.avendano', global_name: 'Max Avendaño'};
  }, MEMBERS);
  await page.goto('/?theme=dark#kanban');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Tareas', level: 1})).toBeVisible();
});

async function quickAdd(page, titles) {
  await page.getByRole('button', {name: 'Nueva tarea'}).click();
  const input = page.getByPlaceholder('¿Qué hay que hacer?');
  await expect(input).toBeFocused();
  for (const title of titles) {
    await input.fill(title);
    await input.press('Enter');
  }
  await input.press('Escape');
}

async function openColumn(page, name) {
  if (isNarrow(page)) await page.getByRole('tab', {name: new RegExp(`^${name}`)}).click();
}

const column = (page, name) => page.getByRole('list', {name: `Tareas en ${name}`});

test('crear, completar el detalle y que sobreviva a recargar', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await quickAdd(page, ['Preparar presupuesto', 'Revisar contrato']);
  await expect(column(page, 'Por hacer').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', {name: 'Agregar tarea'}).first()).toBeFocused();

  await page.getByRole('button', {name: /Abrir tarea #1/}).click();
  const dialog = page.getByRole('dialog', {name: /Tarea #1/});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Alta', exact: true}).click();
  await dialog.getByRole('button', {name: 'Elegir responsable'}).click();
  await page.getByRole('option', {name: /Anderson/}).click();
  await expect(dialog.getByRole('button', {name: /Responsable: Anderson/})).toBeVisible();
  await dialog.getByLabel('Descripción').fill('Con cifras de finanzas');
  await dialog.getByLabel('Nueva subtarea').fill('Pedir cifras');
  await dialog.getByLabel('Nueva subtarea').press('Enter');
  await dialog.getByRole('checkbox', {name: 'Pedir cifras'}).click();
  await dialog.getByRole('button', {name: 'Elegir fecha límite'}).click();
  await page.getByRole('button', {name: 'Hoy', exact: true}).click();
  await expect(dialog.getByRole('button', {name: /Fecha límite: Hoy/})).toBeVisible();
  await dialog.getByRole('button', {name: 'Listo'}).click();
  await expect(dialog).toBeHidden();

  const card = column(page, 'Por hacer').getByRole('listitem').first();
  await expect(card).toContainText('Alta');
  await expect(card).toContainText('1/1');
  await expect(card).toContainText('Hoy');

  await page.reload();
  await page.getByRole('button', {name: /Abrir tarea #1/}).click();
  const reopened = page.getByRole('dialog', {name: /Tarea #1/});
  await expect(reopened.getByLabel('Descripción')).toHaveValue('Con cifras de finanzas');
  await expect(reopened.getByRole('button', {name: /Responsable: Anderson/})).toBeVisible();
  expect(errors).toEqual([]);
});

test('mover con el teclado desde el asa (escritorio) y con "Mover a" (móvil)', async ({page}) => {
  await quickAdd(page, ['Mover esta']);
  if (isNarrow(page)) {
    await page.getByRole('button', {name: 'Más acciones de la tarea #1'}).click();
    await page.getByRole('menuitem', {name: 'En curso'}).click();
  } else {
    const handle = page.getByRole('button', {name: 'Mover tarea #1'});
    await handle.focus();
    // dnd-kit mide las columnas al tomar la tarjeta; una persona nunca teclea en el mismo milisegundo.
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/está sobre la columna «En curso»/)).toBeAttached();
    await page.keyboard.press('Space');
  }
  await openColumn(page, 'En curso');
  await expect(column(page, 'En curso')).toContainText('Mover esta');
  await page.reload();
  await openColumn(page, 'En curso');
  await expect(column(page, 'En curso')).toContainText('Mover esta');
});

test('columnas: hasta 6, renombrar y eliminar moviendo sus tareas', async ({page}) => {
  await quickAdd(page, ['Tarea viajera']);
  const addColumn = async name => {
    if (isNarrow(page)) {
      await page.getByRole('button', {name: /^Opciones de la columna/}).click();
      await page.getByRole('menuitem', {name: 'Agregar columna'}).click();
    } else {
      await page.getByLabel('Columnas del tablero').getByRole('button', {name: 'Agregar columna'}).click();
    }
    const dialog = page.getByRole('dialog', {name: 'Nueva columna'});
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('button', {name: 'Agregar columna'}).click();
    await expect(dialog).toBeHidden();
  };
  for (const name of ['Revisión', 'Bloqueado', 'QA']) await addColumn(name);
  if (isNarrow(page)) {
    await page.getByRole('button', {name: /^Opciones de la columna/}).click();
    await expect(page.getByRole('menuitem', {name: 'Máximo 6 columnas'})).toBeDisabled();
    await page.keyboard.press('Escape');
  } else {
    await expect(page.getByLabel('Columnas del tablero').getByRole('button', {name: 'Agregar columna'})).toHaveAttribute('aria-disabled', 'true');
  }

  await openColumn(page, 'Por hacer');
  await page.getByRole('button', {name: 'Opciones de la columna Por hacer'}).click();
  await page.getByRole('menuitem', {name: /Renombrar/}).click();
  await page.getByLabel('Nombre', {exact: true}).fill('Pendiente');
  await page.getByRole('button', {name: 'Guardar'}).click();

  await openColumn(page, 'Pendiente');
  await page.getByRole('button', {name: 'Opciones de la columna Pendiente'}).click();
  await page.getByRole('menuitem', {name: 'Eliminar columna'}).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Su tarea se moverá');
  await confirm.getByRole('radio', {name: /Bloqueado/}).click();
  await confirm.getByRole('button', {name: 'Eliminar columna'}).click();
  await openColumn(page, 'Bloqueado');
  await expect(column(page, 'Bloqueado')).toContainText('Tarea viajera');
  await expect(page.getByRole('list', {name: 'Tareas en Pendiente'})).toHaveCount(0);
});

test('filtro "Mías" y archivar con deshacer', async ({page}) => {
  await quickAdd(page, ['Mía', 'De otra persona']);
  await page.getByRole('button', {name: /Abrir tarea #1/}).click();
  const dialog = page.getByRole('dialog', {name: /Tarea #1/});
  await dialog.getByRole('button', {name: 'Elegir responsable'}).click();
  await page.getByRole('option', {name: /Max Avendaño/}).click();
  await dialog.getByRole('button', {name: 'Listo'}).click();

  await page.getByRole('button', {name: 'Mías'}).click();
  await expect(column(page, 'Por hacer').getByRole('listitem')).toHaveCount(1);
  await expect(column(page, 'Por hacer')).toContainText('Mía');
  await page.getByRole('button', {name: 'Quitar filtros'}).click();

  await page.getByRole('button', {name: 'Más acciones de la tarea #2'}).click();
  await page.getByRole('menuitem', {name: 'Archivar tarea'}).click();
  await expect(column(page, 'Por hacer')).not.toContainText('De otra persona');
  await page.getByRole('button', {name: 'Deshacer'}).click();
  await expect(column(page, 'Por hacer')).toContainText('De otra persona');
});

test('la página no se desborda a lo ancho y no tiene scroll vertical vacío', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await quickAdd(page, ['Una tarea con un título bastante largo para ver cómo se corta en pantallas angostas']);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    height: window.innerHeight,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1);
  expect(errors).toEqual([]);
});

test('acuerdos de una reunión → tareas, sin duplicar al repetir', async ({page}) => {
  await page.goto('/?theme=dark#planner');
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await page.getByRole('button', {name: 'Listo'}).click();
  await page.getByRole('button', {name: 'Iniciar reunión'}).first().click();
  await page.getByRole('button', {name: 'Nuevo acuerdo', exact: true}).first().click();
  await page.getByPlaceholder(/Escribe el acuerdo/).fill('Enviar la minuta al equipo');
  await page.getByRole('button', {name: 'Guardar acuerdo'}).click();
  await page.getByRole('button', {name: 'Más acciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Terminar reunión'}).click();
  await page.getByRole('dialog', {name: '¿Terminar la reunión?'}).getByRole('button', {name: 'Terminar reunión'}).click();

  await page.getByRole('button', {name: 'Crear tareas'}).click();
  const dialog = page.getByRole('dialog', {name: 'Crear tareas desde los acuerdos'});
  await expect(dialog).toContainText('Enviar la minuta al equipo');
  await dialog.getByRole('button', {name: 'Crear 1 tarea'}).click();
  await expect(dialog).toContainText('Se creó 1 tarea.');
  await dialog.getByRole('button', {name: 'Cerrar', exact: true}).first().click();

  await page.getByRole('button', {name: 'Crear tareas'}).click();
  await expect(page.getByRole('dialog', {name: 'Crear tareas desde los acuerdos'})).toContainText('Ya es la tarea #1');
  await page.getByRole('dialog', {name: 'Crear tareas desde los acuerdos'}).getByRole('button', {name: 'Cancelar'}).click();

  await page.goto('/?theme=dark#kanban');
  await expect(column(page, 'Por hacer')).toContainText('Enviar la minuta al equipo');
});
