// Exportación PDF/DOCX: el documento se ve como documento, no como markdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PDFPage } from 'pdf-lib';
import { parseBlocks, parseInline, runsToText, unescapeMarkdown } from '../src/export-markdown.js';
import { generateDocxDocument, generatePdfDocument } from '../src/export-format.js';
import worker, { attachmentDisposition } from '../src/worker.js';
import { createExportToken } from '../src/export-token.js';

/** Runs `fn` while recording every PDF text draw (text + baseline y). */
async function captureDrawnText(fn) {
  const drawn = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function spy(text, options) {
    drawn.push({ text, y: options?.y, font: options?.font?.name });
    return original.call(this, text, options);
  };
  try {
    await fn();
  } finally {
    PDFPage.prototype.drawText = original;
  }
  return drawn;
}

async function elapsed(fn) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

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

test('PDF: tablas anchas y palabras enormes no pierden texto', async () => {
  const row = `| ${'x'.repeat(400)} | b | c |`;
  const markdown = ['| A | B | C |', '| --- | --- | --- |', ...Array.from({ length: 120 }, () => row)].join('\n');
  let bytes;
  const drawn = await captureDrawnText(async () => {
    bytes = await generatePdfDocument({ title: 'Largo', originalMarkdown: markdown });
  });
  assert.ok(bytes.byteLength > 1000);
  // Every "x" of every cell is drawn (split into chunks), none below the margin.
  const xCount = drawn.filter(item => /^x+$/.test(item.text)).reduce((sum, item) => sum + item.text.length, 0);
  assert.equal(xCount, 400 * 120);
  assert.ok(drawn.every(item => item.y >= 40), 'ningún texto bajo el margen inferior');
});

test('PDF: una fila de tabla más alta que una página continúa en la siguiente sin perder líneas', async () => {
  const words = Array.from({ length: 1500 }, (_, index) => `w${String(index).padStart(4, '0')}`);
  const markdown = ['| Celda larga | Otra |', '| --- | --- |', `| ${words.join(' ')} | fin |`].join('\n');
  const drawn = await captureDrawnText(() => generatePdfDocument({ title: 'Tabla', originalMarkdown: markdown }));
  const text = drawn.map(item => item.text).join(' ');
  for (const word of words) assert.ok(text.includes(word), `falta ${word}`);
  assert.ok(drawn.every(item => item.y >= 40), 'ningún texto bajo el margen inferior');
});

test('un ```npm install``` en una línea es código en línea, no un bloque que se traga el documento', () => {
  const blocks = parseBlocks('Ejecuta ```npm install``` primero.\n\n```npm install```\n\n## Siguiente\n\nTexto');
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'paragraph', 'heading', 'paragraph']);
  assert.equal(runsToText(blocks[1].runs), 'npm install');
  assert.equal(blocks[1].runs[0].code, true);
  // A real fence (one info word) still opens a code block.
  assert.equal(parseBlocks('```js\nconst a = 1;\n```')[0].type, 'code');
});

test('listas numeradas "perezosas" (1. 1. 1.) se exportan como 1, 2, 3', () => {
  const [lazy] = parseBlocks('1. uno\n1. dos\n1. tres');
  assert.deepEqual(lazy.items.map(item => item.number), [1, 2, 3]);
  const [fromThree] = parseBlocks('3. a\n3. b\n   1. sub\n   1. sub2\n3. c');
  assert.deepEqual(fromThree.items.map(item => item.number), [3, 4, 1, 2, 5]);
});

test('Content-Disposition: filename* codifica también \' ( ) * (RFC 5987)', () => {
  const header = attachmentDisposition("Acta (final) *v2* de Ana's.pdf");
  assert.match(header, /filename\*=UTF-8''Acta%20%28final%29%20%2Av2%2A%20de%20Ana%27s\.pdf$/);
  assert.doesNotMatch(header.split("filename*=UTF-8''")[1], /['()*]/);
});

test('rendimiento: un .txt de 380 KB lleno de *, _, [ y ( exporta a PDF y DOCX en menos de 1 s', async () => {
  const line = index => `2026-10-08T12:00:01Z [WARN] job_${index} *retry* ** [queue (pending=${index} \`x * _y [z ( <u ~~ __init__ __`;
  let log = '';
  for (let index = 0; log.length < 380_000; index += 1) log += `${line(index)}\n`;
  const pdf = await elapsed(() => generatePdfDocument({ title: 'log', originalMarkdown: log }));
  const docx = await elapsed(() => generateDocxDocument({ title: 'log', originalMarkdown: log }));
  assert.ok(pdf < 1000, `PDF tardó ${Math.round(pdf)} ms`);
  assert.ok(docx < 1000, `DOCX tardó ${Math.round(docx)} ms`);
});

test('rendimiento: "**a " × 2000 exporta en menos de 200 ms', async () => {
  const markdown = '**a '.repeat(2000);
  const pdf = await elapsed(() => generatePdfDocument({ title: 't', originalMarkdown: markdown }));
  const docx = await elapsed(() => generateDocxDocument({ title: 't', originalMarkdown: markdown }));
  assert.ok(pdf < 200, `PDF tardó ${Math.round(pdf)} ms`);
  assert.ok(docx < 200, `DOCX tardó ${Math.round(docx)} ms`);
  // The unmatched markers are kept as text, not swallowed.
  assert.equal(runsToText(parseInline(markdown)), markdown);
});

test('entradas extremas (10 000 ">" anidados, tabla de 200 000 filas) no lanzan RangeError', async () => {
  const nested = `${'> '.repeat(10_000)}hola`;
  await generatePdfDocument({ title: 'Citas', originalMarkdown: nested });
  await generateDocxDocument({ title: 'Citas', originalMarkdown: nested });
  const table = ['| a | b |', '| --- | --- |', ...Array.from({ length: 200_000 }, () => '| 1 | 2 |')].join('\n');
  const [block] = parseBlocks(table);
  assert.equal(block.rows.length, 200_000);
  const deep = `${'**a '.repeat(3000)}z${'**'.repeat(3000)}`;
  assert.ok(runsToText(parseInline(deep)).includes('z'));
});

test('un enlace firmado que falla muestra la página en español, no un JSON 500', async () => {
  const env = {
    DISCORD_CLIENT_SECRET: 'secreto',
    DB: { prepare() { throw new Error('D1 caído'); } },
  };
  const { token } = await createExportToken(env, { docId: 'doc-1', format: 'pdf', userId: 'u' });
  const response = await worker.fetch(new Request(`https://bardo.example/api/documents/doc-1/export?format=pdf&t=${encodeURIComponent(token)}`), env);
  assert.equal(response.status, 500);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /No pudimos preparar la descarga/);
});
