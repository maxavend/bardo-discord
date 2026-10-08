// Round-trip del editor de documentos: Plate -> HTML -> Markdown -> HTML -> Plate.
// Los módulos del frontend usan DOMParser; aquí se provee con domino (dependencia
// de turndown) para correr en Node sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import domino from '@mixmark-io/domino';

globalThis.DOMParser ??= class DOMParser {
  parseFromString(html) {
    return domino.createDocument(html, true);
  }
};

const {htmlToMarkdown, markdownToHtml} = await import('../activity-app/src/editor/bardo-markdown.js');
const {htmlToPlateValue, plateValueToHtml} = await import('../activity-app/src/editor/bardo-editor-serialization.js');

function stripIds(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => (key === 'id' ? undefined : val)));
}

/** Plate -> HTML -> Markdown -> HTML -> Plate */
function roundTrip(value, title = 'Documento') {
  const html = plateValueToHtml(value);
  const markdown = htmlToMarkdown(html);
  const remote = `# ${title}\n\n${markdown}`;
  const htmlBack = markdownToHtml(remote, title);
  return {markdown, html, htmlBack, value: htmlToPlateValue(htmlBack)};
}

function assertRoundTrip(value, message) {
  const result = roundTrip(value);
  assert.deepEqual(stripIds(result.value), stripIds(value), `${message}\nMarkdown:\n${result.markdown}`);
  // Debe ser estable: una segunda vuelta no cambia el Markdown.
  assert.equal(roundTrip(result.value).markdown, result.markdown, `${message} (estabilidad)`);
  return result;
}

const p = (...children) => ({type: 'p', children: children.map(c => (typeof c === 'string' ? {text: c} : c))});

test('párrafos y saltos de línea sobreviven', () => {
  assertRoundTrip([p('Primera línea\nsegunda línea'), p('Otro párrafo')], 'párrafos');
});

test('encabezados h1, h2 y h3 se conservan (h1 no se fusiona con el párrafo siguiente)', () => {
  const {markdown} = assertRoundTrip([
    {type: 'h1', children: [{text: 'Título grande'}]},
    p('texto'),
    {type: 'h2', children: [{text: 'Sección'}]},
    {type: 'h3', children: [{text: 'Subsección'}]},
  ], 'encabezados');
  assert.match(markdown, /^# Título grande\n\ntexto/);
});

test('marcas inline: negrita, cursiva, subrayado, tachado, código y kbd', () => {
  assertRoundTrip([p(
    {text: 'negrita', bold: true}, ' y ',
    {text: 'cursiva', italic: true}, ' y ',
    {text: 'ambas', bold: true, italic: true}, ' ',
    {text: 'subrayado', underline: true}, ' ',
    {text: 'tachado', strikethrough: true}, ' ',
    {text: 'a `b` c', code: true}, ' ',
    {text: 'Ctrl', kbd: true},
  )], 'marcas');
});

test('enlaces se conservan, incluidos paréntesis en la URL', () => {
  assertRoundTrip([p('Ver ', {type: 'a', url: 'https://example.com/a_(b)?q=1&x=2', target: '_blank', children: [{text: 'la guía', bold: true}]}, ' ahora')], 'enlaces');
});

test('caracteres especiales de Markdown en texto no se reinterpretan', () => {
  const tricky = [
    p('archivo_final_v2.pdf y 5 * 3 * 2 y __init__ y ~~no~~ y `literal` y [corchetes](no-link) y a|b y <b>html</b> y \\barra'),
    p('- esto no es lista'),
    p('1. tampoco numerada'),
    p('# ni título'),
    p('> ni cita'),
    p('---'),
    p('```'),
    p('<details>'),
  ];
  const {htmlBack} = assertRoundTrip(tricky, 'escapes');
  assert.doesNotMatch(htmlBack, /<em>|<strong>|<ul>|<ol>|<h1>|<blockquote>|<hr>|<pre>|<details/);
});

test('listas con viñetas de varios ítems (F1)', () => {
  assertRoundTrip([
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'uno'}]},
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'dos'}]},
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'tres', bold: true}]},
  ], 'lista con viñetas');
});

