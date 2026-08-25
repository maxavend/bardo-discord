import {test, expect} from '@playwright/test';
import {seedLocalDocument} from './test-fixture.js';

const monsterTitle = 'Stress test · Documento monstruo de 30 secciones';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

test.beforeEach(async ({page}) => {
  await page.goto('/?theme=dark#docs');
  await seedLocalDocument(page);
  await page.reload();
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();
});

test('visual system, theme and responsive geometry stay coherent', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await expect(page.getByText(/Recientes \(\d+\)/, {exact:true})).toBeVisible();
  const search = page.getByPlaceholder('Buscar');
  await expect(search).toBeVisible();

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const input = document.querySelector('input[placeholder="Buscar documentos..."]') || document.querySelector('input[placeholder="Buscar"]');
    const group = input?.closest('[data-slot="input-group"]') || input?.closest('.search-field__group') || input?.parentElement;
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
  // Browsers serialize OKLCH tokens as lab(), so validate the applied token
  // rather than depending on a browser-specific serialization format.
  expect(audit.accent).not.toBe('');
  expect(audit.radius).toBe('.75rem');
  expect(audit.fieldRadius).toBe('.75rem');
  expect(audit.fieldBorder).toBe('transparent');
  expect(audit.fieldBackground).not.toBe('');
  expect(audit.scrollOverflow).toBeLessThanOrEqual(0);
  expect(audit.groupHeight).toBeGreaterThanOrEqual(36);
  expect(audit.leftDelta).toBeLessThanOrEqual(1);
  expect(audit.groupBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(audit.groupBackground).not.toBe(audit.bodyBackground);
  expect(audit.nativeMenus.every(({w,h}) => w >= 44 && h >= 44)).toBeTruthy();

  await search.focus();
  await expect(search).toBeFocused();
  await search.fill('monstruo');
  await expect(page.getByText('Resultados (1)', {exact:true})).toBeVisible();
  await search.fill('');

  await page.locator('.doc-row-main').filter({hasText:monsterTitle}).click();
  await expect(page.locator('.doc-title')).toContainText('Stress test');
  await expect(page.locator('.doc-body')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

  const introAlignment = await page.evaluate(() => {
    const title = document.querySelector('.doc-title')?.getBoundingClientRect();
    const body = document.querySelector('.doc-body')?.getBoundingClientRect();
    return title && body ? Math.abs(title.left - body.left) : 99;
  });
  expect(introAlignment).toBeLessThanOrEqual(1);

  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900);
  const readerY = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', {name:'Editar'}).click();
  await expect(page.getByRole('toolbar', {name:'Editor toolbar'})).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('.doc-topbar')?.getBoundingClientRect().top ?? 0))).toBeLessThan(2);
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

test('Discord theme drives HeroUI without a manual theme toggle', async ({page}) => {
  await page.goto('/?theme=light#docs');
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();

  const lightTheme = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    toggleCount: document.querySelectorAll('[aria-label="Seleccionar tema visual"]').length,
  }));
  expect(lightTheme.theme).toBe('light');
  expect(lightTheme.colorScheme).toBe('light');
  expect(lightTheme.toggleCount).toBe(0);

  await page.goto('/?theme=dark#docs');
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.goto('/#docs');
  await expect(page.getByText('Docs', {exact:true})).toBeVisible();
  await page.evaluate(() => {
    document.body.style.setProperty('--discord-theme', 'dark');
    window.dispatchEvent(new Event('discord-theme-change'));
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
});

