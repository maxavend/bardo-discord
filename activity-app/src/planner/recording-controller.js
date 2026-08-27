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

export class RecordingController {
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});
    this.mediaRecorder = null;
    this.stream = null;
    this.audioChunks = [];
    this.startTime = null;
    this.pauseStartTime = null;
    this.accumulatedPausedMs = 0;
    this.status = RECORDING_STATUS.IDLE;
    this.currentRecordingId = null;
    this.currentSessionId = null;
    this.currentBlockId = null;
    this.currentBlockTitle = null;
    this.currentPointId = null;
    this.currentPointTitle = null;
    this.currentSources = ['microphone'];
    this.segments = [];
    this.activeSegmentStartedAt = null;
    this.mimeType = '';
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

  async startRecording(sessionId, blockId, blockTitle = 'Bloque', pointId = null, pointTitle = null, sources = ['microphone']) {
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
    this.currentBlockId = blockId;
    this.currentBlockTitle = blockTitle;
    this.currentPointId = pointId;
    this.currentPointTitle = pointTitle;
    this.currentSources = sources || ['microphone'];
    this.audioChunks = [];
    this.accumulatedPausedMs = 0;
    this.segments = [];

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
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? {mimeType} : {});
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start(1000);
      const now = Date.now();
      this.startTime = now;
      this.activeSegmentStartedAt = now;
      this.setStatus(RECORDING_STATUS.RECORDING);
      return this.currentRecordingId;
    } catch (error) {
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(error);
      throw error;
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

  async finalizeRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      this.cleanup({clearContext: true});
      this.setStatus(RECORDING_STATUS.IDLE);
      return null;
    }
    if (this.status === RECORDING_STATUS.FINALIZING) return null;

    this.setStatus(RECORDING_STATUS.FINALIZING);
    const endTime = Date.now();
    const durationMs = this.getElapsedRecordingMs(endTime);

    if (this.activeSegmentStartedAt) {
      this.segments.push({
        id: `seg-${this.segments.length + 1}`,
        startedAt: this.activeSegmentStartedAt,
        endedAt: endTime,
        durationMs: Math.max(0, endTime - this.activeSegmentStartedAt),
      });
      this.activeSegmentStartedAt = null;
    }

    const recordingId = this.currentRecordingId || createRecordingId(endTime);
    const sessionId = this.currentSessionId;
    const blockId = this.currentBlockId;
    const blockTitle = this.currentBlockTitle;
    const pointId = this.currentPointId;
    const pointTitle = this.currentPointTitle;
    const sources = this.currentSources;
    const sourcesLabel = sources.includes('system') ? 'Micrófono + sistema' : 'Micrófono';
    const mimeType = this.mimeType || 'audio/webm';
    const segments = [...this.segments];
    const startedAt = this.startTime;

    return new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      recorder.onstop = () => {
        try {
          const blob = new Blob(this.audioChunks, {type: mimeType});
          const blobUrl = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '';
          const recordingEntity = {
            id: recordingId,
            sessionId,
            blockId,
            blockTitle,
            pointId,
            pointTitle,
            name: pointTitle || blockTitle || 'Grabación',
            createdAt: endTime,
            startedAt,
            endedAt: endTime,
            durationMs,
            sources,
            sourcesLabel,
            segmentsCount: segments.length || 1,
            segments,
            mimeType,
            fileSize: blob.size,
            storageKey: `sessions/${sessionId}/blocks/${blockId}/recordings/${recordingId}`,
            status: 'pending',
            binaryStorage: null,
            blobUrl,
            blob, // transient: stripped before metadata persistence
          };
          this.cleanup({clearContext: true});
          this.setStatus(RECORDING_STATUS.FINALIZED);
          resolve(recordingEntity);
        } catch (error) {
          this.cleanup({clearContext: true});
          this.setStatus(RECORDING_STATUS.ERROR);
          this.onError(error);
          resolve(null);
        }
      };

      try {
        if (recorder.state === 'paused') recorder.resume();
        recorder.stop();
      } catch {
        this.cleanup({clearContext: true});
        this.setStatus(RECORDING_STATUS.IDLE);
        resolve(null);
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
    this.stream = null;
    this.mediaRecorder = null;
    this.startTime = null;
    this.pauseStartTime = null;
    this.activeSegmentStartedAt = null;
    this.accumulatedPausedMs = 0;
    this.audioChunks = [];
    this.segments = [];
    this.mimeType = '';

    if (clearContext) {
      this.currentRecordingId = null;
      this.currentSessionId = null;
      this.currentBlockId = null;
      this.currentBlockTitle = null;
      this.currentPointId = null;
      this.currentPointTitle = null;
      this.currentSources = ['microphone'];
    }
  }
}
