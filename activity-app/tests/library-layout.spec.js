import {test, expect} from '@playwright/test';
import {collectRuntimeErrors, expectLibrary, makeDoc, seedDocs, testDocument} from './docs-helpers.js';

test('library spacing and row geometry stay aligned', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await seedDocs(page, [testDocument, makeDoc({title: 'Segundo documento', body: '<p>Hola.</p>'})], {lastOpenedId: testDocument.id});
  await expect(page.getByText('Continuar lectura', {exact: true})).toBeVisible();
  await expectLibrary(page, 2);
  await expect(page.getByRole('button', {name: 'Archivados (0)'})).toBeVisible();
  // La biblioteca entra con una animación corta: medir con la cabecera ya en su sitio.
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.library-header').getBoundingClientRect().top))).toBe(0);

  const geometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const search = rect('.docs-search');
    const continueHeading = rect('.continue-section .section-title');
    const continueRow = rect('.continue-row');
    const tabs = rect('[aria-label="Mostrar documentos"]');
    const docsList = rect('.docs-list');
    const rows = [...document.querySelectorAll('.doc-row')].map(row => {
      const box = row.getBoundingClientRect();
      const kebab = row.querySelector('[aria-label^="Acciones de"]').getBoundingClientRect();
      return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, kebab: {left: kebab.left, right: kebab.right, top: kebab.top, bottom: kebab.bottom, w: kebab.width, h: kebab.height}};
    });
    return {
      searchBottomToContinueHeading: Math.round(continueHeading.top - search.bottom),
      continueLabelGap: Math.round(continueRow.top - continueHeading.bottom),
      tabsToListGap: Math.round(docsList.top - tabs.bottom),
      // Buscador, "Continuar lectura", pestañas y filas comparten los mismos bordes.
      leftEdges: [search.left, continueHeading.left, continueRow.left, tabs.left, ...rows.map(row => row.left)],
      rightEdges: [search.right, continueRow.right, ...rows.map(row => row.right)],
      rowGaps: rows.slice(1).map((row, index) => Math.round(row.top - rows[index].bottom)),
      rows,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.searchBottomToContinueHeading).toBeGreaterThanOrEqual(24);
  expect(geometry.searchBottomToContinueHeading).toBeLessThanOrEqual(32);
  expect(geometry.continueLabelGap).toBeGreaterThanOrEqual(6);
  expect(geometry.continueLabelGap).toBeLessThanOrEqual(10);
  expect(geometry.tabsToListGap).toBeGreaterThanOrEqual(6);
  expect(geometry.tabsToListGap).toBeLessThanOrEqual(20);
  geometry.leftEdges.forEach(left => expect(Math.abs(left - geometry.leftEdges[0])).toBeLessThanOrEqual(1));
  geometry.rightEdges.forEach(right => expect(Math.abs(right - geometry.rightEdges[0])).toBeLessThanOrEqual(1));
  geometry.rowGaps.forEach(gap => expect(gap).toBeGreaterThanOrEqual(4));
  // El menú de cada fila es un botón táctil dentro de su tarjeta (no un <select> nativo).
  await expect(page.locator('.native-menu select')).toHaveCount(0);
  geometry.rows.forEach(({left, right, top, bottom, kebab}) => {
    expect(kebab.w).toBeGreaterThanOrEqual(32);
    expect(kebab.h).toBeGreaterThanOrEqual(32);
    expect(kebab.left).toBeGreaterThanOrEqual(left);
    expect(kebab.right).toBeLessThanOrEqual(right);
    expect(kebab.top).toBeGreaterThanOrEqual(top);
    expect(kebab.bottom).toBeLessThanOrEqual(bottom);
  });
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