test('Discord mobile safe area keeps Bardo chrome below the host header', async ({page}) => {
  // Discord exposes the native Activity header height through this variable.
  // Setting it here makes the contract testable in a normal browser runner.
  await page.evaluate(() => document.documentElement.style.setProperty('--discord-safe-area-inset-top', '116px'));

  await expect(page.getByText('Continuar lectura', {exact:true})).toBeVisible();
  await page.locator('.doc-row-main').filter({hasText:monsterTitle}).click();
  await expect(page.locator('.doc-topbar')).toBeVisible();
  await expect(page.locator('.doc-body')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1400);

  await expect.poll(() => page.evaluate(() => Math.abs((document.querySelector('.doc-topbar')?.getBoundingClientRect().top ?? 0) - 116))).toBeLessThan(2);

  await page.getByRole('button', {name:'Editar'}).click();
  await expect(page.locator('.editor-toolbar-sticky')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs((document.querySelector('.doc-topbar')?.getBoundingClientRect().top ?? 0) - 116))).toBeLessThan(2);
  const editorChrome = await page.evaluate(() => ({
    topbar: document.querySelector('.doc-topbar')?.getBoundingClientRect().top,
    toolbar: document.querySelector('.editor-toolbar-sticky')?.getBoundingClientRect().top,
  }));
  expect(editorChrome.toolbar ?? 0).toBeGreaterThan(editorChrome.topbar ?? 0);
});

test('editor supports undo and redo with the platform shortcut', async ({page}, testInfo) => {
  await page.locator('.doc-row-main').filter({hasText:monsterTitle}).click();
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.getByRole('button', {name:'Editar'}).click();

  const body = page.locator('.editable-body');
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' [undo-redo-smoke]');
  await expect(body).toContainText('[undo-redo-smoke]');

  await page.keyboard.press('Control+Z');
  await expect(body).not.toContainText('[undo-redo-smoke]');

  await page.keyboard.press('Control+Y');
  await expect(body).toContainText('[undo-redo-smoke]');
  await expect(page.getByRole('button', {name:'Deshacer'})).toBeVisible();
  if (testInfo.project.name === 'mobile-narrow') {
    await expect(page.getByRole('button', {name:'Rehacer'})).toHaveCount(0);
    await page.getByRole('button', {name:'Ver más'}).click();
    await expect(page.getByRole('menuitem', {name:'Rehacer'})).toBeVisible();
    await page.mouse.click(5, 5);
  } else {
    await expect(page.getByRole('button', {name:'Rehacer'})).toBeVisible();
  }
  await expect(page.getByLabel('Ver más')).toBeVisible();
  const toolbarMetrics = await page.evaluate(() => {
    const toolbar = document.querySelector('.editor-toolbar-container');
    return toolbar ? {scrollWidth: toolbar.scrollWidth, clientWidth: toolbar.clientWidth} : null;
  });
  expect(toolbarMetrics).not.toBeNull();
  expect(toolbarMetrics.scrollWidth).toBeLessThanOrEqual(toolbarMetrics.clientWidth + 1);
});

