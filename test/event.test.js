import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEventTimeline,
  eventTarget,
  parseEventTarget,
  generateEventMinutesMarkdown,
  totalEventAgendaMinutes,
  zonedDateTimeToUtcIso,
} from '../src/event.js';

test('eventTarget y parseEventTarget mantienen IDs opacos', () => {
  assert.equal(eventTarget('abc-123'), 'event:abc-123');
  assert.equal(parseEventTarget('event:abc-123'), 'abc-123');
  assert.equal(parseEventTarget('bardo:event:abc-123'), 'abc-123');
  assert.equal(parseEventTarget('board:abc'), null);
});

test('calculateEventTimeline desplaza horas según duración de bloques', () => {
  const event = {
    startTime: '15:00',
    blocks: [
      { id: 'a', title: 'Check-in', position: 0, durationMinutes: 10 },
      { id: 'b', title: 'ORION', position: 1, durationMinutes: 60 },
      { id: 'c', title: 'Break', position: 2, durationMinutes: 10 },
    ],
  };
  const timeline = calculateEventTimeline(event);
  assert.deepEqual(timeline.map((block) => block.startTime), ['15:00', '15:10', '16:10']);
  assert.equal(timeline[2].endTime, '16:20');
  assert.equal(totalEventAgendaMinutes(event), 80);
});

test('zonedDateTimeToUtcIso produce ISO válido respetando zona', () => {
  const iso = zonedDateTimeToUtcIso('2026-08-20', '15:00', 'America/Santiago');
  assert.match(iso, /^2026-08-20T\d{2}:00:00\.000Z$/);
});

test('generateEventMinutesMarkdown reutiliza estructura, decisiones y tareas', () => {
  const markdown = generateEventMinutesMarkdown({
    title: 'Weekly Diseño',
    eventDate: '2026-08-20',
    startTime: '15:00',
    description: 'Revisar avances.',
    participants: [{ userId: '1', displayName: 'Cami' }, { userId: '2', displayName: 'Maxi' }],
    blocks: [{
      id: 'b1', title: 'ORION', position: 0, durationMinutes: 60,
      leads: [{ userId: '1', displayName: 'Cami' }], notes: [], decisions: [], tasks: [],
      items: [{
        id: 'i1', title: 'Mi Plan', durationMinutes: 15, speakers: [{ userId: '2', displayName: 'Maxi' }],
        links: [{ label: 'Figma', url: 'https://figma.com/file/demo' }],
        notes: [{ content: 'Revisar copy.' }], decisions: [{ content: 'Mantener navegación inferior.' }],
        tasks: [{ title: 'Validar con CX', assigneeName: 'Cami' }],
      }],
    }],
    decisions: [{ content: 'Mantener navegación inferior.' }],
    tasks: [{ title: 'Validar con CX', assigneeName: 'Cami' }],
  });
  assert.match(markdown, /# Weekly Diseño — 2026-08-20/);
  assert.match(markdown, /## ORION/);
  assert.match(markdown, /### Mi Plan/);
  assert.match(markdown, /\[Figma\]\(https:\/\/figma\.com\/file\/demo\)/);
  assert.match(markdown, /Mantener navegación inferior/);
  assert.match(markdown, /\[ \] Validar con CX — Cami/);
});
