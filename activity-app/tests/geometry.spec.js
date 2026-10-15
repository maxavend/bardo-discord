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

  await page.getByRole('button', {name: /^Espacio: /}).click();
  await expect(page.getByRole('dialog', {name: 'Ajustes'})).toBeVisible();
  expect(await page.evaluate(auditAdjacentHeights), 'Ajustes').toEqual([]);
});
