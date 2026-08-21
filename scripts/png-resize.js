import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function channelsForColorType(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`PNG color type ${colorType} no soportado por el optimizador de Bardo.`);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Avatar PNG inválido.');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw new Error(`Avatar PNG no soportado: ${width}x${height}, depth=${bitDepth}, interlace=${interlace}.`);
  }
  const channels = channelsForColorType(colorType);
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * channels);
  let input = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++];
    const row = y * stride;
    const previous = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[input++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[previous + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[previous + x - channels] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else throw new Error(`Filtro PNG ${filter} no soportado.`);
      pixels[row + x] = decoded & 255;
    }
  }
  return { width, height, bitDepth, colorType, channels, pixels };
}

export function resizePngPixels(image, targetWidth, targetHeight = targetWidth) {
  const { width, height, channels, pixels } = image;
  const out = Buffer.alloc(targetWidth * targetHeight * channels);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * height / targetHeight) - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = Math.max(0, sourceY - y0);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * width / targetWidth) - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = Math.max(0, sourceX - x0);
      for (let channel = 0; channel < channels; channel += 1) {
        const p00 = pixels[(y0 * width + x0) * channels + channel];
        const p10 = pixels[(y0 * width + x1) * channels + channel];
        const p01 = pixels[(y1 * width + x0) * channels + channel];
        const p11 = pixels[(y1 * width + x1) * channels + channel];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[(y * targetWidth + x) * channels + channel] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { ...image, width: targetWidth, height: targetHeight, pixels: out };
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export function encodePng(image) {
  const { width, height, bitDepth, colorType, channels, pixels } = image;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);
}

export function resizePng(buffer, size) {
  return encodePng(resizePngPixels(decodePng(buffer), size, size));
}
