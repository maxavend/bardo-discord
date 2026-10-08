import {test, expect} from '@playwright/test';

// Flujos de Reuniones de punta a punta en modo standalone (localStorage).
const MEMBERS = ['Juan Carlos', 'Max Avendaño', 'Anderson', 'Paula Molina'];

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(members => {
    window.__bardoChannelContext = {
      roles: [{id: 'r1', name: 'Lead', color: '#E67E22'}],
      members: members.map((name, index) => ({id: `u${index}`, username: name.toLowerCase().replace(/ /g, '.'), globalName: name})),
    };
  }, MEMBERS);
  await page.goto('/?theme=dark#planner');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('Todavía no hay reuniones')).toBeVisible();
});

async function createMeeting(page) {
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await expect(page.getByPlaceholder('Nombre de la reunión')).toBeVisible();
}

async function setTime(page, fieldName, hour, minute, period, {commit = 'enter'} = {}) {
  await page.getByRole('button', {name: fieldName}).click();
  const hourInput = page.getByLabel('Hora', {exact: true});
  await hourInput.fill('');
  await hourInput.pressSequentially(hour);
  const minuteInput = page.getByLabel('Minutos', {exact: true});
  await minuteInput.fill('');
  await minuteInput.pressSequentially(minute);
  await page.getByRole('button', {name: period, exact: true}).click();
  if (commit === 'enter') {
    await minuteInput.press('Enter');
  } else {
    // Cerrar haciendo clic fuera debe guardar, igual que cualquier campo.
    await page.mouse.click(5, 5);
  }
  await expect(hourInput).toBeHidden();
}

test('sin reuniones no aparece el aviso de "empieza en…"', async ({page}) => {
  await expect(page.getByText(/empieza en/)).toHaveCount(0);
});

