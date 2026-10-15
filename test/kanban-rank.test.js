import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyBetween,
  isValidRank,
  rebalancedKeys,
  compareCards,
  normalizeSubtasks,
  normalizeIdList,
  isIsoDate,
} from '../activity-app/src/kanban/kanban-shared.js';

test('generateKeyBetween ordena estrictamente entre vecinos y respeta límites abiertos', () => {
  const first = generateKeyBetween(null, null);
  const after = generateKeyBetween(first, null);
  const before = generateKeyBetween(null, first);
  const middle = generateKeyBetween(first, after);
  assert.ok(before < first && first < middle && middle < after);
  for (const key of [first, after, before, middle]) assert.ok(isValidRank(key), key);
});

test('1000 inserciones aleatorias mantienen el orden y claves válidas', () => {
  const keys = [generateKeyBetween(null, null)];
  for (let i = 0; i < 1000; i += 1) {
    const index = Math.floor(Math.random() * (keys.length + 1));
    const key = generateKeyBetween(keys[index - 1] ?? null, keys[index] ?? null);
    assert.ok(isValidRank(key));
    keys.splice(index, 0, key);
  }
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted);
  assert.equal(new Set(keys).size, keys.length);
});

test('insertar siempre al principio o al final crece despacio', () => {
  let top = generateKeyBetween(null, null);
  let bottom = top;
  for (let i = 0; i < 200; i += 1) {
    top = generateKeyBetween(null, top);
    bottom = generateKeyBetween(bottom, null);
  }
  assert.ok(top.length < 48 && bottom.length < 48);
});

test('generateKeyBetween rechaza vecinos invertidos o iguales', () => {
  assert.throws(() => generateKeyBetween('b', 'a'), RangeError);
  assert.throws(() => generateKeyBetween('a', 'a'), RangeError);
  assert.throws(() => generateKeyBetween('a0', null), RangeError);
});

test('rebalancedKeys da claves cortas, únicas y ordenadas', () => {
  for (const n of [1, 2, 7, 61, 500]) {
    const keys = rebalancedKeys(n);
    assert.equal(keys.length, n);
    assert.deepEqual(keys, [...keys].sort());
    assert.equal(new Set(keys).size, n);
    keys.forEach(key => assert.ok(isValidRank(key) && key.length <= 4, key));
    // Siempre queda espacio entre claves vecinas.
    assert.ok(generateKeyBetween(keys[0], keys[1] ?? null));
  }
});

test('compareCards desempata ranks iguales por id', () => {
  const cards = [{id: 'b', rank: 'V'}, {id: 'a', rank: 'V'}, {id: 'c', rank: 'U'}];
  assert.deepEqual(cards.sort(compareCards).map(card => card.id), ['c', 'a', 'b']);
});

test('validadores de subtareas, listas de ids y fechas', () => {
  assert.deepEqual(normalizeSubtasks([{id: 'x', text: ' Uno ', done: 1}, {text: ''}, 'basura']), [{id: 'x', text: 'Uno', done: true}]);
  assert.equal(normalizeSubtasks(Array.from({length: 31}, (_, i) => ({id: `s${i}`, text: 't'}))), false);
  assert.equal(normalizeSubtasks('x'), null);
  assert.deepEqual(normalizeIdList(['a', 'a', ' b ', ''], 5), ['a', 'b']);
  assert.equal(normalizeIdList(['a', 'b', 'c'], 2), false);
  assert.ok(isIsoDate('2028-02-29'));
  assert.ok(!isIsoDate('2026-02-29'));
});
