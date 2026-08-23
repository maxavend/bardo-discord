import { expect, test } from '@playwright/test';

const STORAGE = 'bardo-kanban-heroui-v6';

function cssLightness(value: string) {
  const match = value.match(/(?:lab|oklch)\(\s*([\d.]+)%/i);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

async function openApp(page: import('@playwright/test').Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('Cambiar tablero')).toBeVisible();
  await expect(page.getByText('Producto', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  return pageErrors;
}

async function chooseBoardAction(page: import('@playwright/test').Page, value: string) {
  await page.getByLabel('Más opciones').selectOption(value);
}

async function openSettings(page: import('@playwright/test').Page) {
  await chooseBoardAction(page, 'settings');
  const dialog = page.getByRole('dialog', { name: 'Tablero' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('loads without runtime errors', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByText('Backlog', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('uses exact HeroUI default theme contract', async ({ page }) => {
  const errors = await openApp(page);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      accent: style.getPropertyValue('--accent').trim(),
      background: style.getPropertyValue('--background').trim(),
      overlay: style.getPropertyValue('--overlay').trim(),
      defaultColor: style.getPropertyValue('--default').trim(),
      fieldBackground: style.getPropertyValue('--field-background').trim(),
      fieldBorder: style.getPropertyValue('--field-border').trim(),
      radius: style.getPropertyValue('--radius').trim(),
      fieldRadius: style.getPropertyValue('--field-radius').trim(),
    };
  });
  expect(tokens.theme).toBe('default');
  expect(tokens.accent).not.toBe(tokens.background);
  expect(cssLightness(tokens.overlay)).toBeGreaterThan(98);
  expect(cssLightness(tokens.defaultColor)).toBeGreaterThan(90);
  expect(cssLightness(tokens.defaultColor)).toBeLessThan(98);
  expect(tokens.fieldBackground).not.toBe('transparent');
  expect(tokens.fieldBackground).not.toBe(tokens.background);
  expect(tokens.fieldBorder).toBe('transparent');
  expect(Number.parseFloat(tokens.radius)).toBeCloseTo(0.25, 5);
  expect(Number.parseFloat(tokens.fieldRadius)).toBeCloseTo(0.75, 5);
  expect(errors).toEqual([]);
});

test('desktop: quick create opens read-first detail and explicit edit persists', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.keyboard.press('n');
  const quickDialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  await expect(quickDialog).toBeVisible();
  const quickBody = page.getByTestId('quick-body');
  await expect(quickBody.locator('select[aria-label="Columna"]')).toHaveCount(1);
  await quickBody.locator('input').fill('QA read first por Playwright');
  await quickDialog.getByRole('button', { name: 'Crear', exact: true }).click();

  const card = page.locator('.bardo-desktop-board .bardo-task-card').filter({ hasText: 'QA read first por Playwright' });
  await expect(card).toBeVisible();
  await card.click();

  const readView = page.getByTestId('task-read-view');
  await expect(readView).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QA read first por Playwright' })).toBeVisible();
  await expect(readView.locator('select')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const editView = page.getByTestId('task-edit-view');
  await expect(editView).toBeVisible();
  const titleInput = editView.locator('input').first();
  await expect(titleInput).toHaveValue('QA read first por Playwright');
  await editView.locator('textarea').first().fill('Descripción persistida desde edición explícita.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(readView).toBeVisible();
  await expect(readView.getByText('Descripción persistida desde edición explícita.', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    const task = board?.tasks?.find((item: { title: string }) => item.title === 'QA read first por Playwright');
    return task?.description ?? '';
  }, STORAGE)).toBe('Descripción persistida desde edición explícita.');
  expect(errors).toEqual([]);
});

test('desktop: task detail Gestalt hierarchy is deliberate and contained', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  await page.locator('.bardo-desktop-board .bardo-task-card').first().click();
  await expect(page.getByTestId('task-read-view')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = dialog.querySelector<HTMLElement>('.bardo-detail-title')!;
    const subtitle = dialog.querySelector<HTMLElement>('.bardo-detail-updated')!;
    const description = dialog.querySelector<HTMLElement>('.bardo-detail-description')!;
    const propertyLabel = dialog.querySelector<HTMLElement>('.bardo-detail-property-label')!;
    const propertyValue = dialog.querySelector<HTMLElement>('.bardo-detail-property-value')!;
    const body = dialog.querySelector<HTMLElement>('.bardo-detail-body')!;
    const rect = dialog.getBoundingClientRect();
    return {
      titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
      subtitleSize: Number.parseFloat(getComputedStyle(subtitle).fontSize),
      descriptionSize: Number.parseFloat(getComputedStyle(description).fontSize),
      propertyLabelSize: Number.parseFloat(getComputedStyle(propertyLabel).fontSize),
      propertyValueSize: Number.parseFloat(getComputedStyle(propertyValue).fontSize),
      bodyGap: Number.parseFloat(getComputedStyle(body).gap),
      overflowX: dialog.scrollWidth - dialog.clientWidth,
      withinViewport: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
    };
  });

  expect(metrics.titleSize).toBeGreaterThan(metrics.descriptionSize);
  expect(metrics.descriptionSize).toBeGreaterThan(metrics.subtitleSize);
  expect(metrics.propertyValueSize).toBeGreaterThan(metrics.propertyLabelSize);
  expect(metrics.bodyGap).toBeGreaterThanOrEqual(18);
  expect(metrics.overflowX).toBeLessThanOrEqual(1);
  expect(metrics.withinViewport).toBe(true);
  expect(errors).toEqual([]);
});

test('desktop: native drag lifecycle moves a task between columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  const firstCard = page.locator('.bardo-desktop-board .bardo-column').first().locator('.bardo-task-card').first();
  const taskId = await firstCard.getAttribute('data-task-id');
  expect(taskId).toBeTruthy();
  const targetDropzone = page.locator('.bardo-desktop-board .bardo-task-list').nth(1);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await firstCard.dispatchEvent('dragstart', { dataTransfer });
  await targetDropzone.dispatchEvent('dragover', { dataTransfer });
  await targetDropzone.dispatchEvent('drop', { dataTransfer });
  await firstCard.dispatchEvent('dragend', { dataTransfer });
  await expect.poll(async () => page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    return board?.tasks?.find((item: { id: string }) => item.id === id)?.status === board?.columns?.[1]?.id;
  }, { key: STORAGE, id: taskId })).toBe(true);
  expect(errors).toEqual([]);
});

