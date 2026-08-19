import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentPayload, buildErrorPayload, createDocumentPreview } from '../src/components.js';

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

test('buildDocumentPayload produce preview Components V2 con botón Mostrar más', () => {
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
  assert.equal(button.style, 5);
  assert.equal(button.label, '📖 Mostrar más');
  assert.equal(button.url, 'https://discord.com/activities/123456789?custom_id=doc-abc');
});

test('buildErrorPayload produce contenedor con mensaje de error', () => {
  const payload = buildErrorPayload('Error de prueba');
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
});
