/**
 * Recording Controller — Manages browser audio recording for agenda points and blocks.
 * Maintains a single consolidated Recording entity across multiple pause/resume cycles.
 * Uses MediaRecorder with WebM/Opus priority and guaranteed stream track cleanup.
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
    this.currentSessionId = null;
    this.currentBlockId = null;
    this.currentBlockTitle = null;
    this.currentPointId = null;
    this.currentPointTitle = null;
    this.currentSources = ['microphone'];
    this.segments = []; // [{ id, startedAt, endedAt, durationMs }]
    this.activeSegmentStartedAt = null;
    this.mimeType = '';
  }

  getStatus() {
    return this.status;
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
    if (this.status === RECORDING_STATUS.RECORDING) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Tu navegador no soporta grabación de micrófono.');
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(err);
      throw err;
    }

    this.setStatus(RECORDING_STATUS.STARTING);
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

      const options = mimeType ? {mimeType} : {};
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // collect chunk every 1 second
      const now = Date.now();
      this.startTime = now;
      this.activeSegmentStartedAt = now;
      this.setStatus(RECORDING_STATUS.RECORDING);
    } catch (err) {
      this.cleanup();
      this.setStatus(RECORDING_STATUS.ERROR);
      this.onError(err);
      throw err;
    }
  }

  pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
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
      } catch (err) {
        console.warn('[RecordingController] Error pausing recorder:', err);
      }
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
        const now = Date.now();
        if (this.pauseStartTime) {
          this.accumulatedPausedMs += now - this.pauseStartTime;
          this.pauseStartTime = null;
        }
        this.activeSegmentStartedAt = now;
        this.setStatus(RECORDING_STATUS.RECORDING);
      } catch (err) {
        console.warn('[RecordingController] Error resuming recorder:', err);
      }
    }
  }

  async finalizeRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      this.cleanup();
      this.setStatus(RECORDING_STATUS.IDLE);
      return null;
    }

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

    const recId = `rec-${Date.now()}`;
    const blockId = this.currentBlockId;
    const blockTitle = this.currentBlockTitle;
    const pointId = this.currentPointId;
    const pointTitle = this.currentPointTitle;
    const sources = this.currentSources;
    const sourcesLabel = sources.includes('system') ? 'Micrófono + sistema' : 'Micrófono';
    const defaultName = pointTitle || blockTitle || 'Grabación';
    const sessionId = this.currentSessionId;
    const mimeType = this.mimeType || 'audio/webm';
    const totalSegments = this.segments.length || 1;

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        try {
          const blob = new Blob(this.audioChunks, {type: mimeType});
          const blobUrl = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '';
          const storageKey = `sessions/${sessionId}/blocks/${blockId}/recordings/${recId}.webm`;

          const recordingEntity = {
            id: recId,
            sessionId,
            blockId,
            blockTitle,
            pointId,
            pointTitle,
            name: defaultName,
            createdAt: Date.now(),
            startedAt: this.startTime,
            endedAt: endTime,
            durationMs,
            sources,
            sourcesLabel,
            segmentsCount: totalSegments,
            segments: [...this.segments],
            mimeType,
            fileSize: blob.size,
            storageKey,
            status: 'saved',
            blobUrl,
          };

          this.cleanup();
          this.setStatus(RECORDING_STATUS.FINALIZED);
          resolve(recordingEntity);
        } catch (err) {
          this.cleanup();
          this.setStatus(RECORDING_STATUS.ERROR);
          this.onError(err);
          resolve(null);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        this.cleanup();
        this.setStatus(RECORDING_STATUS.IDLE);
        resolve(null);
      }
    });
  }

  // Alias for backward compatibility
  async stopRecording() {
    return this.finalizeRecording();
  }

  discardRecording() {
    this.cleanup();
    this.setStatus(RECORDING_STATUS.IDLE);
  }

  cleanup() {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Stream track stop fallback
      }
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.startTime = null;
    this.pauseStartTime = null;
    this.activeSegmentStartedAt = null;
    this.accumulatedPausedMs = 0;
    this.audioChunks = [];
    this.segments = [];
  }
}
