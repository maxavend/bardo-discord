/**
 * Recording Controller — browser capture lifecycle only.
 *
 * The controller owns MediaRecorder + pause/resume segments. Persistence is
 * intentionally delegated to recording-storage.js so metadata and binary audio
 * have separate responsibilities.
 */

export const RECORDING_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  PAUSED: 'paused',
  FINALIZING: 'finalizing',
  FINALIZED: 'finalized',
  ERROR: 'error',
};

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function createRecordingId(now = Date.now()) {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `rec-${now}-${suffix}`;
}

const TIMESLICE_MS = 1000;

/**
 * Plain-Spanish explanation of a microphone/recorder error for non-technical
 * users, with how to allow the microphone in Discord. Never shows the raw
 * browser message (e.g. "NotAllowedError: Permission denied").
 */
export function describeMicrophoneError(error, {isMobile = false} = {}) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const howToAllow = isMobile
    ? 'En tu teléfono abre Ajustes → Aplicaciones → Discord → Permisos y activa el Micrófono. Luego vuelve a abrir la actividad.'
    : 'En Discord abre Ajustes de usuario → Voz y video y revisa que tu micrófono esté elegido. Si usas Discord en el navegador, permite el micrófono desde el ícono del candado junto a la dirección y vuelve a intentarlo.';
  if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|permission|not allowed/i.test(message)) {
    return `Bardo no tiene permiso para usar tu micrófono. ${howToAllow}`;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || /not found|no device/i.test(message)) {
    return 'No encontramos un micrófono conectado. Conecta uno (o elige otro en Discord: Ajustes de usuario → Voz y video) y vuelve a intentarlo.';
  }
  if (name === 'NotReadableError' || name === 'AbortError' || /in use|could not start|not readable/i.test(message)) {
    return 'Tu micrófono está ocupado por otra aplicación o no responde. Ciérrala o desconecta y vuelve a conectar el micrófono, y vuelve a intentarlo.';
  }
  if (/no soporta/i.test(message)) {
    return 'Este dispositivo no permite grabar audio desde la actividad. Prueba desde Discord en el computador.';
  }
  return `No se pudo usar el micrófono. ${howToAllow}`;
}

export function isMobileUserAgent(userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(userAgent || ''));
}
const STOP_TIMEOUT_MS = 4000;

