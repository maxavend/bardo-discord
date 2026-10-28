import test from 'node:test';
import assert from 'node:assert/strict';
import {focusMeeting, groupTasksByUrgency, longDate, meetingList, meetingWhen} from '../activity-app/src/home-model.js';
import {canEditDoc, canManageDoc, docRole, docSpaceNote, isSharedWithMe} from '../activity-app/src/doc-space.js';

const card = (number, dueDate = null) => ({id: `c${number}`, number, title: `Tarea ${number}`, dueDate});

test('las tareas se agrupan por urgencia y se recortan sin grupos vacíos', () => {
  const cards = [card(1, '2026-10-30'), card(2, '2026-10-20'), card(3), card(4, '2026-10-28'), card(5, '2026-12-01'), card(6, '2026-10-27')];
  const {groups, total, overdue, dueToday} = groupTasksByUrgency(cards, '2026-10-28', {limit: 4});
  assert.equal(total, 6);
  assert.equal(overdue, 2);
  assert.equal(dueToday, 1);
  assert.deepEqual(groups.map(group => group.id), ['overdue', 'today', 'week']);
  // Las vencidas, de la más antigua a la más reciente.
  assert.deepEqual(groups[0].cards.map(item => item.number), [2, 6]);
  assert.equal(groups.reduce((sum, group) => sum + group.cards.length, 0), 4);
});

const at = (date, time) => Date.parse(`${date}T${time}`);

test('la reunión de ahora: la en curso gana; si no, la próxima de la semana', () => {
  const now = at('2026-10-28', '10:00');
  const meetings = [
    {id: 'lejana', date: '2026-11-20', startTime: '10:00', eventStatus: 'scheduled'},
    {id: 'manana', date: '2026-10-29', startTime: '09:00', eventStatus: 'scheduled'},
    {id: 'pasada', date: '2026-10-27', startTime: '09:00', eventStatus: 'finished'},
  ];
  assert.equal(focusMeeting(meetings, now)?.id, 'manana');
  assert.equal(focusMeeting([...meetings, {id: 'vivo', date: '2026-10-28', startTime: '08:00', eventStatus: 'in_progress'}], now)?.id, 'vivo');
  // Programada y dentro de su horario: sigue siendo la de ahora.
  const started = {id: 'ya', date: '2026-10-28', startTime: '09:30', targetDuration: 60, eventStatus: 'scheduled'};
  assert.equal(focusMeeting([started, ...meetings], now)?.id, 'ya');
  assert.equal(focusMeeting([meetings[0]], now), null);
});

test('la hora de una reunión se dice en relativo cuando está cerca', () => {
  const now = at('2026-10-28', '10:00');
  assert.equal(meetingWhen({eventStatus: 'in_progress'}, now), 'En curso');
  assert.equal(meetingWhen({date: '2026-10-28', startTime: '10:25'}, now), 'En 25 min');
  assert.equal(meetingWhen({date: '2026-10-28', startTime: '15:00'}, now), 'Hoy, 15:00');
  assert.equal(meetingWhen({date: '2026-10-29', startTime: '09:00'}, now), 'Mañana, 09:00');
  assert.equal(meetingWhen({date: '2026-10-28', startTime: '09:30', targetDuration: 60}, now), 'Ahora, 09:30');
});

test('la lista de reuniones muestra próximas y completa con las recientes', () => {
  const now = at('2026-10-28', '10:00');
  const meetings = [
    {id: 'a', date: '2026-10-29', startTime: '09:00', eventStatus: 'scheduled'},
    {id: 'b', date: '2026-10-27', startTime: '09:00', eventStatus: 'finished'},
    {id: 'c', date: '2026-10-20', startTime: '09:00', eventStatus: 'finished'},
  ];
  const {upcoming, past} = meetingList(meetings, now, {exclude: null, limit: 2});
  assert.deepEqual(upcoming.map(item => item.id), ['a']);
  assert.deepEqual(past.map(item => item.id), ['b']);
  assert.deepEqual(meetingList(meetings, now, {exclude: 'a', limit: 3}).upcoming, []);
});

test('la fecha larga empieza con mayúscula', () => {
  assert.match(longDate(at('2026-10-28', '12:00')), /^Miércoles 28 de octubre$/);
});

test('roles de documentos: lo propio se gestiona, lo compartido para leer no se edita', () => {
  assert.equal(docRole({}), 'channel');
  assert.equal(docRole({space: 'personal'}), 'owner');
  const viewer = {space: 'personal', role: 'viewer'};
  assert.equal(canEditDoc(viewer), false);
  assert.equal(canManageDoc(viewer), false);
  assert.equal(isSharedWithMe(viewer), true);
  assert.equal(docSpaceNote(viewer), 'Compartido contigo · Solo lectura');
  assert.equal(canManageDoc({space: 'personal', role: 'editor'}), false);
  assert.equal(canEditDoc({space: 'personal', role: 'editor'}), true);
  assert.equal(docSpaceNote({space: 'personal', linkAccess: 'read'}), 'Con enlace');
  assert.equal(docSpaceNote({space: 'personal'}), 'Solo tú');
});
