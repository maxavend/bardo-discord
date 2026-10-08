import {test, expect} from '@playwright/test';
import {
  collectRuntimeErrors,
  contrastAgainstBackground,
  expectLibrary,
  horizontalOverflow,
  makeDoc,
  openDocFromLibrary,
  placeCaretAfter,
  runToolbarAction,
  seedDocs,
  testDocument,
} from './docs-helpers.js';

// Flujos de Documentos de punta a punta en modo standalone (localStorage).

async function startNewDocument(page) {
  await page.getByRole('button', {name: 'Crear documento'}).first().click();
  await expect(page.locator('.editable-body')).toBeVisible();
}

async function finishEditing(page) {
  await page.getByRole('button', {name: 'Listo', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Editar', exact: true})).toBeVisible();
}

async function openTextPreview(page) {
  await page.getByRole('button', {name: 'Acciones del documento'}).click();
  await page.getByRole('menuitem', {name: 'Descargar'}).click();
  await page.getByRole('menuitem', {name: 'Ver como texto'}).click();
  const dialog = page.getByRole('dialog', {name: 'Texto del documento'});
  await expect(dialog).toBeVisible();
  return dialog;
}

test('crear un documento (título y cuerpo) sobrevive a recargar en cada paso', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, []);
  await expect(page.getByText('Todavía no hay documentos')).toBeVisible();

  await startNewDocument(page);
  await page.getByLabel('Título', {exact: true}).fill('Acta semanal');
  await page.locator('.editable-body').click();
  await page.keyboard.type('Primer punto: revisar presupuesto.');

  // Recargar sin esperar al autoguardado: el borrador privado se conserva.
  await page.reload();
  await expect(page.getByLabel('Título', {exact: true})).toHaveValue('Acta semanal');
  await expect(page.locator('.editable-body')).toContainText('Primer punto: revisar presupuesto.');

  await finishEditing(page);
  await expect(page.locator('h1.doc-title')).toHaveText('Acta semanal');

  // Recargar justo después de crearlo.
  await page.reload();
  await expect(page.locator('h1.doc-title')).toHaveText('Acta semanal');
  await expect(page.locator('.doc-body')).toContainText('Primer punto: revisar presupuesto.');

  // Editar y recargar de inmediato (antes del autoguardado) tampoco pierde el cambio.
  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await placeCaretAfter(page, 'revisar presupuesto.');
  await page.keyboard.type(' Segundo punto.');
  await page.reload();
  await expect(page.locator('.editable-body')).toContainText('Primer punto: revisar presupuesto. Segundo punto.');
  await finishEditing(page);

  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expectLibrary(page, 1);
  await expect(page.locator('.doc-row').filter({hasText: 'Acta semanal'})).toHaveCount(1);
  await expect(page.getByText('Borrador sin terminar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('una lista numerada que empieza en 3 conserva el "3." tras editar y recargar', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const doc = makeDoc({
    title: 'Pasos pendientes',
    body: '<p>Seguimos desde el paso tres.</p><ol start="3"><li>Tercero</li><li>Cuarto</li></ol>',
  });
  await seedDocs(page, [doc]);
  await openDocFromLibrary(page, 'Pasos pendientes');
  await expect(page.locator('.doc-body ol')).toHaveAttribute('start', '3');

  // El editor muestra la misma numeración (antes todo se veía como "1.").
  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  const body = page.locator('.editable-body');
  await expect(body.locator('ol').first()).toHaveAttribute('start', '3');
  await expect(body.locator('ol').nth(1)).toHaveAttribute('start', '4');
  await placeCaretAfter(page, 'Cuarto');
  await page.keyboard.type(' paso');
  await finishEditing(page);

  await page.reload();
  await expect(page.locator('h1.doc-title')).toHaveText('Pasos pendientes');
  const list = page.locator('.doc-body ol');
  await expect(list).toHaveCount(1);
  await expect(list).toHaveAttribute('start', '3');
  await expect(list.locator('li')).toHaveText(['Tercero', 'Cuarto paso']);

  const preview = await openTextPreview(page);
  await expect(preview.getByLabel('Texto del documento')).toContainText('3. Tercero');
  await expect(preview.getByLabel('Texto del documento')).toContainText('4. Cuarto paso');
  expect(errors).toEqual([]);
});

