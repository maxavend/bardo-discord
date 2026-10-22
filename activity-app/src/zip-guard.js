// Revisión barata de un .docx (ZIP) antes de descomprimirlo: lee solo el
// directorio central y suma los tamaños descomprimidos declarados. Un archivo
// pequeño que se infla a cientos de MB (bomba ZIP) se rechaza sin abrirlo.
// La comparten el Worker (al subir) y la Activity (antes de convertir).

export const MAX_DOCX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 3000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** {entries, uncompressedBytes} del ZIP, o null si no es un ZIP legible. */
export function inspectZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= minEocd; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) { eocd = offset; break; }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  // ZIP64 (tamaños u offsets de 0xFFFFFFFF): un Word real nunca lo necesita.
  if (entries === 0xffff || offset === 0xffffffff) return {entries: Infinity, uncompressedBytes: Infinity};
  let uncompressedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return null;
    const size = view.getUint32(offset + 24, true);
    if (size === 0xffffffff) return {entries, uncompressedBytes: Infinity};
    uncompressedBytes += size;
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return {entries, uncompressedBytes};
}

/** Mensaje para la persona si el .docx es sospechosamente grande al abrirlo; null si está bien. */
export function docxBombReason(input) {
  const zip = inspectZip(input);
  // Lo que no es un ZIP lo rechaza el conversor con su propio mensaje.
  if (!zip) return null;
  if (zip.entries > MAX_DOCX_ENTRIES || zip.uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
    return 'Este documento de Word es demasiado grande para abrirlo en Bardo. Guárdalo de nuevo sin elementos pesados o divídelo en partes.';
  }
  return null;
}
