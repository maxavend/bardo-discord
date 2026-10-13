import {test, expect} from '@playwright/test';
import {collectRuntimeErrors, makeDoc, seedDocs, horizontalOverflow, contrastAgainstBackground} from './docs-helpers.js';

test('Inicio conecta módulos, documentos recientes y borrador sin perder el historial', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const doc = makeDoc({title: 'Decisiones del equipo', body: '<p>Acuerdo conservado</p>'});
  await seedDocs(page, [doc], {hash: '#home'});
  await page.evaluate(() => localStorage.setItem('bardo.docs.heroui.draft.v1', JSON.stringify({title: 'Pendiente de publicar', body: '<p>Borrador conservado</p>'})));
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Tu espacio en Bardo'})).toBeVisible();
  await page.getByRole('link', {name: /Decisiones del equipo/}).click();
  await expect(page.locator('h1.doc-title')).toHaveText(doc.title);
  await page.goBack();
  await expect(page.getByRole('heading', {name: 'Tu espacio en Bardo'})).toBeVisible();
  await page.getByRole('link', {name: /Pendiente de publicar/}).click();
  await expect(page.getByLabel('Título', {exact: true})).toHaveValue('Pendiente de publicar');
  await expect(page.locator('.editable-body')).toContainText('Borrador conservado');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await page.getByRole('link', {name: 'Bardo · Inicio'}).click();
  await page.getByRole('link', {name: 'Abrir Reuniones', exact: true}).click();
  await expect(page.getByText('Todavía no hay reuniones')).toBeVisible();
  await page.getByRole('link', {name: 'Bardo · Inicio'}).click();
  await expect(page.getByRole('heading', {name: 'Tu espacio en Bardo'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('Inicio muestra la reunión creada y abre su agenda correcta', async ({page}) => {
  await seedDocs(page, [], {hash: '#home'});
  await page.getByRole('link', {name: 'Nueva reunión', exact: true}).click();
  await page.getByPlaceholder('Nombre de la reunión').fill('Revisión desde Inicio');
  await page.getByRole('button', {name: 'Listo', exact: true}).click();
  await page.getByRole('button', {name: 'Volver', exact: true}).click();
  await page.getByRole('link', {name: 'Bardo · Inicio'}).click();
  await page.getByRole('link', {name: /Revisión desde Inicio/}).click();
  await expect(page.locator('.planner-module-root')).toContainText('Revisión desde Inicio');
  await expect(page).toHaveURL(/#planner-agenda$/);
  await page.goBack();
  await expect(page.getByRole('heading', {name: 'Tu espacio en Bardo'})).toBeVisible();
  await page.getByRole('link', {name: /Revisión desde Inicio/}).click();
  await page.reload();
  await expect(page.locator('.planner-module-root')).toContainText('Revisión desde Inicio');
});

test('Inicio vacío, errores parciales y títulos largos mantienen navegación, contraste y ancho', async ({page}) => {
  await seedDocs(page, [], {hash: '#home'});
  await expect(page.getByText(/Todavía no hay documentos/)).toBeVisible();
  await expect(page.getByText(/Todavía no hay reuniones/)).toBeVisible();
  const title = 'Documento largo '.repeat(25);
  await seedDocs(page, [makeDoc({title})], {hash: '#home'});
  await page.evaluate(() => {
    window.__bardoHomeStatus = {planner: 'error', docs: 'ready'};
    window.dispatchEvent(new Event('bardo-home-status'));
  });
  await expect(page.getByRole('status')).toContainText('No pudimos actualizar Reuniones');
  await expect(page.getByRole('button', {name: 'Reintentar conexión'})).toBeVisible();
  await expect(page.getByRole('link', {name: /Documento largo/})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await contrastAgainstBackground(page.locator('.home-context'))).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path: `/tmp/bardo-home-${test.info().project.name}.png`, fullPage: true, animations: 'disabled'});
  await page.getByRole('link', {name: 'Abrir Documentos', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', {name: 'Buscar documentos'})).toBeVisible();
});

test('Inicio respeta reduced motion y el zoom por aumento de texto', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await seedDocs(page, [makeDoc({title: 'Documento accesible'})], {hash: '#home'});
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('link', {name: 'Abrir Reuniones', exact: true}).focus();
  await expect(page.getByRole('link', {name: 'Abrir Reuniones', exact: true})).toBeFocused();
  const hasMotion = await page.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().duration > 1));
  expect(hasMotion).toBe(false);
});

test('una URL dañada recupera Inicio sin bloquear la aplicación', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await page.goto('/?theme=dark#%E0%A4%A');
  await expect(page.getByRole('heading', {name: 'Tu espacio en Bardo'})).toBeVisible();
  expect(errors).toEqual([]);
});
