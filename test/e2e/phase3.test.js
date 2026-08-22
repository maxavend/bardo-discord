import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 3 browser fixture covers Documents, Kanban and Planner at the required viewports', async () => {
  const script = await readFile(new URL('../../scripts/ui-browser-check.js', import.meta.url), 'utf8');
  assert.match(script, /\['docs','kanban','planner'\]/);
  assert.match(script, /\[390,768,1440\]/);
  assert.match(script, /--screenshot=/);
});
