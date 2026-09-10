import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARDO_OPEN_PREFIX,
  normalizeDocumentId,
  buildDocumentPayload,
  buildDocNewPayload,
  buildErrorPayload,
  buildReuNewPayload,
  buildReusListPayload,
  createDocumentPreview,
} from '../src/components.js';

test('BARDO_OPEN_PREFIX está definido como bardo:open:', () => {
  assert.equal(BARDO_OPEN_PREFIX, 'bardo:open:');
});

test('normalizeDocumentId normaliza prefijos y valores nulos/vacíos', () => {
  assert.equal(normalizeDocumentId('bardo:open:abc-123'), 'abc-123');
  assert.equal(normalizeDocumentId('abc-123'), 'abc-123');
  assert.equal(normalizeDocumentId(null), null);
  assert.equal(normalizeDocumentId(undefined), null);
  assert.equal(normalizeDocumentId(''), null);
  assert.equal(normalizeDocumentId('   '), null);
  assert.equal(normalizeDocumentId('bardo:open:'), null);
  assert.equal(normalizeDocumentId('bardo:open:   '), null);
  assert.equal(normalizeDocumentId('bardo:open:doc-xyz-789'), 'doc-xyz-789');
});

test('createDocumentPreview limita el contenido y agrega llamada a abrir completo', () => {
  const markdown = `${'# Sección\n\n'}${'Texto largo '.repeat(180)}`;
  const preview = createDocumentPreview(markdown, 500);

  assert.ok(preview.length < 650);
  assert.match(preview, /Abre el documento completo/);
});

test('createDocumentPreview reemplaza tablas Markdown por un fallback limpio', () => {
  const markdown = '| Acción | Responsable |\n| --- | --- |\n| Probar | Max |';
  const preview = createDocumentPreview(markdown);

  assert.equal(preview, '*Tabla disponible en el documento completo.*');
});

test('buildDocumentPayload produce preview Components V2 con botón nativo de Activity', () => {
  const document = {
    title: 'Minuta Test',
    originalMarkdown: '# Minuta Test\n\nContenido completo',
    pages: ['Contenido de vista previa'],
  };

  const payload = buildDocumentPayload(document, {
    applicationId: '123456789',
    documentId: 'doc-abc',
  });

  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0].type, 17);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.style, 1); // ButtonStyle.Primary
  assert.equal(button.label, 'Abrir documento');
  assert.equal(button.custom_id, 'bardo:open:doc-abc');
  assert.equal(button.url, undefined);
});

test('buildErrorPayload produce contenedor con mensaje de error', () => {
  const payload = buildErrorPayload('Error de prueba');
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
});

test('buildReuNewPayload produce contenedor Components V2 con botón para abrir sesión de reunión', () => {
  const session = {
    id: 'session-123',
    title: 'Planificación Sprint 12',
    date: '2026-09-15',
    startTime: '11:00',
    targetDuration: 45,
    hostName: 'Max',
    description: 'Revisión de historias de usuario',
  };

  const payload = buildReuNewPayload({ session });
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0].type, 17);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.label, 'Abrir reunión');
  assert.equal(button.custom_id, 'bardo:open:planner-session:session-123');
});

test('buildReusListPayload muestra lista de reuniones y botón para abrir el planner', () => {
  const sessions = [
    { id: 's1', title: 'Reu Live', status: 'live', startTime: '10:00' },
    { id: 's2', title: 'Reu Próxima', status: 'scheduled', date: '2026-09-16', startTime: '15:00' },
    { id: 's3', title: 'Reu Pasada', status: 'finished', date: '2026-09-08' },
  ];

  const payload = buildReusListPayload({ sessions, channelName: 'general' });
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.label, 'Abrir Reuniones');
  assert.equal(button.custom_id, 'bardo:open:planner');
});

test('buildReusListPayload maneja canal sin reuniones con mensaje amigable', () => {
  const payload = buildReusListPayload({ sessions: [] });
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.label, 'Abrir Reuniones');
  assert.equal(button.custom_id, 'bardo:open:planner');
});

test('buildDocNewPayload produce contenedor con botón para crear documento', () => {
  const payload = buildDocNewPayload({ title: 'Especificación de API' });
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.label, 'Crear en Bardo');
  assert.equal(button.custom_id, 'bardo:open:new-doc');
});