test('editor history covers deletion, formatting and inserted blocks', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run the full editor history matrix once on the representative mobile viewport.');

  await page.getByRole('button', {name:/Nuevo/}).click();
  const body = page.locator('.editable-body');
  await body.click();
  await page.keyboard.type('Texto para auditar el historial.');
  await expect(body).toContainText('Texto para auditar el historial.');

  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect(body).toContainText('historial');
  await page.keyboard.press('Control+Z');
  await expect(body).toContainText('historial.');
  await page.keyboard.press('Control+Y');
  await expect(body).not.toContainText('historial.');

  await body.click();
  await page.evaluate(() => {
    const body = document.querySelector('.editable-body');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && node.textContent.trim().length <= 8) node = walker.nextNode();
    if (!node) throw new Error('No editable text node available');
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(8, node.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(50);
  await page.getByRole('button', {name:'Negrita'}).click();
  await expect(body.locator('strong')).toHaveCount(1);
  await body.focus();
  await page.keyboard.press('Control+Z');
  await expect(body.locator('strong')).toHaveCount(0);
  await page.keyboard.press('Control+Y');
  await expect(body.locator('strong')).toHaveCount(1);

  await body.focus();
  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Lista de tareas'}).click();
  await expect(body.locator('ul.checklist')).toHaveCount(1);
  await body.focus();
  await page.keyboard.press('Control+Z');
  await expect(body.locator('ul.checklist')).toHaveCount(0);
  await page.keyboard.press('Control+Y');
  await expect(body.locator('ul.checklist')).toHaveCount(1);
});

test('selected text drives block, callout, disclosure and checklist formats', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run selection-format coverage once on the representative mobile viewport.');

  const selectText = async (text, {wholeBlock = false} = {}) => {
    await page.evaluate(({text: targetText, wholeBlock: selectWholeBlock}) => {
      const body = document.querySelector('.editable-body');
      const block = [...body.querySelectorAll('p, h1, h2, h3')].find(element => element.textContent.includes(targetText));
      if (!block) throw new Error(`Could not find block containing: ${targetText}`);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent.includes(targetText)) node = walker.nextNode();
      if (!node) throw new Error(`Could not find text node containing: ${targetText}`);
      const range = document.createRange();
      if (selectWholeBlock) range.selectNodeContents(block);
      else {
        const start = node.textContent.indexOf(targetText);
        range.setStart(node, start);
        range.setEnd(node, start + targetText.length);
      }
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    }, {text, wholeBlock});
  };

  const startNew = async () => {
    await page.goto('/?theme=dark#docs');
    await expect(page.getByText('Docs', {exact:true})).toBeVisible();
    await page.getByRole('button', {name:/Nuevo/}).click();
    await expect(page.locator('.editable-body')).toBeVisible();
  };

  const typeAndSelect = async (text, options) => {
    const body = page.locator('.editable-body');
    await body.click();
    await page.keyboard.type(text);
    await selectText(text, options);
    return body;
  };

  await startNew();
  let body = await typeAndSelect('Texto parcial para destacar.', {wholeBlock: false});
  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Destacado'}).click();
  await expect(body.locator('.doc-callout')).toContainText('Texto parcial para destacar.');

  await startNew();
  body = await typeAndSelect('Contenido de lista desplegable.', {wholeBlock: true});
  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Lista desplegable'}).click();
  await expect(body.locator('details.spoiler')).toContainText('Contenido de lista desplegable.');

  await startNew();
  body = await typeAndSelect('Tarea seleccionada.', {wholeBlock: false});
  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Lista de tareas'}).click();
  await expect(body.locator('ul.checklist > li')).toContainText('Tarea seleccionada.');

  await startNew();
  body = await typeAndSelect('Título seleccionado.', {wholeBlock: true});
  await page.getByRole('button', {name:'Tipo de texto'}).click();
  await page.getByRole('menuitem', {name:'Encabezado 1'}).click();
  await expect(body.locator('h1')).toContainText('Título seleccionado.');
});

