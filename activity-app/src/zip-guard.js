// Revisión barata de un .docx (ZIP) antes de descomprimirlo: lee solo el
// directorio central y suma los tamaños descomprimidos declarados. Un archivo
// pequeño que se infla a cientos de MB (bomba ZIP) se rechaza sin abrirlo.
// La comparten el Worker (al subir) y la Activity (antes de convertir).

export const MAX_DOCX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 3000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const INVALID_DOCX = 'No pudimos leer este documento Word. Puede estar dañado o usar un formato ZIP que Bardo no puede abrir. Guárdalo de nuevo como .docx y vuelve a subirlo.';
const TOO_LARGE_DOCX = 'Este documento de Word es demasiado grande para abrirlo en Bardo. Guárdalo de nuevo sin elementos pesados o divídelo en partes.';

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
  if (eocd + 22 + view.getUint16(eocd + 20, true) !== bytes.byteLength) return null;
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralStart = view.getUint32(eocd + 16, true);
  // ZIP64 (tamaños u offsets de 0xFFFFFFFF): un Word real nunca lo necesita.
  if (entries === 0xffff || centralStart === 0xffffffff || centralSize === 0xffffffff) return {entries: Infinity, uncompressedBytes: Infinity};
  // JSZip tolera recuentos falsos y offsets desplazados. Aquí deben coincidir:
  // de otro modo su conversor puede abrir entradas que el guard no contó.
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0
    || view.getUint16(eocd + 8, true) !== entries || centralStart + centralSize !== eocd) return null;
  let offset = centralStart;
  let uncompressedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return null;
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if (size === 0xffffffff || compressedSize === 0xffffffff || local === 0xffffffff) return {entries, uncompressedBytes: Infinity};
    if (next > eocd || (flags & 1) || ![0, 8].includes(method)
      || view.getUint16(offset + 34, true) !== 0 || local + 30 > centralStart
      || view.getUint32(local, true) !== LOCAL_SIGNATURE) return null;
    const localNameLength = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method
      || localNameLength !== nameLength || dataStart + compressedSize > centralStart) return null;
    for (let i = 0; i < nameLength; i += 1) {
      if (bytes[local + 30 + i] !== bytes[offset + 46 + i]) return null;
    }
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressedSize
      || view.getUint32(local + 22, true) !== size)) return null;
    if (method === 0 && compressedSize !== size) return null;
    uncompressedBytes += size;
    offset = next;
  }
  if (offset !== eocd) return null;
  return {entries, uncompressedBytes};
}

/** Mensaje para la persona si el .docx es sospechosamente grande al abrirlo; null si está bien. */
export function docxBombReason(input) {
  const zip = inspectZip(input);
  if (!zip) return INVALID_DOCX;
  if (zip.entries > MAX_DOCX_ENTRIES || zip.uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
    return TOO_LARGE_DOCX;
  }
  return null;
}

/**
 * Antes de Mammoth, cuenta también la expansión REAL sin acumular el contenido.
 * Los tamaños de ambas cabeceras pueden estar falsificados; el control síncrono
 * de metadatos por sí solo no basta. Las entradas se comprueban en serie y se
 * detiene el flujo al superar el presupuesto compartido de todo el archivo.
 */
export async function docxContentReason(input) {
  const metadataReason = docxBombReason(input);
  if (metadataReason) return metadataReason;
  let expandedBytes = 0;
  try {
    const {default: JSZip} = await import('jszip');
    const zip = await JSZip.loadAsync(input);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const reason = await new Promise(resolve => {
        const stream = entry.internalStream('uint8array');
        stream.on('data', chunk => {
          expandedBytes += chunk.byteLength;
          if (expandedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
            stream.pause();
            resolve(TOO_LARGE_DOCX);
          }
        }).on('error', () => resolve(INVALID_DOCX)).on('end', () => resolve(null)).resume();
      });
      if (reason) return reason;
    }
    return null;
  } catch {
    return INVALID_DOCX;
  }
}