export class RecordingController {
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});
    // Called with a finalized Recording entity when capture stops on its own
    // (microphone unplugged, permission revoked, recorder error). The audio
    // captured so far is never discarded.
    this.onAutoFinalized = options.onAutoFinalized || (() => {});
    // Optional {begin(meta), append(recordingId, seq, blob)} for incremental
    // persistence (see recording-storage.createChunkSink).
    this.chunkSink = options.chunkSink || null;
    this.mediaRecorder = null;
    this.stream = null;
    this.audioChunks = [];
    this.chunkSeq = 0;
    this.startTime = null;
    this.pauseStartTime = null;
    this.accumulatedPausedMs = 0;
    this.status = RECORDING_STATUS.IDLE;
    this.currentRecordingId = null;
    this.currentSessionId = null;
    this.currentPlannerSessionId = null;
    this.currentBlockId = null;
    this.currentBlockTitle = null;
    this.currentPointId = null;
    this.currentPointTitle = null;
    this.currentSources = ['microphone'];
    this.segments = [];
    this.activeSegmentStartedAt = null;
    this.mimeType = '';
    this.finalizeRequest = null;
    this.lastRecorderError = null;
    this.trackListeners = [];
  }

  getStatus() {
    return this.status;
  }

  getCurrentRecordingId() {
    return this.currentRecordingId;
  }

  isRecording() {
    return this.status === RECORDING_STATUS.RECORDING;
  }

  isPaused() {
    return this.status === RECORDING_STATUS.PAUSED;
  }

  isActive() {
    return this.status === RECORDING_STATUS.RECORDING || this.status === RECORDING_STATUS.PAUSED;
  }

  getCurrentContext() {
    return {
      recordingId: this.currentRecordingId,
      sessionId: this.currentSessionId,
      blockId: this.currentBlockId,
      blockTitle: this.currentBlockTitle,
      pointId: this.currentPointId,
      pointTitle: this.currentPointTitle,
      sources: this.currentSources,
      sourcesLabel: this.currentSources.includes('system') ? 'Micrófono + sistema' : 'Micrófono',
      recordingName: this.currentPointTitle || this.currentBlockTitle || 'Grabación',
    };
  }

  setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  getElapsedRecordingMs(now = Date.now()) {
    if (!this.startTime) return 0;
    if (this.status === RECORDING_STATUS.PAUSED && this.pauseStartTime) {
      return Math.max(0, this.pauseStartTime - this.startTime - this.accumulatedPausedMs);
    }
    return Math.max(0, now - this.startTime - this.accumulatedPausedMs);
  }

  sink(method, ...args) {
    if (!this.chunkSink?.[method]) return;
    try {
      const result = this.chunkSink[method](...args);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Incremental persistence is best effort; in-memory chunks remain.
    }
  }

  async startRecording(sessionId, blockId, blockTitle = 'Bloque', pointId = null, pointTitle = null, sources = ['microphone'], context = {}) {
    if (this.isActive() || this.status === RECORDING_STATUS.STARTING || this.status === RECORDING_STATUS.FINALIZING) {
      return this.currentRecordingId;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const error = new Error('Tu navegador no soporta grabación de micrófono.');
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(error);
      throw error;
    }

    this.setStatus(RECORDING_STATUS.STARTING);
    this.currentRecordingId = createRecordingId();
    this.currentSessionId = sessionId;
    this.currentPlannerSessionId = context?.plannerSessionId || null;
    this.currentBlockId = blockId;
    this.currentBlockTitle = blockTitle;
    this.currentPointId = pointId;
    this.currentPointTitle = pointTitle;
    this.currentSources = sources || ['microphone'];
    this.audioChunks = [];
    this.chunkSeq = 0;
    this.accumulatedPausedMs = 0;
    this.segments = [];
    this.lastRecorderError = null;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = getSupportedMimeType();
      this.mimeType = mimeType;
      this.attachNewRecorder();
      this.setStatus(RECORDING_STATUS.RECORDING);
      return this.currentRecordingId;
    } catch (error) {
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(error);
      throw error;
    }
  }

  /** Creates a MediaRecorder on the current stream for the current context and starts it. */
  attachNewRecorder() {
    const mimeType = this.mimeType;
    const recorder = new MediaRecorder(this.stream, mimeType ? {mimeType} : {});
    this.mediaRecorder = recorder;
    const recordingId = this.currentRecordingId;
    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size <= 0) return;
      if (this.mediaRecorder !== recorder) return;
      this.audioChunks.push(event.data);
      this.sink('append', recordingId, this.chunkSeq, event.data);
      this.chunkSeq += 1;
    };
    recorder.onstop = () => this.handleRecorderStop(recorder);
    recorder.onerror = (event) => {
      const error = event?.error || new Error('El grabador de audio falló.');
      this.lastRecorderError = error;
      this.onError(error);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        this.handleRecorderStop(recorder);
      }
    };
    this.watchTracks(recorder);

    recorder.start(TIMESLICE_MS);
    const now = Date.now();
    this.startTime = now;
    this.activeSegmentStartedAt = now;
    this.sink('begin', {
      id: recordingId,
      sessionId: this.currentSessionId,
      plannerSessionId: this.currentPlannerSessionId,
      blockId: this.currentBlockId,
      blockTitle: this.currentBlockTitle,
      pointId: this.currentPointId,
      pointTitle: this.currentPointTitle,
      sources: this.currentSources,
      startedAt: now,
      mimeType: mimeType || 'audio/webm',
      timesliceMs: TIMESLICE_MS,
    });
    return recorder;
  }

  /**
   * Closes the current recording as its own file and immediately continues
   * recording on the SAME microphone stream for a new tema/bloque (no new
   * permission prompt, minimal gap). Resolves with the finalized entity of
   * the previous segment. If nothing is being recorded it resolves null.
   */
  async rolloverRecording({sessionId, blockId, blockTitle = 'Bloque', pointId = null, pointTitle = null, plannerSessionId, startPaused = false} = {}) {
    if (!this.isActive() || !this.stream || !this.mediaRecorder || this.status === RECORDING_STATUS.FINALIZING) {
      return null;
    }
    const oldRecorder = this.mediaRecorder;
    const meta = this.snapshotMeta(Date.now());
    const oldChunks = this.audioChunks;
    let oldSeq = this.chunkSeq;
    const oldId = meta.recordingId;

    const finalized = new Promise((resolve) => {
      let done = false;
      let timeout = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try {
          resolve(this.buildEntity(meta, {continuedFromRollover: true}, oldChunks));
        } catch (error) {
          this.onError(error);
          resolve(null);
        }
      };
      oldRecorder.ondataavailable = (event) => {
        if (!event.data || event.data.size <= 0) return;
        oldChunks.push(event.data);
        this.sink('append', oldId, oldSeq, event.data);
        oldSeq += 1;
      };
      oldRecorder.onstop = finish;
      oldRecorder.onerror = finish;
      timeout = setTimeout(finish, STOP_TIMEOUT_MS);
      try {
        if (oldRecorder.state === 'paused') oldRecorder.resume();
        if (oldRecorder.state !== 'inactive') oldRecorder.stop();
        else finish();
      } catch {
        finish();
      }
    });

    // New recording context on the same stream.
    this.currentRecordingId = createRecordingId();
    this.currentSessionId = sessionId ?? this.currentSessionId;
    if (plannerSessionId !== undefined) this.currentPlannerSessionId = plannerSessionId;
    this.currentBlockId = blockId;
    this.currentBlockTitle = blockTitle;
    this.currentPointId = pointId;
    this.currentPointTitle = pointTitle;
    this.audioChunks = [];
    this.chunkSeq = 0;
    this.accumulatedPausedMs = 0;
    this.pauseStartTime = null;
    this.segments = [];
    this.lastRecorderError = null;
    try {
      const recorder = this.attachNewRecorder();
      if (startPaused) {
        // Meeting is paused: the new part must not capture anything until the
        // meeting resumes (never "record, then pause after the old one stops").
        recorder.pause();
        this.pauseStartTime = this.startTime;
        this.activeSegmentStartedAt = null;
        this.setStatus(RECORDING_STATUS.PAUSED);
      } else {
        this.setStatus(RECORDING_STATUS.RECORDING);
      }
    } catch (error) {
      this.lastRecorderError = error;
      this.onError(error);
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.ERROR);
    }
    return finalized;
  }

  /** Removes the `ended` listeners of the previous recorder (one set per recorder, never accumulated). */
  unwatchTracks() {
    for (const {track, onEnded} of this.trackListeners || []) {
      try {
        if (typeof track.removeEventListener === 'function') track.removeEventListener('ended', onEnded);
        else if (track.onended === onEnded) track.onended = null;
      } catch {
        // ignore
      }
    }
    this.trackListeners = [];
  }

  watchTracks(recorder) {
    this.unwatchTracks();
    const tracks = this.stream?.getTracks?.() || [];
    for (const track of tracks) {
      const onEnded = () => {
        if (this.mediaRecorder !== recorder) return;
        try {
          if (recorder.state !== 'inactive') recorder.stop();
          else this.handleRecorderStop(recorder);
        } catch {
          this.handleRecorderStop(recorder);
        }
      };
      if (typeof track.addEventListener === 'function') track.addEventListener('ended', onEnded);
      else track.onended = onEnded;
      this.trackListeners.push({track, onEnded});
    }
  }

  pauseRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    try {
      this.mediaRecorder.pause();
      const now = Date.now();
      this.pauseStartTime = now;
      if (this.activeSegmentStartedAt) {
        this.segments.push({
          id: `seg-${this.segments.length + 1}`,
          startedAt: this.activeSegmentStartedAt,
          endedAt: now,
          durationMs: Math.max(0, now - this.activeSegmentStartedAt),
        });
        this.activeSegmentStartedAt = null;
      }
      this.setStatus(RECORDING_STATUS.PAUSED);
    } catch (error) {
      console.warn('[RecordingController] Error pausing recorder:', error);
    }
  }

  resumeRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    try {
      this.mediaRecorder.resume();
      const now = Date.now();
      if (this.pauseStartTime) {
        this.accumulatedPausedMs += now - this.pauseStartTime;
        this.pauseStartTime = null;
      }
      this.activeSegmentStartedAt = now;
      this.setStatus(RECORDING_STATUS.RECORDING);
    } catch (error) {
      console.warn('[RecordingController] Error resuming recorder:', error);
    }
  }

  snapshotMeta(endTime) {
    if (this.activeSegmentStartedAt) {
      this.segments.push({
        id: `seg-${this.segments.length + 1}`,
        startedAt: this.activeSegmentStartedAt,
        endedAt: endTime,
        durationMs: Math.max(0, endTime - this.activeSegmentStartedAt),
      });
      this.activeSegmentStartedAt = null;
    }
    const sources = this.currentSources;
    return {
      endTime,
      durationMs: this.getElapsedRecordingMs(endTime),
      recordingId: this.currentRecordingId || createRecordingId(endTime),
      sessionId: this.currentSessionId,
      plannerSessionId: this.currentPlannerSessionId,
      blockId: this.currentBlockId,
      blockTitle: this.currentBlockTitle,
      pointId: this.currentPointId,
      pointTitle: this.currentPointTitle,
      sources,
      sourcesLabel: sources.includes('system') ? 'Micrófono + sistema' : 'Micrófono',
      mimeType: this.mimeType || 'audio/webm',
      segments: [...this.segments],
      startedAt: this.startTime,
    };
  }

  buildEntity(meta, extra = {}, chunks = this.audioChunks) {
    const blob = new Blob(chunks, {type: meta.mimeType});
    const blobUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
    return {
      id: meta.recordingId,
      sessionId: meta.sessionId,
      plannerSessionId: meta.plannerSessionId || null,
      blockId: meta.blockId,
      blockTitle: meta.blockTitle,
      pointId: meta.pointId,
      pointTitle: meta.pointTitle,
      name: meta.pointTitle || meta.blockTitle || 'Grabación',
      createdAt: meta.endTime,
      startedAt: meta.startedAt,
      endedAt: meta.endTime,
      durationMs: meta.durationMs,
      sources: meta.sources,
      sourcesLabel: meta.sourcesLabel,
      segmentsCount: meta.segments.length || 1,
      segments: meta.segments,
      mimeType: meta.mimeType,
      fileSize: blob.size,
      storageKey: `sessions/${meta.sessionId}/blocks/${meta.blockId}/recordings/${meta.recordingId}`,
      status: 'pending',
      binaryStorage: null,
      blobUrl,
      blob,
      ...extra,
    };
  }

  /**
   * Single exit point for a stopped recorder. Resolves a pending
   * finalizeRecording() or, when the stop was not requested (track ended,
   * recorder error), hands the captured audio to onAutoFinalized.
   */
  handleRecorderStop(recorder) {
    if (recorder && this.mediaRecorder !== recorder) return;
    const request = this.finalizeRequest;
    this.finalizeRequest = null;
    if (request) {
      clearTimeout(request.timeout);
      let entity = null;
      try {
        entity = this.buildEntity(request.meta);
      } catch (error) {
        this.onError(error);
      }
      this.cleanup({clearContext: true});
      this.setStatus(entity ? RECORDING_STATUS.FINALIZED : RECORDING_STATUS.ERROR);
      request.resolve(entity);
      return;
    }
    if (!(this.isActive() || this.status === RECORDING_STATUS.STARTING)) return;
    let entity = null;
    try {
      const meta = this.snapshotMeta(Date.now());
      entity = this.buildEntity(meta, {
        interrupted: true,
        interruptionReason: this.lastRecorderError?.message || 'La captura de audio se detuvo inesperadamente.',
      });
    } catch (error) {
      this.onError(error);
    }
    this.cleanup({clearContext: true});
    this.setStatus(entity ? RECORDING_STATUS.FINALIZED : RECORDING_STATUS.ERROR);
    if (entity) this.onAutoFinalized(entity);
  }

  async finalizeRecording() {
    if (this.status === RECORDING_STATUS.FINALIZING) return null;
    const recorder = this.mediaRecorder;
    if (!recorder) {
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.IDLE);
      return null;
    }

    // Compute duration before changing PAUSED -> FINALIZING so an outstanding
    // paused interval never leaks into recorded duration.
    const meta = this.snapshotMeta(Date.now());
    this.setStatus(RECORDING_STATUS.FINALIZING);

    if (recorder.state === 'inactive') {
      // Recorder already stopped (e.g. stop event not delivered yet): keep the
      // chunks captured so far instead of discarding them.
      const entity = this.audioChunks.length > 0 ? this.buildEntity(meta) : null;
      this.cleanup({clearContext: true});
      this.setStatus(entity ? RECORDING_STATUS.FINALIZED : RECORDING_STATUS.IDLE);
      return entity;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // onstop never arrived: finalize with what we have.
        if (this.finalizeRequest?.resolve === resolve) this.handleRecorderStop(recorder);
      }, STOP_TIMEOUT_MS);
      this.finalizeRequest = {meta, resolve, timeout};
      try {
        if (recorder.state === 'paused') recorder.resume();
        recorder.stop();
      } catch {
        this.handleRecorderStop(recorder);
      }
    });
  }

  async stopRecording() {
    return this.finalizeRecording();
  }

  discardRecording() {
    this.cleanup({clearContext: true});
    this.setStatus(RECORDING_STATUS.IDLE);
  }

  cleanup({clearContext = false} = {}) {
    this.unwatchTracks();
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Best effort track cleanup.
      }
    }
    if (this.finalizeRequest) {
      clearTimeout(this.finalizeRequest.timeout);
      this.finalizeRequest = null;
    }
    this.stream = null;
    this.mediaRecorder = null;
    this.startTime = null;
    this.pauseStartTime = null;
    this.activeSegmentStartedAt = null;
    this.accumulatedPausedMs = 0;
    this.audioChunks = [];
    this.chunkSeq = 0;
    this.segments = [];
    this.mimeType = '';

    if (clearContext) {
      this.currentRecordingId = null;
      this.currentSessionId = null;
      this.currentPlannerSessionId = null;
      this.currentBlockId = null;
      this.currentBlockTitle = null;
      this.currentPointId = null;
      this.currentPointTitle = null;
      this.currentSources = ['microphone'];
    }
  }
}
