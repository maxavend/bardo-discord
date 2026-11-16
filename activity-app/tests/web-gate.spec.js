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
const STUDIO = {id: '200', name: 'Estudio Bardo', icon: null, channels: manyChannels};
const LONG_SERVER = 'Comunidad de diseño y desarrollo con un nombre muy largo para comprobar la experiencia en teléfonos';

async function withAccount(page, guilds = [STUDIO]) {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  await page.route('**/api/web/channels', route => json(route, 200, {guilds, truncated: false}));
  await page.route('**/api/web/channel-content?*', route => {
    const guild = guilds.find(item => item.id === new URL(route.request().url()).searchParams.get('guild_id'));
    return guild ? json(route, 200, contentFor(guild)) : json(route, 403, {});
  });
}

function contentFor(guild, values = {}) {
  return {guildId: guild.id, channels: guild.channels.map(channel => ({
    id: channel.id, documents: 0, meetings: 0, tasks: 0, updatedAt: null, ...values[channel.id],
  }))};
}

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

test('la raíz mantiene el home aunque haya un canal reciente y permite retomarlo', async ({page}) => {
  await withAccount(page, [{...STUDIO, channels: manyChannels.slice(0, 2)}]);
  await page.addInitScript(() => localStorage.setItem('bardo.web.channels.v1', JSON.stringify({
    userId: '100',
    channels: [{guildId: '200', channelId: '300'}, {guildId: '200', channelId: '999'}],
  })));
  const opened = [];
  await page.route('**/api/web/channel-session', route => {
    opened.push(route.request().postDataJSON());
    return json(route, 403, {error: 'channel_forbidden', message: 'No tienes acceso a este canal de Discord.'});
  });
  await page.goto('/');

  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Continuar en un canal'})).toBeVisible();
  await expect(page.getByRole('button', {name: /canal-0/})).toBeVisible();
  await expect(page.getByRole('button', {name: /canal-1/})).toHaveCount(0);
  await expect(page.getByRole('searchbox', {name: 'Buscar servidor', exact: true})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(opened).toEqual([]);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', {name: /canal-0/}).click();
  await expect(page).toHaveURL(/guild=200&channel=300/);
  await expect.poll(() => opened).toEqual([{guildId: '200', channelId: '300'}]);
});

test('con cinco recientes muestra primero los servidores y permite elegir sin desplazarse', async ({page}) => {
  await withAccount(page);
  await page.addInitScript(() => localStorage.setItem('bardo.web.channels.v1', JSON.stringify({
    userId: '100',
    channels: Array.from({length: 5}, (_, index) => ({guildId: '200', channelId: String(300 + index)})),
  })));
  await page.goto('/');

  const directory = page.getByRole('region', {name: 'Servidores disponibles', exact: true});
  const recents = page.getByRole('region', {name: 'Continuar en un canal', exact: true});
  await expect(recents.getByRole('button')).toHaveCount(5);
  const studio = directory.getByRole('link', {name: /Estudio Bardo/});
  await expect(studio).toBeInViewport({ratio: 1});
  expect(await directory.evaluate((element, recentHeadingId) => Boolean(
    element.compareDocumentPosition(document.getElementById(recentHeadingId)) & Node.DOCUMENT_POSITION_FOLLOWING
  ), await recents.getAttribute('aria-labelledby'))).toBe(true);
  const serverBox = await studio.boundingBox();
  const recentsBox = await recents.boundingBox();
  expect(serverBox.y + serverBox.height).toBeLessThanOrEqual(recentsBox.y);
  const installBox = await page.getByRole('button', {name: /Agregar Bardo a Discord/}).boundingBox();
  expect(installBox.y).toBeGreaterThan(serverBox.y + serverBox.height);
  await expectNoHorizontalOverflow(page);
  await studio.click();
  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeVisible();
});

test('permite elegir entre servidores, volver al home y buscar nombres largos', async ({page}) => {
  await withAccount(page, [STUDIO, {id: '201', name: LONG_SERVER, icon: null, channels: []}]);
  await page.goto('/');

  const studio = page.getByRole('link', {name: /Estudio Bardo/});
  await expect(studio).toHaveAttribute('href', '/?server=200');
  await expect(page.getByRole('link', {name: new RegExp(LONG_SERVER)})).toHaveAttribute('href', '/?server=201');
  await expect(page.getByRole('button', {name: /canal-0/})).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await studio.click();

  await expect(page).toHaveURL(/server=200/);
  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeFocused();
  await expect(page.getByRole('button', {name: /canal-0/})).toBeVisible();
  await page.goBack();
  await expect(studio).toBeFocused();
  await page.goForward();
  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeFocused();
  const back = page.getByRole('link', {name: 'Mis servidores', exact: true});
  await expect(back).toHaveAttribute('href', '/');
  await back.click();

  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
  const search = page.getByRole('searchbox', {name: 'Buscar servidor', exact: true});
  await search.fill('DESARROLLO');
  await expect(page.getByRole('link', {name: new RegExp(LONG_SERVER)})).toBeVisible();
  await expect(studio).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await search.fill('un servidor que no existe');
  await expect(page.getByRole('link', {name: new RegExp(LONG_SERVER)})).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(/coincide/);
  await search.fill('');
  await expect(studio).toBeVisible();
});

test('dentro del servidor busca canales y los abre con teclado', async ({page}) => {
  await withAccount(page);
  await page.route('**/api/web/channel-session', route => json(route, 403, {error: 'channel_forbidden', message: 'No tienes acceso a este canal de Discord.'}));
  await page.goto('/?server=200');

  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeVisible();
  await expect(page.getByText(manyChannels[4].name)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const search = page.getByRole('searchbox', {name: 'Buscar canal', exact: true});
  await search.fill('sin resultados');
  await expect(page.getByRole('status')).toContainText('Ningún canal coincide');
  await search.fill('canal-2');
  const row = page.getByRole('button', {name: /canal-2/});
  await expect(row).toBeVisible();
  await expect(page.getByText('canal-3')).toHaveCount(0);

  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/guild=200&channel=302/);
});

test('al recorrer 28 canales conserva el regreso y la búsqueda visibles sin solaparse', async ({page}) => {
  const channels = Array.from({length: 28}, (_, index) => ({
    id: String(400 + index), name: `canal-${index}`, type: 0, category: 'Proyecto',
  }));
  await withAccount(page, [{...STUDIO, channels}]);
  await page.goto('/?server=200');
  await page.getByRole('button', {name: 'canal-27', exact: true}).scrollIntoViewIfNeeded();

  const back = page.getByRole('link', {name: 'Mis servidores', exact: true});
  const search = page.getByRole('searchbox', {name: 'Buscar canal', exact: true});
  const refresh = page.getByRole('button', {name: 'Actualizar', exact: true});
  for (const control of [back, search, refresh]) {
    await expect(control).toBeInViewport({ratio: 1});
    expect(await control.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
  }
  const backBox = await back.boundingBox();
  const searchBox = await search.boundingBox();
  const refreshBox = await refresh.boundingBox();
  expect(searchBox.y).toBeGreaterThanOrEqual(backBox.y + backBox.height);
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(refreshBox.x);
  expect(refreshBox.width).toBeGreaterThanOrEqual(44);
  expect(refreshBox.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  await back.click();
  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
});

test('abre el espacio del canal, conserva el tema elegido y vuelve a Mis servidores', async ({page}) => {
  await withAccount(page);
  await page.route('**/api/web/channel-session', route => json(route, 200, {
    bardo_token: 'test-web-token', guild_id: '200', channel_id: '300', user: USER,
  }));
  await page.route('**/api/docs', route => json(route, 200, {documents: [], contextDocumentId: null}));
  await page.route('**/api/discord/channel-context', route => json(route, 200, {
    guildId: '200', channelId: '300', guildName: 'Estudio Bardo', channelName: 'canal-0',
    members: [], roles: [], timeZone: 'America/Santiago', timeZoneSource: 'server',
  }));
  await page.route('**/api/planner/sessions', route => json(route, 200, {sessions: []}));
  await page.route('**/api/kanban/board?*', route => json(route, 200, {
    board: {id: 'board-300', rev: 1, guildId: '200', channelId: '300', columns: [{id: 'todo', name: 'Por hacer', isDone: false}], tags: [], projects: []},
    cards: [], full: true, capabilities: {},
  }));
  const themes = [];
  await page.route('**/api/settings/personal', route => {
    if (route.request().method() === 'PATCH') themes.push(route.request().postDataJSON().theme);
    return json(route, 200, {personal: {theme: themes.at(-1) || 'dark'}});
  });
  await page.goto('/');

  await page.getByRole('button', {name: 'Tu perfil y ajustes, Maxi'}).click();
  const lightTheme = page.getByRole('menuitemradio', {name: 'Claro', exact: true});
  // En móvil las opciones se muestran directamente, sin un submenú lateral.
  if (!await lightTheme.isVisible()) await page.getByRole('menuitem', {name: /^Tema/}).click();
  await lightTheme.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', {name: /Estudio Bardo/}).click();
  await page.getByRole('button', {name: 'canal-0', exact: true}).click();

  await expect(page.locator('#home-title')).toBeVisible();
  await expect(page).toHaveURL(/guild=200&channel=300/);
  await expect.poll(() => themes).toEqual(['light']);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNoHorizontalOverflow(page);
  if (page.viewportSize().width < 768) {
    const back = page.getByRole('link', {name: 'Mis servidores', exact: true});
    await expect(back).toBeInViewport({ratio: 1});
    await back.click();
  } else {
    await page.getByRole('button', {name: 'Tu perfil y ajustes, Maxi'}).click();
    await page.getByRole('menuitem', {name: 'Mis servidores', exact: true}).click();
  }
  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', {name: 'Continuar en un canal'})).toBeVisible();
});

test('un servidor sin canales explica el estado y conserva la salida al home', async ({page}) => {
  await withAccount(page, [{id: '201', name: LONG_SERVER, icon: null, channels: []}]);
  await page.goto('/?server=201');

  await expect(page.getByRole('heading', {name: LONG_SERVER, exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'No hay canales disponibles'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Mis servidores', exact: true})).toBeVisible();
  await expectNoHorizontalOverflow(page);
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
  await expect(page.getByRole('heading', {name: 'No encontramos servidores con Bardo'})).toBeVisible();
  await expect(page.getByRole('button', {name: /Agregar Bardo a Discord/})).toHaveAttribute('href', /discord\.com\/oauth2\/authorize/);
  await expectNoHorizontalOverflow(page);
});

test('un canal sin permiso vuelve al home con el motivo', async ({page}) => {
  await withAccount(page, [{...STUDIO, channels: manyChannels.slice(0, 2)}]);
  await page.route('**/api/web/channel-session', route => json(route, 403, {error: 'channel_forbidden', message: 'No tienes acceso a este canal de Discord.'}));
  await page.goto('/?guild=200&channel=999');

  await expect(page.getByRole('alert')).toContainText('No tienes acceso');
  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
});

test('una respuesta parcial mantiene los servidores disponibles y permite volver a consultar', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  let calls = 0;
  await page.route('**/api/web/channels', route => {
    calls += 1;
    return json(route, 200, {guilds: [STUDIO], truncated: false, partial: calls === 1});
  });
  await page.goto('/');

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
  await page.getByRole('alert').getByRole('button', {name: 'Intentar de nuevo'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
  expect(calls).toBe(2);
});

test('informa la carga de servidores antes de mostrar los resultados', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/web/channels', async route => {
    await pending;
    return json(route, 200, {guilds: [STUDIO], truncated: false});
  });
  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('Buscando tus servidores');
  release();
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
});

test('un fallo al actualizar conserva los servidores que ya estaban disponibles', async ({page}) => {
  await asWebApp(page);
  await page.route('**/api/web/session', route => json(route, 200, {user: USER}));
  let calls = 0;
  await page.route('**/api/web/channels', route => {
    calls += 1;
    return calls === 2
      ? json(route, 503, {message: 'Discord está ocupado.'})
      : json(route, 200, {guilds: [STUDIO], truncated: false});
  });
  await page.goto('/');

  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
  await page.getByRole('button', {name: 'Actualizar', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Discord está ocupado.');
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
  await page.getByRole('button', {name: 'Intentar de nuevo'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
});

test('si caduca la sesión al consultar servidores permite volver a entrar', async ({page}) => {
  await asWebApp(page);
  let sessions = 0;
  await page.route('**/api/web/session', route => {
    sessions += 1;
    return json(route, 200, {user: sessions === 1 ? USER : null});
  });
  await page.route('**/api/web/channels', route => json(route, 401, {error: 'unauthorized'}));
  await page.goto('/');

  await expect(page.getByRole('heading', {name: 'Entra a Bardo'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Continuar con Discord'})).toBeVisible();
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toHaveCount(0);
});

test('un fallo de sesión al iniciar permite recuperarse sin perder el destino de servidor', async ({page}) => {
  await asWebApp(page);
  let calls = 0;
  await page.route('**/api/web/session', route => {
    calls += 1;
    return calls === 1 ? json(route, 503, {}) : json(route, 200, {user: USER});
  });
  await page.route('**/api/web/channels', route => json(route, 200, {guilds: [STUDIO], truncated: false}));
  await page.goto('/?server=200');

  await expect(page.getByRole('heading', {name: 'No pudimos abrir Bardo'})).toBeVisible();
  await page.getByRole('button', {name: 'Intentar de nuevo'}).click();
  await expect(page.getByRole('heading', {name: 'Estudio Bardo', exact: true})).toBeVisible();
  await expect(page).toHaveURL(/server=200/);
});

test('si caduca la sesión al abrir un canal ofrece login conservando el destino', async ({page}) => {
  await withAccount(page);
  await page.route('**/api/web/channel-session', route => json(route, 401, {error: 'unauthorized'}));
  await page.goto('/?guild=200&channel=300');

  await expect(page.getByRole('heading', {name: 'Entra a Bardo'})).toBeVisible();
  const href = await page.getByRole('button', {name: 'Continuar con Discord'}).getAttribute('href');
  expect(new URL(href, 'https://bardo.example').searchParams.get('return_to')).toBe('/?guild=200&channel=300');
});

test('un fallo al cerrar sesión informa que sigue abierta y permite reintentar', async ({page}) => {
  await asWebApp(page);
  let signedOut = false;
  let calls = 0;
  await page.route('**/api/web/session', route => json(route, 200, {user: signedOut ? null : USER}));
  await page.route('**/api/web/channels', route => json(route, 200, {guilds: [STUDIO], truncated: false}));
  await page.route('**/api/web/logout', route => {
    calls += 1;
    if (calls === 1) return json(route, 503, {});
    signedOut = true;
    return json(route, 200, {ok: true});
  });
  await page.goto('/');

  await page.getByRole('button', {name: 'Tu perfil y ajustes, Maxi'}).click();
  await page.getByRole('menuitem', {name: 'Cerrar sesión', exact: true}).click();
  const failure = page.getByRole('alertdialog');
  await expect(failure).toContainText('Tu sesión sigue abierta.');
  await failure.getByRole('button', {name: 'Intentar de nuevo'}).click();
  await expect(page.getByRole('heading', {name: 'Entra a Bardo'})).toBeVisible();
  expect(calls).toBe(2);
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

test('consulta contenido solo al elegir servidor y prioriza los canales actualizados con contenido', async ({page}) => {
  await withAccount(page);
  const asked = [];
  await page.route('**/api/web/channel-content?*', route => {
    asked.push(new URL(route.request().url()).searchParams.get('guild_id'));
    return json(route, 200, contentFor(STUDIO, {
      '300': {documents: 1, tasks: 2, updatedAt: Date.UTC(2026, 10, 15)},
      '304': {documents: 1200, meetings: 3, tasks: 28, updatedAt: Date.UTC(2026, 10, 16)},
    }));
  });
  await page.goto('/');
  await expect(page.getByRole('link', {name: /Estudio Bardo/})).toBeVisible();
  expect(asked).toEqual([]);
  await page.getByRole('link', {name: /Estudio Bardo/}).click();

  const content = page.getByRole('region', {name: /^Con contenido/});
  const empty = page.getByRole('region', {name: /^Canales sin contenido/});
  await expect(content.getByRole('button')).toHaveCount(2);
  await expect(content.getByRole('button').nth(0)).toHaveAccessibleName(manyChannels[4].name);
  await expect(content.getByRole('button').nth(1)).toHaveAccessibleName('canal-0');
  await expect(content.getByRole('button').nth(1)).toHaveAccessibleDescription(/1 documento.*2 tareas/);
  await expect(content).toContainText('1 documento');
  await expect(content).toContainText('2 tareas');
  await expect(empty.getByRole('button')).toHaveCount(8);
  const firstEmpty = await empty.boundingBox();
  const contentBounds = await content.boundingBox();
  expect(firstEmpty.y).toBeGreaterThanOrEqual(contentBounds.y + contentBounds.height);
  expect(asked).toEqual(['200']);
  await expectNoHorizontalOverflow(page);
});

test('busca en canales vacíos y categorías y permite abrir un canal sin contenido', async ({page}) => {
  await withAccount(page);
  await page.route('**/api/web/channel-content?*', route => json(route, 200, contentFor(STUDIO, {
    '300': {documents: 1, updatedAt: Date.UTC(2026, 10, 16)},
  })));
  await page.route('**/api/web/channel-session', route => json(route, 403, {error: 'channel_forbidden', message: 'No tienes acceso a este canal de Discord.'}));
  await page.goto('/?server=200');
  await expect(page.getByRole('region', {name: /^Con contenido/})).toBeVisible();

  const search = page.getByRole('searchbox', {name: 'Buscar canal', exact: true});
  await search.fill('Equipos');
  const empty = page.getByRole('region', {name: /^Canales sin contenido/});
  await expect(empty.getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('button', {name: 'canal-0', exact: true})).toHaveCount(0);
  await search.fill('canal-3');
  const channel = empty.getByRole('button', {name: 'canal-3', exact: true});
  await expect(channel).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await channel.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/guild=200&channel=303/);
});

test('el resumen puede cargar o fallar sin bloquear canales y permite reintentar', async ({page}) => {
  await withAccount(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/api/web/channel-content?*', async route => {
    calls += 1;
    if (calls === 1) {
      await pending;
      return json(route, 503, {message: 'No pudimos consultar el contenido.'});
    }
    return json(route, 200, contentFor(STUDIO, {'302': {meetings: 1, updatedAt: Date.UTC(2026, 10, 16)}}));
  });
  await page.goto('/?server=200');
  const channel = page.getByRole('button', {name: 'canal-2', exact: true});
  await expect(channel).toBeEnabled();
  await expect(page.getByRole('status')).toContainText(/contenido/i);
  await expect(page.getByRole('region', {name: /^Canales sin contenido/})).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('No pudimos consultar el contenido');
  await expect(channel).toBeEnabled();
  await expect(page.getByRole('region', {name: /^Canales sin contenido/})).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', {name: 'Reintentar resumen', exact: true}).click();
  const content = page.getByRole('region', {name: /^Con contenido/});
  await expect(content.getByRole('button', {name: 'canal-2', exact: true})).toBeVisible();
  await expect(content).toContainText('1 reunión');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('si falla actualizar el resumen conserva los datos anteriores y avisa que no están actualizados', async ({page}) => {
  await withAccount(page);
  let calls = 0;
  await page.route('**/api/web/channel-content?*', route => {
    calls += 1;
    return calls === 1
      ? json(route, 200, contentFor(STUDIO, {'300': {documents: 2, updatedAt: Date.UTC(2026, 10, 15)}}))
      : json(route, 503, {message: 'No pudimos consultar el contenido.'});
  });
  await page.goto('/?server=200');
  const content = page.getByRole('region', {name: /^Con contenido/});
  await expect(content).toContainText('2 documentos');
  await page.getByRole('button', {name: 'Actualizar', exact: true}).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByRole('alert')).toContainText(/último|anterior|actualizar/i);
  await expect(content).toContainText('2 documentos');
  await expect(content.getByRole('button', {name: 'canal-0', exact: true})).toBeEnabled();
  await expectNoHorizontalOverflow(page);
});

test('al llegar el resumen mantiene el foco del canal mientras lo reordena', async ({page}) => {
  await withAccount(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/web/channel-content?*', async route => {
    await pending;
    return json(route, 200, contentFor(STUDIO, {'308': {tasks: 2, updatedAt: Date.UTC(2026, 10, 16)}}));
  });
  await page.goto('/?server=200');
  const channel = page.getByRole('button', {name: 'canal-8', exact: true});
  await channel.focus();
  await expect(channel).toBeFocused();
  release();
  const moved = page.getByRole('region', {name: /^Con contenido/}).getByRole('button', {name: 'canal-8', exact: true});
  await expect(moved).toBeFocused();
  await expect(moved).toBeInViewport({ratio: 1});
});

test('un canal sin resumen no se confunde con un canal vacío', async ({page}) => {
  await withAccount(page, [{...STUDIO, channels: manyChannels.slice(0, 3)}]);
  await page.route('**/api/web/channel-content?*', route => json(route, 200, {
    guildId: '200', channels: [
      {id: '300', documents: 1, meetings: 0, tasks: 0, updatedAt: Date.UTC(2026, 10, 16)},
      {id: '301', documents: 0, meetings: 0, tasks: 0, updatedAt: null},
    ],
  }));
  await page.goto('/?server=200');
  await expect(page.getByRole('region', {name: /^Con contenido/})).toBeVisible();
  await expect(page.getByRole('region', {name: /^Canales sin contenido/}).getByRole('button')).toHaveCount(1);
  const unknown = page.getByRole('button', {name: 'canal-2', exact: true});
  await expect(unknown).toBeEnabled();
  await expect(page.getByRole('region', {name: /^Canales sin contenido/}).getByRole('button', {name: 'canal-2', exact: true})).toHaveCount(0);
  await expect(page.getByRole('region', {name: /^Con contenido/}).getByRole('button', {name: 'canal-2', exact: true})).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'Contenido sin consultar', exact: true}).getByRole('button', {name: 'canal-2', exact: true})).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('si vence la sesión al consultar contenido vuelve a pedir Discord y conserva el servidor', async ({page}) => {
  await withAccount(page);
  await page.route('**/api/web/channel-content?*', route => json(route, 401, {error: 'sign_in_required'}));
  await page.goto('/?server=200');
  await expect(page.getByRole('heading', {name: 'Entra a Bardo', exact: true})).toBeVisible();
  const href = await page.getByRole('button', {name: 'Continuar con Discord'}).getAttribute('href');
  expect(new URL(href, 'https://bardo.example').searchParams.get('return_to')).toBe('/?server=200');
  await expect(page.getByRole('button', {name: 'canal-0', exact: true})).toHaveCount(0);
});

test('al cambiar de servidor una respuesta anterior no mezcla el contenido ni bloquea la salida', async ({page}) => {
  const other = {id: '201', name: 'Otra comunidad', icon: null, channels: [
    {id: '600', name: 'otro-canal', type: 0, category: 'Equipo'},
  ]};
  await withAccount(page, [STUDIO, other]);
  let release;
  let requestedFirst = false;
  let abortedFirst = false;
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/web/channel-content' && url.searchParams.get('guild_id') === STUDIO.id) abortedFirst = true;
  });
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/web/channel-content?*', async route => {
    if (new URL(route.request().url()).searchParams.get('guild_id') === STUDIO.id) {
      requestedFirst = true;
      await pending;
      return json(route, 200, contentFor(STUDIO, {'300': {documents: 99, updatedAt: Date.UTC(2026, 10, 16)}}));
    }
    return json(route, 200, contentFor(other, {'600': {tasks: 1, updatedAt: Date.UTC(2026, 10, 15)}}));
  });
  await page.goto('/?server=200');
  await expect.poll(() => requestedFirst).toBe(true);
  await page.getByRole('link', {name: 'Mis servidores', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Mis servidores', exact: true})).toBeVisible();
  await expect.poll(() => abortedFirst).toBe(true);
  await page.getByRole('link', {name: /Otra comunidad/}).click();
  const content = page.getByRole('region', {name: /^Con contenido/});
  await expect(content).toContainText('1 tarea');
  release();
  await expect(page.getByRole('heading', {name: 'Otra comunidad', exact: true})).toBeVisible();
  await expect(content.getByRole('button')).toHaveCount(1);
  await expect(content.getByRole('button')).toHaveAccessibleName('otro-canal');
  await expect(page.getByText('99 documentos')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
