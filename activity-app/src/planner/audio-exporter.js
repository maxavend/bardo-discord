import JSZip from 'jszip';
import { createRecordingStorage } from './recording-storage.js';

/**
 * Trigger download of a Blob in the browser
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Creates a valid synthetic PCM WAV Blob for mock or demo recordings
 * that don't have binary audio stored in IndexedDB.
 */
export function createSynthesizedAudioBlob(durationMs = 3000, sampleRate = 44100) {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Write subtle harmonic tone so playback sounds gentle if played
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(Math.min(1, Math.max(0, (i / numSamples) * Math.PI)));
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15 * envelope;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export class RecordingUnavailableError extends Error {
  constructor(recording, message = 'El audio de esta grabación no está disponible en este dispositivo.') {
    super(message);
    this.name = 'RecordingUnavailableError';
    this.recordingId = recording?.id || null;
  }
}

const MIME_EXTENSIONS = [
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['video/webm', 'webm'],
  ['video/mp4', 'm4a'],
];

/** File extension for an audio MIME type ("audio/mp4;codecs=…" → "m4a"). */
export function extensionForMimeType(mimeType = '') {
  const base = String(mimeType || '').split(';')[0].trim().toLowerCase();
  return MIME_EXTENSIONS.find(([type]) => type === base)?.[1] || 'webm';
}

export function sanitizeFileName(value, fallback) {
  return (value || fallback).replace(/[/\\?%*:|"<>]/g, '-');
}

/**
 * Retrieve the real audio Blob for a recording (in-memory Blob, object URL or
 * IndexedDB). Throws RecordingUnavailableError when the audio does not exist
 * on this device. A synthetic tone is only produced with `allowSynthetic`
 * (explicit demo mode) — never as a silent substitute for lost audio.
 */
export async function getRecordingBlob(recording, {allowSynthetic = false, storage = null} = {}) {
  if (!recording) {
    if (allowSynthetic) return createSynthesizedAudioBlob(1000);
    throw new RecordingUnavailableError(recording);
  }

  if (typeof Blob !== 'undefined' && recording.blob instanceof Blob && recording.blob.size > 0) {
    return recording.blob;
  }

  if (recording.blobUrl && typeof fetch === 'function') {
    try {
      const response = await fetch(recording.blobUrl);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) return blob;
      }
    } catch {
      // fall through to IndexedDB
    }
  }

  if (recording.id) {
    try {
      const store = storage || createRecordingStorage();
      const storedBlob = await store.get(recording.id);
      if (typeof Blob !== 'undefined' && storedBlob instanceof Blob && storedBlob.size > 0) return storedBlob;
    } catch {
      // fall through
    }
  }

  if (allowSynthetic) return createSynthesizedAudioBlob(recording.durationMs || 3000);
  throw new RecordingUnavailableError(recording);
}

/**
 * Convert an AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** Above this total duration the combined WAV would need hundreds of MB. */
export const MAX_COMBINED_EXPORT_MS = 45 * 60 * 1000;

export function shouldExportAsZip(recordings = [], maxCombinedMs = MAX_COMBINED_EXPORT_MS) {
  const total = (recordings || []).reduce((sum, recording) => sum + (Number(recording?.durationMs) || 0), 0);
  return total > maxCombinedMs;
}

/**
 * Concatenate multiple audio blobs into a single WAV Blob.
 * Returns {blob, failed}: `failed` counts blobs that could not be decoded; when
 * it is > 0 callers must not present the result as complete.
 */
export async function concatenateAudioBlobs(blobs) {
  if (!blobs || blobs.length === 0) return {blob: null, failed: 0};
  if (blobs.length === 1) return {blob: blobs[0], failed: 0};

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineContextClass) return {blob: null, failed: blobs.length};

  const audioContext = new AudioContextClass();
  try {
    const audioBuffers = [];
    let failed = 0;
    for (const blob of blobs) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        audioBuffers.push(await audioContext.decodeAudioData(arrayBuffer));
      } catch {
        failed += 1;
      }
    }
    if (failed > 0 || audioBuffers.length === 0) return {blob: null, failed: failed || blobs.length};

    const sampleRate = audioBuffers[0].sampleRate;
    const numChannels = Math.max(...audioBuffers.map((b) => b.numberOfChannels));
    const totalLength = audioBuffers.reduce((sum, b) => sum + b.length, 0);
    const offlineContext = new OfflineContextClass(numChannels, totalLength, sampleRate);
    let currentOffset = 0;
    for (const buffer of audioBuffers) {
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(currentOffset / sampleRate);
      currentOffset += buffer.length;
    }
    const renderedBuffer = await offlineContext.startRendering();
    return {blob: audioBufferToWav(renderedBuffer), failed: 0};
  } finally {
    try {
      audioContext.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Download individual audio for a subpoint. Throws RecordingUnavailableError
 * when the audio is not on this device.
 */
export async function downloadPointAudio(pointTitle, recording, options = {}) {
  const blob = await getRecordingBlob(recording, options);
  const cleanTitle = sanitizeFileName(pointTitle, 'Grabación');
  downloadBlob(blob, `${cleanTitle}.${extensionForMimeType(blob.type || recording?.mimeType)}`);
}

/**
 * Collects the real blobs of `recordings`. Missing audio is reported, never
 * replaced by a synthetic file (unless allowSynthetic for demo mode).
 */
export async function collectRecordingBlobs(recordings = [], options = {}) {
  const available = [];
  const missing = [];
  for (const recording of recordings || []) {
    try {
      available.push({recording, blob: await getRecordingBlob(recording, options)});
    } catch (error) {
      if (error instanceof RecordingUnavailableError) missing.push(recording);
      else throw error;
    }
  }
  return {available, missing};
}

/**
 * Export all block recordings combined into a single audio file.
 * Falls back to a ZIP of the original files (no re-encoding, no data loss)
 * when the block is too long to combine in memory or any file can't be
 * decoded. Returns {mode: 'combined'|'zip', reason?, missing}.
 */
export async function exportBlockRecordingsCombined(blockTitle, recordings, options = {}) {
  const {maxCombinedMs = MAX_COMBINED_EXPORT_MS, ...blobOptions} = options;
  if (!recordings || recordings.length === 0) throw new RecordingUnavailableError(null, 'Este bloque no tiene grabaciones.');
  if (shouldExportAsZip(recordings, maxCombinedMs)) {
    const result = await exportBlockRecordingsAsZip(blockTitle, recordings, blobOptions);
    return {...result, mode: 'zip', reason: 'long'};
  }
  const {available, missing} = await collectRecordingBlobs(recordings, blobOptions);
  if (available.length === 0) throw new RecordingUnavailableError(null, 'El audio de este bloque no está disponible en este dispositivo.');
  const {blob: mergedBlob, failed} = await concatenateAudioBlobs(available.map((item) => item.blob));
  if (!mergedBlob || failed > 0) {
    const result = await exportBlockRecordingsAsZip(blockTitle, recordings, blobOptions);
    return {...result, mode: 'zip', reason: 'decode'};
  }
  const cleanTitle = sanitizeFileName(blockTitle, 'Bloque');
  downloadBlob(mergedBlob, `${cleanTitle} - Bloque Completo.${extensionForMimeType(mergedBlob.type)}`);
  return {mode: 'combined', missing: missing.length};
}

/**
 * Export all block recordings separated per point inside a ZIP folder.
 * Returns {mode: 'zip', missing}. Throws when no audio is available.
 */
export async function exportBlockRecordingsAsZip(blockTitle, recordings, options = {}) {
  if (!recordings || recordings.length === 0) throw new RecordingUnavailableError(null, 'Este bloque no tiene grabaciones.');
  const {available, missing} = await collectRecordingBlobs(recordings, options);
  if (available.length === 0) throw new RecordingUnavailableError(null, 'El audio de este bloque no está disponible en este dispositivo.');
  const zip = new JSZip();
  const cleanBlockTitle = sanitizeFileName(blockTitle, 'Bloque');
  const folder = zip.folder(cleanBlockTitle);

  let index = 1;
  for (const {recording, blob} of available) {
    const title = sanitizeFileName(recording.pointTitle || recording.name, `Tema ${index}`);
    folder.file(`${index}. ${title}.${extensionForMimeType(blob.type || recording.mimeType)}`, blob);
    index++;
  }

  const zipContent = await zip.generateAsync({type: 'blob'});
  downloadBlob(zipContent, `${cleanBlockTitle} - Grabaciones por tema.zip`);
  return {mode: 'zip', missing: missing.length};
}
