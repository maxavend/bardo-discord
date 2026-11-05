import {test, expect} from '@playwright/test';

// Pantallas previas al canal en la web. La API se simula: el flujo real de
// sesión y permisos se prueba contra el Worker en test/web-auth.test.js.

const USER = {id: '100', username: 'Maxi', global_name: 'Maxi', avatar: null};

const manyChannels = Array.from({length: 10}, (_, index) => ({
  id: String(300 + index),
  name: index === 4 ? 'un-canal-con-un-nombre-muy-largo-que-no-debe-romper-la-pantalla-en-telefonos' : `canal-${index}`,
  type: index === 9 ? 2 : 0,
  category: index % 2 ? 'Equipos' : null,
}));

function json(route, status, body) {
  return route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
}

/** El Worker marca el HTML solo en el dominio web; aquí se simula esa marca. */
async function asWebApp(page) {
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<head>', '<head><meta name="bardo-web" content="1">');
    await route.fulfill({response, body});
  });
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('sin sesión pide entrar con Discord y explica el error del login', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: null}));
  await page.goto('/?auth_error=cancelled');

  await expect(page.getByRole('heading', {name: 'Entra a Bardo'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Cancelaste');
  await expect(page).toHaveURL(/\/$/);
  const signIn = page.getByRole('button', {name: 'Continuar con Discord'});
  await expect(signIn).toHaveAttribute('href', /^\/auth\/discord\?return_to=/);
  await expectNoHorizontalOverflow(page);
});

test('con sesión y sin canal muestra el selector, busca y abre con teclado', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  await page.route('**/api/web/channels', route => json(route, 200, {
    guilds: [{id: '200', name: 'Estudio Bardo', icon: null, channels: manyChannels}],
    truncated: false,
  }));
  await page.goto('/');

  await expect(page.getByRole('heading', {name: '¿Dónde quieres trabajar?'})).toBeVisible();
  await expect(page.getByText('canal-0')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const search = page.getByRole('searchbox', {name: 'Buscar canal o servidor'});
  await search.fill('sin resultados');
  await expect(page.getByText('Ningún canal coincide')).toBeVisible();
  await search.fill('canal-2');
  const row = page.getByRole('button', {name: /canal-2/});
  await expect(row).toBeVisible();
  await expect(page.getByText('canal-3')).toHaveCount(0);

  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/guild=200&channel=302/);
});

test('sin servidores explica por qué y permite reintentar', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  let calls = 0;
  await page.route('**/api/web/channels', route => {
    calls += 1;
    return calls === 1
      ? json(route, 503, {error: 'discord_unavailable', message: 'Discord está ocupado.'})
      : json(route, 200, {guilds: [], truncated: false});
  });
  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText('Discord está ocupado.');
  await page.getByRole('button', {name: 'Intentar de nuevo'}).click();
  await expect(page.getByRole('heading', {name: 'Todavía no hay canales para abrir'})).toBeVisible();
});

test('un canal sin permiso vuelve al selector con el motivo', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  await page.route('**/api/web/channels', route => json(route, 200, {
    guilds: [{id: '200', name: 'Estudio Bardo', icon: null, channels: manyChannels.slice(0, 2)}],
    truncated: false,
  }));
  await page.route('**/api/web/channel-session', route => json(route, 403, {error: 'channel_forbidden', message: 'No tienes acceso a este canal de Discord.'}));
  await page.goto('/?guild=200&channel=999');

  await expect(page.getByRole('alert')).toContainText('No tienes acceso');
  await expect(page.getByText('canal-0')).toBeVisible();
});

test('con la web apagada no consulta nada, sigue el modo local y permite zoom', async ({page}) => {
  const asked = [];
  const errors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/web/')) asked.push(request.url());
  });
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/');

  await expect(page.locator('.app-root')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Entra a Bardo'})).toHaveCount(0);
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toContain('user-scalable=no');
});
