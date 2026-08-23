import { expect, test } from '@playwright/test';

async function openApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByLabel('Cambiar tablero')).toBeVisible();
}

async function openFirstTask(page: import('@playwright/test').Page) {
  await page.locator('.bardo-mobile-column-slide').first().locator('.bardo-task-card').first().click();
  await expect(page.getByTestId('task-read-view')).toBeVisible();
}

test('mobile audit: sticky app header is full-bleed and opaque above carousel content', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);

  const metrics = await page.locator('.bardo-topbar').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      viewport: window.innerWidth,
      background: style.backgroundColor,
      zIndex: Number.parseInt(style.zIndex, 10),
    };
  });

  expect(metrics.left).toBeLessThanOrEqual(1);
  expect(metrics.right).toBeGreaterThanOrEqual(metrics.viewport - 1);
  expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(metrics.zIndex).toBeGreaterThan(30);
});

test('mobile audit: modal chrome is opaque and fields visibly separate from modal surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);
  await openFirstTask(page);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const dialog = page.getByRole('dialog');
  const header = dialog.locator('.bardo-detail-header');
  const footer = dialog.locator('.bardo-detail-footer');
  const edit = page.getByTestId('task-edit-view');
  const title = edit.locator('input').first();
  const description = edit.locator('textarea').first();
  const nativeShell = edit.locator('.bardo-native-select-shell').first();

  const colors = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const header = dialog.querySelector<HTMLElement>('.bardo-detail-header')!;
    const footer = dialog.querySelector<HTMLElement>('.bardo-detail-footer')!;
    const input = dialog.querySelector<HTMLInputElement>('[data-testid="task-edit-view"] input')!;
    const textarea = dialog.querySelector<HTMLTextAreaElement>('[data-testid="task-edit-view"] textarea')!;
    const shell = dialog.querySelector<HTMLElement>('.bardo-native-select-shell')!;
    return {
      dialog: getComputedStyle(dialog).backgroundColor,
      header: getComputedStyle(header).backgroundColor,
      footer: getComputedStyle(footer).backgroundColor,
      input: getComputedStyle(input).backgroundColor,
      textarea: getComputedStyle(textarea).backgroundColor,
      nativeShell: getComputedStyle(shell).backgroundColor,
    };
  });

  await expect(header).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(title).toBeVisible();
  await expect(description).toBeVisible();
  await expect(nativeShell).toBeVisible();

  expect(colors.dialog).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.header).toBe(colors.dialog);
  expect(colors.footer).toBe(colors.dialog);
  expect(colors.nativeShell).not.toBe(colors.dialog);
  expect([colors.input, colors.textarea]).not.toEqual([colors.dialog, colors.dialog]);
});

test('mobile audit: switching from scrolled read mode to edit starts at the title', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);
  await openFirstTask(page);

  const read = page.getByTestId('task-read-view');
  await read.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => read.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = page.getByTestId('task-edit-view');
  const title = edit.locator('input').first();
  await expect(edit).toBeVisible();
  await expect(title).toBeVisible();

  const metrics = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('[data-testid="task-edit-view"]')!;
    const header = document.querySelector<HTMLElement>('.bardo-detail-header')!;
    const title = body.querySelector<HTMLInputElement>('input')!;
    const titleRect = title.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      scrollTop: body.scrollTop,
      titleTop: titleRect.top,
      headerBottom: headerRect.bottom,
    };
  });

  expect(metrics.scrollTop).toBeLessThanOrEqual(1);
  expect(metrics.titleTop).toBeGreaterThanOrEqual(metrics.headerBottom - 1);
});

test('mobile audit: board settings has no horizontal clipping and column inputs own the row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);
  await page.getByLabel('Más opciones').selectOption('settings');
  const dialog = page.getByRole('dialog', { name: 'Tablero' });
  const body = page.getByTestId('settings-body');
  await expect(dialog).toBeVisible();

  const metrics = await body.evaluate((element) => {
    const bodyRect = element.getBoundingClientRect();
    const rows = Array.from(element.querySelectorAll<HTMLElement>('.bardo-column-setting'));
    const inputs = rows.map((row) => row.querySelector<HTMLInputElement>('input')).filter(Boolean) as HTMLInputElement[];
    return {
      overflowX: element.scrollWidth - element.clientWidth,
      rowsInside: rows.every((row) => {
        const rect = row.getBoundingClientRect();
        return rect.left >= bodyRect.left - 1 && rect.right <= bodyRect.right + 1;
      }),
      inputsInside: inputs.every((input) => {
        const rect = input.getBoundingClientRect();
        return rect.left >= bodyRect.left - 1 && rect.right <= bodyRect.right + 1;
      }),
      inputsWide: inputs.every((input) => input.getBoundingClientRect().width >= bodyRect.width * 0.8),
    };
  });

  expect(metrics.overflowX).toBeLessThanOrEqual(1);
  expect(metrics.rowsInside).toBe(true);
  expect(metrics.inputsInside).toBe(true);
  expect(metrics.inputsWide).toBe(true);
});

test('mobile audit: native select uses one OS focus treatment, not a doubled custom ring', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);
  await openFirstTask(page);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const select = page.getByTestId('task-edit-view').locator('select[aria-label="Responsable"]');
  await select.focus();
  const focus = await select.evaluate((element) => {
    const shell = element.parentElement as HTMLElement;
    return {
      selectOutline: getComputedStyle(element).outlineStyle,
      shellShadow: getComputedStyle(shell).boxShadow,
    };
  });

  expect(focus.selectOutline).toBe('none');
  expect(focus.shellShadow).not.toContain('0px 0px 0px 2px');
});
