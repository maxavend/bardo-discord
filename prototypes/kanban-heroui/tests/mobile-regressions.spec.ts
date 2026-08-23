import { expect, test } from '@playwright/test';

async function openApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByLabel('Cambiar tablero')).toBeVisible();
}

test('mobile: tapping a state never re-activates the previous pill during smooth scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);

  const target = page.locator('.bardo-column-pill').filter({ hasText: 'Por hacer' }).first();
  await target.click();
  await expect(target).toHaveAttribute('data-active', 'true');

  for (let index = 0; index < 10; index += 1) {
    await page.waitForTimeout(35);
    await expect(target).toHaveAttribute('data-active', 'true');
  }
});

test('mobile: quick modal opens without programmatically focusing the title field', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);

  await page.getByLabel('Nueva tarea').click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByLabel('Título', { exact: true });
  await expect(dialog).toBeVisible();
  await expect(title).toBeVisible();

  const titleHasFocus = await title.evaluate((element) => document.activeElement === element);
  expect(titleHasFocus).toBe(false);
});

test('mobile: task edit also avoids automatic keyboard focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);

  await page.locator('.bardo-mobile-column-slide').first().locator('.bardo-task-card').first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const edit = page.getByTestId('task-edit-view');
  const title = edit.locator('input').first();
  await expect(edit).toBeVisible();
  await expect(title).toBeVisible();

  const titleHasFocus = await title.evaluate((element) => document.activeElement === element);
  expect(titleHasFocus).toBe(false);
});

test('native select keeps OS appearance inside a rounded semantic field surface', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Nueva tarea').click();

  const select = page.getByRole('dialog').getByLabel('Columna');
  await expect(select).toHaveJSProperty('tagName', 'SELECT');

  const styles = await select.evaluate((element) => {
    const selectStyle = getComputedStyle(element);
    const shell = element.parentElement as HTMLElement;
    const shellStyle = getComputedStyle(shell);
    return {
      appearance: selectStyle.appearance,
      shellClass: shell.className,
      shellBackground: shellStyle.backgroundColor,
      shellRadius: Number.parseFloat(shellStyle.borderRadius),
    };
  });

  expect(styles.appearance).not.toBe('none');
  expect(styles.shellClass).toContain('bardo-native-select-shell');
  expect(styles.shellBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.shellRadius).toBeGreaterThan(0);
});

test('desktop: drag target uses a rounded dashed pseudo-border instead of a square outline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openApp(page);

  const card = page.locator('.bardo-desktop-board .bardo-column').first().locator('.bardo-task-card').first();
  const target = page.locator('.bardo-desktop-board .bardo-task-list').nth(1);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(target).toHaveAttribute('data-over', 'true');

  const styles = await target.evaluate((element) => {
    const base = getComputedStyle(element);
    const marker = getComputedStyle(element, '::after');
    return {
      outlineStyle: base.outlineStyle,
      borderStyle: marker.borderTopStyle,
      borderRadius: Number.parseFloat(marker.borderRadius),
    };
  });

  expect(styles.outlineStyle).toBe('none');
  expect(styles.borderStyle).toBe('dashed');
  expect(styles.borderRadius).toBeGreaterThan(0);
});
