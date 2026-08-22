import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NotificationService } from '../src/services/notifications.js';

function preferenceDb(row) {
  return {
    prepare(query) {
      return {
        bind() {
          return {
            async first() {
              if (query.includes('FROM notification_preferences')) return row;
              return null;
            },
          };
        },
      };
    },
  };
}

test('event reminder offsets use defaults, custom preference and disabled preference', async () => {
  const defaults = new NotificationService({ DB: preferenceDb(null) });
  assert.deepEqual(await defaults.reminderOffsetsFor('guild', 'user'), [1440, 60, 10]);

  const custom = new NotificationService({ DB: preferenceDb({
    guild_id: 'guild', user_id: 'user', event_type: 'event.reminder',
    dm_enabled: 1, reminder_offset_minutes: 30, updated_at: '2026-08-21T00:00:00.000Z',
  }) });
  assert.deepEqual(await custom.reminderOffsetsFor('guild', 'user'), [30]);

  const disabled = new NotificationService({ DB: preferenceDb({
    guild_id: 'guild', user_id: 'user', event_type: 'event.reminder',
    dm_enabled: 0, reminder_offset_minutes: 30, updated_at: '2026-08-21T00:00:00.000Z',
  }) });
  assert.deepEqual(await disabled.reminderOffsetsFor('guild', 'user'), []);
});

test('minutes-ready notification is post-response, deduplicated and waitUntil-owned', () => {
  const source = fs.readFileSync(new URL('../src/p2-entry.js', import.meta.url), 'utf8');
  assert.match(source, /event\.minutes_ready/);
  assert.match(source, /event\.minutes_ready:\$\{event\.id\}:\$\{person\.userId\}:\$\{documentId\}/);
  assert.match(source, /ctx\?\.waitUntil/);
  assert.match(source, /response\.clone\(\)\.json/);
});
