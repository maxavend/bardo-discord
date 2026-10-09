import {test, expect} from '@playwright/test';
import {
  collectRuntimeErrors,
  expectLibrary,
  openDocFromLibrary,
  placeCaretAfter,
  runToolbarAction,
  seedLocalDocument,
  selectEditorText,
  testDocument,
} from './docs-helpers.js';

const monsterTitle = testDocument.title;
const TOOLBAR_NAME = 'Barra de herramientas del editor';
// Acciones opcionales de la barra, en el orden en que la barra adaptable las deja a la vista.
const OPTIONAL_ACTIONS = ['Lista', 'Lista numerada', 'Lista de tareas', 'Cursiva', 'Enlace', 'Rehacer', 'Subrayado', 'Tachado', 'Código en línea', 'Cita'];
// Inserciones y utilidades que siempre viven en "Ver más".
const ALWAYS_IN_MORE = ['Tabla', 'Nota destacada', 'Desplegable', 'Separador', 'Copiar texto', 'Limpiar formato'];
const TEXT_TYPES = ['Texto', 'Título 1', 'Título 2', 'Título 3', 'Cita', 'Bloque de código'];

test.beforeEach(async ({page}) => {
  await page.goto('/?theme=dark#docs');
  await seedLocalDocument(page);
  await page.reload();
  await expect(page.locator('.library-header')).toContainText('Bardo');
  await expectLibrary(page, 1);
});

function editorToolbar(page) {
  return page.getByRole('toolbar', {name: TOOLBAR_NAME});
}

async function startNewDocument(page) {
  await page.getByRole('button', {name: 'Crear documento'}).first().click();
  await expect(editorToolbar(page)).toBeVisible();
  await expect(page.locator('.editable-body')).toBeVisible();
}

