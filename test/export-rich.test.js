// Exportación PDF/DOCX: el documento se ve como documento, no como markdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PDFPage } from 'pdf-lib';
import { parseBlocks, parseInline, runsToText, unescapeMarkdown } from '../src/export-markdown.js';
import { generateDocxDocument, generatePdfDocument } from '../src/export-format.js';

// Markdown tal como lo escribe el editor de Bardo (escapes incluidos).
const EDITOR_MARKDOWN = [
  '# Acta semanal',
  '',
  'Revisar el archivo informe\\_final\\_v2 con **negrita**, *cursiva* y ***ambas***.',
  'Ver [la guía](https://bardo.app/guia) y <https://discord.com>.',
  '',
  '- [x] Tarea hecha',
  '- [ ] Tarea pendiente',
  '- \\[x\\] Tarea importada',
  '',
  '3. Tercer punto',
  '4. Cuarto punto',
  '',
  '| Nombre | Rol \\| área |',
  '| --- | --- |',
  '| Ana | *Diseño* |',
  '',
  '> [!NOTE]',
  '> Recordar **enviar** el acta.',
  '',
  '<details>',
  '<summary>Más detalles &amp; notas</summary>',
  '',
  'Contenido oculto',
  '',
  '</details>',
  '',
  '\\# No es un título',
].join('\n');

const DOCUMENT = {
  title: 'Acta semanal',
  description: 'Resumen de la reunión del lunes',
  originalMarkdown: EDITOR_MARKDOWN,
};

test('unescapeMarkdown y parseInline quitan escapes y conservan estilos', () => {
  assert.equal(unescapeMarkdown('a\\_b \\[x\\] \\# c'), 'a_b [x] # c');
  const runs = parseInline('**Hola** *mundo* `a*b` snake_case [Bardo](https://bardo.app)');
  assert.equal(runsToText(runs), 'Hola mundo a*b snake_case Bardo (https://bardo.app)');
  assert.equal(runs[0].bold, true);
  assert.equal(runs.find(run => run.text === 'mundo').italic, true);
  assert.equal(runs.find(run => run.text === 'a*b').code, true);
});

test('parseBlocks reconoce tareas, número inicial, tablas, notas y desplegables', () => {
  const blocks = parseBlocks(EDITOR_MARKDOWN);
  const types = blocks.map(block => block.type);
  assert.deepEqual(types, ['heading', 'paragraph', 'list', 'list', 'table', 'callout', 'details', 'paragraph']);
  assert.deepEqual(blocks[2].items.map(item => item.checked), [true, false, true]);
  assert.equal(blocks[3].items[0].number, 3);
  assert.equal(runsToText(blocks[4].header[1]), 'Rol | área');
  assert.equal(blocks[5].label, 'Nota');
  assert.equal(blocks[6].summary, 'Más detalles & notas');
  assert.equal(runsToText(blocks[7].runs), '# No es un título');
});

test('DOCX: sin escapes visibles, tabla real, casillas, enlaces, negrita y descripción', async () => {
  const zip = await JSZip.loadAsync(await generateDocxDocument(DOCUMENT));
  const xml = await zip.file('word/document.xml').async('string');
  const text = xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  assert.doesNotMatch(text, /\\[_[\]#|]/, 'no debe quedar ningún escape de markdown');
  assert.doesNotMatch(text, /\*\*|\[x\]|\[ \]/, 'no debe quedar sintaxis markdown');
  assert.match(xml, /<w:tbl>/);
  assert.match(text, /Rol \| área/);
  assert.match(text, /☑ Tarea hecha/);
  assert.match(text, /☐ Tarea pendiente/);
  assert.match(text, /☑ Tarea importada/);
  assert.match(text, /3\. Tercer punto/);
  assert.match(text, /la guía \(https:\/\/bardo\.app\/guia\)/);
  assert.match(text, /informe_final_v2/);
  assert.match(xml, /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">negrita<\/w:t>/);
  assert.match(xml, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">cursiva<\/w:t>/);
  assert.match(text, /Resumen de la reunión del lunes/);
  assert.ok(text.indexOf('Resumen de la reunión') < text.indexOf('Revisar el archivo'), 'la descripción va bajo el título');
  assert.match(text, /Nota\s*Recordar enviar el acta/);
  assert.match(text, /Más detalles & notas\s*Contenido oculto/);
  assert.match(text, /# No es un título/);
});

test('PDF: texto limpio, casillas [x]/[ ], tabla alineada, negrita y descripción', async () => {
  const drawn = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function spy(text, options) {
    drawn.push({ text, font: options?.font?.name });
    return original.call(this, text, options);
  };
  try {
    const bytes = await generatePdfDocument(DOCUMENT);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  } finally {
    PDFPage.prototype.drawText = original;
  }

  const all = drawn.map(item => item.text).join('\n');
  assert.doesNotMatch(all, /\\[_[\]#|]/, 'no debe quedar ningún escape de markdown');
  assert.doesNotMatch(all, /\*\*/);
  assert.match(all, /Resumen de la reunión del lunes/);
  assert.ok(drawn.some(item => item.text === '[x] '));
  assert.ok(drawn.some(item => item.text === '[ ] '));
  assert.ok(drawn.some(item => item.text === '3. '));
  assert.match(all, /la guía \(https:\/\/bardo\.app\/guia\)/);
  // Each table cell is drawn on its own (columns aligned), header in bold.
  assert.ok(drawn.some(item => item.text === 'Ana'));
  assert.ok(drawn.some(item => item.text === 'Rol | área' && item.font === 'Helvetica-Bold'));
  assert.ok(drawn.some(item => item.text === 'negrita' && item.font === 'Helvetica-Bold'));
  assert.ok(drawn.some(item => item.text === 'cursiva' && item.font === 'Helvetica-Oblique'));
  assert.ok(drawn.some(item => item.text === 'Nota' && item.font === 'Helvetica-Bold'));
  assert.ok(drawn.some(item => item.text === 'Más detalles & notas'));
});

test('PDF: documentos largos con tablas anchas y palabras enormes no rompen la exportación', async () => {
  const row = `| ${'x'.repeat(400)} | b | c |`;
  const markdown = ['| A | B | C |', '| --- | --- | --- |', ...Array.from({ length: 120 }, () => row)].join('\n');
  const bytes = await generatePdfDocument({ title: 'Largo', originalMarkdown: markdown });
  assert.ok(bytes.byteLength > 1000);
});