test('desktop: board and action pickers are real native selects', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  const boardPicker = page.getByLabel('Cambiar tablero');
  const actionPicker = page.getByLabel('Más opciones');
  await expect(boardPicker).toHaveJSProperty('tagName', 'SELECT');
  await expect(actionPicker).toHaveJSProperty('tagName', 'SELECT');
  await boardPicker.selectOption('personal');
  await expect(page.getByText('Personal', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await actionPicker.selectOption('settings');
  await expect(page.getByRole('dialog', { name: 'Tablero' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop: fifth column is allowed and sixth is blocked', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  const settings = await openSettings(page);
  const addColumn = settings.getByRole('button', { name: /Columna/ }).filter({ hasText: 'Columna' }).last();
  await expect(settings.getByText('4/5 · 4 por defecto')).toBeVisible();
  await addColumn.click();
  await expect(settings.getByText('5/5 · 4 por defecto')).toBeVisible();
  await expect(addColumn).toBeDisabled();
  expect(errors).toEqual([]);
});

test('desktop: board tag catalog stops at eight', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  await page.getByLabel('Cambiar tablero').selectOption('personal');
  const settings = await openSettings(page);
  await expect(settings.getByText('4/8 máximo por tablero')).toBeVisible();
  const tagInput = settings.getByLabel('Nuevo tag');
  const addTag = settings.getByRole('button', { name: 'Añadir', exact: true }).last();
  for (const tag of ['Salud', 'Trabajo', 'Viaje', 'Ideas']) {
    await tagInput.fill(tag);
    await addTag.click();
  }
  await expect(settings.getByText('8/8 máximo por tablero')).toBeVisible();
  await tagInput.fill('Noveno');
  await expect(addTag).toBeDisabled();
  expect(errors).toEqual([]);
});

test('desktop: stress adds 1000 tasks and self-test remains green', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);
  await chooseBoardAction(page, 'stress-1000');
  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    return board?.tasks?.length ?? 0;
  }, STORAGE)).toBe(1180);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Autoprueba' }).click();
  await expect(settings.getByText(/PASS · 4 tableros/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: pills are single-axis and carousel shows next-column peek', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);
  const carousel = page.getByTestId('mobile-column-carousel');
  const pills = page.locator('.bardo-column-pill');
  await expect(carousel).toBeVisible();
  await expect(pills.first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('.bardo-column-pill-rail')!;
    const carousel = document.querySelector<HTMLElement>('[data-testid="mobile-column-carousel"]')!;
    const slides = Array.from(document.querySelectorAll<HTMLElement>('.bardo-mobile-column-slide'));
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.bardo-column-pill-label'));
    const first = slides[0].getBoundingClientRect();
    const second = slides[1].getBoundingClientRect();
    const viewport = carousel.getBoundingClientRect();
    return {
      railOverflowY: getComputedStyle(rail).overflowY,
      railClientHeight: rail.clientHeight,
      railScrollHeight: rail.scrollHeight,
      labelsUnclipped: labels.every((label) => getComputedStyle(label).textOverflow === 'clip' && getComputedStyle(label).whiteSpace === 'nowrap'),
      firstWidth: first.width,
      viewportWidth: viewport.width,
      secondLeft: second.left,
      viewportRight: viewport.right,
      scrollSnapType: getComputedStyle(carousel).scrollSnapType,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(metrics.railOverflowY).toBe('hidden');
  expect(metrics.railScrollHeight).toBeLessThanOrEqual(metrics.railClientHeight + 1);
  expect(metrics.labelsUnclipped).toBe(true);
  expect(metrics.firstWidth).toBeLessThan(metrics.viewportWidth - 20);
  expect(metrics.firstWidth).toBeGreaterThan(metrics.viewportWidth * 0.78);
  expect(metrics.secondLeft).toBeLessThan(metrics.viewportRight);
  expect(metrics.scrollSnapType).toContain('x mandatory');
  expect(metrics.pageOverflow).toBeLessThanOrEqual(1);

  const nextPill = pills.filter({ hasText: 'Por hacer' }).first();
  await nextPill.click();
  await expect(nextPill).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(20);

  await page.getByLabel('Nueva tarea').click();
  const quickBody = page.getByTestId('quick-body');
  await expect(quickBody.locator('select[aria-label="Columna"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile: carousel scrolling updates active pill', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);
  const carousel = page.getByTestId('mobile-column-carousel');
  await carousel.evaluate((element) => {
    const second = element.querySelectorAll<HTMLElement>('[data-mobile-column-id]')[1];
    element.scrollTo({ left: second.offsetLeft, behavior: 'auto' });
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect(page.locator('.bardo-column-pill').filter({ hasText: 'Por hacer' }).first()).toHaveAttribute('data-active', 'true');
  expect(errors).toEqual([]);
});

test('mobile: long press and horizontal drag moves a card', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);
  const carousel = page.getByTestId('mobile-column-carousel');
  const card = page.locator('.bardo-mobile-column-slide').first().locator('.bardo-task-card').first();
  const taskId = await card.getAttribute('data-task-id');
  const box = await card.boundingBox();
  expect(taskId).toBeTruthy();
  expect(box).not.toBeNull();
  const startX = Math.round(box!.x + Math.min(box!.width / 2, 120));
  const startY = Math.round(box!.y + Math.min(box!.height / 2, 48));
  const pointerId = 17;
  await card.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX, clientY: startY });
  await page.waitForTimeout(460);
  await expect(page.getByTestId('mobile-drag-ghost')).toBeVisible();
  await carousel.dispatchEvent('pointermove', { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX + 110, clientY: startY });
  await expect(page.getByTestId('mobile-drag-ghost')).toContainText('Mover a Por hacer');
  await carousel.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: true, button: 0, clientX: startX + 110, clientY: startY });
  await expect.poll(async () => page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    return board?.tasks?.find((item: { id: string }) => item.id === id)?.status === board?.columns?.[1]?.id;
  }, { key: STORAGE, id: taskId })).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile: task detail is read-first and edit uses native OS selects', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);
  await page.locator('.bardo-mobile-column-slide').first().locator('.bardo-task-card').first().click();
  const dialog = page.getByRole('dialog');
  const readView = page.getByTestId('task-read-view');
  await expect(readView).toBeVisible();
  await expect(dialog.locator('select')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const editView = page.getByTestId('task-edit-view');
  await expect(editView).toBeVisible();
  const nativeSelectors = editView.locator('select');
  await expect(nativeSelectors).toHaveCount(3);
  for (const label of ['Columna', 'Responsable', 'Prioridad']) {
    const control = editView.locator(`select[aria-label="${label}"]`);
    await expect(control).toHaveCount(1);
    expect(await control.evaluate((element) => getComputedStyle(element).appearance)).not.toBe('none');
  }
  expect(errors).toEqual([]);
});

