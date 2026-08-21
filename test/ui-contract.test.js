import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Phase 3 exposes shared semantic tokens and reduced-motion contract', async () => {
  const css = await read('src/activity/ui/tokens.css');
  for (const token of ['--bardo-bg','--bardo-surface','--bardo-text','--bardo-accent','--bardo-focus','--bardo-space-4','--bardo-radius-card','--bardo-touch']) assert.match(css, new RegExp(token));
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('Phase 3 keeps terminal Kanban space and responsive modal sheet behavior', async () => {
  const modules = await read('src/activity/ui/modules.css');
  const patterns = await read('src/activity/ui/patterns.css');
  assert.match(modules, /kanban-track::after/);
  assert.match(modules, /scroll-padding-inline/);
  assert.match(patterns, /border-radius:\s*18px 18px 0 0/);
});

test('shared runtime provides navigation, dialog focus trap and focus restoration', async () => {
  const runtime = await read('src/activity/ui/runtime.js');
  const primitives = await read('src/activity/ui/primitives.js');
  assert.match(runtime, /Inicio/); assert.match(runtime, /Documentos/); assert.match(runtime, /Tableros/); assert.match(runtime, /Agenda/);
  assert.match(primitives, /event\.key !== 'Tab'/);
  assert.match(primitives, /restoreDialogFocus/);
});