test('una tarea marcada en el lector sigue marcada tras recargar y se lee bien', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const doc = makeDoc({
    title: 'Checklist de lanzamiento',
    body: '<p>Antes de publicar:</p><ul class="checklist"><li>Revisar textos</li><li>Probar en móvil</li></ul>',
  });
  await seedDocs(page, [doc]);
  await openDocFromLibrary(page, 'Checklist de lanzamiento');

  const firstItem = page.locator('.doc-body ul.checklist > li').first();
  await firstItem.getByRole('button', {name: 'Marcar como completado'}).click();
  await expect(firstItem).toHaveClass(/done/);
  await expect(firstItem.getByRole('button', {name: 'Marcar como pendiente'})).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  const reloadedFirst = page.locator('.doc-body ul.checklist > li').first();
  await expect(reloadedFirst).toHaveClass(/done/);
  await expect(reloadedFirst.getByRole('button', {name: 'Marcar como pendiente'})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.doc-body ul.checklist > li').nth(1)).not.toHaveClass(/done/);

  // Tachada y atenuada, pero legible: contraste del texto contra el fondo real.
  const darkContrast = await contrastAgainstBackground(reloadedFirst);
  test.info().annotations.push({type: 'contraste tarea hecha (oscuro)', description: darkContrast.toFixed(2)});
  expect(darkContrast).toBeGreaterThanOrEqual(3);

  // Igual en tema claro.
  await page.getByRole('button', {name: 'Cambiar a modo claro'}).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  const lightContrast = await contrastAgainstBackground(reloadedFirst);
  test.info().annotations.push({type: 'contraste tarea hecha (claro)', description: lightContrast.toFixed(2)});
  expect(lightContrast).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('la búsqueda ignora tildes y no encuentra "bardo" en todos los documentos', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, [
    makeDoc({title: 'Reunión de equipo', body: '<p>Temas de la semana.</p>'}),
    makeDoc({title: 'Plan de marketing', body: '<p>Campaña de otoño.</p>'}),
    makeDoc({title: 'Guía rápida', body: '<p>Cómo usar Bardo en el servidor.</p>'}),
  ]);
  await expectLibrary(page, 3);
  const search = page.getByRole('textbox', {name: 'Buscar documentos'});

  await search.fill('reunion');
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();
  await expect(page.locator('.doc-row')).toHaveCount(1);
  await expect(page.locator('.doc-row')).toContainText('Reunión de equipo');

  await search.fill('REUNIÓN equipo');
  await expect(page.locator('.doc-row')).toHaveCount(1);

  // Todos dicen "Creado en Bardo": eso no es contenido y no debe coincidir.
  await search.fill('bardo');
  await expect(page.getByText('1 resultado', {exact: true})).toBeVisible();
  await expect(page.locator('.doc-row')).toHaveCount(1);
  await expect(page.locator('.doc-row')).toContainText('Guía rápida');

  await search.fill('presupuesto inexistente');
  await expect(page.getByText('Sin resultados')).toBeVisible();
  await page.getByRole('button', {name: 'Limpiar búsqueda'}).first().click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.doc-row')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('archivar actualiza el contador de Archivados sin abrir la pestaña, y restaurar lo devuelve', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, [
    makeDoc({title: 'Informe trimestral', body: '<p>Cifras.</p>'}),
    makeDoc({title: 'Notas sueltas', body: '<p>Ideas.</p>'}),
  ]);
  await expectLibrary(page, 2);
  await expect(page.getByRole('button', {name: 'Archivados (0)'})).toBeVisible();

  const row = page.locator('.doc-row').filter({hasText: 'Informe trimestral'});
  await row.getByRole('button', {name: 'Acciones de Informe trimestral'}).click();
  await page.getByRole('menuitem', {name: 'Archivar documento'}).click();
  const confirm = page.getByRole('alertdialog', {name: 'Archivar documento'});
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', {name: 'Archivar', exact: true}).click();

  const archivedTab = page.getByRole('button', {name: 'Archivados (1)'});
  await expect(archivedTab).toBeVisible();
  await expect(archivedTab).toHaveAttribute('aria-pressed', 'false');
  await expectLibrary(page, 1);
  await expect(row).toHaveCount(0);

  // El contador se mantiene tras recargar.
  await page.reload();
  await expect(page.getByRole('button', {name: 'Archivados (1)'})).toBeVisible();

  await page.getByRole('button', {name: 'Archivados (1)'}).click();
  const archivedRow = page.locator('.doc-row').filter({hasText: 'Informe trimestral'});
  await expect(archivedRow).toContainText('Archivado');
  await archivedRow.getByRole('button', {name: 'Acciones de Informe trimestral'}).click();
  await page.getByRole('menuitem', {name: 'Restaurar documento'}).click();
  await expect(page.getByRole('button', {name: 'Archivados (0)'})).toBeVisible();
  await expect(page.getByText('No hay documentos archivados')).toBeVisible();

  await page.getByRole('button', {name: 'Activos (2)'}).click();
  await expect(page.locator('.doc-row').filter({hasText: 'Informe trimestral'})).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('"Nuevo" con un borrador sin terminar pregunta si continuarlo o empezar uno nuevo', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, [makeDoc({title: 'Documento existente', body: '<p>Hola.</p>'})]);
  await expectLibrary(page, 1);

  await startNewDocument(page);
  await page.getByLabel('Título', {exact: true}).fill('Borrador pendiente');
  await page.locator('.editable-body').click();
  await page.keyboard.type('Ideas a medio escribir');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expectLibrary(page, 1);
  await expect(page.getByText('Borrador sin terminar')).toBeVisible();
  await expect(page.locator('.continue-row').filter({hasText: 'Borrador pendiente'})).toBeVisible();

  await page.getByRole('button', {name: 'Crear documento'}).first().click();
  const choice = page.getByRole('alertdialog', {name: 'Tienes un borrador sin terminar'});
  await expect(choice).toBeVisible();
  await expect(choice).toContainText('Borrador pendiente');
  await expect(choice.getByRole('button', {name: 'Continuar borrador'})).toBeVisible();
  await expect(choice.getByRole('button', {name: 'Empezar uno nuevo'})).toBeVisible();

  await choice.getByRole('button', {name: 'Continuar borrador'}).click();
  await expect(page.getByLabel('Título', {exact: true})).toHaveValue('Borrador pendiente');
  await expect(page.locator('.editable-body')).toContainText('Ideas a medio escribir');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expectLibrary(page, 1);

  await page.getByRole('button', {name: 'Crear documento'}).first().click();
  await page.getByRole('alertdialog', {name: 'Tienes un borrador sin terminar'})
    .getByRole('button', {name: 'Empezar uno nuevo'}).click();
  await expect(page.getByLabel('Título', {exact: true})).toHaveValue('');
  await expect(page.locator('.editable-body')).not.toContainText('Ideas a medio escribir');
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expectLibrary(page, 1);
  await expect(page.getByText('Borrador sin terminar')).toHaveCount(0);

  // Sin borrador, "Nuevo" abre directamente el editor.
  await startNewDocument(page);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('sin desborde horizontal en la biblioteca ni en el editor (incluido 320 px)', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  const wide = makeDoc({
    title: 'Documento con un título larguísimo que no debería empujar nada fuera de la pantalla',
    description: 'Descripción también bastante larga para el encabezado del documento.',
    body: [
      '<p>Enlace sin espacios: https://ejemplo.com/una/ruta/muy/larga/sin/espacios/para/forzar/el/ajuste/de/linea</p>',
      '<table><tbody><tr><th>Columna uno</th><th>Columna dos</th><th>Columna tres</th></tr>',
      '<tr><td>Dato</td><td>Otro dato</td><td>Último dato</td></tr></tbody></table>',
      '<pre><code>const línea = "un bloque de código bastante largo que no cabe en 320 px";</code></pre>',
      '<ul class="checklist"><li>Tarea con texto largo para revisar el ajuste en pantallas angostas</li></ul>',
    ].join(''),
  });
  await seedDocs(page, [wide, testDocument]);
  await expectLibrary(page, 2);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.locator('.doc-row').first().getByRole('button', {name: /^Acciones de/}).click();
  await expect(page.getByRole('menuitem', {name: 'Abrir'})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');

  await openDocFromLibrary(page, wide.title);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', {name: 'Editar', exact: true}).click();
  await expect(page.getByRole('toolbar', {name: 'Barra de herramientas del editor'})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.locator('.editable-body').getByText('Otro dato').click();
  await expect(page.getByRole('button', {name: 'Opciones de tabla'})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', {name: 'Ver más'}).click();
  await expect(page.getByRole('menuitem', {name: 'Limpiar formato'})).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');

  await startNewDocumentFromEditor(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

async function startNewDocumentFromEditor(page) {
  await finishEditing(page);
  await page.getByRole('button', {name: 'Volver a Documentos'}).click();
  await expectLibrary(page);
  await startNewDocument(page);
  await runToolbarAction(page, 'Lista de tareas');
  await page.keyboard.type('Primera tarea en una pantalla angosta');
}

test('escribir varios párrafos seguidos (incluso muy rápido) no lanza errores de React', async ({page}, testInfo) => {
  test.skip(!['mobile-standard', 'laptop'].includes(testInfo.project.name), 'Una vista táctil y una de escritorio bastan.');
  test.fixme(true, 'BUG: con pulsaciones sin pausa (Enter + texto) el editor lanza a menudo React #185 "Maximum update depth exceeded" desde los listeners onChange de Slate/Plate.');
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, []);
  // Tres documentos nuevos con 10 párrafos tecleados sin pausa: el error es intermitente.
  for (let round = 0; round < 3 && errors.length === 0; round += 1) {
    await startNewDocument(page);
    await page.locator('.editable-body').click();
    for (let index = 0; index < 10; index += 1) {
      if (index) await page.keyboard.press('Enter');
      await page.keyboard.type(`Párrafo número ${index + 1} del acta.`);
    }
    await expect(page.locator('.editable-body p')).toHaveCount(10);
    await finishEditing(page);
    await page.getByRole('button', {name: 'Volver a Documentos'}).click();
    await expectLibrary(page, round + 1);
  }
  expect(errors).toEqual([]);
});
