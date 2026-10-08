// Reuniones: crear, editar y cerrar (descansos explícitos, duración "Otra…",
// reunión nueva, Home, deshacer borrados, acta y anuncio, copiar, abrir desde Discord).
import test from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';

globalThis.DOMParser ??= class DOMParser {
  parseFromString(html) {
    return domino.createDocument(html, true);
  }
};

const {
  isBreakBlock,
  computePlannerTimes,
  parseCustomDurationMinutes,
} = await import('../activity-app/src/planner/time-engine.js');
const {
  nextHalfHourSlot,
  createCleanPlannerSession,
  isDefaultEmptySession,
  getHomeTopSection,
  collectMeetingAgreements,
  generateMinutesMarkdown,
  generateDiscordAnnouncement,
  DEFAULT_MEETING_TITLE,
} = await import('../activity-app/src/planner/planner-store.js');
const {
  removeBlock,
  removeTopic,
  removeAgreement,
  restoreRemoved,
  restoreSessionAgreement,
  createAgendaBlock,
  createBreakBlock,
} = await import('../activity-app/src/planner/agenda-edits.js');
const {buildMinutesDoc} = await import('../activity-app/src/planner/minutes-doc.js');
const {copyTextToClipboard} = await import('../activity-app/src/planner/clipboard.js');
const {plannerSessionLaunchHash} = await import('../activity-app/src/production-bridge.js');
const {
  upcomingStartLabel,
  eventStatusLabel,
  liveStatusLabel,
  formatMeetingDuration,
  formatAgreementsCountLabel,
} = await import('../activity-app/src/planner/copy-tokens.js');

// ── Descansos: solo por tipo explícito ──────────────────────────────────────

test('escribir "Pausa activa" en un bloque nunca lo convierte en descanso ni borra sus temas', () => {
  let planner = computePlannerTimes({
    blocks: [{
      id: 'b1', type: 'block', title: '', durationMinutes: 20, leader: 'Ana', introDesc: 'Contexto',
      subpoints: [{id: 'p1', title: 'Tema 1'}], decisions: [{id: 'd1', content: 'Acuerdo'}],
    }],
  });
  for (const title of ['P', 'Pa', 'Pau', 'Paus', 'Pausa', 'Pausa ', 'Pausa activa']) {
    planner = computePlannerTimes({...planner, blocks: planner.blocks.map((block) => ({...block, title}))});
    const [block] = planner.blocks;
    assert.equal(block.type, 'block', `título "${title}"`);
    assert.equal(block.isBreak, false);
    assert.equal(block.subpoints.length, 1);
    assert.equal(block.decisions.length, 1);
    assert.equal(block.leader, 'Ana');
    assert.equal(block.introDesc, 'Contexto');
  }
  for (const title of ['Descanso', 'Break', 'Breakout rooms']) {
    assert.equal(isBreakBlock({type: 'block', title}), false, title);
  }
});

test('un descanso se reconoce por su tipo aunque se renombre', () => {
  assert.equal(isBreakBlock({type: 'break', title: 'Café'}), true);
  assert.equal(isBreakBlock({type: 'block', isBreak: true, title: 'Pausa'}), false);
});

test('bloques antiguos sin tipo conservan la regla por título (solo legado)', () => {
  assert.equal(isBreakBlock({title: 'Descanso'}), true);
  assert.equal(isBreakBlock({title: ' pausa '}), true);
  assert.equal(isBreakBlock({title: 'Revisión'}), false);
  assert.equal(isBreakBlock({isBreak: true, title: 'Café'}), true);
  const [legacy] = computePlannerTimes({blocks: [{id: 'x', title: 'Break', durationMinutes: 10}]}).blocks;
  assert.equal(legacy.type, 'break');
  const [typed] = computePlannerTimes({blocks: [{id: 'y', title: 'Revisión', durationMinutes: 10}]}).blocks;
  assert.equal(typed.type, 'block');
  // Una vez tipado, renombrarlo a "Pausa" ya no lo cambia.
  assert.equal(isBreakBlock({...typed, title: 'Pausa'}), false);
});

test('los bloques nuevos siempre llevan tipo explícito', () => {
  const block = createAgendaBlock({id: 'b-new'});
  assert.equal(block.type, 'block');
  assert.equal(block.subpoints.length, 1);
  assert.equal(block.subpoints[0].title, '');
  const pause = createBreakBlock({id: 'b-break'});
  assert.equal(pause.type, 'break');
  assert.equal(pause.title, 'Descanso');
  assert.equal(pause.durationMinutes, 10);
});

