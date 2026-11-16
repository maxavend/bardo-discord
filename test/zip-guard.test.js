import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {docxBombReason, docxContentReason, inspectZip, MAX_DOCX_UNCOMPRESSED_BYTES} from '../activity-app/src/zip-guard.js';

async function docx(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
}

test('un .docx normal pasa y se mide sin descomprimirlo', async () => {
  const bytes = await docx({'[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document>Hola</w:document>'});
  const zip = inspectZip(bytes);
  assert.ok(zip.entries >= 2, 'archivos (y carpetas) del ZIP');
  assert.equal(zip.uncompressedBytes, '<Types/>'.length + '<w:document>Hola</w:document>'.length);
  assert.equal(docxBombReason(bytes), null);
  assert.equal(await docxContentReason(bytes), null);
});

test('una bomba ZIP (pocos KB que se inflan a decenas de MB) se rechaza', async () => {
  const bytes = await docx({'word/document.xml': new Uint8Array(MAX_DOCX_UNCOMPRESSED_BYTES + 1)});
  assert.ok(bytes.byteLength < 200_000, 'el archivo comprimido es pequeño');
  assert.match(docxBombReason(bytes), /demasiado grande/);
});

test('lo que no es un ZIP se rechaza antes del conversor', () => {
  assert.equal(inspectZip(new TextEncoder().encode('esto no es un docx')), null);
  assert.match(docxBombReason(new TextEncoder().encode('esto no es un docx')), /dañado/);
});

test('un recuento EOCD falso no oculta entradas al guard aunque JSZip las abra', async () => {
  const bytes = await docx({'word/document.xml': 'contenido'});
  const view = new DataView(bytes.buffer);
  view.setUint16(bytes.length - 22 + 8, 0, true);
  view.setUint16(bytes.length - 22 + 10, 0, true);
  assert.ok((await JSZip.loadAsync(bytes)).file('word/document.xml'));
  assert.equal(inspectZip(bytes), null);
  assert.match(docxBombReason(bytes), /dañado/);
});

test('rechaza offsets, longitudes y discos inconsistentes antes de descomprimir', async () => {
  const original = await docx({'word/document.xml': 'contenido'});
  for (const mutate of [
    (view, end) => view.setUint32(end + 12, 0, true),
    (view, end) => view.setUint32(end + 16, 1, true),
    (view, end) => view.setUint16(end + 20, 1, true),
    (view, end) => view.setUint16(end + 4, 1, true),
    (view, end) => view.setUint16(view.getUint32(end + 16, true) + 28, 0xffff, true),
  ]) {
    const bytes = original.slice();
    mutate(new DataView(bytes.buffer), bytes.length - 22);
    assert.equal(inspectZip(bytes), null);
    assert.match(docxBombReason(bytes), /dañado/);
  }
});

test('una bomba que falsifica ambos tamaños se detiene contando bytes reales', async () => {
  const bytes = await docx({'word/document.xml': new Uint8Array(MAX_DOCX_UNCOMPRESSED_BYTES + 1)});
  const view = new DataView(bytes.buffer);
  let offset = view.getUint32(bytes.length - 22 + 16, true);
  while (view.getUint32(offset, true) === 0x02014b50) {
    if (view.getUint32(offset + 24, true) > MAX_DOCX_UNCOMPRESSED_BYTES) {
      view.setUint32(offset + 24, 1, true);
      view.setUint32(view.getUint32(offset + 42, true) + 22, 1, true);
    }
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  assert.equal(docxBombReason(bytes), null, 'el tamaño declarado por sí solo no detecta esta falsificación');
  assert.match(await docxContentReason(bytes), /demasiado grande/);
});

test('un ZIP normal escrito con descriptores de datos sigue siendo compatible', async () => {
  const zip = new JSZip().file('word/document.xml', 'contenido');
  const bytes = await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', streamFiles: true, comment: 'Documento de prueba'});
  assert.equal(docxBombReason(bytes), null);
  assert.equal(await docxContentReason(bytes), null);
});
