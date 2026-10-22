import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {docxBombReason, inspectZip, MAX_DOCX_UNCOMPRESSED_BYTES} from '../activity-app/src/zip-guard.js';

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
});

test('una bomba ZIP (pocos KB que se inflan a decenas de MB) se rechaza', async () => {
  const bytes = await docx({'word/document.xml': new Uint8Array(MAX_DOCX_UNCOMPRESSED_BYTES + 1)});
  assert.ok(bytes.byteLength < 200_000, 'el archivo comprimido es pequeño');
  assert.match(docxBombReason(bytes), /demasiado grande/);
});

test('lo que no es un ZIP queda para el conversor', () => {
  assert.equal(inspectZip(new TextEncoder().encode('esto no es un docx')), null);
  assert.equal(docxBombReason(new TextEncoder().encode('esto no es un docx')), null);
});
