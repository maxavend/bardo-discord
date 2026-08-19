import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_TYPES,
  fileStem,
  getSourceType,
  isTextSourceType,
  sourceLabel,
} from '../src/import-format.js';

test('getSourceType reconoce Markdown, TXT, PDF y DOCX sin depender de mayúsculas', () => {
  assert.equal(getSourceType('minuta.md'), SOURCE_TYPES.MARKDOWN);
  assert.equal(getSourceType('NOTAS.MARKDOWN'), SOURCE_TYPES.MARKDOWN);
  assert.equal(getSourceType('texto.TXT'), SOURCE_TYPES.TEXT);
  assert.equal(getSourceType('reporte.PDF'), SOURCE_TYPES.PDF);
  assert.equal(getSourceType('handoff.DOCX'), SOURCE_TYPES.DOCX);
});

test('getSourceType rechaza extensiones fuera del alcance', () => {
  assert.equal(getSourceType('legacy.doc'), null);
  assert.equal(getSourceType('slides.pptx'), null);
  assert.equal(getSourceType('imagen.png'), null);
  assert.equal(getSourceType(''), null);
});

test('isTextSourceType solo marca las entradas que no requieren normalización binaria', () => {
  assert.equal(isTextSourceType(SOURCE_TYPES.MARKDOWN), true);
  assert.equal(isTextSourceType(SOURCE_TYPES.TEXT), true);
  assert.equal(isTextSourceType(SOURCE_TYPES.PDF), false);
  assert.equal(isTextSourceType(SOURCE_TYPES.DOCX), false);
});

test('fileStem genera un título base útil para PDF y Word', () => {
  assert.equal(fileStem('/tmp/Minuta Weekly.docx'), 'Minuta Weekly');
  assert.equal(fileStem('Documento final.PDF'), 'Documento final');
  assert.equal(fileStem(''), 'Documento');
});

test('sourceLabel produce etiquetas legibles', () => {
  assert.equal(sourceLabel(SOURCE_TYPES.PDF), 'PDF');
  assert.equal(sourceLabel(SOURCE_TYPES.DOCX), 'Word');
  assert.equal(sourceLabel(SOURCE_TYPES.MARKDOWN), 'Markdown');
});
