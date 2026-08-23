import {test, expect} from '@playwright/test';

const monsterTitle = 'Stress test · Documento monstruo de 30 secciones';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

test.beforeEach(async ({page}) => {
  await page.goto('/#docs');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();
});

test('visual system, theme and responsive geometry stay coherent', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await expect(page.getByText('Recientes · 21', {exact:true})).toBeVisible();
  const search = page.getByPlaceholder('Buscar');
  await expect(search).toBeVisible();

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const input = document.querySelector('input[placeholder="Buscar"]');
    const group = input?.closest('.search-field__group') || input?.parentElement;
    const groupStyle = group ? getComputedStyle(group) : null;
    const bodyStyle = getComputedStyle(document.body);
    const libraryTitle = document.querySelector('.library-title')?.getBoundingClientRect();
    const searchRect = group?.getBoundingClientRect();
    const nativeMenus = [...document.querySelectorAll('.native-menu select')].map(el => el.getBoundingClientRect());
    return {
      accent: root.getPropertyValue('--accent').trim(),
      radius: root.getPropertyValue('--radius').trim(),
      fieldRadius: root.getPropertyValue('--field-radius').trim(),
      fieldBorder: root.getPropertyValue('--field-border').trim(),
      fieldBackground: root.getPropertyValue('--field-background').trim(),
      rootTheme: document.documentElement.dataset.theme,
      scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      groupBackground: groupStyle?.backgroundColor,
      bodyBackground: bodyStyle.backgroundColor,
      groupShadow: groupStyle?.boxShadow,
      groupHeight: searchRect?.height,
      leftDelta: libraryTitle && searchRect ? Math.abs(libraryTitle.left - searchRect.left) : 99,
      nativeMenus: nativeMenus.map(r => ({w:r.width,h:r.height})),
    };
  });

  expect(audit.rootTheme).toBe('dark');
  expect(audit.accent).toContain('57.74%');
  expect(audit.accent).toContain('0.2091');
  expect(audit.accent).toContain('273.85');
  expect(audit.radius).toBe('0.25rem');
  expect(audit.fieldRadius).toBe('0.75rem');
  expect(audit.fieldBorder).toBe('transparent');
  expect(audit.fieldBackground).not.toBe('');
  expect(audit.scrollOverflow).toBeLessThanOrEqual(0);
  expect(audit.groupHeight).toBeGreaterThanOrEqual(44);
  expect(audit.leftDelta).toBeLessThanOrEqual(1);
  expect(audit.groupBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(audit.groupBackground).not.toBe(audit.bodyBackground);
  expect(audit.nativeMenus.every(({w,h}) => w >= 44 && h >= 44)).toBeTruthy();

  await search.focus();
  await expect(search).toBeFocused();
  await search.fill('monstruo');
  await expect(page.getByText('Resultados · 1', {exact:true})).toBeVisible();
  await search.fill('');

  await page.getByRole('button', {name:monsterTitle}).click();
  await expect(page.locator('.doc-title')).toContainText('Stress test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

  const introAlignment = await page.evaluate(() => {
    const title = document.querySelector('.doc-title')?.getBoundingClientRect();
    const body = document.querySelector('.doc-body')?.getBoundingClientRect();
    return title && body ? Math.abs(title.left - body.left) : 99;
  });
  expect(introAlignment).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900);
  const readerY = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', {name:'Editar'}).click();
  await expect(page.getByRole('toolbar', {name:'Formato del documento'})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  const sticky = await page.evaluate(() => ({
    header: document.querySelector('.doc-topbar')?.getBoundingClientRect().top,
    toolbar: document.querySelector('.editor-toolbar-sticky')?.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gap: (document.querySelector('.editor-toolbar-sticky')?.getBoundingClientRect().top ?? 0) - (document.querySelector('.doc-topbar')?.getBoundingClientRect().bottom ?? 0),
    readerY: window.scrollY,
  }));
  expect(Math.abs(sticky.header)).toBeLessThan(2);
  expect(Math.abs(sticky.toolbar - 68)).toBeLessThan(3);
  expect(Math.abs(sticky.gap - 16)).toBeLessThan(3);
  expect(sticky.overflow).toBeLessThanOrEqual(0);
  expect(sticky.readerY).toBeGreaterThan(readerY * 0.3);

  const toolbarTargets = await page.evaluate(() => [...document.querySelectorAll('.editor-toolbar button, .editor-toolbar .native-menu select')].map(el => {
    const r = el.getBoundingClientRect(); return {w:r.width,h:r.height};
  }));
  expect(toolbarTargets.every(({w,h}) => w >= 40 && h >= 40)).toBeTruthy();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('complete editing and CRUD flow remains functional', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Full behavior matrix runs once; geometry runs in every viewport.');
  const errors = collectRuntimeErrors(page);

  const search = page.getByPlaceholder('Buscar');
  await search.fill('monstruo');
  await page.getByRole('button', {name:monsterTitle}).click();
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.getByRole('button', {name:'Editar'}).click();

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
  const rowMenu = row.locator('select');
  await rowMenu.selectOption('duplicate');
  await expect(page.locator('.doc-title')).toContainText('Prueba React HeroUI · copia');

  await page.locator('.doc-topbar select').selectOption('delete');
  await expect(page.getByText('Eliminar documento', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Eliminar'}).click();
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();

  await page.getByRole('button', {name:/Nuevo/}).click();
  await page.locator('.editable-body').click();
  await page.keyboard.type('enlace');
  await page.evaluate(() => {
    const body = document.querySelector('.editable-body');
    const node = body?.firstChild?.firstChild || body?.firstChild;
    if (!node) return;
    const range = document.createRange(); range.selectNodeContents(node);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.locator('.toolbar-native-menu select').selectOption('createLink');
  await expect(page.getByText('Agregar enlace', {exact:true})).toBeVisible();
  const urlInput = page.getByLabel('URL');
  await expect(urlInput).toBeVisible();
  const fieldAudit = await urlInput.evaluate(el => {
    const style = getComputedStyle(el);
    return {fontSize: parseFloat(style.fontSize), bg: style.backgroundColor};
  });
  expect(fieldAudit.fontSize).toBeGreaterThanOrEqual(16);
  await urlInput.fill('https://example.com');
  await page.getByRole('button', {name:'Aplicar'}).click();
  await expect(page.locator('.editable-body a[href="https://example.com/"]')).toHaveCount(1);

  expect(errors, errors.join('\n')).toEqual([]);
});
