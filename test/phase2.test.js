import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatRelativeTime,
  localDateTimeToInstant,
  parseClock,
  parseDuration,
  parseLocalDate,
  resolveTimezone,
} from '../src/lib/time.js';
import { MemberDirectoryService } from '../src/services/member-directory.js';
import { DiscordDmError, sendDiscordDm } from '../src/services/discord-dm.js';

test('parseDuration acepta los formatos flexibles definidos por el producto', () => {
  const cases = new Map([
    ['60m', 60], ['90m', 90], ['3h', 180], ['3:30h', 210], ['3h30m', 210], ['3h 30m', 210], ['90', 90],
  ]);
  for (const [input, minutes] of cases) assert.equal(parseDuration(input).minutes, minutes, input);
  assert.equal(parseDuration('3h30m').normalized, '3h 30m');
});

test('parseDuration rechaza negativos, minutos de reloj imposibles y máximos de producto', () => {
  assert.throws(() => parseDuration('-5m'), /negativa/);
  assert.throws(() => parseDuration('3:90h'), /0 y 59/);
  assert.throws(() => parseDuration('721m', { maxMinutes: 720 }), /entre 0 y 720/);
});

test('parseClock acepta 24h y 12h incluyendo 12 am/pm', () => {
  const cases = new Map([
    ['15', '15:00'], ['15:30', '15:30'], ['3pm', '15:00'], ['3:30pm', '15:30'], ['3:30 pm', '15:30'], ['12 am', '00:00'], ['12 pm', '12:00'],
  ]);
  for (const [input, normalized] of cases) assert.equal(parseClock(input).normalized, normalized, input);
  assert.throws(() => parseClock('24:90'), /15:30/);
  assert.throws(() => parseClock('13pm'), /15:30/);
});

test('fechas locales validan calendario real y bisiestos', () => {
  assert.equal(parseLocalDate('2028-02-29', 'UTC').localDate, '2028-02-29');
  assert.throws(() => parseLocalDate('2027-02-29', 'UTC'), /no existe/);
  assert.throws(() => parseLocalDate('2026-13-01', 'UTC'), /no existe/);
});

test('timezone usa precedencia evento → usuario → servidor → fallback', () => {
  assert.equal(resolveTimezone({ eventTimezone: 'Europe/Madrid', userTimezone: 'America/Santiago', guildTimezone: 'UTC' }), 'Europe/Madrid');
  assert.equal(resolveTimezone({ eventTimezone: 'No/Existe', userTimezone: 'America/Santiago', guildTimezone: 'UTC' }), 'America/Santiago');
  assert.equal(resolveTimezone({ eventTimezone: '', userTimezone: '', guildTimezone: 'Europe/London' }), 'Europe/London');
  assert.equal(resolveTimezone({ fallback: 'UTC' }), 'UTC');
});

test('DST rechaza hora inexistente y conserva una hora válida en el retroceso', () => {
  assert.throws(() => localDateTimeToInstant('2026-03-08', '02:30', 'America/New_York'), /horario de verano/);
  const fallBack = localDateTimeToInstant('2026-11-01', '01:30', 'America/New_York');
  assert.match(fallBack, /^2026-11-01T0[56]:30:00\.000Z$/);
});

test('formatRelativeTime entrega una etiqueta localizada útil', () => {
  const now = new Date('2026-08-20T20:00:00.000Z');
  const label = formatRelativeTime('2026-08-20T21:00:00.000Z', now, 'es');
  assert.match(label, /1/);
});

test('MemberDirectory busca después de dos caracteres, limita, filtra bots y unifica el modelo', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/roles')) {
      return new Response(JSON.stringify([
        { id: 'role-1', name: 'Diseño', position: 10 },
        { id: 'role-2', name: 'Equipo', position: 1 },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify([
      { user: { id: '111111111111111111', username: 'max', global_name: 'Max' }, nick: 'Maxi', roles: ['role-1'] },
      { user: { id: '222222222222222222', username: 'bardo-bot', bot: true }, roles: [] },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const service = new MemberDirectoryService({ DISCORD_TOKEN: 'test-token' });
    assert.deepEqual(await service.search({ guildId: '123456789012345678', query: 'm' }), []);
    assert.equal(calls.length, 0);
    const members = await service.search({ guildId: '123456789012345678', query: 'ma', limit: 25 });
    assert.equal(members.length, 1);
    assert.deepEqual(members[0], {
      userId: '111111111111111111', displayName: 'Maxi', username: 'max', avatarUrl: null,
      roleIds: ['role-1'], roleLabel: 'Diseño', isBot: false, source: 'discord_search',
    });
    assert.ok(calls.some((url) => url.includes('/members/search?query=ma&limit=25')));
    assert.ok(calls.some((url) => url.endsWith('/roles')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Discord DM clasifica privacidad cerrada como no transitoria', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 50007 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  try {
    await assert.rejects(
      sendDiscordDm({ DISCORD_TOKEN: 'token' }, { userId: '123456789012345678', content: 'Hola' }),
      (error) => error instanceof DiscordDmError && error.privacy === true && error.transient === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 2 wiring usa TaskService en slash, Kanban y Planner y mantiene autocomplete autorizado', () => {
  const worker = fs.readFileSync(new URL('../src/p2-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /new TaskService\(env\)\.create/);
  assert.match(worker, /handleBoardTaskCreate/);
  assert.match(worker, /handleEventTaskCreate/);
  assert.match(worker, /APPLICATION_COMMAND_AUTOCOMPLETE/);
  assert.match(worker, /verifyActivityAccess/);
  assert.match(worker, /\/api\/member-directory/);
});

test('MemberPicker remoto implementa debounce, cancelación y navegación por teclado', () => {
  const source = fs.readFileSync(new URL('../src/activity/member-picker-remote.js', import.meta.url), 'utf8');
  assert.match(source, /DEBOUNCE_MS = 200/);
  assert.match(source, /MIN_QUERY_LENGTH = 2/);
  assert.match(source, /AbortController/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']) assert.ok(source.includes(key), key);
  assert.match(source, /aria-autocomplete/);
  assert.match(source, /\/api\/member-directory\?query=/);
});

test('registro de comandos prepara autocomplete sin registrar nada durante tests', () => {
  const source = fs.readFileSync(new URL('../scripts/register-commands.js', import.meta.url), 'utf8');
  assert.match(source, /setName\('documento'\)/);
  assert.ok((source.match(/setAutocomplete\(true\)/g) || []).length >= 5);
  assert.match(source, /setName\('duracion'\).*60m, 90m, 3h/s);
  assert.match(source, /setName\('responsable'\)/);
});