// ── Duración "Otra…" ────────────────────────────────────────────────────────

test('duración personalizada: minutos enteros entre 1 y 480', () => {
  assert.equal(parseCustomDurationMinutes('40'), 40);
  assert.equal(parseCustomDurationMinutes(' 480 '), 480);
  assert.equal(parseCustomDurationMinutes('1'), 1);
  for (const invalid of ['0', '481', '1.5', '-5', 'abc', '', null, undefined, '40 min']) {
    assert.equal(parseCustomDurationMinutes(invalid), null, String(invalid));
  }
});

// ── Reunión nueva ───────────────────────────────────────────────────────────

test('reunión nueva: próxima media hora (hora local), 60 min y un bloque', () => {
  assert.deepEqual(nextHalfHourSlot(new Date(2026, 9, 8, 10, 7)), {date: '2026-10-08', startTime: '10:30'});
  assert.deepEqual(nextHalfHourSlot(new Date(2026, 9, 8, 10, 0)), {date: '2026-10-08', startTime: '10:30'});
  assert.deepEqual(nextHalfHourSlot(new Date(2026, 9, 8, 10, 30)), {date: '2026-10-08', startTime: '11:00'});
  assert.deepEqual(nextHalfHourSlot(new Date(2026, 9, 8, 18, 59, 40)), {date: '2026-10-08', startTime: '19:00'});
  assert.deepEqual(nextHalfHourSlot(new Date(2026, 9, 8, 23, 45)), {date: '2026-10-09', startTime: '00:00'});

  const meeting = createCleanPlannerSession({now: new Date(2026, 9, 8, 14, 12), host: 'Max'});
  assert.equal(meeting.title, DEFAULT_MEETING_TITLE);
  assert.equal(meeting.title, 'Nueva reunión');
  assert.equal(meeting.date, '2026-10-08');
  assert.equal(meeting.startTime, '14:30');
  assert.equal(meeting.targetDuration, 60);
  assert.equal(meeting.host, 'Max');
  assert.equal(meeting.blocks.length, 1);
  assert.equal(meeting.blocks[0].type, 'block');
  assert.ok(isDefaultEmptySession(meeting));
  // Reuniones guardadas con el título anterior siguen contando como intactas.
  assert.ok(isDefaultEmptySession({...meeting, title: 'Nueva sesión de trabajo'}));
  assert.equal(isDefaultEmptySession({...meeting, title: 'Weekly'}), false);
});

// ── Home ────────────────────────────────────────────────────────────────────

test('Home: "Todavía no hay reuniones" solo cuando de verdad no hay ninguna', () => {
  const placeholder = createCleanPlannerSession({now: new Date(2026, 9, 8, 9, 0)});
  const other = {eventId: 'otra', title: 'Weekly'};
  assert.equal(getHomeTopSection({plannerState: placeholder, events: []}), 'empty');
  assert.equal(getHomeTopSection({plannerState: placeholder, events: [other]}), 'none');
  // Creada con "Nueva reunión": ya está en la lista, se muestra aunque no se haya editado.
  assert.equal(getHomeTopSection({plannerState: placeholder, events: [{eventId: placeholder.id}]}), 'current');
  assert.equal(getHomeTopSection({plannerState: {...placeholder, title: 'Retro'}, events: []}), 'current');
  assert.equal(getHomeTopSection({plannerState: placeholder, sessionStatus: 'running', events: []}), 'current');
});

test('etiquetas de estado y duración usan el vocabulario de Reuniones', () => {
  assert.equal(eventStatusLabel('completed'), 'Terminada');
  assert.equal(eventStatusLabel('in_progress'), 'En curso');
  assert.equal(eventStatusLabel('scheduled'), 'Programada');
  assert.equal(liveStatusLabel('idle'), 'Programada');
  assert.equal(liveStatusLabel('paused'), 'En pausa');
  assert.equal(liveStatusLabel('completed'), 'Terminada');
  assert.equal(formatMeetingDuration(45), '45 min');
  assert.equal(formatMeetingDuration(60), '1 h');
  assert.equal(formatMeetingDuration(95), '1 h 35 min');
  assert.equal(formatAgreementsCountLabel(1), '1 acuerdo');
  assert.equal(formatAgreementsCountLabel(3), '3 acuerdos');
  assert.equal(upcomingStartLabel(20), 'empieza en 20 min');
  assert.equal(upcomingStartLabel(0), 'empieza ahora');
  assert.equal(upcomingStartLabel(-12), 'debía empezar hace 12 min');
});

