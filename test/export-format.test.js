import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  sanitizeExportFileName,
  renderMarkdown,
  stripLeadingTitle,
  generateWordDocument,
  generatePrintDocument,
} from '../src/export-format.js';

test('escapeHtml escapa caracteres especiales', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('sanitizeExportFileName genera nombres limpios para archivos', () => {
  assert.equal(sanitizeExportFileName('Minuta — Reunión #1/2*?'), 'Minuta — Reunion #12');
  assert.equal(sanitizeExportFileName(''), 'documento');
});

test('stripLeadingTitle retira el H1 si coincide con el título', () => {
  const md = '# Mi Título\n\nContenido del documento';
  assert.equal(stripLeadingTitle(md, 'Mi Título'), 'Contenido del documento');
});

test('renderMarkdown convierte markdown completo a HTML estructurado', () => {
  const md = `# Encabezado 1
## Encabezado 2

Párrafo con **negrita** y _cursiva_ y \`código\`.

> Cita importante

- Item 1
- Item 2

1. Primero
2. Segundo

| Col 1 | Col 2 |
| --- | --- |
| Val 1 | Val 2 |

\`\`\`js
const x = 1;
\`\`\`
`;
  const html = renderMarkdown(md);
  assert.ok(html.includes('<h1>Encabezado 1</h1>'));
  assert.ok(html.includes('<h2>Encabezado 2</h2>'));
  assert.ok(html.includes('<strong>negrita</strong>'));
  assert.ok(html.includes('<em>cursiva</em>'));
  assert.ok(html.includes('<code>código</code>'));
  assert.ok(html.includes('<blockquote>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<pre><code data-language="js">'));
});

test('generateWordDocument genera documento Word con estilos', () => {
  const doc = {
    title: 'Minuta de Trabajo',
    originalMarkdown: '# Minuta de Trabajo\n\n**Fecha:** 19 de agosto\n\n## 1. Objetivo\n\nRevisar avances.',
  };
  const wordHtml = generateWordDocument(doc);
  assert.ok(wordHtml.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'));
  assert.ok(wordHtml.includes('<h1>Minuta de Trabajo</h1>'));
  assert.ok(wordHtml.includes('<strong>Fecha:</strong>'));
  assert.ok(wordHtml.includes('<h2>1. Objetivo</h2>'));
  assert.ok(!wordHtml.includes('## 1. Objetivo')); // No debe tener sintaxis markdown cruda
});

test('generatePrintDocument genera documento HTML listo para impresión/PDF', () => {
  const doc = {
    title: 'Minuta de Trabajo',
    originalMarkdown: '# Minuta de Trabajo\n\n**Fecha:** 19 de agosto\n\n## 1. Objetivo\n\nRevisar avances.',
  };
  const printHtml = generatePrintDocument(doc);
  assert.ok(printHtml.includes('@page'));
  assert.ok(printHtml.includes('window.print()'));
  assert.ok(printHtml.includes('Minuta de Trabajo'));
  assert.ok(printHtml.includes('<strong>Fecha:</strong>'));
  assert.ok(!printHtml.includes('**Fecha:**')); // No debe tener sintaxis markdown cruda
});
