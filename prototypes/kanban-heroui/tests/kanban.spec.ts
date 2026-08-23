import { expect, test } from '@playwright/test';

const STORAGE = 'bardo-kanban-heroui-v6';

async function openApp(page: import('@playwright/test').Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('Cambiar tablero')).toBeVisible();
  await expect(page.getByText('Producto', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  return pageErrors;
}

async function openOptions(page: import('@playwright/test').Page) {
  await page.getByLabel('Más opciones').click();
  await expect(page.getByRole('menu')).toBeVisible();
}

async function openSettings(page: import('@playwright/test').Page) {
  await openOptions(page);
  await page.getByRole('menuitem', { name: 'Configurar tablero' }).click({ force: true });
  const dialog = page.getByRole('dialog', { name: 'Tablero' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('loads the HeroUI app without runtime errors', async ({ page }) => {
  const errors = await openApp(page);
  const backlog = page.getByText('Backlog', { exact: true }).filter({ visible: true }).first();
  await expect(backlog).toBeVisible();
  expect(errors).toEqual([]);
});

test('uses the exact HeroUI default theme contract', async ({ page }) => {
  const errors = await openApp(page);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      accent: style.getPropertyValue('--accent').trim(),
      background: style.getPropertyValue('--background').trim(),
      overlay: style.getPropertyValue('--overlay').trim(),
      fieldBackground: style.getPropertyValue('--field-background').trim(),
      fieldBorder: style.getPropertyValue('--field-border').trim(),
      radius: style.getPropertyValue('--radius').trim(),
    };
  });
  expect(tokens.theme).toBe('default');
  expect(tokens.accent).not.toBe('');
  expect(tokens.background).not.toBe('');
  expect(tokens.accent).not.toBe(tokens.background);
  expect(tokens.overlay).toContain('100.00%');
  expect(tokens.fieldBackground).not.toBe('transparent');
  expect(tokens.fieldBackground).not.toBe(tokens.background);
  expect(tokens.fieldBorder).toBe('transparent');
  expect(Number.parseFloat(tokens.radius)).toBeCloseTo(0.25, 5);
  expect(errors).toEqual([]);
});

test('desktop: quick create, edit and persist a task', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
  await page.getByLabel('Título').fill('QA HeroUI creada por Playwright');
  await page.getByRole('button', { name: 'Crear', exact: true }).click();

  const card = page.locator('.bardo-desktop-board .bardo-task-card').filter({ hasText: 'QA HeroUI creada por Playwright' });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByLabel('Título de la tarea')).toHaveValue('QA HeroUI creada por Playwright');
  await page.getByLabel('Descripción').fill('Descripción persistida desde el gate E2E.');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(card.getByText('Descripción persistida desde el gate E2E.', { exact: true })).toBeVisible();

  await expect.poll(async () => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE)).toBe(true);
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
    const task = board?.tasks?.find((item: { id: string }) => item.id === id);
    return task?.status === board?.columns?.[1]?.id;
  }, { key: STORAGE, id: taskId })).toBe(true);
  expect(errors).toEqual([]);
});

test('desktop: allows a fifth column and blocks a sixth', async ({ page }, testInfo) => {
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

  await page.getByLabel('Cambiar tablero').click();
  await page.getByRole('menuitem', { name: /Personal/ }).click();
  await expect(page.getByText('Personal', { exact: true }).filter({ visible: true }).first()).toBeVisible();
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

test('desktop: stress adds one thousand tasks and self-test remains green', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await openOptions(page);
  await page.getByRole('menuitem', { name: '+1000 tareas mock' }).click();
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

test('mobile: exposes one column at a time and quick create stays reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);

  const visibleColumn = page.locator('.bardo-mobile-panel:visible .bardo-column');
  await expect(visibleColumn).toHaveCount(1);
  await page.getByRole('tab', { name: /^Por hacer/ }).click();
  await expect(page.locator('.bardo-mobile-panel:visible .bardo-column h2')).toHaveText('Por hacer');
  await expect(visibleColumn).toHaveCount(1);

  await page.getByLabel('Nueva tarea').click();
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
  await expect(page.getByLabel('Título')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: HeroUI owns icon field and modal rendering', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);

  const geometry = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('button[aria-label="Más opciones"]');
    const search = document.querySelector<HTMLElement>('button[aria-label="Buscar"]');
    const create = document.querySelector<HTMLElement>('button[aria-label="Nueva tarea"]');
    const svgs = [action, search, create].map((button) => button?.querySelector<SVGElement>('svg'));
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('.bardo-mobile-tabs [role="tab"]'));
    return {
      actionBox: action ? [action.getBoundingClientRect().width, action.getBoundingClientRect().height] : [0, 0],
      searchBox: search ? [search.getBoundingClientRect().width, search.getBoundingClientRect().height] : [0, 0],
      createBox: create ? [create.getBoundingClientRect().width, create.getBoundingClientRect().height] : [0, 0],
      svgBoxes: svgs.map((svg) => svg ? [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height] : [0, 0]),
      buttonText: [action, search, create].map((button) => button?.textContent?.trim() ?? ''),
      noWrappedTabs: tabs.every((tab) => tab.getBoundingClientRect().height <= 48),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.actionBox).toEqual(geometry.searchBox);
  expect(geometry.actionBox).toEqual(geometry.createBox);
  for (const [width, height] of geometry.svgBoxes) {
    expect(width).toBeCloseTo(16, 0);
    expect(height).toBeCloseTo(16, 0);
  }
  expect(geometry.buttonText).toEqual(['', '', '']);
  expect(geometry.noWrappedTabs).toBe(true);
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);

  await page.getByLabel('Nueva tarea').click();
  const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual((await page.viewportSize())!.height);

  const computed = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[aria-label="Título"]');
    const surface = document.querySelector<HTMLElement>('[data-testid="quick-surface"]');
    const root = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      overlayToken: root.getPropertyValue('--overlay').trim(),
      defaultToken: root.getPropertyValue('--default').trim(),
      dialogBackground: dialog ? getComputedStyle(dialog).backgroundColor : '',
      inputBackground: input ? getComputedStyle(input).backgroundColor : '',
      surfaceBackground: surface ? getComputedStyle(surface).backgroundColor : '',
    };
  });

  expect(computed.theme).toBe('default');
  expect(computed.overlayToken).toContain('100.00%');
  expect(computed.defaultToken).toContain('94.00%');
  expect(computed.dialogBackground).not.toBe('');
  expect(computed.inputBackground).not.toBe('');
  expect(computed.inputBackground).not.toBe(computed.dialogBackground);
  expect(computed.inputBackground).not.toBe(computed.surfaceBackground);
  expect(errors).toEqual([]);
});
