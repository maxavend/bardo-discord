import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownToHtml, renderInline} from '../activity-app/src/editor/bardo-markdown.js';
import {parseBlocks} from '../src/export-markdown.js';

test('una tabla irregular no amplifica unos KB a millones de celdas', () => {
  const markdown = [`| ${Array(2000).fill('a').join(' | ')} |`, '| --- |', ...Array(2000).fill('| valor |')].join('\n');
  const html = markdownToHtml(markdown);
  assert.ok(html.startsWith('<pre><code>'));
  assert.ok(html.endsWith('</code></pre>'));
  assert.doesNotMatch(html, /<t[dh]>/);
  assert.ok(html.includes('valor'));
  const [block] = parseBlocks(markdown);
  assert.equal(block.type, 'code');
  assert.equal(block.text, markdown);
});

test('también limita el total de celdas en tablas con un ancho normal', () => {
  const markdown = ['| a | b |', '| --- | --- |', ...Array(5000).fill('| uno | dos |')].join('\n');
  assert.ok(markdownToHtml(markdown).startsWith('<pre><code>'));
  assert.equal(parseBlocks(markdown)[0].type, 'code');
});

test('miles de desplegables anidados mantienen texto y un DOM de profundidad acotada', () => {
  const markdown = `${'<details>\n'.repeat(10_000)}contenido <img src=x onerror=alert(1)>\n${'</details>\n'.repeat(10_000)}`;
  const html = markdownToHtml(markdown);
  assert.equal((html.match(/<details class=/g) || []).length, 12);
  assert.match(html, /contenido &lt;img/);
  assert.doesNotMatch(html, /<img/);
});

test('párrafos patológicos largos se muestran literalmente sin regex cuadráticas', () => {
  for (const marker of ['[a', '**a ', '~~a ']) {
    const source = marker.repeat(200_000);
    assert.equal(renderInline(source), source);
  }
  const html = renderInline(`${'[a'.repeat(20_000)}<script>alert(1)</script>`);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
});

test('tablas y formato inline ordinarios conservan la representación existente', () => {
  assert.match(markdownToHtml('| A | B |\n| --- | --- |\n| uno | dos |'), /<table>.*<td>uno<\/td><td>dos<\/td>/);
  assert.equal(renderInline('**negrita** y [guía](https://example.com)'), '<strong>negrita</strong> y <a href="https://example.com">guía</a>');
  assert.equal(parseBlocks('| A | B |\n| --- | --- |\n| uno | dos |')[0].type, 'table');
});
