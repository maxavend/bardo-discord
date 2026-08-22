import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 5 editor reliability exposes accessible conflict, recovery and history surfaces', async () => {
  const source = await readFile(new URL('../../src/activity/editor-reliability.js', import.meta.url), 'utf8');
  assert.match(source, /setAttribute\('role', 'alert'\)/);
  assert.match(source, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /aria-labelledby/);
  assert.match(source, /beforeunload/);
  assert.match(source, /pagehide/);
  assert.match(source, /localStorage/);
  assert.match(source, /Copiar mis cambios/);
  assert.match(source, /Recargar versión actual/);
  assert.match(source, /Recuperar para revisar/);
});