// ── Deshacer borrados ───────────────────────────────────────────────────────

const AGENDA = {
  id: 'reu-1',
  blocks: [
    {id: 'b1', type: 'block', title: 'Uno', subpoints: [{id: 'p1', title: 'A'}, {id: 'p2', title: 'B'}], decisions: [{id: 'd1', content: 'X'}]},
    {id: 'b2', type: 'block', title: 'Dos', subpoints: [], decisions: []},
    {id: 'b3', type: 'break', title: 'Descanso', subpoints: [], decisions: []},
  ],
};

test('deshacer un bloque lo devuelve a su lugar, una sola vez', () => {
  const {state, removed} = removeBlock(AGENDA, 'b2');
  assert.deepEqual(state.blocks.map((block) => block.id), ['b1', 'b3']);
  const restored = restoreRemoved(state, removed);
  assert.deepEqual(restored.blocks.map((block) => block.id), ['b1', 'b2', 'b3']);
  assert.equal(restoreRemoved(restored, removed), restored, 'no se duplica');
  assert.equal(removeBlock(AGENDA, 'no-existe').removed, null);
});

test('deshacer un tema respeta otros cambios hechos mientras tanto', () => {
  const {state, removed} = removeTopic(AGENDA, 'b1', 'p1');
  const edited = {...state, blocks: state.blocks.map((block) => (block.id === 'b1' ? {...block, title: 'Uno editado'} : block))};
  const restored = restoreRemoved(edited, removed);
  const block = restored.blocks.find((candidate) => candidate.id === 'b1');
  assert.equal(block.title, 'Uno editado');
  assert.deepEqual(block.subpoints.map((point) => point.id), ['p1', 'p2']);
});

test('deshacer un acuerdo cuyo bloque ya no existe no inventa nada', () => {
  const {state, removed} = removeAgreement(AGENDA, 'b1', 'd1');
  assert.equal(state.blocks[0].decisions.length, 0);
  const withoutBlock = removeBlock(state, 'b1').state;
  assert.equal(restoreRemoved(withoutBlock, removed), withoutBlock);
  const back = restoreRemoved(state, removed);
  assert.deepEqual(back.blocks[0].decisions.map((decision) => decision.id), ['d1']);
});

test('deshacer un acuerdo también lo devuelve al estado en vivo, sin duplicar', () => {
  const live = {decisions: [{id: 'd2', content: 'Y'}]};
  const back = restoreSessionAgreement(live, {id: 'd1', content: 'X'});
  assert.deepEqual(back.decisions.map((decision) => decision.id), ['d2', 'd1']);
  assert.equal(restoreSessionAgreement(back, {id: 'd1', content: 'X'}), back);
});

// ── Acta y anuncio ──────────────────────────────────────────────────────────

const MEETING = {
  id: 'reu-acta',
  title: 'Weekly',
  date: '2026-10-08',
  startTime: '10:00',
  host: 'Max',
  blocks: [
    {id: 'b1', type: 'block', title: 'Revisión', durationMinutes: 20, leader: 'Ana', subpoints: [{id: 'p1', title: 'Tema 1'}], decisions: [{id: 'd1', content: 'Acuerdo de revisión'}]},
    {id: 'b2', type: 'block', title: 'Revisión de diseño', durationMinutes: 20, subpoints: [], decisions: [{id: 'd2', content: 'Acuerdo de diseño'}]},
    {id: 'b3', type: 'block', title: '', durationMinutes: 10, subpoints: [], decisions: []},
    {id: 'b4', type: 'break', title: 'Descanso', durationMinutes: 10, subpoints: [], decisions: []},
  ],
};

