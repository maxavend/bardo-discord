import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCX_STYLE_MAP,
  SOURCE_TYPES,
  cleanEscapedMarkdown,
  ensureDocumentTitle,
  fileStem,
  getSourceType,
  isTextSourceType,
  pdfTextToMarkdown,
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

test('pdfTextToMarkdown estructura encabezados, viñetas, listas y metadatos', () => {
  const samplePdf = `
    Página 1 de 3
    Fecha: 20 de Agosto de 2026
    Participantes: Maximiliano, Paula, Camila

    1. OBJETIVOS DE LA SESIÓN
    Revisar los avances del tablero Kanban y la importación de documentos.

    1.1 Alcance del Sprint
    El alcance comprende la mejora del parser de PDF y la conversión de Word.

    2. ACUERDOS Y TAREAS
    • Implementar detección de metadatos y listas en PDF
    • Configurar mapa de estilos enriquecido para Mammoth DOCX
    • Agregar gestión de miembros al tablero Kanban

    Nota: Todos los cambios deben pasar la suite de pruebas automatizadas.
  `;

  const md = pdfTextToMarkdown(samplePdf, 'Minuta de Reunión');
  assert.ok(md.includes('# Minuta de Reunión'));
  assert.ok(md.includes('**Fecha:** 20 de Agosto de 2026'));
  assert.ok(md.includes('**Participantes:** Maximiliano, Paula, Camila'));
  assert.ok(md.includes('## 1. OBJETIVOS DE LA SESIÓN'));
  assert.ok(md.includes('### 1.1 Alcance del Sprint'));
  assert.ok(md.includes('## 2. ACUERDOS Y TAREAS'));
  assert.ok(md.includes('- Implementar detección de metadatos'));
  assert.ok(md.includes('- Configurar mapa de estilos'));
  assert.ok(md.includes('> **Nota:** Todos los cambios deben pasar'));
  assert.ok(!md.includes('Página 1 de 3'));
});

test('pdfTextToMarkdown reconstruye párrafos partidos con guiones (de-hyphenation)', () => {
  const text = `
    Esta es una implementación del proyec-
    to que continúa en la siguiente línea
    y explica el funcionamiento del mó-
    dulo de documentos.
  `;
  const md = pdfTextToMarkdown(text, 'Documento');
  assert.ok(md.includes('proyecto que continúa en la siguiente línea'));
  assert.ok(md.includes('módulo de documentos'));
});

test('DOCX_STYLE_MAP contiene mapeos esenciales para títulos y estilos', () => {
  assert.ok(DOCX_STYLE_MAP.some((s) => s.includes('Heading 1')));
  assert.ok(DOCX_STYLE_MAP.some((s) => s.includes('Título 1')));
  assert.ok(DOCX_STYLE_MAP.some((s) => s.includes('Quote')));
  assert.ok(DOCX_STYLE_MAP.some((s) => s.includes('Code')));
});

test('ensureDocumentTitle antepone el título si no existe', () => {
  assert.equal(ensureDocumentTitle('Contenido base', 'Mi Título'), '# Mi Título\n\nContenido base');
  assert.equal(ensureDocumentTitle('# Mi Título\n\nContenido base', 'Mi Título'), '# Mi Título\n\nContenido base');
});

test('cleanEscapedMarkdown limpia barras invertidas accidentales y escapes recursivos', () => {
  const ugly = '11\\\\. Modelo de trabajo propuesto\n\\\\\\\\|Diseño de experiencia y flujo\n-> Desarrollo\\\\\\\\|';
  const clean = cleanEscapedMarkdown(ugly);
  assert.equal(clean, '11. Modelo de trabajo propuesto\n|Diseño de experiencia y flujo\n-> Desarrollo|');
});