test('hora de inicio, término y facilitador se guardan y sobreviven a recargar', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await createMeeting(page);

  // Hora de dos dígitos con Enter (antes volvía al valor anterior).
  await setTime(page, 'Hora de inicio', '02', '00', 'PM');
  await expect(page.getByRole('button', {name: 'Hora de inicio'})).toContainText('02:00 p.m.');

  // Término cerrando con clic afuera (antes se descartaba).
  await setTime(page, 'Término', '03', '30', 'PM', {commit: 'outside'});
  await expect(page.getByRole('button', {name: 'Término'})).toContainText('03:30 p.m.');
  await expect(page.getByText('quedan 1h 15m libres')).toBeVisible();

  // Mover el inicio conserva la duración reservada.
  await setTime(page, 'Hora de inicio', '04', '00', 'PM');
  await expect(page.getByRole('button', {name: 'Término'})).toContainText('05:30 p.m.');

  // Un término antes del inicio no se acepta.
  await setTime(page, 'Término', '03', '00', 'PM');
  await expect(page.getByRole('button', {name: 'Término'})).toContainText('05:30 p.m.');

  // Facilitador: una sola persona, el menú se cierra al elegir y se puede quitar.
  await page.getByRole('button', {name: 'Facilita', exact: true}).click();
  await page.getByRole('option', {name: /Anderson/}).click();
  await expect(page.getByPlaceholder('Buscar persona...')).toBeHidden();
  await expect(page.getByRole('button', {name: 'Facilita', exact: true})).toContainText('Anderson');
  await page.getByRole('button', {name: 'Facilita', exact: true}).click();
  await expect(page.locator('[role="option"][data-checked="true"]')).toHaveCount(1);
  await page.getByRole('option', {name: 'Quitar facilitador'}).click();
  await expect(page.getByRole('button', {name: 'Facilita', exact: true})).toContainText('Elegir persona');
  await page.getByRole('button', {name: 'Facilita', exact: true}).click();
  await page.getByRole('option', {name: /Paula Molina/}).click();

  await page.getByRole('button', {name: 'Listo'}).click();
  await expect(page.getByText('16:00 – 17:30')).toBeVisible();

  await page.reload();
  await expect(page.getByText('16:00 – 17:30')).toBeVisible();
  await expect(page.getByText('Paula Molina').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('AM/PM: el botón interior es concéntrico con su marco', async ({page}) => {
  await createMeeting(page);
  await page.getByRole('button', {name: 'Hora de inicio'}).click();
  const radii = await page.getByRole('button', {name: 'AM', exact: true}).evaluate(item => {
    const group = item.parentElement;
    const groupStyle = getComputedStyle(group);
    return {
      outer: parseFloat(groupStyle.borderTopLeftRadius),
      inset: parseFloat(groupStyle.borderTopWidth) + parseFloat(groupStyle.paddingTop),
      inner: [parseFloat(getComputedStyle(item).borderTopLeftRadius), parseFloat(getComputedStyle(item).borderTopRightRadius)],
    };
  });
  expect(radii.inner[0]).toBeCloseTo(radii.outer - radii.inset, 0);
  expect(radii.inner[1]).toBeCloseTo(radii.outer - radii.inset, 0);
});

test('un bloque llamado "Pausa activa" conserva sus temas, y borrar un bloque se puede deshacer', async ({page}) => {
  await createMeeting(page);
  await page.getByRole('button', {name: 'Agregar tema'}).first().click();
  const tema = page.getByPlaceholder(/Título del tema/).first();
  await tema.pressSequentially('Revisar presupuesto');
  const blockTitle = page.getByPlaceholder('Título del bloque').first();
  await blockTitle.fill('');
  // Escribir letra a letra pasa por "Pausa", que antes lo convertía en descanso y borraba los temas.
  await blockTitle.pressSequentially('Pausa activa');
  await expect(page.getByPlaceholder(/Título del tema/).first()).toHaveValue('Revisar presupuesto');

  await page.getByRole('button', {name: 'Opciones del bloque'}).first().click();
  await page.getByRole('menuitem', {name: 'Eliminar bloque'}).click();
  await expect(page.getByPlaceholder('Título del bloque')).toHaveCount(0);
  await page.getByRole('button', {name: 'Deshacer'}).click();
  await expect(page.getByPlaceholder('Título del bloque').first()).toHaveValue('Pausa activa');
});

test('reunión en vivo: tiempo restante, pausa congela el reloj, terminar pide confirmación y se puede reabrir', async ({page}) => {
  const errors = collectRuntimeErrors(page);
  await createMeeting(page);
  await page.getByRole('button', {name: 'Listo'}).click();
  await page.getByRole('button', {name: 'Iniciar reunión'}).first().click();

  const dock = page.getByRole('region', {name: 'Controles de la reunión en curso'});
  await expect(dock).toBeVisible();
  await expect(dock).toContainText(/Quedan \d+:\d\d/);

  await dock.getByRole('button', {name: 'Pausar reunión'}).click();
  const frozen = (await dock.textContent()).match(/Quedan \d+:\d\d/)?.[0];
  await page.waitForTimeout(2200);
  expect((await dock.textContent()).match(/Quedan \d+:\d\d/)?.[0]).toBe(frozen);
  await dock.getByRole('button', {name: 'Reanudar reunión'}).click();

  // Recargar a mitad de reunión mantiene la reunión en curso.
  await page.reload();
  await expect(page.getByRole('region', {name: 'Controles de la reunión en curso'})).toBeVisible();

  await page.getByRole('button', {name: 'Más acciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Terminar reunión'}).click();
  const dialog = page.getByRole('dialog', {name: '¿Terminar la reunión?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Seguir en la reunión'}).click();
  await expect(page.getByRole('region', {name: 'Controles de la reunión en curso'})).toBeVisible();

  await page.getByRole('button', {name: 'Más acciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Terminar reunión'}).click();
  await page.getByRole('dialog', {name: '¿Terminar la reunión?'}).getByRole('button', {name: 'Terminar reunión'}).click();
  await expect(page.getByRole('button', {name: 'Reabrir reunión'})).toBeVisible();

  await page.getByRole('button', {name: 'Reabrir reunión'}).click();
  await expect(page.getByRole('region', {name: 'Controles de la reunión en curso'})).toBeVisible();
  expect(errors).toEqual([]);
});