test('el acta muestra cada acuerdo una vez y solo en su propio bloque', () => {
  const live = {
    status: 'completed',
    pointStatuses: {p1: 'done'},
    decisions: [
      {id: 'd1', blockId: 'b1', pointId: 'p1', content: 'Acuerdo de revisión'},
      {id: 'd2', blockId: 'b2', content: 'Acuerdo de diseño'},
    ],
  };
  const agreements = collectMeetingAgreements(MEETING, live);
  assert.equal(agreements.length, 2);
  assert.equal(agreements.find((agreement) => agreement.id === 'd1').origin, 'Revisión → Tema 1');

  const markdown = generateMinutesMarkdown(MEETING, live);
  assert.equal(markdown.split('Acuerdo de revisión').length - 1, 2, 'resumen + su bloque');
  assert.equal(markdown.split('Acuerdo de diseño').length - 1, 2, 'resumen + su bloque');
  const untitledSection = markdown.slice(markdown.indexOf('### 3.'), markdown.indexOf('### 4.'));
  assert.ok(!untitledSection.includes('Acuerdo'), 'un bloque sin título no recibe acuerdos ajenos');
  assert.match(markdown, /\*\*Facilita:\*\* Max/);
  assert.doesNotMatch(markdown, /Organiza|Conduce|decisiones/);
});

test('el anuncio usa el vocabulario y no numera los descansos', () => {
  const text = generateDiscordAnnouncement(MEETING);
  assert.match(text, /Facilita:\*\* Max/);
  assert.match(text, /Facilita: Ana/);
  assert.match(text, /Agenda de la reunión/);
  assert.match(text, /☕ \*Descanso \(10 min\)\*/);
  assert.match(text, /3\. \*\*Bloque sin título\*\* \(10 min\)/);
  assert.doesNotMatch(text, /^4\./m, 'el descanso no lleva número');
  assert.doesNotMatch(text, /Modera|Lidera|Break|sesión|2026-10-08/);
});

test('guardar el acta en Docs convierte el Markdown a HTML y actualiza el mismo documento', () => {
  const markdown = generateMinutesMarkdown(MEETING, null);
  const first = buildMinutesDoc({id: 'minutes-reu-acta', title: 'Acta: Weekly', body: markdown}, {now: '2026-10-08T12:00:00.000Z', editorName: 'Max'});
  assert.equal(first.id, 'minutes-reu-acta');
  assert.match(first.body, /<h2>/);
  assert.match(first.body, /<li>/);
  assert.doesNotMatch(first.body, /^# |\n## |\*\*Facilita/);
  assert.doesNotMatch(first.body, /<h1>Acta: Weekly<\/h1>/, 'el título no se repite en el cuerpo');

  const second = buildMinutesDoc({id: 'minutes-reu-acta', title: 'Acta: Weekly', body: markdown}, {existing: first, now: '2026-10-08T13:00:00.000Z', editorName: 'Ana'});
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.createdByName, 'Max');
  assert.equal(second.updatedAt, '2026-10-08T13:00:00.000Z');
  assert.equal(second.updatedByName, 'Ana');
});

// ── Copiar ──────────────────────────────────────────────────────────────────

function fakeDocument({copyResult = true} = {}) {
  const appended = [];
  return {
    appended,
    body: {appendChild: (node) => appended.push(node)},
    createElement: () => ({value: '', style: {}, setAttribute() {}, select() {}, remove() { this.removed = true; }}),
    execCommand: (command) => command === 'copy' && copyResult,
  };
}

test('copiar usa el portapapeles y, si Discord lo bloquea, el método alternativo', async () => {
  const writes = [];
  assert.equal(await copyTextToClipboard('hola', {clipboard: {writeText: async (text) => writes.push(text)}, doc: fakeDocument()}), true);
  assert.deepEqual(writes, ['hola']);

  const doc = fakeDocument();
  const blocked = {writeText: async () => { throw new Error('NotAllowedError'); }};
  assert.equal(await copyTextToClipboard('anuncio', {clipboard: blocked, doc}), true);
  assert.equal(doc.appended[0].value, 'anuncio');
  assert.equal(doc.appended[0].removed, true);

  assert.equal(await copyTextToClipboard('x', {clipboard: blocked, doc: fakeDocument({copyResult: false})}), false);
  assert.equal(await copyTextToClipboard('x', {clipboard: undefined, doc: undefined}), false);
});

// ── Abrir desde Discord ─────────────────────────────────────────────────────

test('"Abrir reunión" en Discord abre la agenda de esa reunión, no la lista', () => {
  assert.equal(plannerSessionLaunchHash('reu-1', 'reu-1'), '#planner-agenda');
  assert.equal(plannerSessionLaunchHash('reu-1', 'reu-2'), '#planner');
  assert.equal(plannerSessionLaunchHash('reu-1', null), '#planner');
  assert.equal(plannerSessionLaunchHash('', ''), '#planner');
});
