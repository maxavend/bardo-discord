import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 3 browser fixture asserts dialog semantics, accessible names and overflow', async () => {
  const fixture = await readFile(new URL('../visual/fixture.html', import.meta.url), 'utf8');
  assert.match(fixture, /aria-modal="true"/);
  assert.match(fixture, /aria-label=/);
  assert.match(fixture, /dataset\.a11yCheck/);
  assert.match(fixture, /scrollWidth<=innerWidth\+1/);
});
