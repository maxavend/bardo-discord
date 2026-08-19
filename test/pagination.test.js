import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentTitle, paginateMarkdown } from '../src/pagination.js';

test('extrae el H1 como título y lo quita del cuerpo', () => {
  const result = extractDocumentTitle('# Mi documento\n\nContenido aquí.');
  assert.equal(result.title, 'Mi documento');
  assert.equal(result.body, 'Contenido aquí.');
});

test('respeta un título explícito', () => {
  const result = extractDocumentTitle('# Título del archivo\n\nContenido.', 'Título editorial');
  assert.equal(result.title, 'Título editorial');
  assert.equal(result.body, 'Contenido.');
});

test('divide documentos largos sin superar el límite', () => {
  const paragraph = 'Este es un párrafo de prueba con suficiente texto para validar la paginación. '.repeat(12);
  const markdown = Array.from({ length: 20 }, (_, index) => `## Sección ${index + 1}\n\n${paragraph}`).join('\n\n');
  const pages = paginateMarkdown(markdown, 1000);

  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 1000));
});

test('mantiene bloques de código cercados al dividirlos', () => {
  const code = `\`\`\`js\n${'console.log("hola");\n'.repeat(80)}\`\`\``;
  const pages = paginateMarkdown(code, 600);

  assert.ok(pages.length > 1);
  for (const page of pages) {
    assert.ok(page.startsWith('```js'));
    assert.ok(page.endsWith('```'));
    assert.ok(page.length <= 600);
  }
});