test('listas anidadas y mixtas (numeradas dentro de viñetas)', () => {
  const {markdown} = assertRoundTrip([
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'padre'}]},
    {type: 'p', listStyleType: 'decimal', indent: 2, children: [{text: 'hijo 1'}]},
    {type: 'p', listStyleType: 'decimal', indent: 2, children: [{text: 'hijo 2'}]},
    {type: 'p', listStyleType: 'disc', indent: 3, children: [{text: 'nieto'}]},
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'otro padre'}]},
    p('fuera de la lista'),
    {type: 'p', listStyleType: 'decimal', indent: 1, children: [{text: 'primero'}]},
    {type: 'p', listStyleType: 'decimal', indent: 1, children: [{text: 'segundo'}]},
  ], 'listas anidadas');
  assert.match(markdown, /- padre\n {2}1\. hijo 1\n {2}2\. hijo 2\n {5}- nieto\n- otro padre/);
});

test('ítem de lista con salto de línea interno', () => {
  assertRoundTrip([{type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'línea 1\nlínea 2'}]}], 'salto en lista');
});

test('checklists con estado se conservan', () => {
  assertRoundTrip([
    {type: 'action_item', checked: false, children: [{text: 'pendiente'}]},
    {type: 'action_item', checked: true, children: [{text: 'hecha'}]},
  ], 'checklist');
});

test('tablas se guardan como GFM y vuelven como tabla (F3)', () => {
  const table = {
    type: 'table',
    children: [
      {type: 'tr', children: [
        {type: 'th', children: [p('Nombre')]},
        {type: 'th', children: [p('Notas | detalle')]},
      ]},
      {type: 'tr', children: [
        {type: 'td', children: [p({text: 'Ana', bold: true})]},
        {type: 'td', children: [p('línea 1\nlínea 2')]},
      ]},
    ],
  };
  const {markdown} = assertRoundTrip([table], 'tabla');
  assert.match(markdown, /^\| Nombre \| Notas \\\| detalle \|\n\| --- \| --- \|/);
});

test('tablas sin fila de encabezado no inventan encabezados', () => {
  assertRoundTrip([{
    type: 'table',
    children: [
      {type: 'tr', children: [{type: 'td', children: [p('a')]}, {type: 'td', children: [p('b')]}]},
    ],
  }], 'tabla sin encabezado');
});

test('citas, destacados (callout) y separadores', () => {
  assertRoundTrip([
    {type: 'blockquote', children: [{text: 'cita\ncon dos líneas'}]},
    {type: 'hr', children: [{text: ''}]},
    {type: 'callout', children: [{text: 'Ojo: '}, {text: 'importante', bold: true}, {text: '\nsegunda línea'}]},
  ], 'cita y callout');
});

test('desplegables (details/summary) con bloques internos', () => {
  assertRoundTrip([{
    type: 'toggle',
    summary: 'Ver más <detalles> & notas',
    children: [
      p('contenido oculto'),
      {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'ítem'}]},
      {type: 'action_item', checked: true, children: [{text: 'tarea'}]},
    ],
  }, p('después')], 'details');
});

test('bloques de código conservan saltos, backticks y lenguaje', () => {
  assertRoundTrip([
    {type: 'code_block', lang: 'js', children: [{text: 'const a = 1;\n```\n  indentado *no* markdown'}]},
    p('fin'),
  ], 'código');
});

test('markdownToHtml importa tablas GFM, listas anidadas y h1 desde Markdown externo', () => {
  const html = markdownToHtml([
    '# Doc',
    '',
    '# Sección',
    '',
    '| A | B |',
    '|---|:---:|',
    '| 1 | 2 |',
    '',
    '- a',
    '    - b',
    '- c',
    '',
    'snake_case_name y 2 * 3',
  ].join('\n'), 'Doc');
  assert.match(html, /^<h1>Sección<\/h1>/);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<ul><li>a<ul><li>b<\/li><\/ul><\/li><li>c<\/li><\/ul>/);
  assert.match(html, /<p>snake_case_name y 2 \* 3<\/p>/);
});

