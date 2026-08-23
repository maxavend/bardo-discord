import { expect, test } from '@playwright/test';

test('mobile: settings descendants have zero intrinsic overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');
  await page.getByLabel('Más opciones').selectOption('settings');
  const body = page.getByTestId('settings-body');
  await expect(body).toBeVisible();

  const offenders = await body.evaluate((element) => {
    const bodyRect = element.getBoundingClientRect();
    const nodes = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))] as HTMLElement[];
    return nodes.flatMap((node) => {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.display === 'contents') return [];

      const rect = node.getBoundingClientRect();
      const overflow = node.scrollWidth - node.clientWidth;
      const escapesBody = rect.width > 0 && (rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1);
      if (overflow <= 1 && !escapesBody) return [];

      const section = node.closest<HTMLElement>('.bardo-section');
      const heading = section?.querySelector('h3')?.textContent?.trim() ?? null;
      return [{
        tag: node.tagName,
        className: typeof node.className === 'string' ? node.className : '',
        role: node.getAttribute('role'),
        ariaLabel: node.getAttribute('aria-label'),
        section: heading,
        text: (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 100),
        width: rect.width,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflow,
        leftEscape: bodyRect.left - rect.left,
        rightEscape: rect.right - bodyRect.right,
        display: style.display,
        minWidth: style.minWidth,
        widthStyle: style.width,
        whiteSpace: style.whiteSpace,
      }];
    });
  });

  expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
});
