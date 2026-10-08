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
        sessionId,
        plannerSessionId: this.currentPlannerSessionId,
        blockId,
        blockTitle,
        pointId,
        pointTitle,
        sources: this.currentSources,
        startedAt: now,
        mimeType: mimeType || 'audio/webm',
        timesliceMs: TIMESLICE_MS,
      });
      this.setStatus(RECORDING_STATUS.RECORDING);
      return this.currentRecordingId;
    } catch (error) {
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(error);
      throw error;
    }
  }

  watchTracks(recorder) {
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

  buildEntity(meta, extra = {}) {
    const blob = new Blob(this.audioChunks, {type: meta.mimeType});
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