test('mobile toolbar keeps text width and sends overflow to kebab', async ({page}, testInfo) => {
  test.skip(!['mobile-standard', 'mobile-narrow'].includes(testInfo.project.name), 'Run on the representative mobile viewports.');

  await page.getByRole('button', {name:/Nuevo/}).click();
  await expect(page.getByRole('button', {name:'Tipo de texto'})).toBeVisible();
  await page.getByRole('button', {name:'Tipo de texto'}).click();
  const textFormatItems = await page.getByRole('menuitem').allTextContents();
  expect(textFormatItems).toContain('Cita');
  expect(textFormatItems).toContain('Bloque de código');
  expect(textFormatItems).not.toContain('Lista de tareas');
  await page.mouse.click(5, 5);
  const metrics = await page.evaluate(() => {
    const textButton = document.querySelector('button[aria-label="Tipo de texto"]');
    const toolbar = document.querySelector('.editor-toolbar-container');
    return {
      rootClientWidth: document.documentElement.clientWidth,
      toolbarLeft: toolbar?.getBoundingClientRect().left || 0,
      textWidth: textButton?.getBoundingClientRect().width || 0,
      overflow: (toolbar?.scrollWidth || 0) - (toolbar?.clientWidth || 0),
      toolbarWidth: toolbar?.clientWidth || 0,
      standaloneRadii: ['.mobile-history-group .button:first-child', '.mobile-more-trigger'].map(selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      }),
      children: [...document.querySelector('.editor-toolbar-container .toolbar')?.children || []].map(el => ({aria:el.getAttribute('aria-label'), width:el.getBoundingClientRect().width, display:getComputedStyle(el).display})),
    };
  });
  expect(metrics.textWidth).toBeGreaterThanOrEqual(120);
  expect(metrics.textWidth).toBeLessThanOrEqual(200);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  if (testInfo.project.name === 'mobile-narrow') {
    expect(metrics.standaloneRadii.every(radii => radii.every(radius => radius === radii[0]))).toBeTruthy();
  } else {
    expect(metrics.standaloneRadii[1].every(radius => radius === metrics.standaloneRadii[1][0])).toBeTruthy();
  }
  expect(await page.locator('.editor-toolbar-container .toolbar').evaluate(element => getComputedStyle(element).gap)).toBe('8px');
  await expect(page.getByRole('button', {name:'Insertar bloque'})).toHaveCount(0);
  if (testInfo.project.name === 'mobile-narrow') {
    await expect(page.getByRole('button', {name:'Rehacer'})).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', {name:'Rehacer'})).toBeVisible();
  }
  await expect(page.getByRole('button', {name:'Enlace'})).toHaveCount(0);

  await page.getByRole('button', {name:'Ver más'}).click();
  const openMetrics = await page.evaluate(() => {
    const toolbar = document.querySelector('.editor-toolbar-container');
    return {
      rootClientWidth: document.documentElement.clientWidth,
      toolbarLeft: toolbar?.getBoundingClientRect().left || 0,
    };
  });
  expect(openMetrics.rootClientWidth).toBe(metrics.rootClientWidth);
  expect(Math.abs(openMetrics.toolbarLeft - metrics.toolbarLeft)).toBeLessThanOrEqual(1);
  const overflowPopover = page.locator('.toolbar-dropdown-popover:visible').last();
  const overflowMenu = overflowPopover.locator('[data-slot="dropdown-menu"]');
  const overflowItems = await overflowMenu.getByRole('menuitem').allTextContents();
  await expect(overflowPopover).toHaveClass(/scrollbar/);
  await expect(overflowPopover).toHaveCSS('overflow-y', 'auto');
  await expect(overflowPopover).toHaveCSS('overscroll-behavior-y', /contain|auto/);
  await expect(overflowMenu.locator('[data-slot="separator"]')).toHaveCount(3);
  const separatorHeights = await overflowMenu.locator('[data-slot="separator"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).height));
  expect(separatorHeights).toEqual(['1px', '1px', '1px']);
  expect(overflowItems).toContain('Tachado');
  expect(overflowItems).toContain('Código en línea');
  expect(overflowItems).toContain('Lista con viñetas');
  expect(overflowItems).toContain('Lista numerada');
  expect(overflowItems).not.toContain('Cita');
  expect(overflowItems).toContain('Destacado');
  expect(overflowItems).toContain('Lista desplegable');
  expect(overflowItems).toContain('Lista de tareas');
  expect(overflowItems).not.toContain('Bloque de código');
  expect(overflowItems).toContain('Separador');
  expect(overflowItems).toContain('Copiar texto');
  expect(overflowItems).toContain('Limpiar formato');
  if (testInfo.project.name === 'mobile-narrow') {
    expect(overflowItems).toContain('Rehacer');
  } else {
    expect(overflowItems).not.toContain('Rehacer');
  }
  expect(overflowItems).toContain('Enlace');
  if (testInfo.project.name === 'mobile-narrow') {
    expect(overflowItems).toContain('Cursiva');
    expect(overflowItems).toContain('Subrayado');
  }
  expect(new Set(overflowItems).size).toBe(overflowItems.length);
});

test('adaptive toolbar uses spare width and rounds a standalone group control', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run the responsive transition matrix once.');

  await page.setViewportSize({width: 600, height: 800});
  await page.getByRole('button', {name:/Nuevo/}).click();
  await expect(page.getByRole('radio', {name:'Lista con viñetas'})).toBeVisible();
  await expect(page.getByRole('radio', {name:'Lista numerada'})).toHaveCount(0);

  const wideMetrics = await page.evaluate(() => {
    const toolbar = document.querySelector('.editor-toolbar-container');
    const listButton = document.querySelector('[aria-label="Lista con viñetas"]');
    const style = getComputedStyle(listButton);
    return {
      overflow: toolbar.scrollWidth - toolbar.clientWidth,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
    };
  });
  expect(wideMetrics.overflow).toBeLessThanOrEqual(1);
  expect(wideMetrics.radii.every(radius => radius === wideMetrics.radii[0])).toBeTruthy();

  await page.setViewportSize({width: 477, height: 800});
  await expect(page.getByRole('button', {name:'Cursiva'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Subrayado'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Enlace'})).toBeVisible();
  const compactMetrics = await page.evaluate(() => {
    const toolbar = document.querySelector('.editor-toolbar-container');
    const textButton = document.querySelector('[aria-label="Tipo de texto"]');
    return {
      overflow: toolbar.scrollWidth - toolbar.clientWidth,
      textWidth: textButton.getBoundingClientRect().width,
    };
  });
  expect(compactMetrics.overflow).toBeLessThanOrEqual(1);
  expect(compactMetrics.textWidth).toBeGreaterThanOrEqual(120);
  expect(compactMetrics.textWidth).toBeLessThanOrEqual(200);
});

