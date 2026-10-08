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

test('toPdfSafeText conserva Latin-1 y mapea tipografía común a ASCII en vez de borrarla', async () => {
  const {toPdfSafeText} = await import('../src/export-format.js');
  assert.equal(toPdfSafeText('“Hola” — ‘mundo’ – año… • 5€ ñandú'), '"Hola" - \'mundo\' - año... - 5EUR ñandú');
  assert.equal(toPdfSafeText('emoji 🎉 y 漢字'), 'emoji ? y ??');
  assert.equal(toPdfSafeText('a\tb​c'), 'a    bc');
});

test('generatePdfDocument dibuja comillas, rayas y viñetas (no espacios vacíos)', async () => {
  const {PDFDocument, PDFPage} = await import('pdf-lib');
  const drawn = [];
  const originalDrawText = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function spyDrawText(text, options) {
    drawn.push(text);
    return originalDrawText.call(this, text, options);
  };
  let bytes;
  try {
    bytes = await generatePdfDocument({
      title: 'Prueba “tipográfica”',
      originalMarkdown: '# Prueba\n\n- Ítem con “comillas” — y raya…\n\nTexto 🎉 final',
    });
  } finally {
    PDFPage.prototype.drawText = originalDrawText;
  }
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const text = drawn.join('\n');
  // The bullet is drawn on its own (hanging indent), followed by the item text.
  assert.match(text, /^- \nÍtem con "comillas" - y raya\.\.\.$/m);
  assert.match(text, /Texto \? final/);
  assert.match(text, /Prueba "tipográfica"/);
});

test('generateDocxDocument elimina caracteres inválidos en XML y respeta saltos en código', async () => {
  const {default: JSZip} = await import('jszip');
  const bytes = await generateDocxDocument({
    title: 'Doc\u000C con form feed',
    originalMarkdown: 'Texto\u0000 con\u000B controles  y espacios\n\n```\nlinea 1\n  linea 2\n```',
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.match(xml, /Texto con controles  y espacios/);
  assert.match(xml, /linea 1<\/w:t><w:br\/><w:t xml:space="preserve">  linea 2/);
});

test('escapeXml elimina caracteres prohibidos por XML 1.0', () => {
  assert.equal(escapeXml('a\u0001b\u000Cc￾d'), 'abcd');
});
