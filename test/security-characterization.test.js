import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

function createDocumentDb(documentId = 'doc-123') {
  const activityContexts = new Map([
    ['inst-123', { instance_id: 'inst-123', document_id: documentId, created_at: '2026-08-20T12:00:00.000Z' }],
  ]);

  return {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('FROM documents')) {
                const [id] = params;
                if (id !== documentId) return null;
                return {
                  id: documentId,
                  title: 'Documento privado',
                  original_markdown: '# Documento privado\n\nContenido sensible',
                  pages: JSON.stringify(['Contenido sensible']),
                  source_name: 'privado.md',
                  source_mime: 'text/markdown; charset=utf-8',
                  source_type: 'markdown',
                  import_status: 'ready',
                  created_at: '2026-08-20T12:00:00.000Z',
                  created_by: 'user-1',
                };
              }
              if (query.includes('FROM activity_contexts')) {
                const [instanceId] = params;
                return activityContexts.get(instanceId) || null;
              }
              return null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function branchBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

test('[TEMP DEBT] document GET is currently reachable with UUID only', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/documents/doc-123', { method: 'GET' }),
    { DB: createDocumentDb() },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.markdown, '# Documento privado\n\nContenido sensible');
});

test('[TEMP DEBT] document export is currently reachable with UUID only', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/documents/doc-123/export?format=markdown', { method: 'GET' }),
    { DB: createDocumentDb() },
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '# Documento privado\n\nContenido sensible');
});

test('[TEMP DEBT] activity context metadata is currently reachable by instance id only', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/activity-context/inst-123', { method: 'GET' }),
    { DB: createDocumentDb() },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.documentId, 'doc-123');
});

test('document source rejects a missing Activity instance', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/documents/doc-123/source', { method: 'GET' }),
    { DB: createDocumentDb() },
  );

  assert.equal(response.status, 401);
});

test('document normalize rejects a missing Activity instance before parsing payload', async () => {
  const response = await worker.fetch(
    new Request('http://localhost/api/documents/doc-123/normalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '# changed' }),
    }),
    { DB: createDocumentDb() },
  );

  assert.equal(response.status, 401);
});

test('[TEMP DEBT] document PATCH handler currently has no Activity access check', () => {
  const text = source('../src/worker.js');
  const editHandler = branchBetween(text, 'async function handleDocumentEditApi', 'async function handleActivityContextApi');
  assert.doesNotMatch(editHandler, /verifyActivityDocumentAccess/);
});

test('[TEMP DEBT] Kanban read/member/role branches currently bypass board Activity guard', () => {
  const text = source('../src/kanban-worker.js');

  const boardRead = branchBetween(
    text,
    "if (request.method === 'GET' && parts.length === 1)",
    "if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-members')",
  );
  const membersRead = branchBetween(
    text,
    "if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-members')",
    "if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-roles')",
  );
  const rolesRead = branchBetween(
    text,
    "if (request.method === 'GET' && parts.length === 2 && parts[1] === 'guild-roles')",
    "if (request.method === 'POST' && parts.length === 2 && parts[1] === 'tasks')",
  );

  assert.doesNotMatch(boardRead, /verifyBoardActivityAccess/);
  assert.doesNotMatch(membersRead, /verifyBoardActivityAccess/);
  assert.doesNotMatch(rolesRead, /verifyBoardActivityAccess/);
});

test('Kanban mutating branches currently invoke board Activity guard', () => {
  const text = source('../src/kanban-worker.js');
  const createTask = branchBetween(
    text,
    "if (request.method === 'POST' && parts.length === 2 && parts[1] === 'tasks')",
    "if (request.method === 'PATCH' && parts.length === 1)",
  );
  const updateBoard = branchBetween(
    text,
    "if (request.method === 'PATCH' && parts.length === 1)",
    "if ((request.method === 'PATCH' || request.method === 'PUT') && parts.length === 2 && parts[1] === 'columns')",
  );
  const taskApi = branchBetween(text, 'async function handleTaskApi', 'export default');

  assert.match(createTask, /verifyBoardActivityAccess/);
  assert.match(updateBoard, /verifyBoardActivityAccess/);
  assert.match(taskApi, /verifyBoardActivityAccess/);
});

test('Events collection and entity handlers currently derive access from Activity context', () => {
  const text = source('../src/event-worker.js');
  const collection = branchBetween(text, 'async function handleEventsCollection', 'async function handleEventApi');
  const eventApi = branchBetween(text, 'async function handleEventApi', 'async function generateMinutesDocument');

  assert.match(collection, /activityGuild/);
  assert.match(collection, /Guild mismatch/);
  assert.match(eventApi, /verifyEventAccess/);
  assert.match(eventApi, /entityBelongsToEvent/);
});
