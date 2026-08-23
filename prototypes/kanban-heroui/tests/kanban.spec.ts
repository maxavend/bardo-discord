import { expect, test } from '@playwright/test';

const STORAGE = 'bardo-kanban-heroui-v6';

async function openApp(page: import('@playwright/test').Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Producto', { exact: true }).first()).toBeVisible();
  return pageErrors;
}

test('loads the HeroUI app without runtime errors', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByText('Backlog', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop: quick create, edit and persist a task', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
  await page.getByLabel('Título').fill('QA HeroUI creada por Playwright');
  await page.getByRole('button', { name: 'Crear', exact: true }).click();

  const taskTitle = page.getByText('QA HeroUI creada por Playwright', { exact: true });
  await expect(taskTitle).toBeVisible();
  await taskTitle.click();

  await expect(page.getByLabel('Título de la tarea')).toHaveValue('QA HeroUI creada por Playwright');
  await page.getByLabel('Descripción').fill('Descripción persistida desde el gate E2E.');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(page.getByText('Descripción persistida desde el gate E2E.', { exact: true })).toBeVisible();

  await expect.poll(async () => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE)).toBe(true);
  expect(errors).toEqual([]);
});

test('desktop: drag and drop moves a task between columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  const firstCard = page.locator('.bardo-card').first();
  const taskTitle = (await firstCard.locator('.text-sm.font-medium').textContent())?.trim();
  expect(taskTitle).toBeTruthy();
  const targetDropzone = page.locator('.bardo-dropzone').nth(1);
  await firstCard.dragTo(targetDropzone);

  await expect.poll(async () => page.evaluate(({ key, title }) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    const task = board?.tasks?.find((item: { title: string }) => item.title === title);
    return task?.status === board?.columns?.[1]?.id;
  }, { key: STORAGE, title: taskTitle })).toBe(true);
  expect(errors).toEqual([]);
});

test('desktop: allows a fifth column and blocks a sixth', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: 'Configurar tablero' }).click();
  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();

  const addColumn = page.getByRole('button', { name: /Columna/ }).filter({ hasText: 'Columna' }).last();
  await expect(page.getByText('4/5 · 4 por defecto')).toBeVisible();
  await addColumn.click();
  await expect(page.getByText('5/5 · 4 por defecto')).toBeVisible();
  await expect(addColumn).toBeDisabled();
  expect(errors).toEqual([]);
});

test('desktop: board tag catalog stops at eight', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.getByRole('button', { name: /Producto/ }).first().click();
  await page.getByRole('button', { name: /Personal/ }).click();
  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: 'Configurar tablero' }).click();
  await expect(page.getByText('4/8 máximo por tablero')).toBeVisible();

  const tagInput = page.getByLabel('Nuevo tag');
  const addTag = page.getByRole('button', { name: 'Añadir', exact: true }).last();
  for (const tag of ['Salud', 'Trabajo', 'Viaje', 'Ideas']) {
    await tagInput.fill(tag);
    await addTag.click();
  }
  await expect(page.getByText('8/8 máximo por tablero')).toBeVisible();
  await tagInput.fill('Noveno');
  await expect(addTag).toBeDisabled();
  expect(errors).toEqual([]);
});

test('desktop: stress adds one thousand tasks and self-test remains green', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const errors = await openApp(page);

  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: '+1000 tareas mock' }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const board = state?.boards?.find((item: { id: string }) => item.id === state.activeBoardId);
    return board?.tasks?.length ?? 0;
  }, STORAGE)).toBe(1180);

  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: 'Configurar tablero' }).click();
  await page.getByRole('button', { name: 'Autoprueba' }).click();
  await expect(page.getByText(/PASS · 4 tableros/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: exposes one column at a time and quick create stays reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  const errors = await openApp(page);

  await expect(page.locator('.bardo-column:visible')).toHaveCount(1);
  await page.getByRole('button', { name: /^Por hacer/ }).click();
  await expect(page.locator('.bardo-column:visible h2')).toHaveText('Por hacer');
  await expect(page.locator('.bardo-column:visible')).toHaveCount(1);

  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
  await expect(page.getByLabel('Título')).toBeVisible();
  expect(errors).toEqual([]);
});
