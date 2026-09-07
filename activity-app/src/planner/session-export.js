import { recordingStorage } from './recording-storage.js';
import { generateMinutesMarkdown } from './planner-store.js';

const textEncoder = new TextEncoder();

function sanitizeSegment(value, fallback = 'sin-titulo') {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || fallback;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function extensionForMime(mimeType = '') {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

function timeStem(timestamp) {
  if (!timestamp) return 'sin-hora';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'sin-hora';
  return `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function localHeader(nameBytes, crc, size, timestamp) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  const { dosTime, dosDate } = dosDateTime(timestamp);
  let offset = 0;
  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  u32(0x04034b50);
  u16(20);
  u16(0x0800);
  u16(0);
  u16(dosTime);
  u16(dosDate);
  u32(crc);
  u32(size);
  u32(size);
  u16(nameBytes.length);
  u16(0);
  new Uint8Array(buffer, 30).set(nameBytes);
  return new Uint8Array(buffer);
}

function centralHeader(nameBytes, crc, size, timestamp, localOffset) {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  const { dosTime, dosDate } = dosDateTime(timestamp);
  let offset = 0;
  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  u32(0x02014b50);
  u16(20);
  u16(20);
  u16(0x0800);
  u16(0);
  u16(dosTime);
  u16(dosDate);
  u32(crc);
  u32(size);
  u32(size);
  u16(nameBytes.length);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(0);
  u32(localOffset);
  new Uint8Array(buffer, 46).set(nameBytes);
  return new Uint8Array(buffer);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  let offset = 0;
  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entryCount);
  u16(entryCount);
  u32(centralSize);
  u32(centralOffset);
  u16(0);
  return new Uint8Array(buffer);
}

async function resolveRecordingBlob(recording) {
  if (recording?.blob instanceof Blob) return recording.blob;
  if (recording?.binaryStorage === 'indexeddb') {
    const blob = await recordingStorage.get(recording.id);
    if (blob) return blob;
  }
  if (recording?.blobUrl) {
    const response = await fetch(recording.blobUrl);
    if (response.ok) return response.blob();
  }
  return null;
}

function createArchiveLayout(plannerState, sessionState) {
  const blocks = plannerState?.blocks || [];
  const recordings = sessionState?.recordings || [];
  const counters = new Map();
  const manifestRecordings = [];
  const audioEntries = [];

  for (const recording of recordings) {
    const blockIndex = blocks.findIndex((block) => block.id === recording.blockId);
    const block = blockIndex >= 0 ? blocks[blockIndex] : null;
    const points = block?.subpoints || [];
    const pointIndex = points.findIndex((point) => point.id === recording.pointId);
    const point = pointIndex >= 0 ? points[pointIndex] : null;
    const blockPrefix = blockIndex >= 0 ? pad2(blockIndex + 1) : '99';
    const blockFolder = `${blockPrefix}_${sanitizeSegment(block?.title, 'sin-bloque')}`;
    const baseName = point
      ? `${pad2(pointIndex + 1)}_${sanitizeSegment(point.title, 'punto')}`
      : `00_bloque-completo`;
    const counterKey = `${blockFolder}/${baseName}`;
    const sequence = (counters.get(counterKey) || 0) + 1;
    counters.set(counterKey, sequence);
    const duplicateSuffix = sequence > 1 ? `_${pad2(sequence)}` : '';
    const extension = extensionForMime(recording.mimeType);
    const path = `${blockFolder}/${baseName}_${timeStem(recording.startedAt || recording.createdAt)}${duplicateSuffix}.${extension}`;

    audioEntries.push({ path, recording });
    manifestRecordings.push({
      id: recording.id,
      file: path,
      blockId: recording.blockId || null,
      blockTitle: recording.blockTitle || block?.title || null,
      pointId: recording.pointId || null,
      pointTitle: recording.pointTitle || point?.title || null,
      name: recording.name || null,
      durationMs: recording.durationMs || 0,
      mimeType: recording.mimeType || 'audio/webm',
      fileSize: recording.fileSize || null,
      startedAt: recording.startedAt || null,
      endedAt: recording.endedAt || null,
      sources: recording.sources || ['microphone'],
    });
  }

  return { audioEntries, manifestRecordings };
}

async function buildZip(entries) {
  const localParts = [];
  const centralEntries = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.path);
    const blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.data], { type: entry.type || 'application/octet-stream' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(bytes);
    const size = blob.size;
    const timestamp = entry.timestamp || Date.now();
    const header = localHeader(nameBytes, crc, size, timestamp);
    localParts.push(header, blob);
    centralEntries.push(centralHeader(nameBytes, crc, size, timestamp, localOffset));
    localOffset += header.byteLength + size;
  }

  const centralOffset = localOffset;
  const centralSize = centralEntries.reduce((total, part) => total + part.byteLength, 0);
  return new Blob([
    ...localParts,
    ...centralEntries,
    endOfCentralDirectory(entries.length, centralSize, centralOffset),
  ], { type: 'application/zip' });
}

export async function exportMeetingArchive(plannerState, sessionState) {
  const date = plannerState?.date || new Date().toISOString().slice(0, 10);
  const root = `${sanitizeSegment(date, 'reunion')}_${sanitizeSegment(plannerState?.title, 'reunion')}`;
  const { audioEntries, manifestRecordings } = createArchiveLayout(plannerState, sessionState);
  const entries = [];

  for (const item of audioEntries) {
    const blob = await resolveRecordingBlob(item.recording);
    if (!blob) {
      throw new Error(`No se pudo recuperar “${item.recording?.name || 'una grabación'}”. Descárgala individualmente antes de recargar o vuelve a intentar.`);
    }
    entries.push({
      path: `${root}/${item.path}`,
      blob,
      timestamp: item.recording?.startedAt || item.recording?.createdAt || Date.now(),
    });
  }

  const summary = generateMinutesMarkdown(plannerState, sessionState);
  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    meeting: {
      eventId: plannerState?.eventId || null,
      sessionId: sessionState?.sessionId || null,
      title: plannerState?.title || 'Reunión',
      date: plannerState?.date || null,
      startTime: plannerState?.startTime || null,
      host: plannerState?.host || null,
      status: sessionState?.status || 'idle',
      startedAt: sessionState?.sessionStartedAt || null,
      endedAt: sessionState?.sessionEndedAt || null,
    },
    recordings: manifestRecordings,
  };

  entries.push(
    {
      path: `${root}/resumen.md`,
      data: summary,
      type: 'text/markdown;charset=utf-8',
    },
    {
      path: `${root}/manifest.json`,
      data: JSON.stringify(manifest, null, 2),
      type: 'application/json;charset=utf-8',
    }
  );

  const blob = await buildZip(entries);
  return {
    blob,
    fileName: `${root}.zip`,
    recordingsCount: audioEntries.length,
  };
}

export function downloadArchive({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'reunion-bardo.zip';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
