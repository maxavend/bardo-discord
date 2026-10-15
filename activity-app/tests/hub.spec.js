import {test, expect} from '@playwright/test';

// Hub de módulos: pestañas en el header (≥ 768 px) y barra inferior (móvil).
const MODULES = [
  ['Inicio', /#home$/],
  ['Documentos', /#docs$/],
  ['Reuniones', /#planner$/],
  ['Tareas', /#kanban$/],
];

const isNarrow = page => (page.viewportSize()?.width ?? 1280) < 768;

test.beforeEach(async ({page}) => {
  await page.goto('/?theme=dark#home');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('el Hub lleva a cada módulo, marca el actual y la marca no se mueve', async ({page}) => {
  const hub = page.getByRole('navigation', {name: 'Módulos de Bardo'});
  await expect(hub).toHaveCount(1);
  const brand = page.getByRole('button', {name: /^Espacio: /});
  const positions = new Set();
  for (const [label, url] of MODULES) {
    await hub.getByRole('link', {name: label}).click();
    await expect(page).toHaveURL(url);
    await expect(hub.getByRole('link', {name: label})).toHaveAttribute('aria-current', 'page');
    await expect(hub.locator('[aria-current="page"]')).toHaveCount(1);
    const box = await brand.boundingBox();
    positions.add(`${Math.round(box.x)}:${Math.round(box.y)}`);
  }
  expect([...positions]).toHaveLength(1);
});

test('la barra móvil solo aparece en la vista principal de cada módulo', async ({page}) => {
  test.skip(!isNarrow(page), 'barra inferior solo en móvil');
  const bar = page.getByRole('navigation', {name: 'Módulos de Bardo'});
  await expect(bar).toBeVisible();
  await bar.getByRole('link', {name: 'Reuniones'}).click();
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await expect(page.getByPlaceholder('Nombre de la reunión')).toBeVisible();
  await expect(bar).toHaveCount(0);
  await page.getByRole('button', {name: 'Volver', exact: true}).click();
  await expect(page.getByRole('navigation', {name: 'Módulos de Bardo'})).toBeVisible();
  // El contenido nunca queda tapado por la barra.
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.module-hub-bar').getBoundingClientRect();
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = [...document.querySelectorAll('.planner-module-root *')].filter(el => el.getBoundingClientRect().height > 0).at(-1);
    return last ? last.getBoundingClientRect().bottom - bar.top : 0;
  });
  expect(overlap).toBeLessThanOrEqual(0);
});

test('Ajustes: el nombre del espacio se cambia en Espacio y vacío vuelve al predeterminado', async ({page}) => {
  const trigger = page.getByRole('button', {name: /^Espacio: /});
  await expect(trigger).toHaveText('Bardo');
  await trigger.click();
  const dialog = page.getByRole('dialog', {name: 'Ajustes'});
  await expect(dialog.getByRole('tab', {name: 'Espacio'})).toHaveAttribute('aria-selected', 'true');
  await dialog.getByLabel('Nombre del espacio').fill('Equipo Producto');
  await dialog.getByRole('button', {name: 'Guardar'}).click();
  await expect(dialog.getByRole('button', {name: 'Guardar'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveText('Equipo Producto');
  await page.reload();
  await expect(page.getByRole('button', {name: /^Espacio: /})).toHaveText('Equipo Producto');
  await page.getByRole('button', {name: /^Espacio: /}).click();
  await page.getByRole('dialog', {name: 'Ajustes'}).getByLabel('Nombre del espacio').fill('');
  await page.getByRole('dialog', {name: 'Ajustes'}).getByRole('button', {name: 'Guardar'}).click();
  await expect(page.getByRole('dialog', {name: 'Ajustes'}).getByRole('button', {name: 'Guardar'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name: /^Espacio: /})).toHaveText('Bardo');
});

test('Ajustes personales: tema y «Al abrir Bardo» se recuerdan', async ({page}) => {
  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Tareas'}).click();
  await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Ajustes'});
  await dialog.getByRole('button', {name: 'Claro', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await dialog.getByRole('button', {name: 'Lo último que usaste'}).click();
  await page.keyboard.press('Escape');
  await page.goto('/#home');
  await expect(page).toHaveURL(/#kanban$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('el aviso de beta se puede cerrar y no vuelve a aparecer', async ({page}) => {
  const notice = page.getByRole('note', {name: 'Aviso de beta'});
  await expect(notice).toContainText('Bardo está en beta');
  await notice.getByRole('button', {name: 'Cerrar aviso de beta'}).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('note', {name: 'Aviso de beta'})).toHaveCount(0);
});