test('complete editing and CRUD flow remains functional', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Full behavior matrix runs once; geometry runs in every viewport.');
  const errors = collectRuntimeErrors(page);

  const search = page.getByPlaceholder('Buscar');
  await search.fill('monstruo');
  await page.locator('.doc-row-main').filter({hasText:monsterTitle}).click();
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.getByRole('button', {name:'Editar'}).click();
  await expect(page.locator('.editable-body')).toBeVisible();

  await page.evaluate(() => {
    const body = document.querySelector('.editable-body');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && node.textContent.trim().length <= 8) node = walker.nextNode();
    if (!node) throw new Error('No plain text node available for format test');
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(8, node.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(50);
  await page.getByRole('button', {name:'Negrita'}).click();
  expect(await page.evaluate(() => !!document.querySelector('.editable-body p strong'))).toBeTruthy();

  await page.getByRole('button', {name:/Guardar|Listo/}).click();
  await expect(page.getByRole('button', {name:'Editar'})).toBeVisible();
  await page.getByRole('button', {name:/Docs/}).click();
  await expect(page.getByText('Resultados (1)', {exact:true})).toBeVisible();

  await page.getByRole('button', {name:/Nuevo/}).click();
  await expect(page.getByRole('toolbar', {name:'Editor toolbar'})).toBeVisible();
  await page.getByLabel('Título').fill('Prueba React HeroUI');
  await page.getByLabel('Descripción').fill('Documento creado por el smoke test');
  await page.locator('.editable-body').click();
  await page.keyboard.type('Texto nuevo para validar edición y persistencia.');

  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Lista de tareas'}).click();
  await expect(page.locator('.editable-body ul.checklist')).toHaveCount(1);

  await page.getByRole('button', {name:/Guardar|Listo/}).click();
  await expect(page.locator('.doc-title')).toHaveText('Prueba React HeroUI');
  await page.getByRole('button', {name:/Docs/}).click();
  await page.getByPlaceholder('Buscar').fill('Prueba React HeroUI');
  await expect(page.getByText('Resultados (1)', {exact:true})).toBeVisible();

  const row = page.locator('.doc-row').filter({hasText:'Prueba React HeroUI'});
  await row.getByRole('button', {name:/Acciones de Prueba React HeroUI/}).click();
  await page.getByRole('menuitem', {name:'Duplicar'}).click();
  await expect(page.locator('.doc-title')).toContainText('Prueba React HeroUI · copia');

  await page.getByRole('button', {name:'Acciones del documento'}).click();
  await page.getByRole('menuitem', {name:'Eliminar'}).click();
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
  await page.getByRole('button', {name:'Ver más'}).click();
  await page.getByRole('menuitem', {name:'Enlace'}).click();
  await expect(page.getByText('Agregar enlace', {exact:true})).toBeVisible();
  const urlInput = page.getByLabel('URL');
  await expect(urlInput).toBeVisible();
  const fieldAudit = await urlInput.evaluate(el => {
    const style = getComputedStyle(el);
    return {fontSize: parseFloat(style.fontSize), bg: style.backgroundColor};
  });
  expect(fieldAudit.fontSize).toBeGreaterThanOrEqual(14);
  await urlInput.fill('https://example.com');
  await page.getByRole('button', {name:'Aplicar'}).click();
  await expect(page.locator('.editable-body a[href*="example.com"]')).toHaveCount(1);

  expect(errors, errors.join('\n')).toEqual([]);
});