test('HTML heredado (ul > li con párrafos y listas anidadas) se aplana sin perder texto', () => {
  const value = htmlToPlateValue('<ul><li><p>a</p><ul><li>b</li></ul></li><li>c</li></ul>');
  assert.deepEqual(stripIds(value), [
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'a'}]},
    {type: 'p', listStyleType: 'disc', indent: 2, children: [{text: 'b'}]},
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'c'}]},
  ]);
});

test('valores con la estructura clásica ul > li > lic no pierden ítems al serializar', () => {
  const html = plateValueToHtml([{type: 'ul', children: [
    {type: 'li', children: [{type: 'lic', children: [{text: 'a'}]}, {type: 'lic', children: [{text: 'b'}]}]},
  ]}]);
  assert.match(html, /a/);
  assert.match(html, /b/);
});

test('listas creadas con los comandos de la barra/menú "/" sobreviven al guardado (F1)', async () => {
  const {createSlateEditor, createSlatePlugin} = await import('../activity-app/node_modules/platejs/dist/index.js');
  const {BaseListPlugin} = await import('../activity-app/node_modules/@platejs/list/dist/index.js');
  const commands = await import('../activity-app/src/editor/bardo-editor-commands.js');
  const element = key => createSlatePlugin({key, node: {isElement: true}});
  const editor = createSlateEditor({
    plugins: [BaseListPlugin, element('h1'), element('action_item'), element('code_block')],
    value: [{type: 'p', children: [{text: 'uno'}]}],
  });
  editor.tf.select({path: [0, 0], offset: 3});
  commands.toggleBardoList(editor, 'disc');
  editor.tf.insertBreak();
  editor.tf.insertText('dos');
  editor.tf.insertBreak();
  editor.tf.insertText('tres');
  commands.toggleBardoList(editor, 'decimal');
  assert.equal(commands.currentBlockKind(editor), 'insertOrderedList');

  const html = plateValueToHtml(editor.children);
  const markdown = htmlToMarkdown(html);
  assert.equal(markdown, '- uno\n- dos\n\n1. tres');
  const back = stripIds(htmlToPlateValue(markdownToHtml(markdown)));
  assert.deepEqual(back.map(node => [node.listStyleType, node.children[0].text]), [['disc', 'uno'], ['disc', 'dos'], ['decimal', 'tres']]);

  // Desactivar la lista y convertir en título no deja propiedades de lista colgando.
  commands.toggleBardoList(editor, 'decimal');
  commands.setBlockType(editor, 'h1');
  const last = stripIds(editor.children).at(-1);
  assert.deepEqual(last, {type: 'h1', children: [{text: 'tres'}]});

  // Tareas.
  commands.toggleChecklist(editor);
  assert.equal(commands.currentBlockKind(editor), 'checklist');
  assert.match(htmlToMarkdown(plateValueToHtml(editor.children)), /- \[ \] tres$/);
});

test('negrita que abarca un salto de línea no se rompe', () => {
  assertRoundTrip([p({text: 'a\nb', bold: true}, ' fin')], 'negrita multilínea');
});

test('documentos vacíos y párrafos vacíos no generan basura', () => {
  assert.equal(htmlToMarkdown(plateValueToHtml([p('')])), '');
  assert.equal(markdownToHtml('# Título\n\n', 'Título'), '<p><br></p>');
});

test('el marcador de párrafo vacío <p><br></p> no crea un salto de línea fantasma', () => {
  assert.deepEqual(stripIds(htmlToPlateValue('<p><br></p>')), [{type: 'p', children: [{text: ''}]}]);
  assert.deepEqual(stripIds(htmlToPlateValue('<ul><li>cinco<br></li></ul>')), [
    {type: 'p', listStyleType: 'disc', indent: 1, children: [{text: 'cinco'}]},
  ]);
  // Un salto final intencional se conserva entre Plate y HTML.
  const value = [p('línea\n')];
  assert.deepEqual(stripIds(htmlToPlateValue(plateValueToHtml(value))), value);
});
