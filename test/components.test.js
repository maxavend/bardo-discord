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

test('buildDocNewPayload: tarjeta del documento ya creado con botón para editarlo', () => {
  const payload = buildDocNewPayload({ documentId: 'doc-42', title: 'Especificación de API', createdByName: 'Ana_B' });
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);

  const actionRow = payload.components[0].components.at(-1);
  const button = actionRow.components[0];
  assert.equal(button.label, 'Abrir documento');
  // The button opens the already-created document straight in the editor.
  assert.equal(button.custom_id, 'bardo:open:edit:doc-42');
  const text = JSON.stringify(payload);
  assert.match(text, /Especificación de API/);
  assert.match(text, /Ana\\\\_B/, 'el nombre se escapa para el markdown de Discord');
  // The copy names the real button.
  assert.match(text, /Pulsa \*\*Abrir documento\*\*/);
});

test('buildDocNewPayload sin título usa "Sin título"', () => {
  const text = JSON.stringify(buildDocNewPayload({ documentId: 'doc-1' }));
  assert.match(text, /Sin título/);
});

test('buildDocumentPayload nombra el botón real y muestra quién compartió', () => {
  const payload = buildDocumentPayload({ title: 'Plan', pages: ['Hola'] }, { documentId: 'doc-1', attribution: 'Compartido por Ana' });
  const text = JSON.stringify(payload);
  assert.match(text, /Compartido por Ana/);
  assert.match(text, /Pulsa \*\*Abrir documento\*\*/);
  assert.doesNotMatch(text, /Mostrar más|Abre Bardo para ver/);
  assert.equal(payload.components[0].components.at(-1).components[0].label, 'Abrir documento');
});

test('vocabulario de Reuniones: Facilita, Programadas, En curso y Terminadas', () => {
  const card = JSON.stringify(buildReuNewPayload({ session: { id: 's', title: 'Daily', hostName: 'Pau' } }));
  assert.match(card, /Facilita: Pau/);
  assert.doesNotMatch(card, /Organiza/);
  const list = JSON.stringify(buildReusListPayload({ sessions: [
    { id: 'a', title: 'A', status: 'live' },
    { id: 'b', title: 'B', status: 'scheduled' },
    { id: 'c', title: 'C', status: 'completed' },
  ] }));
  assert.match(list, /En curso/);
  assert.match(list, /Programadas/);
  assert.match(list, /Terminadas/);
  assert.doesNotMatch(list, /Pasadas|Concluidas|sesión|evento/i);
});

function totalText(payload) {
  let total = '';
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') total += `${node.content}\n`;
    for (const child of node.components || []) visit(child);
  };
  payload.components.forEach(visit);
  return total;
}

test('buildReusListPayload lista reuniones completadas por el runner y respeta 4000 caracteres', () => {
  const sessions = [
    { id: 'c', title: 'Reu Completada', status: 'completed', date: '2026-09-01' },
    ...Array.from({ length: 20 }, (_, index) => ({ id: `l${index}`, title: 'L'.repeat(200), status: 'live' })),
  ];
  const text = totalText(buildReusListPayload({ sessions }));
  assert.ok(text.length < 4000, `texto: ${text.length}`);

  const completed = totalText(buildReusListPayload({ sessions: [sessions[0]] }));
  assert.match(completed, /Reu Completada/);
});

test('buildReuNewPayload y buildErrorPayload nunca superan el límite de Components V2', () => {
  const reu = buildReuNewPayload({ session: { id: 's', title: 'T'.repeat(5000), description: 'D'.repeat(6000) } });
  assert.ok(totalText(reu).length < 4000);
  assert.ok(totalText(buildErrorPayload('E'.repeat(10_000))).length < 4000);
  assert.ok(totalText(buildDocumentPayload({ title: 'X'.repeat(3000), pages: ['hola'] }, { documentId: 'd' })).length < 4000);
});
