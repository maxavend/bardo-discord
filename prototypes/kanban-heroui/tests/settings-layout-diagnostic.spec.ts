import { expect, test } from '@playwright/test';

test('mobile: settings direct children have zero intrinsic overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');
  await page.getByLabel('Más opciones').selectOption('settings');
  const body = page.getByTestId('settings-body');
  await expect(body).toBeVisible();

  const metrics = await body.evaluate((element) => Array.from(element.children).map((node) => {
    const child = node as HTMLElement;
    const rect = child.getBoundingClientRect();
    const style = getComputedStyle(child);
    return {
      tag: child.tagName,
      className: child.className,
      role: child.getAttribute('role'),
      width: rect.width,
      clientWidth: child.clientWidth,
      scrollWidth: child.scrollWidth,
      overflow: child.scrollWidth - child.clientWidth,
      display: style.display,
      minWidth: style.minWidth,
      widthStyle: style.width,
    };
  }));

  const offenders = metrics.filter((item) => item.overflow > 1);
  expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
});
