const DB_NAME = 'bardo-planner-recordings-v1';
const DB_VERSION = 2;
const STORE_NAME = 'audio';
const DRAFT_STORE_NAME = 'draft-chunks';
const DRAFT_METADATA_KEY = 'bardo-planner-recording-draft-v1';

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
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new RecordingStorageError('No se pudo abrir el almacenamiento de audio.', request.error));
  });
}

function runTransaction(indexedDBImpl, mode, operation, storeName = STORE_NAME) {
  return openDatabase(indexedDBImpl).then((db) => new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(storeName);
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
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.delete(recordingId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new RecordingStorageError('No se pudo eliminar el audio.', request.error));
      });
    },

    async appendDraftChunk(recordingId, sequence, blob) {
      if (!recordingId || !blob) return;
      const id = `${recordingId}:${String(sequence).padStart(8, '0')}`;
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.put({
          id,
          recordingId,
          sequence,
          blob,
          savedAt: Date.now(),
        });
        request.onsuccess = () => resolve(id);
        request.onerror = () => reject(new RecordingStorageError('No se pudo respaldar un segmento de audio.', request.error));
      }, DRAFT_STORE_NAME);
    },

    async getDraftChunks(recordingId) {
      if (!recordingId) return [];
      return runTransaction(indexedDBImpl, 'readonly', (store, resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const chunks = (request.result || [])
            .filter((entry) => entry.recordingId === recordingId)
            .sort((a, b) => a.sequence - b.sequence);
          resolve(chunks);
        };
        request.onerror = () => reject(new RecordingStorageError('No se pudo recuperar el respaldo temporal del audio.', request.error));
      }, DRAFT_STORE_NAME);
    },

    async clearDraft(recordingId) {
      if (!recordingId) return;
      return runTransaction(indexedDBImpl, 'readwrite', (store, resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => {
          const keys = (request.result || []).filter((key) => String(key).startsWith(`${recordingId}:`));
          if (keys.length === 0) {
            resolve();
            return;
          }
          let pending = keys.length;
          for (const key of keys) {
            const deletion = store.delete(key);
            deletion.onsuccess = () => {
              pending -= 1;
              if (pending === 0) resolve();
            };
            deletion.onerror = () => reject(new RecordingStorageError('No se pudo limpiar el respaldo temporal del audio.', deletion.error));
          }
        };
        request.onerror = () => reject(new RecordingStorageError('No se pudo leer el respaldo temporal del audio.', request.error));
      }, DRAFT_STORE_NAME);
    },
  };
}

export const recordingStorage = createRecordingStorage();

export function saveRecordingDraftMetadata(metadata) {
  try {
    if (!metadata?.recordingId) return false;
    localStorage.setItem(DRAFT_METADATA_KEY, JSON.stringify(metadata));
    return true;
  } catch {
    return false;
  }
}

export function loadRecordingDraftMetadata() {
  try {
    const raw = localStorage.getItem(DRAFT_METADATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRecordingDraftMetadata(recordingId = null) {
  try {
    if (recordingId) {
      const current = loadRecordingDraftMetadata();
      if (current?.recordingId && current.recordingId !== recordingId) return;
    }
    localStorage.removeItem(DRAFT_METADATA_KEY);
  } catch {
    // Best-effort cleanup.
  }
}

export async function recoverRecordingDraft(metadata, storage = recordingStorage) {
  if (!metadata?.recordingId) return null;
  const entries = await storage.getDraftChunks(metadata.recordingId);
  if (entries.length === 0) return null;
  const mimeType = metadata.mimeType || entries[0]?.blob?.type || 'audio/webm';
  const blob = new Blob(entries.map((entry) => entry.blob), {type: mimeType});
  if (blob.size === 0) return null;
  const endedAt = entries.at(-1)?.savedAt || Date.now();
  const startedAt = metadata.startedAt || endedAt;
  return {
    id: metadata.recordingId,
    sessionId: metadata.sessionId || null,
    blockId: metadata.blockId || null,
    blockTitle: metadata.blockTitle || null,
    pointId: metadata.pointId || null,
    pointTitle: metadata.pointTitle || null,
    name: metadata.pointTitle || metadata.blockTitle || 'Grabación recuperada',
    createdAt: endedAt,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    sources: metadata.sources || ['microphone'],
    sourcesLabel: metadata.sourcesLabel || 'Micrófono',
    segmentsCount: 1,
    segments: [],
    mimeType,
    fileSize: blob.size,
    storageKey: `sessions/${metadata.sessionId || 'recovered'}/blocks/${metadata.blockId || 'unknown'}/recordings/${metadata.recordingId}`,
    status: 'pending',
    binaryStorage: null,
    blobUrl: typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '',
    blob,
    recoveredFromDraft: true,
  };
}



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
