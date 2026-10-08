// "/doc-new titulo:..." → el editor de documento nuevo abre con ese título.
import test from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';

globalThis.DOMParser ??= class DOMParser {
  parseFromString(html) {
    return domino.createDocument(html, true);
  }
};

const { prefillNewDocTitle } = await import('../activity-app/src/production-bridge.js');
const KEY = 'bardo.docs.heroui.draft.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

test('sin borrador, el título del comando queda en el borrador nuevo', () => {
  const storage = memoryStorage();
  assert.equal(prefillNewDocTitle('Plan Q4', storage), true);
  assert.equal(JSON.parse(storage.getItem(KEY)).title, 'Plan Q4');
});

test('un borrador vacío se reemplaza por el título', () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify({ title: '', description: '', body: '<p><br></p>' }) });
  assert.equal(prefillNewDocTitle('Acta', storage), true);
  assert.equal(JSON.parse(storage.getItem(KEY)).title, 'Acta');
});

test('nunca pisa un borrador con contenido sin terminar', () => {
  const draft = JSON.stringify({ title: '', description: '', body: '<p>Texto a medio escribir</p>' });
  const storage = memoryStorage({ [KEY]: draft });
  assert.equal(prefillNewDocTitle('Otro', storage), false);
  assert.equal(storage.getItem(KEY), draft);
  const titled = memoryStorage({ [KEY]: JSON.stringify({ title: 'Mío', body: '' }) });
  assert.equal(prefillNewDocTitle('Otro', titled), false);
});

test('sin título no hace nada', () => {
  const storage = memoryStorage();
  assert.equal(prefillNewDocTitle('', storage), false);
  assert.equal(storage.getItem(KEY), null);
});
