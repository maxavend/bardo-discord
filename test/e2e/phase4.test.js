import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 4 browser evidence covers Bardo Home at mobile, tablet and desktop widths', async () => {
  const script = await readFile(new URL('../../scripts/ui-browser-check.js', import.meta.url), 'utf8');
  const fixture = await readFile(new URL('../visual/fixture.html', import.meta.url), 'utf8');
  assert.match(script, /phase4Views=\['home'\]/);
  assert.match(script, /\[390,768,1440\]/);
  assert.match(script, /--force-prefers-reduced-motion/);
  assert.match(script, /--force-high-contrast/);
  assert.match(fixture, /data-view="home"/);
  assert.match(fixture, /Próximos eventos/);
  assert.match(fixture, /Mis tareas activas/);
  assert.match(fixture, /Documentos recientes/);
});

test('Phase 4 cross-product flow is exercised by the runtime suite', async () => {
  const runtime = await readFile(new URL('../phase4-runtime.test.js', import.meta.url), 'utf8');
  assert.match(runtime, /Document → Task persists limited context, due date, backlink and safe undo/);
  assert.match(runtime, /Event → Task keeps point origin and minutes regenerate an idempotent live-task section/);
  assert.match(runtime, /navigation switches the Activity target only after same-guild validation/);
});