async function finishEditing(page) {
  await page.getByRole('button', {name: 'Listo', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Editar', exact: true})).toBeVisible();
}

/** Controles de la barra realmente visibles, con su geometría y radios. */
function toolbarLayout(page) {
  return page.evaluate(() => {
    const container = document.querySelector('.editor-toolbar-container');
    const toolbar = container.querySelector('[role="toolbar"]');
    const isShown = element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
    const describe = button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        name: button.getAttribute('aria-label'),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
      };
    };
    const controls = [...toolbar.querySelectorAll('button')].filter(isShown).map(describe);
    // Grupos con un solo control a la vista: ese control debe verse como pastilla completa.
    const standalone = [...toolbar.querySelectorAll('[data-slot="toggle-group"], [data-slot="button-group"]')]
      .map(group => [...group.querySelectorAll('button')].filter(isShown))
      .filter(buttons => buttons.length === 1)
      .map(([button]) => describe(button));
    const containerRect = container.getBoundingClientRect();
    return {
      controls,
      standalone,
      names: controls.map(control => control.name),
      overflow: container.scrollWidth - container.clientWidth,
      containerLeft: containerRect.left,
      containerRight: containerRect.right,
      rootClientWidth: document.documentElement.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/** La barra adaptable se recalcula con un ResizeObserver: esperar a que deje de cambiar. */
async function settledToolbarLayout(page) {
  let previous = '';
  await expect.poll(async () => {
    const layout = await toolbarLayout(page);
    const key = `${layout.names.join('|')}:${layout.overflow}:${layout.rootClientWidth}`;
    const settled = key === previous;
    previous = key;
    return settled;
  }, {intervals: [100, 100, 150, 250, 500]}).toBe(true);
  return toolbarLayout(page);
}

function expectToolbarFits(layout) {
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  expect(layout.containerLeft).toBeGreaterThanOrEqual(0);
  expect(layout.containerRight).toBeLessThanOrEqual(layout.rootClientWidth + 0.5);
  const sorted = [...layout.controls].sort((a, b) => a.left - b.left);
  sorted.slice(1).forEach((control, index) => {
    expect(control.left, `${control.name} se superpone con ${sorted[index].name}`).toBeGreaterThanOrEqual(sorted[index].right - 0.5);
  });
}

/** Las acciones opcionales a la vista son siempre un prefijo de la lista de prioridad. */
function visibleOptionalActions(layout) {
  const visible = OPTIONAL_ACTIONS.filter(name => layout.names.includes(name));
  expect(visible).toEqual(OPTIONAL_ACTIONS.slice(0, visible.length));
  return visible;
}

test('visual system, theme and responsive geometry stay coherent', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const search = page.getByRole('textbox', {name: 'Buscar documentos'});
  await expect(search).toBeVisible();
  // La biblioteca entra con una animación corta: medir cuando la cabecera ya está en su sitio.
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.library-header').getBoundingClientRect().top))).toBe(0);
  // Y cuando terminan las animaciones de entrada de sus botones (a mitad de
  // camino miden 31,999… px de alto).
  await expect.poll(() => page.evaluate(() => document.querySelector('.library-header').getAnimations({subtree: true}).every(animation => animation.playState === 'finished'))).toBe(true);

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const group = document.querySelector('.docs-search');
    const header = document.querySelector('.library-header');
    const headerRect = header.getBoundingClientRect();
    const searchRect = group.getBoundingClientRect();
    return {
      accent: root.getPropertyValue('--accent').trim(),
      radius: root.getPropertyValue('--radius').trim(),
      rootTheme: document.documentElement.dataset.theme,
      colorScheme: root.colorScheme,
      scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      groupBackground: getComputedStyle(group).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      groupHeight: searchRect.height,
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      headerTop: headerRect.top,
      headerPosition: getComputedStyle(header).position,
      // Ancho de la página sin el canal reservado para la barra de desplazamiento
      // (html usa scrollbar-gutter: stable; en escritorio son 15 px).
      viewportWidth: document.body.getBoundingClientRect().width,
      contentInset: searchRect.left,
      contentRightInset: document.body.getBoundingClientRect().width - searchRect.right,
      headerTargets: [...header.querySelectorAll('button')].map(button => {
        const rect = button.getBoundingClientRect();
        return {name: button.getAttribute('aria-label'), w: rect.width, h: rect.height};
      }),
    };
  });

  expect(audit.rootTheme).toBe('dark');
  expect(audit.colorScheme).toBe('dark');
  // Los navegadores serializan los tokens OKLCH como lab(): se valida que el token exista.
  expect(audit.accent).not.toBe('');
  expect(audit.radius).not.toBe('');
  expect(audit.scrollOverflow).toBeLessThanOrEqual(0);
  expect(audit.groupHeight).toBeGreaterThanOrEqual(36);
  expect(Math.abs(audit.headerLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(audit.viewportWidth - audit.headerRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(audit.headerTop)).toBeLessThanOrEqual(1);
  expect(audit.headerPosition).toBe('sticky');
  expect(audit.contentInset).toBeGreaterThanOrEqual(12);
  expect(Math.abs(audit.contentInset - audit.contentRightInset)).toBeLessThanOrEqual(1);
  expect(audit.groupBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(audit.groupBackground).not.toBe(audit.bodyBackground);
  expect(audit.headerTargets.map(target => target.name)).toEqual(['Reuniones', 'Subir archivo', 'Crear documento', 'Cambiar a modo claro']);
  expect(audit.headerTargets.every(({w, h}) => w >= 32 && h >= 32), JSON.stringify(audit.headerTargets)).toBeTruthy();

  await search.focus();
  await expect(search).toBeFocused();
  await search.fill('monstruo');
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();
  await search.fill('');

  await openDocFromLibrary(page, monsterTitle);
  await expect(page.locator('.doc-body')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

  const introAlignment = await page.evaluate(() => {
    const title = document.querySelector('h1.doc-title')?.getBoundingClientRect();
    const body = document.querySelector('.doc-body')?.getBoundingClientRect();
    return title && body ? Math.abs(title.left - body.left) : 99;
  });
  expect(introAlignment).toBeLessThanOrEqual(1);

  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900);
  const readerY = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await expect(editorToolbar(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('.doc-topbar')?.getBoundingClientRect().top ?? 99))).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  // La barra queda pegada 8 px bajo la cabecera (cuando termina su animación de entrada).
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('.doc-topbar').getBoundingClientRect();
    const toolbar = document.querySelector('.editor-toolbar-sticky').getBoundingClientRect();
    return Math.round(toolbar.top - header.bottom);
  })).toBe(8);
  const sticky = await page.evaluate(() => ({
    header: document.querySelector('.doc-topbar')?.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    readerY: window.scrollY,
  }));
  expect(Math.abs(sticky.header)).toBeLessThan(2);
  expect(sticky.overflow).toBeLessThanOrEqual(0);
  expect(sticky.readerY).toBeGreaterThan(readerY * 0.3);

  // Medir cuando termina la animación de entrada de la barra (escala .99).
  await expect.poll(() => page.evaluate(() => document.querySelector('.editor-toolbar-sticky').getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
  const layout = await toolbarLayout(page);
  expectToolbarFits(layout);
  expect(layout.controls.every(({width, height}) => width >= 31.5 && height >= 31.5)).toBeTruthy();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Discord theme picks the initial theme and the manual toggle persists', async ({page}) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?theme=light#docs');
  await expectLibrary(page);
  const themeState = () => page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(await themeState()).toEqual({theme: 'light', colorScheme: 'light'});
  await expect(page.getByRole('button', {name: 'Cambiar a modo oscuro'})).toBeVisible();

  await page.goto('/?theme=dark#docs');
  await expectLibrary(page);
  await expect.poll(themeState).toEqual({theme: 'dark', colorScheme: 'dark'});

  // Un solo botón cambia el tema; la elección del usuario manda sobre la de Discord.
  await page.getByRole('button', {name: 'Cambiar a modo claro'}).click();
  await expect.poll(themeState).toEqual({theme: 'light', colorScheme: 'light'});
  await page.reload();
  await expectLibrary(page);
  await expect.poll(themeState).toEqual({theme: 'light', colorScheme: 'light'});
  await expect(page.getByRole('button', {name: 'Cambiar a modo oscuro'})).toBeVisible();
});

test('Discord mobile safe area keeps Bardo chrome below the host header', async ({page}) => {
  // Discord expone la altura de su cabecera nativa en esta variable; fijarla aquí
  // permite probar el contrato en un navegador normal.
  await page.evaluate(() => document.documentElement.style.setProperty('--discord-safe-area-inset-top', '116px'));
  const topbarTop = selector => page.evaluate(sel => document.querySelector(sel)?.getBoundingClientRect().top ?? -1, selector);

  await expect.poll(() => topbarTop('.library-header')).toBe(116);
  await openDocFromLibrary(page, monsterTitle);
  await expect(page.locator('.doc-body')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1400);
  await expect.poll(async () => Math.abs(await topbarTop('.doc-topbar') - 116)).toBeLessThan(2);

  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await expect(page.locator('.editor-toolbar-sticky')).toBeVisible();
  await expect.poll(async () => Math.abs(await topbarTop('.doc-topbar') - 116)).toBeLessThan(2);
  const editorChrome = await page.evaluate(() => ({
    topbarBottom: document.querySelector('.doc-topbar')?.getBoundingClientRect().bottom,
    toolbar: document.querySelector('.editor-toolbar-sticky')?.getBoundingClientRect().top,
  }));
  expect(editorChrome.toolbar).toBeGreaterThan(editorChrome.topbarBottom);
});

test('editor supports undo and redo with the platform shortcut', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await openDocFromLibrary(page, monsterTitle);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.getByRole('button', {name: 'Editar', exact: true}).click();

  const body = page.locator('.editable-body');
  await expect(editorToolbar(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('.editor-toolbar-sticky').getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
  await placeCaretAfter(page, 'Sección 30:');
  await page.keyboard.type(' [undo-redo-smoke]');
  await expect(body).toContainText('Sección 30: [undo-redo-smoke]');

  // Ctrl+Z / Ctrl+Shift+Z (⌘ en macOS), los atajos de deshacer/rehacer de cada plataforma.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body).not.toContainText('[undo-redo-smoke]');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(body).toContainText('[undo-redo-smoke]');

  // Los mismos pasos desde la barra.
  const toolbar = editorToolbar(page);
  await toolbar.getByRole('button', {name: 'Deshacer'}).click();
  await expect(body).not.toContainText('[undo-redo-smoke]');
  if (page.viewportSize().width < 480) {
    // Sin espacio, "Rehacer" vive en "Ver más" (pulsarlo ahí con la página
    // desplazada está cubierto por el test de menús con scroll).
    await expect(toolbar.getByRole('button', {name: 'Rehacer'})).toBeHidden();
    await toolbar.getByRole('button', {name: 'Ver más'}).click();
    await expect(page.getByRole('menuitem', {name: 'Rehacer'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', {name: 'Rehacer'})).toHaveCount(0);
    await body.focus();
    await page.keyboard.press('ControlOrMeta+Shift+Z');
  } else {
    await expect(toolbar.getByRole('button', {name: 'Rehacer'})).toBeEnabled();
    await toolbar.getByRole('button', {name: 'Rehacer'}).click();
  }
  await expect(body).toContainText('[undo-redo-smoke]');
  await expect(toolbar.getByRole('button', {name: 'Deshacer'})).toBeEnabled();

  expectToolbarFits(await toolbarLayout(page));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('editor history covers deletion, formatting and inserted blocks', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run the full editor history matrix once on the representative mobile viewport.');
  const errors = collectRuntimeErrors(page);

  await startNewDocument(page);
  const body = page.locator('.editable-body');
  await body.click();
  await page.keyboard.type('Texto para auditar el historial.');
  await expect(body).toContainText('Texto para auditar el historial.');

  await page.keyboard.press('Shift+ArrowLeft');
  // slate-react adopta la selección del DOM con un throttle de 100 ms; si el borrado
  // llega antes, el historial lo une con lo tecleado (comportamiento de Slate).
  await page.waitForTimeout(150);
  await page.keyboard.press('Backspace');
  await expect(body).not.toContainText('historial.');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body).toContainText('historial.');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(body).not.toContainText('historial.');

  await selectEditorText(page, 'Texto pa');
  await editorToolbar(page).getByRole('button', {name: 'Negrita'}).click();
  await expect(body.locator('strong')).toHaveText('Texto pa');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body.locator('strong')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(body.locator('strong')).toHaveCount(1);

  await placeCaretAfter(page, 'historial');
  await runToolbarAction(page, 'Lista de tareas');
  await expect(body.locator('.slate-action_item')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body.locator('.slate-action_item')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(body.locator('.slate-action_item')).toHaveCount(1);

  await placeCaretAfter(page, 'historial');
  await runToolbarAction(page, 'Separador');
  await expect(body.locator('hr')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(body.locator('hr')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('selected text drives block types and lists; "Ver más" inserts callout and disclosure', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run selection-format coverage once on the representative mobile viewport.');
  const errors = collectRuntimeErrors(page);

  await startNewDocument(page);
  await page.getByLabel('Título', {exact: true}).fill('Formatos');
  const body = page.locator('.editable-body');
  await body.click();
  for (const [index, line] of ['Título seleccionado.', 'Cita seleccionada.', 'Código seleccionado.', 'Tarea seleccionada.', 'Paso numerado.'].entries()) {
    if (index) await page.keyboard.press('Enter');
    // El tecleado sin pausas está cubierto en documentos.spec.js (React #185).
    await page.keyboard.type(line, {delay: 25});
  }

  const textType = editorToolbar(page).getByRole('button', {name: /^Tipo de texto/});
  const applyTextType = async (text, label, {wholeBlock = false} = {}) => {
    await selectEditorText(page, text, {wholeBlock});
    await textType.click();
    await page.getByRole('menuitem', {name: new RegExp(`^${label}`)}).click();
  };

  await applyTextType('Título seleccionado.', 'Título 1', {wholeBlock: true});
  await expect(body.locator('h1')).toHaveText('Título seleccionado.');
  // El selector refleja el tipo del bloque donde está el cursor.
  await placeCaretAfter(page, 'Título seleccionado.');
  await expect(textType).toHaveAccessibleName('Tipo de texto: Título 1');
  await placeCaretAfter(page, 'Cita seleccionada.');
  await expect(textType).toHaveAccessibleName('Tipo de texto: Texto');

  await applyTextType('Cita', 'Cita');
  await expect(body.locator('blockquote')).toHaveText('Cita seleccionada.');

  await applyTextType('Código', 'Bloque de código');
  await expect(body.locator('.slate-code_block')).toHaveText('Código seleccionado.');

  // Una selección parcial convierte el bloque completo.
  await selectEditorText(page, 'Tarea');
  await runToolbarAction(page, 'Lista de tareas');
  await expect(body.locator('.slate-action_item')).toHaveText('Tarea seleccionada.');

  await selectEditorText(page, 'Paso');
  await runToolbarAction(page, 'Lista numerada');
  await expect(body.locator('ol')).toHaveText('Paso numerado.');

  // Nota destacada y Desplegable se insertan como bloques nuevos (no transforman la selección).
  await placeCaretAfter(page, 'Paso numerado.');
  await runToolbarAction(page, 'Nota destacada');
  await expect(body.locator('.slate-callout')).toHaveText('Escribe una nota…');
  await placeCaretAfter(page, 'Escribe una nota…');
  await runToolbarAction(page, 'Desplegable');
  await expect(body.locator('.slate-toggle')).toContainText('Escribe contenido oculto…');

  await finishEditing(page);
  const reader = page.locator('.doc-body');
  await expect(reader.locator('h1')).toHaveText('Título seleccionado.');
  await expect(reader.locator('blockquote')).toHaveText('Cita seleccionada.');
  await expect(reader.locator('pre code')).toHaveText('Código seleccionado.');
  await expect(reader.locator('ul.checklist > li')).toContainText('Tarea seleccionada.');
  await expect(reader.locator('ol > li')).toHaveText('Paso numerado.');
  await expect(reader.locator('.doc-callout')).toHaveText('Escribe una nota…');
  await expect(reader.locator('details.spoiler')).toContainText('Escribe contenido oculto…');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('editor renders checklist, callout and disclosure blocks with their own controls', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run block rendering once on the representative mobile viewport.');

  await startNewDocument(page);
  const body = page.locator('.editable-body');
  await body.click();
  await runToolbarAction(page, 'Lista de tareas');
  await page.keyboard.type('Tarea en el editor');
  const task = body.locator('.checklist-item').filter({hasText: 'Tarea en el editor'});
  await expect(task.getByRole('button', {name: 'Marcar como completado'})).toBeVisible();
  await task.getByRole('button', {name: 'Marcar como completado'}).click();
  await expect(task.getByRole('button', {name: 'Marcar como pendiente'})).toHaveAttribute('aria-pressed', 'true');

  await runToolbarAction(page, 'Nota destacada');
  await expect(body.locator('.doc-callout')).toHaveText('Escribe una nota…');
  await runToolbarAction(page, 'Desplegable');
  await expect(body.locator('.spoiler')).toContainText('Escribe contenido oculto…');
});

test('mobile toolbar fits without horizontal overflow and sends the rest to "Ver más"', async ({page}, testInfo) => {
  test.skip(!['mobile-standard', 'mobile-narrow'].includes(testInfo.project.name), 'Run on the representative mobile viewports.');

  await startNewDocument(page);
  const toolbar = editorToolbar(page);
  const textType = toolbar.getByRole('button', {name: /^Tipo de texto/});
  await expect(textType).toBeVisible();
  await textType.click();
  for (const label of TEXT_TYPES) {
    await expect(page.getByRole('menuitem', {name: new RegExp(`^${label}`)})).toBeVisible();
  }
  await expect(page.getByRole('menuitem')).toHaveCount(TEXT_TYPES.length);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);

  const layout = await settledToolbarLayout(page);
  expectToolbarFits(layout);
  // En móvil el selector de tipo de texto queda en solo ícono, con un área táctil cómoda.
  const textTypeBox = layout.controls.find(control => control.name.startsWith('Tipo de texto'));
  expect(textTypeBox.width).toBeGreaterThanOrEqual(44);
  expect(textTypeBox.width).toBeLessThanOrEqual(72);
  await expect(textType.locator('.mobile-toolbar-label')).toBeHidden();
  expect(layout.names).toEqual(expect.arrayContaining(['Deshacer', 'Negrita', 'Ver más']));
  const visibleOptional = visibleOptionalActions(layout);
  expect(visibleOptional.length).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button', {name: 'Insertar bloque'})).toHaveCount(0);
  await expect(toolbar.getByRole('button', {name: 'Rehacer'})).toBeHidden();
  await expect(toolbar.getByRole('button', {name: 'Enlace'})).toBeHidden();

  await toolbar.getByRole('button', {name: 'Ver más'}).click();
  const overflowPopover = page.locator('.toolbar-dropdown-popover:visible').last();
  await expect(overflowPopover).toBeVisible();
  const openLayout = await toolbarLayout(page);
  expect(openLayout.rootClientWidth).toBe(layout.rootClientWidth);
  expect(Math.abs(openLayout.containerLeft - layout.containerLeft)).toBeLessThanOrEqual(1);

  await expect(overflowPopover).toHaveClass(/scrollbar/);
  await expect(overflowPopover).toHaveCSS('overflow-y', 'auto');
  await expect(overflowPopover).toHaveCSS('overscroll-behavior-y', 'contain');
  const separatorHeights = await overflowPopover.locator('[data-slot="dropdown-menu-separator"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).height));
  expect(separatorHeights.length).toBeGreaterThanOrEqual(2);
  expect(separatorHeights.every(height => height === '1px')).toBeTruthy();
  const popoverBox = await overflowPopover.boundingBox();
  expect(popoverBox.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(layout.rootClientWidth + 0.5);

  const overflowItems = (await overflowPopover.getByRole('menuitem').allTextContents()).map(text => text.trim());
  expect(new Set(overflowItems).size).toBe(overflowItems.length);
  // Cada acción opcional está exactamente en un lugar: en la barra o en "Ver más".
  for (const name of OPTIONAL_ACTIONS) {
    expect(overflowItems.includes(name), `${name} en "Ver más"`).toBe(!visibleOptional.includes(name));
  }
  for (const name of ALWAYS_IN_MORE) expect(overflowItems).toContain(name);
  expect(overflowItems).not.toContain('Bloque de código');
  expect(overflowItems).not.toContain('Negrita');
  expect(overflowItems).toHaveLength(OPTIONAL_ACTIONS.length - visibleOptional.length + ALWAYS_IN_MORE.length);
});

test('adaptive toolbar uses spare width and keeps priorities', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run the responsive transition matrix once.');

  await startNewDocument(page);
  const counts = [];
  // 390/430 px: ver "adaptive toolbar never overflows at common phone widths".
  for (const width of [320, 477, 600, 1024]) {
    await page.setViewportSize({width, height: 800});
    const layout = await settledToolbarLayout(page);
    expectToolbarFits(layout);
    counts.push(visibleOptionalActions(layout).length);
  }
  // Más ancho nunca muestra menos acciones; en escritorio caben todas.
  counts.slice(1).forEach((count, index) => expect(count).toBeGreaterThanOrEqual(counts[index]));
  expect(counts[2]).toBeGreaterThan(counts[0]);
  expect(counts.at(-1)).toBe(OPTIONAL_ACTIONS.length);
  await expect(page.locator('.editor-toolbar-container')).toHaveClass(/editor-toolbar-container-full/);

  // Entre 480 y 760 px el selector de tipo de texto vuelve a mostrar su nombre.
  await page.setViewportSize({width: 600, height: 800});
  await expect(editorToolbar(page).locator('.mobile-toolbar-label')).toBeVisible();

  // Dentro de una tabla aparece su menú y la barra sigue cabiendo en 320 px.
  await page.setViewportSize({width: 320, height: 700});
  await page.locator('.editable-body').click();
  await runToolbarAction(page, 'Tabla');
  const tableMenu = editorToolbar(page).getByRole('button', {name: 'Opciones de tabla'});
  await expect(tableMenu).toBeVisible();
  expectToolbarFits(await settledToolbarLayout(page));
  await tableMenu.click();
  await page.getByRole('menuitem', {name: 'Agregar fila abajo'}).click();
  await expect(page.locator('.editable-body table tr')).toHaveCount(3);
  await tableMenu.click();
  await page.getByRole('menuitem', {name: 'Eliminar tabla'}).click();
  await expect(page.locator('.editable-body table')).toHaveCount(0);
  await expect(tableMenu).toBeHidden();
});

test('adaptive toolbar never overflows at common phone widths', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run once on the representative mobile viewport.');

  // Sin la animación de entrada (que mide con scale .99) el desborde aparece al primer render.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await startNewDocument(page);
  expectToolbarFits(await settledToolbarLayout(page));
  for (const width of [350, 390, 430]) {
    await page.setViewportSize({width, height: 844});
    expectToolbarFits(await settledToolbarLayout(page));
  }
});

test('a control left alone in its toolbar group is a full pill', async ({page}, testInfo) => {
  test.skip(!['mobile-standard', 'mobile-narrow'].includes(testInfo.project.name), 'Run on the representative mobile viewports.');

  await startNewDocument(page);
  const layout = await toolbarLayout(page);
  expect(layout.standalone.map(control => control.name)).toEqual(expect.arrayContaining(['Deshacer', 'Ver más']));
  layout.standalone.forEach(control => {
    expect(control.radii.every(radius => radius === control.radii[0]), `${control.name} debe ser una pastilla completa`).toBeTruthy();
  });
});

test('the text type selector follows a type change without moving the cursor', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run once on the representative mobile viewport.');

  await startNewDocument(page);
  await page.locator('.editable-body').click();
  await page.keyboard.type('Encabezado nuevo');
  const textType = editorToolbar(page).getByRole('button', {name: /^Tipo de texto/});
  await textType.click();
  await page.getByRole('menuitem', {name: /^Título 2/}).click();
  await expect(page.locator('.editable-body h2')).toHaveText('Encabezado nuevo');
  await expect(textType).toHaveAccessibleName('Tipo de texto: Título 2');
});

test('menus opened while scrolled keep the sticky chrome and open on screen', async ({page}, testInfo) => {
  test.skip(!['mobile-standard', 'laptop'].includes(testInfo.project.name), 'Run on one touch and one desktop viewport.');

  await openDocFromLibrary(page, monsterTitle);
  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await expect(editorToolbar(page)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2000));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await editorToolbar(page).getByRole('button', {name: 'Ver más'}).click();
  await expect(page.getByRole('menuitem', {name: 'Limpiar formato'})).toBeInViewport();
  const chrome = await page.evaluate(() => ({
    header: document.querySelector('.editing-route .doc-topbar').getBoundingClientRect().top,
    toolbar: document.querySelector('.editor-toolbar-container').getBoundingClientRect().top,
  }));
  expect(Math.abs(chrome.header)).toBeLessThan(2);
  expect(chrome.toolbar).toBeGreaterThan(0);
  await page.getByRole('menuitem', {name: 'Limpiar formato'}).click();
  await expect(page.getByText('Formato limpiado')).toBeVisible();
});

test('document actions: text preview, markdown download and share outside Discord', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Run the document action flow once.');
  const errors = collectRuntimeErrors(page);

  const row = page.locator('.doc-row').filter({hasText: monsterTitle});
  const openRowActions = async () => {
    await row.getByRole('button', {name: /^Acciones de Stress test/}).click();
    await expect(page.getByRole('menuitem', {name: 'Abrir'})).toBeVisible();
  };

  await openRowActions();
  expect((await page.getByRole('menuitem').allTextContents()).map(text => text.trim()))
    .toEqual(['Abrir', 'Editar', 'Duplicar', 'Copiar texto', 'Compartir en el canal', 'Descargar', 'Archivar documento']);
  await page.getByRole('menuitem', {name: 'Descargar'}).click();
  await expect(page.getByRole('menuitem', {name: 'Texto con formato (.md)'})).toBeVisible();
  // PDF y Word se generan en el servidor: fuera de Discord no se ofrecen.
  await expect(page.getByRole('menuitem', {name: 'PDF (.pdf)'})).toHaveCount(0);
  await expect(page.getByRole('menuitem', {name: 'Word (.docx)'})).toHaveCount(0);
  await page.getByRole('menuitem', {name: 'Ver como texto'}).click();
  const preview = page.getByRole('dialog', {name: 'Texto del documento'});
  await expect(preview).toBeVisible();
  await expect(preview.getByLabel('Texto del documento')).toContainText(monsterTitle);
  await expect(preview.getByLabel('Texto del documento')).toContainText('Sección 30:');
  await expect(preview.getByRole('button', {name: 'Copiar texto'})).toBeVisible();
  await preview.getByRole('button', {name: 'Atrás'}).click();
  await expect(preview).toBeHidden();

  await openRowActions();
  await page.getByRole('menuitem', {name: 'Descargar'}).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', {name: 'Texto con formato (.md)'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Stress-test-Documento-monstruo-de-30-secciones.md');
  const {readFile} = await import('node:fs/promises');
  const markdown = await readFile(await download.path(), 'utf8');
  expect(markdown.startsWith(`# ${monsterTitle}\n`)).toBeTruthy();
  expect(markdown).toContain('Sección 30:');

  await openRowActions();
  await page.getByRole('menuitem', {name: 'Compartir en el canal'}).click();
  await expect(page.getByText('Compartir en el canal solo está disponible dentro de Discord.')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('complete editing and CRUD flow remains functional', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-standard', 'Full behavior matrix runs once; geometry runs in every viewport.');
  const errors = collectRuntimeErrors(page);

  const search = page.getByRole('textbox', {name: 'Buscar documentos'});
  await search.fill('monstruo');
  await openDocFromLibrary(page, monsterTitle);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await expect(page.locator('.editable-body')).toBeVisible();

  await selectEditorText(page, 'Sección 2:');
  await editorToolbar(page).getByRole('button', {name: 'Negrita'}).click();
  await expect(page.locator('.editable-body strong')).toHaveText('Sección 2:');

  await finishEditing(page);
  await expect(page.locator('.doc-body strong')).toHaveText('Sección 2:');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();

  await startNewDocument(page);
  await page.getByLabel('Título', {exact: true}).fill('Prueba de documento');
  await page.getByLabel('Descripción', {exact: true}).fill('Documento creado por el smoke test');
  await page.locator('.editable-body').click();
  await page.keyboard.type('Texto nuevo para validar edición y persistencia.');
  await runToolbarAction(page, 'Lista de tareas');
  await expect(page.locator('.editable-body .slate-action_item')).toHaveCount(1);

  await finishEditing(page);
  await expect(page.locator('h1.doc-title')).toHaveText('Prueba de documento');
  await expect(page.locator('.doc-description')).toHaveText('Documento creado por el smoke test');
  await expect(page.locator('.doc-body ul.checklist > li')).toContainText('Texto nuevo para validar edición y persistencia.');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await search.fill('Prueba de documento');
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();

  const row = page.locator('.doc-row').filter({hasText: 'Prueba de documento'});
  await row.getByRole('button', {name: 'Acciones de Prueba de documento'}).click();
  await page.getByRole('menuitem', {name: 'Duplicar'}).click();
  await expect(page.locator('h1.doc-title')).toHaveText('Prueba de documento (copia)');

  await page.getByRole('button', {name: 'Acciones del documento'}).click();
  await page.getByRole('menuitem', {name: 'Archivar documento'}).click();
  await page.getByRole('alertdialog', {name: 'Archivar documento'}).getByRole('button', {name: 'Archivar', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Archivados (1)'})).toBeVisible();
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();

  await page.getByRole('button', {name: 'Archivados (1)'}).click();
  const archived = page.locator('.doc-row').filter({hasText: 'Prueba de documento (copia)'});
  await archived.getByRole('button', {name: 'Acciones de Prueba de documento (copia)'}).click();
  await page.getByRole('menuitem', {name: 'Eliminar definitivamente'}).click();
  const confirmDelete = page.getByRole('alertdialog', {name: 'Eliminar definitivamente'});
  await expect(confirmDelete).toContainText('no se puede deshacer');
  await confirmDelete.getByRole('button', {name: 'Eliminar definitivamente'}).click();
  await expect(page.getByRole('button', {name: 'Archivados (0)'})).toBeVisible();
  await page.getByRole('button', {name: /^Activos/}).click();
  await page.getByRole('button', {name: 'Limpiar búsqueda'}).click();
  await expectLibrary(page, 2);

  await startNewDocument(page);
  await page.locator('.editable-body').click();
  await page.keyboard.type('enlace');
  await selectEditorText(page, 'enlace');
  await runToolbarAction(page, 'Enlace');
  const linkDialog = page.getByRole('dialog', {name: 'Agregar enlace'});
  await expect(linkDialog).toBeVisible();
  const urlInput = linkDialog.getByLabel('Dirección del enlace');
  await expect(urlInput).toBeFocused();
  const fontSize = await urlInput.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(14);
  await urlInput.fill('example.com');
  await linkDialog.getByRole('button', {name: 'Agregar'}).click();
  await expect(page.locator('.editable-body a[href^="https://example.com"]')).toHaveText('enlace');

  expect(errors, errors.join('\n')).toEqual([]);
});
