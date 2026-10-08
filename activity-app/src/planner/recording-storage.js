const DB_NAME = 'bardo-planner-recordings-v1';
const DB_VERSION = 2;
const STORE_NAME = 'audio';
// Incremental capture: every MediaRecorder timeslice is written as it arrives so
// closing the Activity mid-recording keeps everything up to the last second.
const CHUNKS_STORE = 'chunks';
const IN_PROGRESS_STORE = 'inprogress';
const ALL_STORES = [STORE_NAME, CHUNKS_STORE, IN_PROGRESS_STORE];

export class RecordingStorageError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'RecordingStorageError';
    this.cause = cause;
  }
}

function openDatabase(indexedDBImpl) {
  if (!indexedDBImpl) {
    return Promise.reject(new RecordingStorageError('IndexedDB no está disponible en este navegador.'));
  }

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new RecordingStorageError('No se pudo abrir el almacenamiento de audio.', error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'id'});
      }
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, {keyPath: 'key'});
      }
      if (!db.objectStoreNames.contains(IN_PROGRESS_STORE)) {
        db.createObjectStore(IN_PROGRESS_STORE, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new RecordingStorageError('No se pudo abrir el almacenamiento de audio.', request.error));
  });
}

function runTransaction(indexedDBImpl, mode, operation, storeNames = STORE_NAME) {
  return openDatabase(indexedDBImpl).then((db) => new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(storeNames, mode);
      const store = Array.isArray(storeNames)
        ? Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]))
        : transaction.objectStore(storeNames);
      operation(store, resolve, reject);
    } catch (error) {
      db.close();
      reject(new RecordingStorageError('Falló una operación del almacenamiento de audio.', error));
      return;
    }

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(new RecordingStorageError('Falló una transacción del almacenamiento de audio.', transaction.error));
    };
    transaction.onabort = () => {
      db.close();
      reject(new RecordingStorageError('Se canceló una transacción del almacenamiento de audio.', transaction.error));
    };
  }));
}

export function createRecordingStorage(indexedDBImpl = globalThis.indexedDB) {
  return {
    async save(recordingId, blob) {
      if (!recordingId || !blob) throw new RecordingStorageError('Recording id y Blob son obligatorios.');
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.put({id: recordingId, blob, savedAt: Date.now()});
        request.onsuccess = () => resolve(recordingId);
        request.onerror = () => reject(new RecordingStorageError('No se pudo guardar el audio.', request.error));
      });
    },

    async get(recordingId) {
      if (!recordingId) return null;
      return runTransaction(indexedDBImpl, 'readonly', (store, resolve, reject) => {
        const request = store.get(recordingId);
        request.onsuccess = () => resolve(request.result?.blob || null);
        request.onerror = () => reject(new RecordingStorageError('No se pudo recuperar el audio.', request.error));
      });
    },

    async delete(recordingId) {
      if (!recordingId) return;
      return runTransaction(indexedDBImpl, 'readwrite', (stores, resolve, reject) => {
        const request = stores[STORE_NAME].delete(recordingId);
        stores[CHUNKS_STORE].delete(chunkRange(recordingId));
        stores[IN_PROGRESS_STORE].delete(recordingId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new RecordingStorageError('No se pudo eliminar el audio.', request.error));
      }, ALL_STORES);
    },

    async beginInProgress(meta) {
      if (!meta?.id) return;
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.put({...meta, savedAt: Date.now()});
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new RecordingStorageError('No se pudo registrar la grabación en curso.', request.error));
      }, IN_PROGRESS_STORE);
    },

    async appendChunk(recordingId, seq, blob) {
      if (!recordingId || !blob) return;
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.put({key: chunkKey(recordingId, seq), recordingId, seq, blob});
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new RecordingStorageError('No se pudo guardar un fragmento de audio.', request.error));
      }, CHUNKS_STORE);
    },

    async getChunks(recordingId) {
      if (!recordingId) return [];
      return runTransaction(indexedDBImpl, 'readonly', (store, resolve, reject) => {
        const request = store.getAll(chunkRange(recordingId));
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.seq - b.seq).map((row) => row.blob));
        request.onerror = () => reject(new RecordingStorageError('No se pudieron leer los fragmentos de audio.', request.error));
      }, CHUNKS_STORE);
    },

    async listInProgress() {
      return runTransaction(indexedDBImpl, 'readonly', (store, resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new RecordingStorageError('No se pudieron listar las grabaciones en curso.', request.error));
      }, IN_PROGRESS_STORE);
    },

    async clearInProgress(recordingId) {
      if (!recordingId) return;
      return runTransaction(indexedDBImpl, 'readwrite', (stores, resolve) => {
        stores[CHUNKS_STORE].delete(chunkRange(recordingId));
        const request = stores[IN_PROGRESS_STORE].delete(recordingId);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      }, [CHUNKS_STORE, IN_PROGRESS_STORE]);
    },
  };
}

function chunkKey(recordingId, seq) {
  return `${recordingId}:${String(seq).padStart(8, '0')}`;
}

function chunkRange(recordingId) {
  return globalThis.IDBKeyRange.bound(`${recordingId}:`, `${recordingId}:\uffff`);
}

/**
 * Chunk sink handed to RecordingController: writes metadata + every timeslice
 * to IndexedDB. Failures are reported but never interrupt the capture.
 */
export function createChunkSink(storage = recordingStorage, onError = () => {}) {
  const safe = (promise) => Promise.resolve(promise).catch((error) => onError(error));
  return {
    begin: (meta) => safe(storage.beginInProgress?.(meta)),
    append: (recordingId, seq, blob) => safe(storage.appendChunk?.(recordingId, seq, blob)),
  };
}

