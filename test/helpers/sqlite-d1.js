// Minimal D1-compatible wrapper over node:sqlite, so tests run the real SQL
// against the schema produced by the real migrations (instead of mocks that
// match query strings and can drift from the schema).
import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
}

function toSqliteValue(value) {
  if (value === undefined) {
    throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value \'undefined\'');
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value) && !(value instanceof Uint8Array)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}

function fromSqliteRow(row) {
  if (!row) return null;
  const plain = {};
  for (const [key, value] of Object.entries(row)) {
    // D1 returns BLOB columns as arrays of numbers.
    plain[key] = value instanceof Uint8Array ? [...value] : value;
  }
  return plain;
}

class PreparedStatement {
  constructor(d1, sql, params = [], compiled = null) {
    this.d1 = d1;
    this.sql = sql;
    this.params = params;
    // Compile eagerly: an unknown table/column fails here, at prepare() time.
    this.compiled = compiled || d1.sqlite.prepare(sql);
  }

  bind(...params) {
    return new PreparedStatement(this.d1, this.sql, params.map(toSqliteValue), this.compiled);
  }

  #statement() {
    this.d1.queries.push(this.sql);
    return this.compiled;
  }

  async first(column) {
    const row = fromSqliteRow(this.#statement().get(...this.params));
    if (column) return row ? row[column] ?? null : null;
    return row;
  }

  async all() {
    const results = this.#statement().all(...this.params).map(fromSqliteRow);
    return {success: true, results, meta: {changes: 0}};
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const info = this.#statement().run(...this.params);
    return {success: true, results: [], meta: {changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid)}};
  }
}

export class SqliteD1 {
  constructor({migrate = true} = {}) {
    this.sqlite = new DatabaseSync(':memory:');
    // D1 enforces foreign keys.
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.queries = [];
    if (migrate) {
      for (const file of migrationFiles()) {
        this.sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      }
    }
  }

  prepare(sql) {
    return new PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.runSync());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return {count: 1};
  }

  // Test conveniences -------------------------------------------------------
  row(sql, ...params) {
    return fromSqliteRow(this.sqlite.prepare(sql).get(...params.map(toSqliteValue)));
  }

  rows(sql, ...params) {
    return this.sqlite.prepare(sql).all(...params.map(toSqliteValue)).map(fromSqliteRow);
  }

  run(sql, ...params) {
    return this.sqlite.prepare(sql).run(...params.map(toSqliteValue));
  }
}

export function createTestDb(options) {
  return new SqliteD1(options);
}

// ---------------------------------------------------------------------------
// Shared fixtures for API tests.

export const GUILD = 'guild-123';
export const CHANNEL = 'channel-123';
export const USER = 'user-123';
export const TOKEN = 'valid-token';

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function insertSession(db, {
  token = TOKEN,
  userId = USER,
  guildId = GUILD,
  channelId = CHANNEL,
  username = 'TestUser',
  expiresAt = '2099-01-01T00:00:00.000Z',
} = {}) {
  db.run(
    `INSERT INTO docs_sessions (token_hash, user_id, guild_id, channel_id, username, avatar, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    await sha256Hex(token), userId, guildId, channelId, username, '2026-08-01T00:00:00.000Z', expiresAt,
  );
  return token;
}

export function insertDocument(db, {
  id,
  title = 'Documento',
  markdown = `# ${title}\n\nCuerpo`,
  createdBy = 'user-1',
  createdAt = '2026-08-20T10:00:00.000Z',
  updatedAt = createdAt,
  archivedAt = null,
  importStatus = 'ready',
  sourceBlob = null,
  sourceType = 'markdown',
  guildId = GUILD,
  channelIds = [CHANNEL],
} = {}) {
  db.run(
    `INSERT INTO documents (id, title, original_markdown, pages, source_name, created_at, created_by,
       updated_at, archived_at, import_status, source_blob, source_type, source_mime)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title, markdown, JSON.stringify(['Cuerpo']), createdAt, createdBy, updatedAt, archivedAt,
    importStatus, sourceBlob, sourceType, sourceBlob ? 'application/pdf' : null,
  );
  if (guildId) {
    db.run('INSERT INTO document_guild_access (document_id, guild_id, added_at) VALUES (?, ?, ?)', id, guildId, createdAt);
  }
  for (const channelId of channelIds) {
    db.run(
      'INSERT INTO document_channel_access (document_id, guild_id, channel_id, added_at) VALUES (?, ?, ?, ?)',
      id, guildId, channelId, createdAt,
    );
  }
}

/**
 * Fake Discord REST API. `permissions` are the @everyone bits in the guild;
 * `channelGuild` maps channel → guild. `fail` forces a status for every call.
 */
export function createDiscordFetch({
  permissions = '1024',
  ownerId = 'owner-1',
  channels = {[CHANNEL]: GUILD},
  fail = null,
  calls = [],
} = {}) {
  return async input => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (fail) {
      return new Response(JSON.stringify({message: 'fail', retry_after: 1.5}), {status: fail});
    }
    const match = url.pathname.match(/^\/api\/v10\/guilds\/([^/]+)(\/.*)?$/);
    if (match) {
      const [, guildId, rest = ''] = match;
      if (rest === '') return Response.json({id: guildId, owner_id: ownerId});
      if (rest === '/roles') return Response.json([{id: guildId, permissions}]);
      if (rest.startsWith('/members/')) return Response.json({user: {id: rest.split('/')[2]}, roles: []});
      if (rest.startsWith('/members')) return Response.json([]);
    }
    const channel = url.pathname.match(/^\/api\/v10\/channels\/([^/]+)$/);
    if (channel && channels[channel[1]]) {
      return Response.json({id: channel[1], name: 'general', guild_id: channels[channel[1]], permission_overwrites: []});
    }
    return new Response('{}', {status: 404});
  };
}

export function createEnv(db, extra = {}) {
  return {
    DB: db,
    DISCORD_TOKEN: 'test-bot-token',
    DISCORD_FETCH: createDiscordFetch(),
    ...extra,
  };
}

export function authHeaders(token = TOKEN, extra = {}) {
  return {Authorization: `Bearer ${token}`, ...extra};
}
