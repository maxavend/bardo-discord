import {test, expect} from '@playwright/test';

test('library spacing and row geometry stay aligned', async ({page}) => {
  await page.goto('/#docs');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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
    const nativeTarget = rect('.native-menu select');

    return {
      searchBottomToContinueHeading: searchGroup && continueHeading ? continueHeading.top - searchGroup.bottom : -1,
      continueLabelGap: continueHeading && continueRow ? continueRow.top - continueHeading.bottom : -1,
      recentLabelGap: recentHeading && docsList ? docsList.top - recentHeading.bottom : -1,
      rowTitleDelta: continueTitle && firstRecentTitle ? Math.abs(continueTitle.left - firstRecentTitle.left) : 99,
      kebabSize: kebab ? {w:kebab.width,h:kebab.height} : null,
      nativeTarget: nativeTarget ? {w:nativeTarget.width,h:nativeTarget.height} : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.searchBottomToContinueHeading).toBeGreaterThanOrEqual(24);
  expect(geometry.searchBottomToContinueHeading).toBeLessThanOrEqual(32);
  expect(geometry.continueLabelGap).toBeGreaterThanOrEqual(6);
  expect(geometry.continueLabelGap).toBeLessThanOrEqual(10);
  expect(geometry.recentLabelGap).toBeGreaterThanOrEqual(6);
  expect(geometry.recentLabelGap).toBeLessThanOrEqual(10);
  expect(geometry.rowTitleDelta).toBeLessThanOrEqual(1);
  expect(geometry.kebabSize?.w).toBe(18);
  expect(geometry.kebabSize?.h).toBe(18);
  expect(geometry.nativeTarget?.w).toBeGreaterThanOrEqual(44);
  expect(geometry.nativeTarget?.h).toBeGreaterThanOrEqual(44);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
});