/**
 * Rebuilds recordings that were still being captured when the page died
 * (Activity closed, crash, reload). A capture is recovered when it belongs to
 * the live run `sessionId` OR to the agenda `plannerSessionId` (the run id may
 * change when the live state is reconciled with the server). Others stay
 * stored until their agenda is opened.
 *
 * `options.existingRecordingIds`: ids already present in the session. If one
 * of them already has its full audio stored, the leftover chunks are just
 * cleared (no duplicate, no partial copy replacing the complete one).
 * Returns persisted Recording metadata (status 'saved' or 'error').
 */
export async function recoverInProgressRecordings(sessionId, storage = recordingStorage, options = {}) {
  const {plannerSessionId = null, existingRecordingIds = []} = options || {};
  if ((!sessionId && !plannerSessionId) || typeof storage.listInProgress !== 'function') return [];
  const existing = new Set(existingRecordingIds || []);
  const metas = (await storage.listInProgress()).filter((meta) =>
    (sessionId && meta.sessionId === sessionId) ||
    (plannerSessionId && meta.plannerSessionId === plannerSessionId)
  );
  const recovered = [];
  for (const meta of metas) {
    if (existing.has(meta.id)) {
      let fullAudio = null;
      try {
        fullAudio = await storage.get(meta.id);
      } catch {
        fullAudio = null;
      }
      if (fullAudio) {
        await storage.clearInProgress(meta.id);
        continue;
      }
    }
    const chunks = await storage.getChunks(meta.id);
    if (!chunks.length) {
      await storage.clearInProgress(meta.id);
      continue;
    }
    const mimeType = meta.mimeType || chunks[0]?.type || 'audio/webm';
    const blob = new Blob(chunks, {type: mimeType});
    const baseName = meta.pointTitle || meta.blockTitle || 'Grabación';
    const durationMs = chunks.length * (meta.timesliceMs || 1000);
    const persisted = await persistRecordingBinary({
      id: meta.id,
      sessionId: meta.sessionId,
      plannerSessionId: meta.plannerSessionId || null,
      blockId: meta.blockId,
      blockTitle: meta.blockTitle,
      pointId: meta.pointId,
      pointTitle: meta.pointTitle,
      name: `${baseName} (recuperada)`,
      createdAt: meta.startedAt + durationMs,
      startedAt: meta.startedAt,
      endedAt: meta.startedAt + durationMs,
      durationMs,
      sources: meta.sources || ['microphone'],
      sourcesLabel: meta.sourcesLabel || 'Micrófono',
      segmentsCount: 1,
      segments: [],
      mimeType,
      fileSize: blob.size,
      storageKey: `sessions/${meta.sessionId}/blocks/${meta.blockId}/recordings/${meta.id}`,
      recovered: true,
      status: 'pending',
      binaryStorage: null,
      blob,
    }, storage);
    if (persisted.status === 'saved') await storage.clearInProgress(meta.id);
    recovered.push(persisted);
  }
  return recovered;
}

export const recordingStorage = createRecordingStorage();

/**
 * Persists a transient Recording entity returned by RecordingController and
 * returns serializable metadata. A Recording is never marked `saved` until its
 * binary Blob has actually been written.
 */
export async function persistRecordingBinary(recording, storage = recordingStorage) {
  if (!recording) return null;
  const {blob, blobUrl, ...metadata} = recording;
  if (!blob) {
    return {
      ...metadata,
      status: 'error',
      persistenceError: 'La grabación no contiene audio binario para persistir.',
    };
  }

  try {
    await storage.save(recording.id, blob);
    return {
      ...metadata,
      status: 'saved',
      binaryStorage: 'indexeddb',
      persistenceError: null,
      blobUrl: blobUrl || (typeof URL !== 'undefined' ? URL.createObjectURL(blob) : ''),
    };
  } catch (error) {
    return {
      ...metadata,
      status: 'error',
      binaryStorage: null,
      persistenceError: error?.message || 'No se pudo persistir el audio.',
      blobUrl: blobUrl || '',
    };
  }
}

/**
 * Rehydrates persisted metadata with its binary Blob after reload.
 * The object URL is recreated for the current page lifecycle only.
 */
export async function hydrateRecordingBinary(
  recording,
  storage = recordingStorage,
  objectUrlFactory = (blob) => (typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '')
) {
  if (!recording) return null;

  if (recording.binaryStorage !== 'indexeddb') {
    return {
      ...recording,
      blobUrl: '',
      status: 'error',
      persistenceError: recording.persistenceError || 'Esta grabación es anterior a la persistencia binaria y no puede recuperarse tras recargar.',
    };
  }

  try {
    const blob = await storage.get(recording.id);
    if (!blob) {
      return {
        ...recording,
        blobUrl: '',
        status: 'error',
        persistenceError: 'El audio guardado no se encontró en el almacenamiento local.',
      };
    }
    return {
      ...recording,
      blobUrl: objectUrlFactory(blob),
      status: 'saved',
      persistenceError: null,
    };
  } catch (error) {
    return {
      ...recording,
      blobUrl: '',
      status: 'error',
      persistenceError: error?.message || 'No se pudo recuperar el audio guardado.',
    };
  }
}

export async function hydrateRecordings(recordings = [], storage = recordingStorage) {
  return Promise.all((recordings || []).map((recording) => hydrateRecordingBinary(recording, storage)));
}
