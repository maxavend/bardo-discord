// Horario planificado de una reunión: "Término" ↔ duración reservada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { durationUntil, getPlannedSchedule } from '../activity-app/src/planner/time-engine.js';

test('el término elegido se respeta aunque los temas sumen menos (queda tiempo libre)', () => {
  const s = getPlannedSchedule({ startTime: '10:00', targetDuration: 60, blocks: [{ durationMinutes: 15 }] });
  assert.equal(s.plannedEnd, '11:00');
  assert.equal(s.plannedMinutes, 60);
  assert.equal(s.freeMinutes, 45);
  assert.equal(s.overMinutes, 0);
});

test('si los temas suman más que lo reservado, el término real es el de los temas y se avisa', () => {
  const s = getPlannedSchedule({ startTime: '14:30', targetDuration: 30, blocks: [{ durationMinutes: 30 }, { durationMinutes: 15 }] });
  assert.equal(s.plannedEnd, '15:15');
  assert.equal(s.overMinutes, 15);
  assert.equal(s.freeMinutes, 0);
});

test('reuniones antiguas sin duración reservada usan la suma de los temas (sin cambios)', () => {
  const s = getPlannedSchedule({ startTime: '17:45', blocks: [{ durationMinutes: 90 }, { durationMinutes: 90 }] });
  assert.equal(s.plannedEnd, '20:45');
  assert.equal(s.freeMinutes, 0);
  assert.equal(s.overMinutes, 0);
});

test('mover la hora de inicio conserva la duración reservada', () => {
  const before = getPlannedSchedule({ startTime: '10:00', targetDuration: 45, blocks: [] });
  const after = getPlannedSchedule({ startTime: '14:30', targetDuration: 45, blocks: [] });
  assert.equal(before.plannedEnd, '10:45');
  assert.equal(after.plannedEnd, '15:15');
});

test('en vivo, las extensiones de bloque corren el término estimado solo si superan el tiempo libre', () => {
  const live = { blockExtensions: { b1: { extensionMinutes: 10 } } };
  assert.equal(getPlannedSchedule({ startTime: '10:00', targetDuration: 60, blocks: [{ durationMinutes: 15 }] }, live).estimatedEnd, '11:00');
  assert.equal(getPlannedSchedule({ startTime: '10:00', targetDuration: 60, blocks: [{ durationMinutes: 55 }] }, live).estimatedEnd, '11:05');
});

test('durationUntil rechaza un término igual o un probable error a.m./p.m.', () => {
  assert.equal(durationUntil('14:30', '15:15'), 45);
  assert.equal(durationUntil('14:30', '14:30'), null);
  // 14:30 → 02:45 would be 12 h 15 min: almost surely an a.m./p.m. slip.
  assert.equal(durationUntil('14:30', '02:45'), null);
});

test('durationUntil acepta reuniones que cruzan la medianoche (hasta 12 h)', () => {
  assert.equal(durationUntil('23:30', '00:30'), 60);
  assert.equal(durationUntil('22:00', '01:15'), 195);
  assert.equal(durationUntil('20:00', '08:00'), 720);
  assert.equal(durationUntil('20:00', '08:01'), null);
});
