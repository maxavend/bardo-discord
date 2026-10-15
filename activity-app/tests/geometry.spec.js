import {test, expect} from '@playwright/test';

// Un botón al lado de un campo (o de otro control de la misma fila) debe tener
// el mismo alto. Revisa campos con caja visible y botones a ≤ 24 px en su fila.
function auditAdjacentHeights() {
  const visible = el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[inert],[aria-hidden="true"]');
  };
  const boxed = el => {
    const style = getComputedStyle(el);
    const background = style.backgroundColor;
    return (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent')
      || (parseFloat(style.borderTopWidth) > 0 && style.borderTopColor !== 'rgba(0, 0, 0, 0)');
  };
  const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, [role=combobox]')]
    .filter(el => visible(el) && boxed(el));
  const buttons = [...document.querySelectorAll('button, a[data-slot=button]')].filter(visible);
  const problems = [];
  for (const field of fields) {
    const a = field.getBoundingClientRect();
    for (const button of buttons) {
      if (button === field || field.contains(button) || button.contains(field)) continue;
      const b = button.getBoundingClientRect();
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlap < Math.min(a.height, b.height) * 0.5) continue;
      const gap = b.left >= a.right ? b.left - a.right : a.left - b.right;
      if (gap < 0 || gap > 24) continue;
      if (Math.abs(a.height - b.height) > 1) {
        problems.push(`${field.getAttribute('aria-label') || field.placeholder || field.id} (${Math.round(a.height)}px) ↔ ${(button.getAttribute('aria-label') || button.textContent).trim()} (${Math.round(b.height)}px)`);
      }
    }
  }
  return problems;
}

// Un botón nunca parte su texto en dos líneas ni lo deja cortado.
function auditWrappedButtons() {
  const problems = [];
  for (const button of document.querySelectorAll('button, a[data-slot=button]')) {
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height || button.closest('[inert],[aria-hidden="true"]')) continue;
    const label = button.textContent.trim();
    if (!label) continue;
    // Solo el texto (no los íconos): una línea nueva empieza bajo la anterior.
    const rects = [];
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...[...range.getClientRects()].filter(r => r.width > 0));
    }
    rects.sort((a, b) => a.top - b.top);
    const lines = rects.reduce((count, r, i) => (i && r.top >= rects[i - 1].top + rects[i - 1].height * 0.6 ? count + 1 : count), rects.length ? 1 : 0);
    if (lines > 1) problems.push(`${label}: ${lines} líneas`);
    else if (button.scrollWidth > button.clientWidth + 1) problems.push(`${label}: texto cortado`);
  }
  return problems;
}

function rowHeights(selector) {
  return [...document.querySelectorAll(selector)].map(el => Math.round(el.getBoundingClientRect().height)).filter(Boolean);
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    window.__bardoChannelContext = {roles: [], members: [{id: 'u0', username: 'ana', globalName: 'Ana'}]};
  });
  await page.goto('/?theme=dark#docs');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('campos y botones vecinos tienen el mismo alto', async ({page}) => {
  expect(await page.evaluate(auditAdjacentHeights), 'Documentos').toEqual([]);

  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Tareas'}).click();
  await page.getByRole('button', {name: 'Nueva tarea'}).click();
  await page.getByPlaceholder('¿Qué hay que hacer?').fill('Medir alturas');
  await page.getByPlaceholder('¿Qué hay que hacer?').press('Enter');
  await page.getByPlaceholder('¿Qué hay que hacer?').press('Escape');
  expect(await page.evaluate(auditAdjacentHeights), 'Tareas').toEqual([]);
  // Filtros y su menú ⋯ en la misma fila.
  const toolbar = await page.evaluate(rowHeights, '[aria-label="Filtrar tareas"] button, [data-kanban-toolbar-control]');
  expect(new Set(toolbar).size, `filtros: ${toolbar}`).toBe(1);

  await page.getByRole('button', {name: /Abrir tarea #1/}).click();
  const dialog = page.getByRole('dialog', {name: /Tarea #1/});
  await dialog.getByRole('button', {name: 'Elegir responsable'}).click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', {name: 'Listo'}).click();
  // El avatar del responsable queda pegado al borde derecho del contenido de la tarjeta.
  const avatar = await page.locator('.kanban-card').first().evaluate(card => {
    const style = getComputedStyle(card);
    const contentRight = card.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    const avatarRight = card.querySelector('[data-slot=avatar]')?.getBoundingClientRect().right;
    return {contentRight, avatarRight};
  });
  expect(Math.abs(avatar.avatarRight - avatar.contentRight), JSON.stringify(avatar)).toBeLessThanOrEqual(1);
  await page.getByRole('button', {name: /Abrir tarea #1/}).click();
  await dialog.getByLabel('Nueva subtarea').fill('Paso');
  expect(await page.evaluate(auditAdjacentHeights), 'Detalle de tarea').toEqual([]);
  await dialog.getByRole('button', {name: 'Listo'}).click();

  await page.getByRole('button', {name: 'Más opciones del tablero'}).click();
  await page.getByRole('menuitem', {name: /Etiquetas/}).click();
  expect(await page.evaluate(auditAdjacentHeights), 'Etiquetas').toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Ajustes'})).toBeVisible();
  expect(await page.evaluate(auditAdjacentHeights), 'Ajustes').toEqual([]);
});

test('ningún botón parte su texto en dos líneas', async ({page}) => {
  expect(await page.evaluate(auditWrappedButtons), 'Documentos').toEqual([]);

  await page.getByRole('navigation', {name: 'Módulos de Bardo'}).getByRole('link', {name: 'Reuniones'}).click();
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await expect(page.getByPlaceholder('Nombre de la reunión')).toBeVisible();
  await page.getByRole('button', {name: 'Más opciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Archivar reunión'}).click();
  const confirm = page.getByRole('alertdialog', {name: '¿Archivar esta reunión?'});
  await expect(confirm.getByRole('button', {name: 'Sí, archivar'})).toBeVisible();
  expect(await page.evaluate(auditWrappedButtons), 'Archivar reunión').toEqual([]);
});
