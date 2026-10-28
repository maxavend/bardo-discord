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

test('el Hub lleva a cada módulo, marca el actual y ni la marca ni las pestañas se mueven', async ({page}) => {
  const hub = page.getByRole('navigation', {name: 'Módulos de Bardo'});
  await expect(hub).toHaveCount(1);
  const brand = page.locator('.workspace-mark:visible').first();
  const positions = new Set();
  const hubPositions = new Set();
  for (const [label, url] of MODULES) {
    await hub.getByRole('link', {name: label}).click();
    await expect(page).toHaveURL(url);
    await expect(hub.getByRole('link', {name: label})).toHaveAttribute('aria-current', 'page');
    await expect(hub.locator('[aria-current="page"]')).toHaveCount(1);
    const box = await brand.boundingBox();
    positions.add(`${Math.round(box.x)}:${Math.round(box.y)}`);
    const hubBox = await hub.boundingBox();
    hubPositions.add(`${Math.round(hubBox.x)}:${Math.round(hubBox.width)}`);
  }
  expect([...positions]).toHaveLength(1);
  // Escritorio: las pestañas, centradas, quedan en el mismo lugar en todas las vistas.
  if (!isNarrow(page)) expect([...hubPositions]).toHaveLength(1);
});

test('la barra móvil solo aparece en la vista principal de cada módulo', async ({page}) => {
  test.skip(!isNarrow(page), 'barra inferior solo en móvil');
  const bar = page.getByRole('navigation', {name: 'Módulos de Bardo'});
  await expect(bar).toBeVisible();
  await bar.getByRole('link', {name: 'Reuniones'}).click();
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await expect(page.getByPlaceholder('Nombre de la reunión')).toBeVisible();
  await expect(bar).toHaveCount(0);
  await page.getByRole('button', {name: 'Volver a Reuniones'}).click();
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
  const name = page.locator('.workspace-name');
  await expect(name).toHaveText('Bardo');
  await expect(page.getByRole('button', {name: /^Espacio: /})).toHaveCount(0);
  // El menú de perfil abre Ajustes directo en la pestaña del canal.
  const openSpaceSettings = async () => {
    await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
    await page.getByRole('menuitem', {name: /^Este canal/}).click();
    await expect(page.getByRole('dialog', {name: 'Ajustes'}).getByRole('tab', {name: 'Espacio'})).toHaveAttribute('aria-selected', 'true');
  };
  await openSpaceSettings();
  const dialog = page.getByRole('dialog', {name: 'Ajustes'});
  await dialog.getByLabel('Nombre del espacio').fill('Equipo Producto');
  await dialog.getByRole('button', {name: 'Guardar'}).click();
  await expect(dialog.getByRole('button', {name: 'Guardar'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(name).toHaveText('Equipo Producto');
  await page.reload();
  await expect(name).toHaveText('Equipo Producto');
  await openSpaceSettings();
  await page.getByRole('dialog', {name: 'Ajustes'}).getByLabel('Nombre del espacio').fill('');
  await page.getByRole('dialog', {name: 'Ajustes'}).getByRole('button', {name: 'Guardar'}).click();
  await expect(page.getByRole('dialog', {name: 'Ajustes'}).getByRole('button', {name: 'Guardar'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(name).toHaveText('Bardo');
});

test('Ajustes personales: tema y «Al abrir Bardo» se recuerdan', async ({page}) => {
  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Tareas'}).click();
  await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
  await page.getByRole('menuitem', {name: /^Tus preferencias/}).click();
  const dialog = page.getByRole('dialog', {name: 'Ajustes'});
  await dialog.getByRole('button', {name: 'Claro', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await dialog.getByRole('button', {name: 'Lo último que usaste'}).click();
  await page.keyboard.press('Escape');
  await page.goto('/#home');
  await expect(page).toHaveURL(/#kanban$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('el aviso de beta está a mano sin ocupar una franja bajo el header', async ({page}) => {
  await expect(page.getByText('Bardo está en beta')).toHaveCount(0);
  // Escritorio: el chip «Beta»; móvil: el menú del espacio, junto al título.
  if (isNarrow(page)) await page.locator('.workspace-chip').click();
  else await page.getByRole('button', {name: /Bardo está en beta/}).click();
  await expect(page.getByText('Bardo está en beta. Si algo no funciona')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Bardo está en beta. Si algo no funciona')).toHaveCount(0);
});
