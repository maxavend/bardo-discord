import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Cambiar tablero')).toBeVisible();
}

async function expectNoUnexpectedPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectContained(locator: import('@playwright/test').Locator) {
  const result = await locator.evaluate((root) => {
    const host = root as HTMLElement;
    const hostRect = host.getBoundingClientRect();
    const children = Array.from(host.children) as HTMLElement[];
    return children
      .filter((child) => getComputedStyle(child).position !== 'fixed')
      .map((child) => {
        const rect = child.getBoundingClientRect();
        return {
          left: rect.left - hostRect.left,
          right: rect.right - hostRect.right,
          widthOverflow: child.scrollWidth - child.clientWidth,
        };
      });
  });
  for (const child of result) {
    expect(child.left).toBeGreaterThanOrEqual(-1);
    expect(child.right).toBeLessThanOrEqual(1);
    expect(child.widthOverflow).toBeLessThanOrEqual(1);
  }
}

async function expectModalOwnsTopLayer(page: Page) {
  const result = await page.evaluate(() => {
    const controls = [
      document.querySelector<HTMLElement>('[aria-label="Buscar"]'),
      document.querySelector<HTMLElement>('[aria-label="Más opciones"]'),
      document.querySelector<HTMLElement>('[aria-label="Nueva tarea"]'),
    ].filter(Boolean) as HTMLElement[];
    return controls.map((control) => {
      const rect = control.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null;
      return Boolean(top && (top === control || control.contains(top)));
    });
  });
  expect(result).toEqual([false, false, false]);
}

test('mobile: full product flow keeps every wrapper contained and scrollers symmetric', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openApp(page);

  const boardPicker = page.getByLabel('Cambiar tablero');
  await boardPicker.selectOption('personal');
  await expect(page.getByText('Personal', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await boardPicker.selectOption('product');
  await expect(page.getByText('Producto', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  await page.getByLabel('Buscar').click();
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await page.getByLabel('Orden').selectOption('priority');
  await page.getByRole('button', { name: 'Urgentes', exact: true }).click();
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  await expectNoUnexpectedPageOverflow(page);

  const carousel = page.getByTestId('mobile-column-carousel');
  const carouselGeometry = await carousel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const first = element.querySelector<HTMLElement>('[data-mobile-column-id]')!;
    const second = element.querySelectorAll<HTMLElement>('[data-mobile-column-id]')[1];
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      firstLeft: firstRect.left,
      nextPeek: rect.right - secondRect.left,
    };
  });
  expect(Math.abs(carouselGeometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(carouselGeometry.right)).toBeLessThanOrEqual(1);
  expect(carouselGeometry.paddingLeft).toBeCloseTo(carouselGeometry.paddingRight, 0);
  expect(carouselGeometry.firstLeft).toBeCloseTo(carouselGeometry.paddingLeft, 0);
  expect(carouselGeometry.nextPeek).toBeGreaterThan(24);

  const porHacer = page.locator('.bardo-column-pill').filter({ hasText: 'Por hacer' }).first();
  await porHacer.click();
  await expect(porHacer).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => carousel.evaluate((element) => {
    const style = getComputedStyle(element);
    const gutter = Number.parseFloat(style.paddingLeft);
    const active = Array.from(element.querySelectorAll<HTMLElement>('[data-mobile-column-id]'))[1];
    return Math.abs(active.getBoundingClientRect().left - (element.getBoundingClientRect().left + gutter));
  })).toBeLessThanOrEqual(2);

  await page.getByLabel('Nueva tarea').click();
  const quick = page.getByRole('dialog', { name: 'Nueva tarea' });
  await expect(quick).toBeVisible();
  await expectModalOwnsTopLayer(page);
  await expectContained(page.getByTestId('quick-body'));
  await page.getByTestId('quick-body').locator('select[aria-label="Columna"]').selectOption('product-c3');
  await page.getByTestId('quick-body').locator('input').fill('Auditoría completa de wrappers');
  await quick.getByRole('button', { name: 'Crear', exact: true }).click();

  const newCard = page.locator('.bardo-task-card').filter({ hasText: 'Auditoría completa de wrappers' }).filter({ visible: true }).first();
  await expect(newCard).toBeVisible();
  await newCard.click();
  const detail = page.getByRole('dialog');
  await expect(page.getByTestId('task-read-view')).toBeVisible();
  await expectModalOwnsTopLayer(page);
  await expectContained(page.getByTestId('task-read-view'));

  await detail.getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = page.getByTestId('task-edit-view');
  await expect(edit).toBeVisible();
  await edit.locator('select[aria-label="Columna"]').selectOption('product-c2');
  await edit.locator('select[aria-label="Responsable"]').selectOption('ma');
  await edit.locator('select[aria-label="Prioridad"]').selectOption('high');
  await expectContained(edit);
  await detail.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await detail.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(edit).toBeVisible();
  await detail.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: false }).filter({ visible: true }).first().click().catch(() => page.keyboard.press('Escape'));
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByLabel('Más opciones').selectOption('settings');
  const settings = page.getByRole('dialog', { name: 'Tablero' });
  const settingsBody = page.getByTestId('settings-body');
  await expect(settings).toBeVisible();
  await expectModalOwnsTopLayer(page);
  await settingsBody.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'auto' }));
  await expectContained(settingsBody);

  const settingsGeometry = await settings.evaluate((dialog) => {
    const body = dialog.querySelector<HTMLElement>('.bardo-settings-body')!;
    const footer = dialog.querySelector<HTMLElement>('.bardo-settings-footer')!;
    const dialogRect = (dialog as HTMLElement).getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const rows = Array.from(dialog.querySelectorAll<HTMLElement>('.bardo-column-setting'));
    return {
      viewportLeft: dialogRect.left,
      viewportRight: dialogRect.right,
      overflow: (dialog as HTMLElement).scrollWidth - (dialog as HTMLElement).clientWidth,
      bodyBeforeFooter: bodyRect.bottom <= footerRect.top + 1,
      rowsContained: rows.every((row) => {
        const rect = row.getBoundingClientRect();
        return rect.left >= dialogRect.left - 1 && rect.right <= dialogRect.right + 1 && row.scrollWidth <= row.clientWidth + 1;
      }),
    };
  });
  expect(settingsGeometry.overflow).toBeLessThanOrEqual(1);
  expect(settingsGeometry.bodyBeforeFooter).toBe(true);
  expect(settingsGeometry.rowsContained).toBe(true);
  await settings.getByRole('button', { name: 'Listo', exact: true }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoUnexpectedPageOverflow(page);
});

test('desktop: board scroller is full-bleed while columns retain internal gutter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await openApp(page);
  const board = page.locator('.bardo-desktop-board');
  await expect(board).toBeVisible();
  const geometry = await board.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const firstColumn = element.querySelector<HTMLElement>('.bardo-column')!;
    const firstRect = firstColumn.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      firstLeft: firstRect.left,
    };
  });
  expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.right)).toBeLessThanOrEqual(1);
  expect(geometry.paddingLeft).toBeCloseTo(geometry.paddingRight, 0);
  expect(geometry.firstLeft).toBeCloseTo(geometry.paddingLeft, 0);
  await expectNoUnexpectedPageOverflow(page);
});
