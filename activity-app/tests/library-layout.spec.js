import {test, expect} from '@playwright/test';
import {seedLocalDocument} from './test-fixture.js';

test('library spacing and row geometry stay aligned', async ({page}) => {
  await page.goto('/#docs');
  await seedLocalDocument(page);
  await page.reload();
  await expect(page.getByText('Continuar lectura', {exact:true})).toBeVisible();
  await expect(page.getByText(/Recientes \(\d+\)/, {exact:true})).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const searchGroup = document.querySelector('.docs-search .search-field__group')?.getBoundingClientRect();
    const continueTitle = rect('.continue-copy strong');
    const firstRecentTitle = rect('.doc-row-main strong');
    const continueHeading = rect('.continue-section .section-title');
    const continueRow = rect('.continue-row');
    const recentHeading = rect('.recent-section .section-title');
    const docsList = rect('.docs-list');
    const kebab = rect('.native-menu-visual');

    return {
      searchBottomToContinueHeading: searchGroup && continueHeading ? continueHeading.top - searchGroup.bottom : -1,
      continueLabelGap: continueHeading && continueRow ? continueRow.top - continueHeading.bottom : -1,
      recentLabelGap: recentHeading && docsList ? docsList.top - recentHeading.bottom : -1,
      rowTitleDelta: continueTitle && firstRecentTitle ? Math.abs(continueTitle.left - firstRecentTitle.left) : 99,
      kebabSize: kebab ? {w:kebab.width,h:kebab.height} : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.searchBottomToContinueHeading).toBeGreaterThanOrEqual(24);
  expect(geometry.searchBottomToContinueHeading).toBeLessThanOrEqual(32);
  expect(geometry.continueLabelGap).toBeGreaterThanOrEqual(6);
  expect(geometry.continueLabelGap).toBeLessThanOrEqual(10);
  expect(geometry.recentLabelGap).toBeGreaterThanOrEqual(6);
  expect(geometry.recentLabelGap).toBeLessThanOrEqual(20);
  expect(geometry.rowTitleDelta).toBeLessThanOrEqual(1);
  expect(geometry.kebabSize).toBeNull();
  expect(geometry.overflow).toBeLessThanOrEqual(0);
});
