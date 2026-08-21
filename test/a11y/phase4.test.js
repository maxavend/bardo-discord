import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 4 Home keeps browser accessibility and overflow contracts', async () => {
  const fixture = await readFile(new URL('../visual/fixture.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../../scripts/ui-browser-check.js', import.meta.url), 'utf8');
  assert.match(fixture, /data-view="home"/);
  assert.match(fixture, /aria-label="Acciones rápidas"/);
  assert.match(fixture, /data-a11y-check/);
  assert.match(fixture, /data-ui-check/);
  assert.match(script, /view=home/);
  assert.match(script, /--force-prefers-reduced-motion/);
  assert.match(script, /--force-high-contrast/);
});
