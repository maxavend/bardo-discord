import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARDO_OPEN_PREFIX,
  normalizeDocumentId,
  buildDocumentPayload,
  buildErrorPayload,
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

test('buildDocumentPayload produce preview Components V2 con botón interactivo Mostrar más', () => {
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
  assert.equal(button.label, '📖 Mostrar más');
  assert.equal(button.custom_id, 'bardo:open:doc-abc');
  assert.equal(button.url, undefined);
});

test('buildErrorPayload produce contenedor con mensaje de error', () => {
  const payload = buildErrorPayload('Error de prueba');
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
});
