import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  escapeXml,
  sanitizeExportFileName,
  stripLeadingTitle,
  generatePdfDocument,
  generateDocxDocument,
} from '../src/export-format.js';

test('escapeHtml escapa caracteres especiales', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('escapeXml escapa caracteres XML', () => {
  assert.equal(escapeXml('<tag attr="val & \'test\'">'), '&lt;tag attr=&quot;val &amp; &apos;test&apos;&quot;&gt;');
});

test('sanitizeExportFileName genera nombres limpios para archivos', () => {
  assert.equal(sanitizeExportFileName('Minuta — Reunión #1/2*?'), 'Minuta — Reunion #12');
  assert.equal(sanitizeExportFileName(''), 'documento');
});

test('stripLeadingTitle retira el H1 si coincide con el título', () => {
  const md = '# Mi Título\n\nContenido del documento';
  assert.equal(stripLeadingTitle(md, 'Mi Título'), 'Contenido del documento');
});

test('generatePdfDocument genera un buffer binario PDF válido', async () => {
  const doc = {
    title: 'Minuta de Trabajo',
    originalMarkdown: `# Minuta de Trabajo
**Fecha:** 19 de agosto de 2026

## 1. Objetivo de la sesión
Revisar el avance de los flujos.

> Cita importante

- Item 1
- Item 2

\`\`\`js
console.log('hola');
\`\`\`
`,
  };
  const pdfBytes = await generatePdfDocument(doc);
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 500);
  const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
  assert.equal(header, '%PDF-');
});

test('generateDocxDocument genera un buffer binario DOCX válido (zip)', async () => {
  const doc = {
    title: 'Minuta de Trabajo',
    originalMarkdown: `# Minuta de Trabajo
**Fecha:** 19 de agosto de 2026

## 1. Objetivo de la sesión
Revisar el avance de los flujos.

> Cita importante

- Item 1
- Item 2
`,
  };
  const docxBytes = await generateDocxDocument(doc);
  assert.ok(docxBytes instanceof Uint8Array);
  assert.ok(docxBytes.length > 500);
  // Un archivo zip/docx comienza con PK (0x50, 0x4B)
  assert.equal(docxBytes[0], 0x50);
  assert.equal(docxBytes[1], 0x4b);
});
