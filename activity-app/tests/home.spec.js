import {test, expect} from '@playwright/test';
import {collectRuntimeErrors, makeDoc, seedDocs, horizontalOverflow, contrastAgainstBackground} from './docs-helpers.js';

test('Inicio conecta módulos, documentos recientes y borrador sin perder el historial', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const doc = makeDoc({title: 'Decisiones del equipo', body: '<p>Acuerdo conservado</p>'});
  await seedDocs(page, [doc], {hash: '#home'});
  await page.evaluate(() => localStorage.setItem('bardo.docs.heroui.draft.v1', JSON.stringify({title: 'Pendiente de publicar', body: '<p>Borrador conservado</p>'})));
  await page.reload();
  await expect(page.locator('#home-title')).toBeVisible();
  await page.getByRole('link', {name: /Decisiones del equipo/}).click();
  await expect(page.locator('h1.doc-title')).toHaveText(doc.title);
  await page.goBack();
  await expect(page.locator('#home-title')).toBeVisible();
  await page.getByRole('link', {name: /Pendiente de publicar/}).click();
  await expect(page.getByLabel('Título', {exact: true})).toHaveValue('Pendiente de publicar');
  await expect(page.locator('.editable-body')).toContainText('Borrador conservado');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Inicio'}).click();
  await page.getByRole('link', {name: 'Abrir Reuniones', exact: true}).click();
  await expect(page.getByText('Todavía no hay reuniones')).toBeVisible();
  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Inicio'}).click();
  await expect(page.locator('#home-title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Inicio muestra la reunión creada y abre su agenda correcta', async ({page}) => {
  await seedDocs(page, [], {hash: '#home'});
  await page.getByRole('link', {name: 'Nueva reunión', exact: true}).click();
  await page.getByPlaceholder('Nombre de la reunión').fill('Revisión desde Inicio');
  await page.getByRole('button', {name: 'Listo', exact: true}).click();
  await page.getByRole('button', {name: 'Volver a Reuniones'}).click();
  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Inicio'}).click();
  await page.getByRole('link', {name: /Revisión desde Inicio/}).click();
  await expect(page.locator('.planner-module-root')).toContainText('Revisión desde Inicio');
  await expect(page).toHaveURL(/#planner-agenda$/);
  await page.goBack();
  await expect(page.locator('#home-title')).toBeVisible();
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
  await expect(page.getByRole('status')).toContainText('No pudimos cargar Reuniones');
  await expect(page.getByRole('button', {name: 'Volver a cargar'})).toBeVisible();
  await expect(page.getByRole('link', {name: /Documento largo/})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await contrastAgainstBackground(page.locator('.home-context'))).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path: `/tmp/bardo-home-${test.info().project.name}.png`, fullPage: true, animations: 'disabled'});
  await page.getByRole('link', {name: 'Documentos del canal', exact: true}).focus();
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
  await expect(page.locator('#home-title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Inicio usa títulos naturales sin avisos de copias antiguas', async ({page}) => {
  await page.addInitScript(() => {window.__BARDO_UNOWNED_LOCAL_DATA__ = true;});
  await seedDocs(page, [makeDoc({title: 'Documento del canal'})], {hash: '#home'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.scrollbarGutter = 'stable';
  });
  await expect(page.getByText('Escribe, importa y comparte el trabajo de tu canal.')).toHaveCount(0);
  await expect(page.getByText('Prepara la agenda, reúne al equipo y conserva los acuerdos.')).toHaveCount(0);
  const headings = page.locator('.home-section-heading');
  await expect(headings).toHaveCount(3);
  for (const heading of await headings.all()) {
    await expect(heading.locator('h2')).toHaveCSS('text-transform', 'none');
  }
  await expect(page.getByText('Hay copias antiguas guardadas en este dispositivo')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('Inicio abre los documentos personales y del canal en su espacio', async ({page}) => {
  const channel = makeDoc({title: 'Plan del canal'});
  const personal = makeDoc({title: 'Mis notas privadas', space: 'personal', role: 'owner'});
  await seedDocs(page, [channel, personal], {hash: '#home'});
  const recent = page.getByRole('region', {name: 'Documentos recientes'});
  await expect(recent.getByRole('link', {name: /Plan del canal/})).toBeVisible();
  await expect(recent.getByRole('link', {name: /Mis notas privadas/})).toContainText('Solo tú');
  await recent.getByRole('link', {name: /^Personal/}).click();
  await expect(page).toHaveURL(/#docs-personal$/);
  await expect(page.locator('.doc-row').filter({hasText: personal.title})).toBeVisible();
  await expect(page.locator('.doc-row').filter({hasText: channel.title})).toHaveCount(0);
  await page.getByRole('navigation', {name: 'Espacio de documentos'}).getByRole('link', {name: /Este canal/}).click();
  await expect(page.locator('.doc-row').filter({hasText: channel.title})).toBeVisible();
  await expect(page.locator('.doc-row').filter({hasText: personal.title})).toHaveCount(0);
});

test('el alta rápida de Inicio se consume una vez y se puede pedir de nuevo', async ({page}) => {
  await seedDocs(page, [], {hash: '#home'});
  const navigation = page.getByRole('navigation', {name: 'Módulos de Bardo'});
  await page.getByRole('button', {name: 'Nueva tarea', exact: true}).click();
  const input = page.getByPlaceholder('¿Qué hay que hacer?');
  await expect(input).toBeFocused();
  await input.fill('Tarea creada desde Inicio');
  await input.press('Enter');
  await input.press('Escape');
  await navigation.getByRole('link', {name: 'Inicio', exact: true}).click();
  await navigation.getByRole('link', {name: 'Tareas', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Tareas', level: 1})).toBeVisible();
  await expect(input).toHaveCount(0);
  await navigation.getByRole('link', {name: 'Inicio', exact: true}).click();
  await page.getByRole('button', {name: 'Nueva tarea', exact: true}).click();
  await expect(input).toBeFocused();
});
