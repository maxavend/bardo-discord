import test from 'node:test';
import assert from 'node:assert/strict';
import {launchCustomId} from '../activity-app/src/production-discord-auth.js';

test('command/app identifiers never become missing documents; Bardo links retain their target', () => {
  const previous = globalThis.window;
  globalThis.window = {location: {search: '?custom_id=bardo&id=123456789'}};
  try {
    assert.equal(launchCustomId({customId: 'bardo'}), null);
    assert.equal(launchCustomId({customId: '123456789'}), null);
    assert.equal(launchCustomId({customId: 'bardo:open:edit:doc-1'}), 'bardo:open:edit:doc-1');
    window.location.search = '?custom_id=bardo%3Aopen%3Ahome';
    assert.equal(launchCustomId({customId: 'bardo:open:old-doc'}), 'bardo:open:home');
    window.location.search = '?document=legacy-doc';
    assert.equal(launchCustomId({}), 'bardo:open:legacy-doc');
  } finally {globalThis.window = previous;}
});

test('production boot opens Home without a deleted-document notice for command IDs and stale links', async () => {
  const {prepareBardoProduction} = await import('../activity-app/src/production-bridge.js');
  const {setDocsStorageScope} = await import('../activity-app/src/docs-storage.js');
  const keys = ['window', 'document', 'location', 'history', 'localStorage', 'Storage', 'fetch'];
  const original = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  try {
    for (const customId of ['bardo', 'bardo:open:deleted-document', null]) {
      class MemoryStorage {
        data = new Map();
        getItem(key) {return this.data.get(key) ?? null;}
        setItem(key, value) {this.data.set(key, String(value));}
        removeItem(key) {this.data.delete(key);}
      }
      globalThis.Storage = MemoryStorage;
      globalThis.localStorage = new MemoryStorage();
      globalThis.location = {search: '', hash: '#doc-deleted-document', hostname: 'test'};
      globalThis.history = {replaceState: (_state, _unused, hash) => {location.hash = hash;}};
      globalThis.document = {addEventListener() {}};
      globalThis.window = {location, __BARDO_GUILD_ID__: 'g', __BARDO_CHANNEL_ID__: 'c',
        __BARDO_USER__: {id: 'u'}, __BARDO_SESSION_TOKEN__: 'test', __BARDO_CUSTOM_ID__: customId,
        dispatchEvent() {}, addEventListener() {}};
      globalThis.fetch = async url => Response.json(String(url).includes('/api/docs')
        ? {documents: [], contextDocumentId: null, launchTarget: 'home'}
        : {sessions: [], roles: [], members: []});
      await prepareBardoProduction({sdk: {}, guildId: 'g', channelId: 'c'});
      assert.equal(location.hash, '#home');
      assert.equal(window.__BARDO_LAUNCH_MISSING_DOC__, null);
      assert.equal(window.__BARDO_DOCUMENT_ID__, null);
    }
  } finally {Object.assign(globalThis, original); setDocsStorageScope(null);}
});

test('a shared link the person cannot open lands on Home with a no-access notice and opens nothing else', async () => {
  const {prepareBardoProduction} = await import('../activity-app/src/production-bridge.js');
  const {setDocsStorageScope} = await import('../activity-app/src/docs-storage.js');
  const keys = ['window', 'document', 'location', 'history', 'localStorage', 'Storage', 'fetch'];
  const original = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  try {
    for (const [customId, denied] of [
      ['bardo:open:secret-doc', 'doc'],
      ['bardo:open:planner-session:sess-x', 'meeting'],
      ['bardo:open:kanban-card:card-x', 'task'],
    ]) {
      class MemoryStorage {
        data = new Map();
        getItem(key) {return this.data.get(key) ?? null;}
        setItem(key, value) {this.data.set(key, String(value));}
        removeItem(key) {this.data.delete(key);}
      }
      globalThis.Storage = MemoryStorage;
      globalThis.localStorage = new MemoryStorage();
      globalThis.location = {search: '', hash: '', hostname: 'test'};
      globalThis.history = {replaceState: (_state, _unused, hash) => {location.hash = hash;}};
      globalThis.document = {addEventListener() {}};
      globalThis.window = {location, __BARDO_GUILD_ID__: 'g', __BARDO_CHANNEL_ID__: 'c',
        __BARDO_USER__: {id: 'u'}, __BARDO_SESSION_TOKEN__: 'test', __BARDO_CUSTOM_ID__: customId,
        dispatchEvent() {}, addEventListener() {}};
      globalThis.fetch = async url => Response.json(String(url).includes('/api/docs')
        ? {documents: [], contextDocumentId: null, launchTarget: 'home', launchDenied: denied}
        : {sessions: [], roles: [], members: []});
      await prepareBardoProduction({sdk: {}, guildId: 'g', channelId: 'c'});
      assert.equal(location.hash, '#home', customId);
      assert.equal(window.__BARDO_LAUNCH_DENIED__, denied);
      assert.equal(window.__BARDO_LAUNCH_MISSING_DOC__, null, 'no se trata como documento eliminado');
      assert.equal(window.__BARDO_DOCUMENT_ID__, null);
    }
  } finally {Object.assign(globalThis, original); setDocsStorageScope(null);}
});
