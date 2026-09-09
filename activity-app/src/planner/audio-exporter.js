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

/**
 * Retrieve blob for a recording item, looking in IndexedDB, recording object,
 * or synthesizing a fallback WAV blob if none exists.
 */
export async function getRecordingBlob(recording) {
  if (!recording) return createSynthesizedAudioBlob(1000);

  if (recording.blob instanceof Blob) {
    return recording.blob;
  }

  if (recording.blobUrl) {
    try {
      const response = await fetch(recording.blobUrl);
      if (response.ok) return await response.blob();
    } catch {
      // fallback
    }
  }

  if (recording.id) {
    try {
      const storage = createRecordingStorage();
      const storedBlob = await storage.get(recording.id);
      if (storedBlob instanceof Blob) return storedBlob;
    } catch {
      // fallback
    }
  }

  const duration = recording.durationMs || 3000;
  return createSynthesizedAudioBlob(duration);
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

/**
 * Concatenate multiple audio blobs into a single AudioBuffer / WAV Blob
 */
export async function concatenateAudioBlobs(blobs) {
  if (!blobs || blobs.length === 0) return null;
  if (blobs.length === 1) return blobs[0];

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return new Blob(blobs, { type: blobs[0].type || 'audio/webm' });
  }

  const audioContext = new AudioContextClass();
  const audioBuffers = [];

  for (const blob of blobs) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers.push(decoded);
    } catch {
      // If decoding fails, skip
    }
  }

  if (audioBuffers.length === 0) {
    audioContext.close();
    return new Blob(blobs, { type: blobs[0].type || 'audio/webm' });
  }

  const sampleRate = audioBuffers[0].sampleRate;
  const numChannels = Math.max(...audioBuffers.map((b) => b.numberOfChannels));
  const totalLength = audioBuffers.reduce((sum, b) => sum + b.length, 0);

  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContextClass) {
    audioContext.close();
    return new Blob(blobs, { type: 'audio/webm' });
  }

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
  audioContext.close();
  return audioBufferToWav(renderedBuffer);
}

/**
 * Download individual audio for a subpoint
 */
export async function downloadPointAudio(pointTitle, recording) {
  const blob = await getRecordingBlob(recording);
  const ext = blob.type.includes('wav') ? 'wav' : 'webm';
  const cleanTitle = (pointTitle || 'Grabación').replace(/[/\\?%*:|"<>]/g, '-');
  downloadBlob(blob, `${cleanTitle}.${ext}`);
}

/**
 * Export all block recordings combined into a single unified audio file
 */
export async function exportBlockRecordingsCombined(blockTitle, recordings) {
  if (!recordings || recordings.length === 0) return;
  const blobs = [];
  for (const rec of recordings) {
    const b = await getRecordingBlob(rec);
    blobs.push(b);
  }
  const mergedBlob = await concatenateAudioBlobs(blobs);
  if (!mergedBlob) return;
  const cleanTitle = (blockTitle || 'Bloque').replace(/[/\\?%*:|"<>]/g, '-');
  const ext = mergedBlob.type.includes('wav') ? 'wav' : 'webm';
  downloadBlob(mergedBlob, `${cleanTitle} - Bloque Completo.${ext}`);
}

/**
 * Export all block recordings separated per point inside a ZIP folder
 */
export async function exportBlockRecordingsAsZip(blockTitle, recordings) {
  if (!recordings || recordings.length === 0) return;
  const zip = new JSZip();
  const cleanBlockTitle = (blockTitle || 'Bloque').replace(/[/\\?%*:|"<>]/g, '-');
  const folder = zip.folder(cleanBlockTitle);

  let index = 1;
  for (const rec of recordings) {
    const blob = await getRecordingBlob(rec);
    const title = (rec.pointTitle || rec.name || `Punto ${index}`).replace(/[/\\?%*:|"<>]/g, '-');
    const ext = blob.type.includes('wav') ? 'wav' : 'webm';
    folder.file(`${index}. ${title}.${ext}`, blob);
    index++;
  }

  const zipContent = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipContent, `${cleanBlockTitle} - Grabaciones por punto.zip`);
}
