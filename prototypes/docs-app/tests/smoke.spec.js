import {test, expect} from '@playwright/test';

const monsterTitle = 'Stress test · Documento monstruo de 30 secciones';

test('Bardo Docs mobile flow stays functional end to end', async ({page}) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/#docs');
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();
  await expect(page.getByText('Recientes · 21', {exact:true})).toBeVisible();
  await expect(page.getByPlaceholder('Buscar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

  await page.getByPlaceholder('Buscar').fill('monstruo');
  await expect(page.getByText('Resultados · 1', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:monsterTitle})).toBeVisible();
  await page.getByPlaceholder('Buscar').fill('');

  await page.getByRole('button', {name:monsterTitle}).click();
  await expect(page.locator('.doc-title')).toContainText('Stress test');
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900);

  await page.getByRole('button', {name:'Editar'}).click();
  await expect(page.getByRole('toolbar', {name:'Formato del documento'})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const sticky = await page.evaluate(() => ({
    header: document.querySelector('.doc-topbar')?.getBoundingClientRect().top,
    toolbar: document.querySelector('.editor-toolbar-sticky')?.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(Math.abs(sticky.header)).toBeLessThan(2);
  expect(Math.abs(sticky.toolbar - 68)).toBeLessThan(3);
  expect(sticky.overflow).toBeLessThanOrEqual(0);

  await page.evaluate(() => {
    const body = document.querySelector('.editable-body');
    const paragraph = body?.querySelector('p');
    const node = [...(paragraph?.childNodes || [])].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 8);
    if (!node) throw new Error('No plain text node available for format test');
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(8, node.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.getByRole('button', {name:'Negrita'}).click();
  expect(await page.evaluate(() => !!document.querySelector('.editable-body p strong'))).toBeTruthy();

  await page.getByRole('button', {name:'Listo'}).click();
  await expect(page.getByRole('button', {name:'Editar'})).toBeVisible();
  await page.getByRole('button', {name:/Docs/}).click();
  await expect(page.getByText('Recientes · 21', {exact:true})).toBeVisible();

  await page.getByRole('button', {name:/Nuevo/}).click();
  await expect(page.getByRole('toolbar', {name:'Formato del documento'})).toBeVisible();
  await page.getByLabel('Título').fill('Prueba React HeroUI');
  await page.getByLabel('Descripción').fill('Documento creado por el smoke test');
  await page.locator('.editable-body').click();
  await page.keyboard.type('Texto nuevo para validar edición y persistencia.');

  await page.getByRole('button', {name:'Insertar bloque'}).click();
  await page.getByText('Checklist', {exact:true}).click();
  await expect(page.locator('.editable-body ul.checklist')).toHaveCount(1);

  await page.getByRole('button', {name:'Listo'}).click();
  await expect(page.locator('.doc-title')).toHaveText('Prueba React HeroUI');
  await page.getByRole('button', {name:/Docs/}).click();
  await page.getByPlaceholder('Buscar').fill('Prueba React HeroUI');
  await expect(page.getByText('Resultados · 1', {exact:true})).toBeVisible();

  const row = page.locator('.doc-row').filter({hasText:'Prueba React HeroUI'});
  await row.locator('select').selectOption('duplicate');
  await expect(page.locator('.doc-title')).toContainText('Prueba React HeroUI · copia');

  await page.locator('.doc-topbar select').selectOption('delete');
  await expect(page.getByText('Eliminar documento', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Eliminar'}).click();
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
