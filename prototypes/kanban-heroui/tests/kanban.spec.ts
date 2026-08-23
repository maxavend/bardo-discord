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
      defaultColor: style.getPropertyValue('--default').trim(),
      fieldBackground: style.getPropertyValue('--field-background').trim(),
      fieldBorder: style.getPropertyValue('--field-border').trim(),
      radius: style.getPropertyValue('--radius').trim(),
    };
  });
  expect(tokens.theme).toBe('default');
  expect(tokens.accent).not.toBe('');
  expect(tokens.background).not.toBe('');
  expect(tokens.accent).not.toBe(tokens.background);
  expect(cssLightness(tokens.overlay)).toBeGreaterThan(98);
  expect(cssLightness(tokens.defaultColor)).toBeGreaterThan(90);
  expect(cssLightness(tokens.defaultColor)).toBeLessThan(98);
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

test('mobile: pill navigation is single-axis, readable and shows the next column peek', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);

  const carousel = page.getByTestId('mobile-column-carousel');
  await expect(carousel).toBeVisible();
  const pills = page.locator('.bardo-column-pill');
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
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
  await expect(page.getByLabel('Título')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: carousel scrolling updates the active pill', async ({ page }, testInfo) => {
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

test('mobile: long press and horizontal drag moves a card to the next column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);

  const carousel = page.getByTestId('mobile-column-carousel');
  const firstSlide = page.locator('.bardo-mobile-column-slide').first();
  const card = firstSlide.locator('.bardo-task-card').first();
  const taskId = await card.getAttribute('data-task-id');
  expect(taskId).toBeTruthy();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  const startX = Math.round(box!.x + Math.min(box!.width / 2, 120));
  const startY = Math.round(box!.y + Math.min(box!.height / 2, 48));
  const pointerId = 17;

  await card.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: startX,
    clientY: startY,
  });
  await page.waitForTimeout(460);
  await expect(page.getByTestId('mobile-drag-ghost')).toBeVisible();

  await carousel.dispatchEvent('pointermove', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: startX + 110,
    clientY: startY,
  });
  await expect(page.getByTestId('mobile-drag-ghost')).toContainText('Mover a Por hacer');

  await carousel.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: startX + 110,
    clientY: startY,
  });
  await expect(page.getByTestId('mobile-drag-ghost')).toHaveCount(0);

  await expect.poll(async () => page.evaluate(({ key, id }) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    const task = board?.tasks?.find((item: { id: string }) => item.id === id);
    return task?.status === board?.columns?.[1]?.id;
  }, { key: STORAGE, id: taskId })).toBe(true);
  await expect(page.locator('.bardo-column-pill').filter({ hasText: 'Por hacer' }).first()).toHaveAttribute('data-active', 'true');
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
    const pills = Array.from(document.querySelectorAll<HTMLElement>('.bardo-column-pill'));
    return {
      actionBox: action ? [action.getBoundingClientRect().width, action.getBoundingClientRect().height] : [0, 0],
      searchBox: search ? [search.getBoundingClientRect().width, search.getBoundingClientRect().height] : [0, 0],
      createBox: create ? [create.getBoundingClientRect().width, create.getBoundingClientRect().height] : [0, 0],
      svgBoxes: svgs.map((svg) => svg ? [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height] : [0, 0]),
      buttonText: [action, search, create].map((button) => button?.textContent?.trim() ?? ''),
      pillRadii: pills.map((pill) => Number.parseFloat(getComputedStyle(pill).borderRadius)),
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
  expect(geometry.pillRadii.every((radius) => radius >= 16)).toBe(true);
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
  expect(cssLightness(computed.overlayToken)).toBeGreaterThan(98);
  expect(cssLightness(computed.defaultToken)).toBeGreaterThan(90);
  expect(cssLightness(computed.defaultToken)).toBeLessThan(98);
  expect(computed.dialogBackground).not.toBe('');
  expect(computed.inputBackground).not.toBe('');
  expect(computed.inputBackground).not.toBe(computed.dialogBackground);
  expect(computed.inputBackground).not.toBe(computed.surfaceBackground);
  expect(errors).toEqual([]);
});
