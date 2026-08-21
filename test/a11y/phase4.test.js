import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 4 Home keeps browser accessibility and overflow contracts', async () => {
  const fixture = await readFile(new URL('../visual/fixture.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../../scripts/ui-browser-check.js', import.meta.url), 'utf8');
  assert.match(fixture, /data-view="home"/);
  assert.match(fixture, /aria-labelledby="fixture-home-now"/);
  assert.match(fixture, /<time datetime=/);
  assert.match(fixture, /role="status"/);
  assert.match(fixture, /dataset\.a11yCheck/);
  assert.match(fixture, /dataset\.uiCheck/);
  assert.match(fixture, /document\.documentElement\.scrollWidth/);
  assert.match(script, /view=home/);
  assert.match(script, /--force-prefers-reduced-motion/);
  assert.match(script, /--force-high-contrast/);
});