test('mobile: native action trigger matches HeroUI icon geometry and modal is contained', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);
  const geometry = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.bardo-native-icon-picker');
    const search = document.querySelector<HTMLElement>('button[aria-label="Buscar"]');
    const create = document.querySelector<HTMLElement>('button[aria-label="Nueva tarea"]');
    const svgs = [action?.querySelector<SVGElement>('svg'), search?.querySelector<SVGElement>('svg'), create?.querySelector<SVGElement>('svg')];
    return {
      actionBox: action ? [action.getBoundingClientRect().width, action.getBoundingClientRect().height] : [0, 0],
      searchBox: search ? [search.getBoundingClientRect().width, search.getBoundingClientRect().height] : [0, 0],
      createBox: create ? [create.getBoundingClientRect().width, create.getBoundingClientRect().height] : [0, 0],
      svgBoxes: svgs.map((svg) => svg ? [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height] : [0, 0]),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.actionBox).toEqual(geometry.searchBox);
  expect(geometry.actionBox).toEqual(geometry.createBox);
  for (const [width, height] of geometry.svgBoxes) {
    expect(width).toBeCloseTo(16, 0);
    expect(height).toBeCloseTo(16, 0);
  }
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);

  await page.getByLabel('Nueva tarea').click();
  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual((await page.viewportSize())!.height);

  const quickBody = page.getByTestId('quick-body');
  const select = quickBody.locator('select[aria-label="Columna"]');
  await expect(select).toHaveCount(1);
  expect(await select.evaluate((element) => getComputedStyle(element).appearance)).not.toBe('none');
  expect(errors).toEqual([]);
});
