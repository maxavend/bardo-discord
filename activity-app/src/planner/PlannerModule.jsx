import {useState, useEffect, useRef, useCallback} from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import {
  Play,
  Check,
  FileText,
} from '@gravity-ui/icons';
import {PlannerSessionHeader} from './PlannerSessionHeader.jsx';
import {PlannerAgendaView} from './PlannerAgendaView.jsx';
import {PlannerHomeView} from './PlannerHomeView.jsx';
import {PlannerCaptureModal} from './PlannerCaptureModal.jsx';
import {SessionDock} from './SessionDock.jsx';
import {SessionRecapView} from './SessionRecapView.jsx';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {PlannerUpcomingBanner} from './PlannerUpcomingBanner.jsx';
import {RecordingSaveModal} from './RecordingSaveModal.jsx';
import {FinishMeetingDialog} from './SessionInterruptModal.jsx';
import {
  loadPlannerState,
  savePlannerState,
  loadLiveSessionState,
  loadPlannerEvents,
  saveLiveSessionState,
  resetToDemoFixture,
  resetToCleanSession,
  deletePlannerSessionById,
  restorePlannerSessionById,
  deletePlannerSessionPermanentlyById,
  fetchArchivedPlannerSessions,
  shouldLoadDemoFixture,
  generateDiscordAnnouncement,
  generateMinutesMarkdown,
  createEmptyLiveSession,
  stampLiveState,
  serializeLiveSessionState,
  isMeaningfulLiveState,
  reconcileLiveState,
  normalizeServerSession,
  toPlannerEvent,
  isDefaultEmptySession,
} from './planner-store.js';
import {
  createPlannerSyncEngine,
  isPlannerRemoteEnabled,
  describeSyncError,
} from './planner-sync.js';
import {computePlannerTimes, getPlannedSchedule, wasMeetingLeftOpen} from './time-engine.js';
import {
  removeBlock,
  removeTopic,
  removeAgreement,
  restoreRemoved,
  restoreSessionAgreement,
  createAgendaBlock,
  createBreakBlock,
} from './agenda-edits.js';
import {copyTextToClipboard} from './clipboard.js';
import {PlannerUndoToast} from './PlannerUndoToast.jsx';
import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  advanceLiveSession,
  advanceToNextBlock,
  skipActivePoint,
  skipActiveBlock,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  resumeInterruptedSession,
  reopenLiveSession,
  finishLiveSessionWith,
  getPointCounts,
  saveFinalizedRecording,
  renameRecordingInSession,
  deleteRecordingFromSession,
  dismissRecordingPrompt,
  getElapsedSessionMs,
  setPointStatus,
  getActiveBlock,
  getActivePoint,
} from './session-runner.js';
import {
  evaluateSessionAssistant,
  ASSISTANT_EVENT,
  formatMsToClock,
  getLivePrimaryAction,
} from './session-assistant-engine.js';
import {
  RecordingController,
  RECORDING_STATUS,
  describeMicrophoneError,
  isMobileUserAgent,
} from './recording-controller.js';
import {
  recordingStorage,
  persistRecordingBinary,
  hydrateRecordingBinary,
  createChunkSink,
  recoverInProgressRecordings,
} from './recording-storage.js';

const REMOTE_POLL_MS = 4000;

function timeOf(iso) {
  const value = Date.parse(iso || '');
  return Number.isFinite(value) ? value : 0;
}

function createClientSessionId() {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `sess-${Date.now().toString(36)}-${suffix}`;
}

function eventIdOf(event) {
  return event?.eventId || event?.id || null;
}

export function PlannerModule({initialTab = 'home', onSwitchTab, onSaveDocToLibrary}) {
  const [plannerState, setPlannerState] = useState(loadPlannerState);
  const [sessionState, setSessionState] = useState(() => loadLiveSessionState(plannerState));
  const [plannerEvents, setPlannerEvents] = useState(loadPlannerEvents);
  const [selectedEventId, setSelectedEventId] = useState(() => plannerState.eventId || null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [isEditing, setIsEditing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab || 'home');
  }, [initialTab]);
  const [recordingStatus, setRecordingStatus] = useState(RECORDING_STATUS.IDLE);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [dismissedUpcomingBanner, setDismissedUpcomingBanner] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [captureModal, setCaptureModal] = useState({isOpen: false, blockId: null});
  const [saveRecordingModal, setSaveRecordingModal] = useState({isOpen: false, recordingEntity: null});
  const [interruptModal, setInterruptModal] = useState({isOpen: false});
  const [deleteSessionModal, setDeleteSessionModal] = useState({isOpen: false, session: null});

  const recordingControllerRef = useRef(null);
  const warned5MinBlockIdsRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const sessionStateRef = useRef(sessionState);
  const plannerStateRef = useRef(plannerState);
  const hydratingRecordingIdsRef = useRef(new Set());
  const recoveredSessionIdsRef = useRef(new Set());
  const recordingPausedBySessionRef = useRef(false);
  const syncEngineRef = useRef(null);
  const liveReadyRef = useRef(new Set());
  const conflictHandlerRef = useRef(null);
  const savedHandlerRef = useRef(null);
  const autoFinalizedHandlerRef = useRef(null);

  // ── Persistence primitives ────────────────────────────────────────────────

  /** Applies an agenda mutation locally and schedules the debounced server save. */
  const updatePlanner = useCallback((mutator, {sync = true} = {}) => {
    const previous = plannerStateRef.current;
    const draft = typeof mutator === 'function' ? mutator(previous) : mutator;
    if (!draft || draft === previous) return previous;
    const next = computePlannerTimes(draft);
    plannerStateRef.current = next;
    setPlannerState(next);
    savePlannerState(next);
    if (sync) syncEngineRef.current?.schedulePlannerSave(next);
    return next;
  }, []);

  /** Replaces the agenda locally without scheduling a server write. */
  const replacePlannerLocally = useCallback((nextState) => {
    const next = computePlannerTimes(nextState);
    plannerStateRef.current = next;
    setPlannerState(next);
    savePlannerState(next);
    return next;
  }, []);

  const pushLive = useCallback((state) => {
    const engine = syncEngineRef.current;
    const plannerId = state?.plannerSessionId;
    if (!engine || !plannerId) return;
    // Until the server copy has been read we never write: a blank/idle local
    // state must not overwrite a meeting that is running elsewhere.
    if (!isMeaningfulLiveState(state)) return;
    if (!liveReadyRef.current.has(plannerId)) {
      // Keep it durable per agenda; it is sent (after checking the server
      // copy) once the remote state has been read or on the next boot.
      engine.stageLiveState(plannerId, serializeLiveSessionState(state));
      return;
    }
    if (plannerStateRef.current?.id === plannerId) engine.rememberSnapshot(plannerStateRef.current);
    engine.pushLiveState(plannerId, serializeLiveSessionState(state));
  }, []);

  /**
   * Commits a live state: memory + localStorage (+ server when `push`).
   * Every local mutation is stamped with `updatedAt` for reconciliation.
   */
  const commitSessionState = useCallback((next, {push = true, stamp = true} = {}) => {
    if (!next) return;
    const plannerId = plannerStateRef.current?.id || null;
    let state = next.plannerSessionId || !plannerId ? next : {...next, plannerSessionId: plannerId};
    if (stamp) state = stampLiveState(state);
    sessionStateRef.current = state;
    setSessionState(state);
    saveLiveSessionState(state);
    if (push) pushLive(state);
  }, [pushLive]);

  // ── Sync engine (Discord production only) ────────────────────────────────

  useEffect(() => {
    if (!isPlannerRemoteEnabled()) return undefined;
    const engine = createPlannerSyncEngine({
      onPlannerSaved: (saved) => savedHandlerRef.current?.(saved),
      onPlannerConflict: (conflict) => conflictHandlerRef.current?.(conflict),
      onError: (error) => console.error('Bardo Planner: error de sincronización', error),
    });
    syncEngineRef.current = engine;
    engine.resumePending();

    const handleHidden = () => {
      if (document.visibilityState === 'hidden') {
        for (const id of [plannerStateRef.current?.id].filter(Boolean)) {
          if (engine.hasPendingPlanner(id)) engine.flushPlanner(id);
        }
      }
    };
    const handlePageHide = () => engine.flushAllKeepalive();
    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('pagehide', handlePageHide);
      engine.dispose();
      if (syncEngineRef.current === engine) syncEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    let lastErrorToastAt = 0;
    const handleStatus = (event) => {
      const detail = event?.detail;
      if (!detail || detail.scope !== 'planner') return;
      if (detail.id && detail.id !== plannerStateRef.current?.id) return;
      setSyncStatus({state: detail.state, message: detail.message || null});
      if ((detail.state === 'error' || detail.state === 'offline') && Date.now() - lastErrorToastAt > 15000) {
        lastErrorToastAt = Date.now();
        toast(detail.message ? `No se pudo guardar la reunión: ${detail.message}` : 'No se pudo guardar la reunión. Reintentaremos automáticamente.');
      }
    };
    window.addEventListener('bardo-sync-status', handleStatus);
    return () => window.removeEventListener('bardo-sync-status', handleStatus);
  }, []);

  /**
   * Replaces the Home list entry with the FULL agenda (blocks, mentions,
   * duration…), so reopening it never shows — or later re-saves — stale blocks.
   */
  const upsertPlannerEvent = useCallback((session) => {
    if (!session?.id) return;
    setPlannerEvents((previous) => {
      const existing = previous.find((event) => eventIdOf(event) === session.id);
      const entry = {
        ...toPlannerEvent(session),
        eventStatus: session.status
          ? (session.status === 'live' ? 'in_progress' : session.status)
          : (existing?.eventStatus || 'scheduled'),
      };
      if (existing) return previous.map((event) => (eventIdOf(event) === session.id ? {...event, ...entry} : event));
      return [entry, ...previous];
    });
  }, []);

  savedHandlerRef.current = (saved) => {
    if (!saved?.id) return;
    const current = plannerStateRef.current;
    if (current?.id === saved.id && saved.updatedAt && saved.updatedAt !== current.updatedAt) {
      replacePlannerLocally({...current, updatedAt: saved.updatedAt});
    }
    upsertPlannerEvent(saved);
  };

  conflictHandlerRef.current = ({id, local, server}) => {
    const engine = syncEngineRef.current;
    if (server && plannerStateRef.current?.id === id) {
      replacePlannerLocally(normalizeServerSession(server));
      engine?.setBaseVersion(id, server.updatedAt);
    }
    if (!local || !engine) {
      toast('Otra persona modificó esta reunión. Se cargó la versión más reciente.');
      return;
    }
    const copyId = createClientSessionId();
    engine.createConflictCopy(local, copyId)
      .then((copy) => {
        if (copy) savedHandlerRef.current?.(copy);
        toast(`Otra persona modificó esta reunión. Se cargó la versión más reciente y tus cambios quedaron en “${local.title || 'Reunión'} (copia en conflicto)”.`);
      })
      .catch((error) => {
        try {
          localStorage.setItem(`bardo.planner.conflict.${id}.${Date.now()}`, JSON.stringify(local));
        } catch {
          // ignore
        }
        toast(`Otra persona modificó esta reunión. No se pudo crear la copia de tus cambios (${describeSyncError(error)}); quedaron respaldados en este dispositivo.`);
      });
  };

  const syncRemoteLive = useCallback(async (plannerId) => {
    const engine = syncEngineRef.current;
    if (!engine || !plannerId) return;
    let remote = null;
    try {
      remote = await engine.fetchRemoteLive(plannerId);
    } catch (error) {
      // 404: the agenda only exists locally (draft) → nothing to protect.
      if (error?.status === 404) liveReadyRef.current.add(plannerId);
      return;
    }
    if (plannerStateRef.current?.id !== plannerId || transitionLockRef.current) return;
    const firstLoad = !liveReadyRef.current.has(plannerId);
    liveReadyRef.current.add(plannerId);
    const {state, source} = reconcileLiveState(plannerStateRef.current, sessionStateRef.current, remote, {
      // Captures in progress are tagged with the local run id: keep it.
      keepLocalSessionId: Boolean(recordingControllerRef.current?.isActive()),
    });
    if (source === 'remote') {
      commitSessionState(state, {push: false, stamp: false});
      return;
    }
    if (firstLoad && isMeaningfulLiveState(state) && timeOf(state.updatedAt) > timeOf(remote?.updatedAt)) {
      // Local progress made while offline / before the first read: send it now.
      pushLive(state);
    }
  }, [commitSessionState, pushLive]);

  const syncRemotePlanner = useCallback(async (plannerId) => {
    const engine = syncEngineRef.current;
    if (!engine || !plannerId || engine.hasPendingPlanner(plannerId)) return;
    let remote = null;
    try {
      remote = await engine.fetchRemoteSession(plannerId);
    } catch {
      return;
    }
    const current = plannerStateRef.current;
    if (!remote || current?.id !== plannerId || engine.hasPendingPlanner(plannerId)) return;
    if (timeOf(remote.updatedAt) > timeOf(current.updatedAt)) {
      replacePlannerLocally({...normalizeServerSession(remote), eventId: current.eventId || remote.id});
      engine.setBaseVersion(plannerId, remote.updatedAt);
    }
  }, [replacePlannerLocally]);

  // Read the server copy as soon as an agenda is opened, then poll.
  useEffect(() => {
    const plannerId = plannerState?.id;
    if (!syncEngineRef.current || !plannerId) return undefined;
    void syncRemoteLive(plannerId);
    void syncRemotePlanner(plannerId);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (transitionLockRef.current) return;
      void syncRemoteLive(plannerId);
      void syncRemotePlanner(plannerId);
    }, REMOTE_POLL_MS);
    return () => clearInterval(interval);
  }, [plannerState?.id, syncRemoteLive, syncRemotePlanner]);

  // ── Recording ─────────────────────────────────────────────────────────────

  const persistCapturedRecording = useCallback(async (entity) => {
    if (!entity) return null;
    const persisted = await persistRecordingBinary(entity);
    if (persisted.status === 'error') {
      toast('No se pudo persistir el audio. Sigue disponible en esta pestaña, pero no recargues hasta resolverlo.');
    } else {
      // Full audio saved: incremental chunks are no longer needed.
      recordingStorage.clearInProgress?.(persisted.id)?.catch?.(() => {});
    }
    return persisted;
  }, []);

  autoFinalizedHandlerRef.current = async (entity) => {
    const persisted = await persistCapturedRecording(entity);
    if (!persisted) return;
    recordingPausedBySessionRef.current = false;
    commitSessionState(saveFinalizedRecording(sessionStateRef.current, persisted));
    toast(`La grabación se detuvo porque el micrófono dejó de responder. Se guardó lo grabado: ${formatMsToClock(persisted.durationMs || 0)}.`);
  };

  useEffect(() => {
    const controller = new RecordingController({
      onStatusChange: setRecordingStatus,
      onError: (error) => toast(describeMicrophoneError(error, {isMobile: isMobileUserAgent()})),
      onAutoFinalized: (entity) => {
        void autoFinalizedHandlerRef.current?.(entity);
      },
      chunkSink: createChunkSink(recordingStorage, (error) => console.warn('Bardo Planner: no se pudo guardar un fragmento de audio', error)),
    });
    recordingControllerRef.current = controller;
    return () => controller.cleanup({clearContext: true});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNowTimestamp(current);
      if (recordingControllerRef.current?.isActive()) {
        setRecordingElapsedMs(recordingControllerRef.current.getElapsedRecordingMs(current));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Restore binary audio from IndexedDB for recordings whose metadata arrived
  // from localStorage or from the server.
  const pendingHydrationKey = (sessionState.recordings || [])
    .filter((recording) => recording.binaryStorage === 'indexeddb' && !recording.blobUrl && recording.status === 'pending')
    .map((recording) => recording.id)
    .join('|');

  useEffect(() => {
    if (!pendingHydrationKey) return undefined;
    const candidates = (sessionStateRef.current.recordings || []).filter(
      (recording) => recording.binaryStorage === 'indexeddb' &&
        !recording.blobUrl &&
        recording.status === 'pending' &&
        !hydratingRecordingIdsRef.current.has(recording.id)
    );
    if (candidates.length === 0) return undefined;
    candidates.forEach((recording) => hydratingRecordingIdsRef.current.add(recording.id));
    let cancelled = false;
    void Promise.all(candidates.map((recording) => hydrateRecordingBinary(recording))).then((hydrated) => {
      candidates.forEach((recording) => hydratingRecordingIdsRef.current.delete(recording.id));
      if (cancelled) return;
      const byId = new Map(hydrated.map((recording) => [recording.id, recording]));
      const previous = sessionStateRef.current;
      commitSessionState({
        ...previous,
        recordings: (previous.recordings || []).map((recording) => byId.get(recording.id) || recording),
      }, {push: false, stamp: false});
    });
    return () => {
      cancelled = true;
    };
  }, [pendingHydrationKey, commitSessionState]);

  // Recover recordings that were still capturing when the Activity closed.
  // Matches by run id AND by agenda id: the run id can change when the live
  // state is reconciled with the server, but the captures stay recoverable.
  const recoveryPlannerId = sessionState.plannerSessionId || null;
  useEffect(() => {
    const sessionId = sessionState.sessionId;
    const plannerSessionId = recoveryPlannerId;
    const key = `${plannerSessionId || ''}|${sessionId || ''}`;
    if ((!sessionId && !plannerSessionId) || recoveredSessionIdsRef.current.has(key)) return undefined;
    if (recordingControllerRef.current?.isActive()) return undefined;
    recoveredSessionIdsRef.current.add(key);
    let cancelled = false;
    recoverInProgressRecordings(sessionId, recordingStorage, {
      plannerSessionId,
      existingRecordingIds: (sessionStateRef.current.recordings || [])
        .filter((recording) => recording.status === 'saved' || recording.binaryStorage === 'indexeddb')
        .map((recording) => recording.id),
    })
      .then((recovered) => {
        if (cancelled || recovered.length === 0) return;
        const current = sessionStateRef.current;
        if (current.sessionId !== sessionId && current.plannerSessionId !== plannerSessionId) return;
        let next = current;
        for (const recording of recovered) next = saveFinalizedRecording(next, recording);
        commitSessionState(next);
        toast(recovered.length === 1
          ? `Se recuperó una grabación interrumpida: ${recovered[0].name}`
          : `Se recuperaron ${recovered.length} grabaciones interrumpidas`);
      })
      .catch((error) => console.warn('Bardo Planner: no se pudieron recuperar grabaciones', error));
    return () => {
      cancelled = true;
    };
  }, [sessionState.sessionId, recoveryPlannerId, commitSessionState]);

  // MediaRecorder cannot survive reload. Chunks are already persisted every
  // second; this pagehide flush is a best-effort attempt to finalize cleanly.
  useEffect(() => {
    const handlePageHide = () => {
      const controller = recordingControllerRef.current;
      if (!controller?.isActive()) return;
      void controller.finalizeRecording().then(async (entity) => {
        if (!entity) return;
        const persisted = await persistRecordingBinary(entity);
        if (persisted.status === 'saved') recordingStorage.clearInProgress?.(persisted.id)?.catch?.(() => {});
        const next = stampLiveState(saveFinalizedRecording(sessionStateRef.current, persisted));
        sessionStateRef.current = next;
        saveLiveSessionState(next);
      });
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  const assistantEvaluation = evaluateSessionAssistant(plannerState, sessionState, nowTimestamp);

  useEffect(() => {
    if (
      assistantEvaluation.event === ASSISTANT_EVENT.BLOCK_5_MIN_REMAINING &&
      assistantEvaluation.activeBlock &&
      !warned5MinBlockIdsRef.current.has(assistantEvaluation.activeBlock.id)
    ) {
      warned5MinBlockIdsRef.current.add(assistantEvaluation.activeBlock.id);
      toast(`⏱ Quedan 5 minutos en “${assistantEvaluation.activeBlock.title}”`);
    }
  }, [assistantEvaluation]);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    onSwitchTab?.(key);
  }, [onSwitchTab]);

  const runAtomicTransition = useCallback(async (operation) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setIsTransitioning(true);
    try {
      return await operation();
    } finally {
      transitionLockRef.current = false;
      setIsTransitioning(false);
    }
  }, []);

  const finalizeActiveRecording = useCallback(async () => {
    const controller = recordingControllerRef.current;
    if (!controller?.isActive()) return null;
    recordingPausedBySessionRef.current = false;
    const entity = await controller.finalizeRecording();
    if (!entity) return null;
    return persistCapturedRecording(entity);
  }, [persistCapturedRecording]);

  /** Saves any in-flight recording into the current live session before switching agendas. */
  const finalizeIntoCurrentSession = useCallback(async () => {
    const recording = await finalizeActiveRecording();
    if (recording) {
      commitSessionState(saveFinalizedRecording(sessionStateRef.current, recording));
      toast(`${recording.name} · ${formatMsToClock(recording.durationMs)} guardados`);
    }
  }, [commitSessionState, finalizeActiveRecording]);

  const handleStartSession = useCallback(() => {
    const planner = plannerStateRef.current;
    // A meeting needs at least one bloque to run (decision 8).
    if (!(planner?.blocks || []).length) {
      toast('Agrega al menos un bloque antes de iniciar la reunión.');
      return;
    }
    const next = createLiveSession(planner);
    commitSessionState(next);
    handleTabChange('agenda');
    toast('Reunión iniciada');
  }, [commitSessionState, handleTabChange]);

  const handlePauseSession = useCallback(() => {
    const next = pauseLiveSession(sessionStateRef.current);
    commitSessionState(next);
    if (recordingControllerRef.current?.isRecording()) {
      recordingControllerRef.current.pauseRecording();
      recordingPausedBySessionRef.current = true;
      toast('Reunión en pausa · grabación en pausa');
    } else {
      toast('Reunión en pausa');
    }
  }, [commitSessionState]);

  const handleResumeSession = useCallback(() => {
    const current = sessionStateRef.current;
    const next = current.status === SESSION_STATUS.INTERRUPTED
      ? resumeInterruptedSession(current)
      : resumeLiveSession(current);
    commitSessionState(next);
    // Resume the recording only if it was paused together with the session.
    if (recordingPausedBySessionRef.current && recordingControllerRef.current?.isPaused()) {
      recordingControllerRef.current.resumeRecording();
      toast('Reunión reanudada · grabación reanudada');
    } else {
      toast('Reunión reanudada');
    }
    recordingPausedBySessionRef.current = false;
    handleTabChange('agenda');
  }, [commitSessionState, handleTabChange]);

  /**
   * Runs a live transition. If audio is being recorded it keeps recording
   * into the new tema/bloque (decision 2): the previous part is saved as its
   * own file and a new one starts on the same microphone without a gap.
   */
  const runLiveTransition = useCallback((transition) => runAtomicTransition(async () => {
    const controller = recordingControllerRef.current;
    const outgoing = sessionStateRef.current;
    const planner = plannerStateRef.current;
    let next = transition(planner, outgoing);
    const nextBlock = getActiveBlock(planner, next);
    const nextPoint = getActivePoint(planner, next);
    const stillLive = next.status === SESSION_STATUS.RUNNING || next.status === SESSION_STATUS.PAUSED;
    const continueMode = controller?.isRecording()
      ? 'recording'
      : controller?.isPaused() && recordingPausedBySessionRef.current
        ? 'paused-by-session'
        : null;

    // Commit the transition right away: anything the group does while the
    // previous audio part is being saved (+5 min, ticking a tema…) is kept,
    // and the finished recording is merged into the CURRENT state afterwards.
    commitSessionState(next);

    let recording = null;
    let continued = false;
    if (continueMode && stillLive && nextBlock) {
      const previousPart = controller.rolloverRecording({
        sessionId: next.sessionId || outgoing.sessionId,
        plannerSessionId: next.plannerSessionId || planner.id || null,
        blockId: nextBlock.id,
        blockTitle: nextBlock.title,
        pointId: nextPoint?.id || null,
        pointTitle: nextPoint?.title || null,
        startPaused: continueMode === 'paused-by-session',
      });
      continued = controller.isActive();
      setRecordingElapsedMs(0);
      const previous = await previousPart;
      recording = previous ? await persistCapturedRecording(previous) : null;
    } else {
      recording = await finalizeActiveRecording();
    }
    if (recording) {
      next = saveFinalizedRecording(sessionStateRef.current, recording);
      commitSessionState(next);
    }

    if (next.status === SESSION_STATUS.COMPLETED) {
      setActiveTab('recap');
      toast(recording ? `Reunión terminada. Se guardó la grabación “${recording.name}”.` : 'Reunión terminada. Este es el resumen.');
      return next;
    }
    const target = nextPoint?.title || nextBlock?.title || 'la reunión';
    if (continued) {
      toast(`Se guardó “${recording?.name || 'la grabación'}” · sigue grabando en “${target}”`);
    } else if (recording) {
      toast(`Se guardó la grabación “${recording.name}” (${formatMsToClock(recording.durationMs)})`);
    }
    return next;
  }), [commitSessionState, finalizeActiveRecording, persistCapturedRecording, runAtomicTransition]);

  const handleAdvance = useCallback(async () => {
    const before = sessionStateRef.current;
    const next = await runLiveTransition((planner, state) => advanceLiveSession(planner, state));
    if (!next || next.status === SESSION_STATUS.COMPLETED) return;
    if (next.liveActiveBlockId === before.liveActiveBlockId) {
      toast(`Siguiente tema: ${getActivePoint(plannerStateRef.current, next)?.title || 'Tema'}`);
    } else {
      toast(`Siguiente bloque: ${getActiveBlock(plannerStateRef.current, next)?.title || 'Bloque'}`);
    }
  }, [runLiveTransition]);

  const handleAdvanceBlock = useCallback(async () => {
    const next = await runLiveTransition((planner, state) => advanceToNextBlock(planner, state));
    if (!next || next.status === SESSION_STATUS.COMPLETED) return;
    toast(`Siguiente bloque: ${getActiveBlock(plannerStateRef.current, next)?.title || 'Bloque'}`);
  }, [runLiveTransition]);

  // Skipping the last tema/bloque would end the meeting: that always goes
  // through the "Terminar reunión" confirmation instead (decision 1).
  const handleSkipPoint = useCallback(async () => {
    const preview = skipActivePoint(plannerStateRef.current, sessionStateRef.current);
    if (preview?.status === SESSION_STATUS.COMPLETED) {
      setInterruptModal({isOpen: true, mode: 'skip-point'});
      return;
    }
    const next = await runLiveTransition((planner, state) => skipActivePoint(planner, state));
    if (next && next.status !== SESSION_STATUS.COMPLETED) toast('Tema saltado');
  }, [runLiveTransition]);

  const handleSkipBlock = useCallback(async () => {
    const preview = skipActiveBlock(plannerStateRef.current, sessionStateRef.current);
    if (preview?.status === SESSION_STATUS.COMPLETED) {
      setInterruptModal({isOpen: true, mode: 'skip-block'});
      return;
    }
    const next = await runLiveTransition((planner, state) => skipActiveBlock(planner, state));
    if (next && next.status !== SESSION_STATUS.COMPLETED) toast('Bloque saltado');
  }, [runLiveTransition]);

  const handleExtendBlock = useCallback((blockId, minutes = 5) => {
    const next = extendActiveBlock(sessionStateRef.current, blockId, minutes);
    commitSessionState(next);
    toast(`+${minutes} min para este bloque`);
  }, [commitSessionState]);

  const handleSetUnlimited = useCallback((blockId) => {
    const next = setUnlimitedActiveBlock(sessionStateRef.current, blockId);
    commitSessionState(next);
    toast('Este bloque ahora no tiene límite de tiempo');
  }, [commitSessionState]);

  // Ending always goes through a confirmation (decision 1).
  // mode 'advance': the primary button on the last tema/bloque (marks it as
  // tratado and ends); mode 'finish': "Terminar reunión" from the menu.
  const handleRequestFinish = useCallback((mode = 'finish') => {
    setInterruptModal({isOpen: true, mode});
  }, []);

  const handleFinishSession = useCallback(() => handleRequestFinish('finish'), [handleRequestFinish]);
  const handleOpenInterrupt = handleFinishSession;

  const handleConfirmFinish = useCallback(async () => {
    const mode = interruptModal.mode || 'finish';
    setInterruptModal({isOpen: false});
    await runLiveTransition((planner, state) => finishLiveSessionWith(mode, planner, state));
  }, [interruptModal.mode, runLiveTransition]);

  /** Adaptive primary live button: Siguiente tema / Siguiente bloque / Terminar reunión. */
  const handleLivePrimary = useCallback(() => {
    const action = getLivePrimaryAction(plannerStateRef.current, sessionStateRef.current);
    if (action.key === 'finish') {
      handleRequestFinish('advance');
      return;
    }
    void handleAdvance();
  }, [handleAdvance, handleRequestFinish]);

  const handleReopenSession = useCallback(() => {
    const reopened = reopenLiveSession(plannerStateRef.current, sessionStateRef.current);
    if (reopened === sessionStateRef.current) return;
    commitSessionState(reopened);
    handleTabChange('agenda');
    toast('Reunión reabierta. El tiempo que estuvo cerrada no se cuenta.');
  }, [commitSessionState, handleTabChange]);

  // Recording context is always resolved from the runner. The user never has to
  // pick a Point that Bardo already knows is active.
  const handleStartRecording = useCallback(async () => {
    if (!recordingControllerRef.current) return;
    const currentSession = sessionStateRef.current;
    const currentPlanner = plannerStateRef.current;
    const block = getActiveBlock(currentPlanner, currentSession);
    const point = getActivePoint(currentPlanner, currentSession);
    if (!block) return;

    try {
      recordingPausedBySessionRef.current = false;
      await recordingControllerRef.current.startRecording(
        currentSession.sessionId || `session-${Date.now()}`,
        block.id,
        block.title,
        point?.id || null,
        point?.title || null,
        ['microphone'],
        {plannerSessionId: currentSession.plannerSessionId || currentPlanner.id || null}
      );
      setRecordingElapsedMs(0);
      toast(`Grabación iniciada: ${point?.title || block.title}`);
    } catch {
      // Permission/runtime error is handled by RecordingController callback.
    }
  }, []);

  const handleFinalizeRecording = useCallback(async () => {
    if (!recordingControllerRef.current) return;
    recordingPausedBySessionRef.current = false;
    const entity = await recordingControllerRef.current.finalizeRecording();
    if (entity) setSaveRecordingModal({isOpen: true, recordingEntity: entity});
  }, []);

  const handleSaveRecordingConfirmed = useCallback(async (finalizedEntity) => {
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    const persisted = await persistCapturedRecording(finalizedEntity);
    if (!persisted) return;
    const next = saveFinalizedRecording(sessionStateRef.current, persisted);
    commitSessionState(next);
    toast(persisted.status === 'saved' ? 'Grabación guardada en la reunión' : 'La grabación terminó, pero no se pudo guardar en este dispositivo');
  }, [commitSessionState, persistCapturedRecording]);

  const handleDiscardRecording = useCallback(() => {
    const entity = saveRecordingModal.recordingEntity;
    if (entity?.blobUrl && typeof URL !== 'undefined') URL.revokeObjectURL(entity.blobUrl);
    if (entity?.id) recordingStorage.clearInProgress?.(entity.id)?.catch?.(() => {});
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    recordingControllerRef.current?.discardRecording();
    toast('Grabación descartada');
  }, [saveRecordingModal.recordingEntity]);

  const handlePauseRecording = useCallback(() => {
    recordingPausedBySessionRef.current = false;
    recordingControllerRef.current?.pauseRecording();
  }, []);
  const handleResumeRecording = useCallback(() => {
    recordingPausedBySessionRef.current = false;
    recordingControllerRef.current?.resumeRecording();
  }, []);

  const handleDismissRecordingPrompt = useCallback(() => {
    const next = dismissRecordingPrompt(sessionStateRef.current);
    commitSessionState(next);
  }, [commitSessionState]);

  const handleRenameRecording = useCallback((recordingId, newName) => {
    const next = renameRecordingInSession(sessionStateRef.current, recordingId, newName);
    commitSessionState(next);
    toast('Grabación renombrada');
  }, [commitSessionState]);

  const handleDeleteRecording = useCallback(async (recordingId) => {
    const recording = (sessionStateRef.current.recordings || []).find((item) => item.id === recordingId);
    try {
      await recordingStorage.delete(recordingId);
    } catch {
      toast('No se pudo borrar el audio de este dispositivo, pero se quitó de la reunión.');
    }
    if (recording?.blobUrl && typeof URL !== 'undefined') URL.revokeObjectURL(recording.blobUrl);
    const next = deleteRecordingFromSession(sessionStateRef.current, recordingId);
    commitSessionState(next);
    toast('Grabación eliminada');
  }, [commitSessionState]);

  // Decision 4: a tema is marked as tratado only with the explicit checkbox
  // during a live meeting; it never edits the agenda and does nothing outside
  // a live meeting.
  const handleToggleSubpointStatus = useCallback((blockId, pointId, checked) => {
    const status = sessionStateRef.current.status;
    if (status !== SESSION_STATUS.RUNNING && status !== SESSION_STATUS.PAUSED) return;
    const nextSession = setPointStatus(
      sessionStateRef.current,
      pointId,
      checked ? POINT_STATUS.DONE : POINT_STATUS.PENDING
    );
    commitSessionState(nextSession);
  }, [commitSessionState]);

  const handleOpenDecisionCapture = useCallback((targetBlockId = null) => {
    const selectedBlockId = targetBlockId || sessionStateRef.current.liveActiveBlockId || plannerStateRef.current.blocks[0]?.id;
    setCaptureModal({
      isOpen: true,
      blockId: selectedBlockId,
    });
  }, []);

  const handleCaptureSubmit = useCallback(({blockId, content, owner = null}) => {
    const liveSession = sessionStateRef.current;
    const resolvedBlockId = blockId || liveSession.liveActiveBlockId || plannerStateRef.current.blocks[0]?.id;
    const isTargetLiveBlock = liveSession.liveActiveBlockId === resolvedBlockId;
    const pointId = isTargetLiveBlock ? liveSession.liveActivePointId : null;
    const timestamp = Date.now();
    const cleanOwner = typeof owner === 'string' && owner.trim() ? owner.trim().replace(/^@/, '') : null;
    const decision = {
      id: `d-${timestamp}`,
      sessionId: liveSession.sessionId || null,
      blockId: resolvedBlockId,
      pointId,
      content,
      owner: cleanOwner,
      timestamp,
    };

    updatePlanner((previous) => ({
      ...previous,
      blocks: previous.blocks.map((block) =>
        block.id === resolvedBlockId
          ? {...block, decisions: [...(block.decisions || []), decision]}
          : block
      ),
    }));

    commitSessionState({
      ...liveSession,
      decisions: [...(liveSession.decisions || []), decision],
    });
    const targetBlock = plannerStateRef.current.blocks.find((b) => b.id === resolvedBlockId);
    toast(`Acuerdo agregado al bloque "${targetBlock?.title || 'seleccionado'}"`);
  }, [commitSessionState, updatePlanner]);

  // ── Undo for deletions of bloque / tema / acuerdo (no confirm dialog) ──────
  const [undoToast, setUndoToast] = useState(null);
  const undoActionsRef = useRef(new Map());

  /** Shows "<message> · Deshacer" for a few seconds; only the latest can be undone. */
  const offerUndo = useCallback((message, undo) => {
    const id = `undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const plannerId = plannerStateRef.current?.id || null;
    undoActionsRef.current = new Map([[id, {undo, plannerId}]]);
    setUndoToast({id, message});
  }, []);

  const handleUndo = useCallback((id) => {
    const entry = undoActionsRef.current.get(id);
    undoActionsRef.current.delete(id);
    setUndoToast((current) => (current?.id === id ? null : current));
    if (!entry) return;
    // Never restore into a different meeting than the one it was deleted from.
    if (entry.plannerId !== (plannerStateRef.current?.id || null)) return;
    entry.undo();
  }, []);

  const handleDismissUndo = useCallback((id) => {
    undoActionsRef.current.delete(id);
    setUndoToast((current) => (current?.id === id ? null : current));
  }, []);

  const clearUndo = useCallback(() => {
    undoActionsRef.current = new Map();
    setUndoToast(null);
  }, []);

  const handleDeleteDecision = useCallback((blockId, decisionId) => {
    let removed = null;
    updatePlanner((previous) => {
      const result = removeAgreement(previous, blockId, decisionId);
      removed = result.removed;
      return result.state;
    });
    const liveDecision = (sessionStateRef.current.decisions || []).find((decision) => decision.id === decisionId) || null;
    if (liveDecision) {
      commitSessionState({
        ...sessionStateRef.current,
        decisions: (sessionStateRef.current.decisions || []).filter((decision) => decision.id !== decisionId),
      });
    }
    if (!removed && !liveDecision) return;
    offerUndo('Acuerdo eliminado', () => {
      if (removed) updatePlanner((previous) => restoreRemoved(previous, removed));
      if (liveDecision) commitSessionState(restoreSessionAgreement(sessionStateRef.current, liveDecision));
    });
  }, [commitSessionState, offerUndo, updatePlanner]);

  const handleCopyAnnouncement = useCallback(async () => {
    const copied = await copyTextToClipboard(generateDiscordAnnouncement(plannerStateRef.current));
    toast(copied
      ? 'Anuncio copiado. Pégalo en el canal de Discord.'
      : 'No se pudo copiar el anuncio en este dispositivo. Intenta de nuevo.');
  }, []);

  const _handleCopyMinutes = useCallback(async () => {
    const copied = await copyTextToClipboard(generateMinutesMarkdown(plannerStateRef.current, sessionStateRef.current));
    toast(copied ? 'Acta copiada' : 'No se pudo copiar el acta en este dispositivo. Intenta de nuevo.');
  }, []);

  const handleLoadDemo = useCallback(() => {
    const demo = resetToDemoFixture();
    setSelectedEventId('event-weekly-design');
    plannerStateRef.current = demo;
    setPlannerState(demo);
    const live = loadLiveSessionState(demo);
    commitSessionState(live, {push: false, stamp: false});
    toast('Datos de demostración cargados');
  }, [commitSessionState]);

  const handleSelectEvent = useCallback((event) => runAtomicTransition(async () => {
    const targetId = eventIdOf(event);
    if (!targetId) return;
    // Any in-flight recording belongs to the agenda being left: save it there.
    await finalizeIntoCurrentSession();
    const previousLive = sessionStateRef.current;
    const leaving = plannerStateRef.current;
    // The list entry of the agenda being left gets its latest local content.
    if (leaving?.id && leaving.id !== targetId) upsertPlannerEvent(leaving);
    const source = leaving?.id === (event.id || targetId) ? leaving : event;
    const next = replacePlannerLocally({...normalizeServerSession(source), id: event.id || targetId, eventId: targetId});
    setSelectedEventId(targetId);
    // Live state: this agenda's own copy if it is in memory, else its unsent
    // copy (pending per agenda), else empty; syncRemoteLive then reconciles
    // with the server. Nothing is written to the server here.
    let live = createEmptyLiveSession(next);
    if (previousLive?.plannerSessionId === next.id) {
      live = previousLive;
    } else {
      const pendingLive = syncEngineRef.current?.getPendingLive(next.id);
      if (pendingLive) live = reconcileLiveState(next, live, pendingLive).state;
    }
    commitSessionState(live, {push: false, stamp: false});
    clearUndo();
    setIsEditing(false);
    handleTabChange('agenda');
    toast(`Reunión abierta: ${event.title || 'Reunión sin título'}`);
  }), [clearUndo, commitSessionState, finalizeIntoCurrentSession, handleTabChange, replacePlannerLocally, runAtomicTransition, upsertPlannerEvent]);

  const [archivedPlannerEvents, setArchivedPlannerEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchArchivedPlannerSessions().then((archived) => {
      if (!cancelled && Array.isArray(archived)) {
        setArchivedPlannerEvents(archived);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCleanSession = useCallback(() => runAtomicTransition(async () => {
    await finalizeIntoCurrentSession();
    const leaving = plannerStateRef.current;
    // Keep the list entry of the meeting being left up to date (never list an
    // untouched placeholder that was never saved).
    if (leaving?.id && !isDefaultEmptySession(leaving)) upsertPlannerEvent(leaving);
    const clean = resetToCleanSession();
    plannerStateRef.current = clean;
    setPlannerState(clean);
    commitSessionState(createEmptyLiveSession(clean), {push: false, stamp: false});
    // Saved right away (not only on the first edit): the new meeting is in the
    // list for everyone even if its defaults are kept as they are.
    syncEngineRef.current?.schedulePlannerSave(clean, {immediate: true});
    upsertPlannerEvent(clean);
    setSelectedEventId(clean.id);
    clearUndo();
    handleTabChange('agenda');
    setIsEditing(true);
    toast('Reunión creada. Los cambios se guardan solos mientras editas.');
  }), [clearUndo, commitSessionState, finalizeIntoCurrentSession, handleTabChange, runAtomicTransition, upsertPlannerEvent]);

  // Open meetings are only archived (restorable); "Eliminar definitivamente"
  // exists only for archived ones, so no two menu items do the same thing.
  const handleDeleteSessionPrompt = useCallback((sessionToDelete = null, action = 'archive') => {
    const target = sessionToDelete || plannerStateRef.current;
    if (!target) return;
    setDeleteSessionModal({
      isOpen: true,
      session: target,
      action: action === 'permanent-delete' ? 'permanent-delete' : 'archive',
    });
  }, []);

  const handleRestoreSession = useCallback(async (sessionToRestore) => {
    if (!sessionToRestore) return;
    const targetId = sessionToRestore.id || sessionToRestore.eventId || sessionToRestore.sessionId;
    if (!targetId) return;

    const restoredEvent = {
      ...sessionToRestore,
      eventStatus: sessionToRestore.eventStatus === 'archived' ? 'scheduled' : (sessionToRestore.eventStatus || 'scheduled'),
      archived: false,
    };
    setArchivedPlannerEvents((prev) => prev.filter((ev) => eventIdOf(ev) !== targetId));
    setPlannerEvents((prev) => [restoredEvent, ...prev.filter((ev) => eventIdOf(ev) !== targetId)]);
    try {
      await restorePlannerSessionById(targetId);
      toast('Reunión restaurada');
    } catch (error) {
      setPlannerEvents((prev) => prev.filter((ev) => eventIdOf(ev) !== targetId));
      setArchivedPlannerEvents((prev) => [sessionToRestore, ...prev.filter((ev) => eventIdOf(ev) !== targetId)]);
      toast(`No se pudo restaurar la reunión: ${describeSyncError(error)}`);
    }
  }, []);

  const handleConfirmDeleteSession = useCallback(async () => {
    const target = deleteSessionModal.session;
    const action = deleteSessionModal.action;
    setDeleteSessionModal({isOpen: false, session: null, action: 'archive'});
    if (!target) return;

    const targetId = target.id || target.eventId || target.sessionId;
    const currentId = plannerStateRef.current.id || plannerStateRef.current.eventId || plannerStateRef.current.sessionId;

    if (action === 'permanent-delete') {
      if (targetId) {
        setArchivedPlannerEvents((prev) => prev.filter((ev) => eventIdOf(ev) !== targetId));
        try {
          await deletePlannerSessionPermanentlyById(targetId);
        } catch (error) {
          setArchivedPlannerEvents((prev) => [target, ...prev.filter((ev) => eventIdOf(ev) !== targetId)]);
          toast(`No se pudo eliminar la reunión: ${describeSyncError(error)}`);
          return;
        }
      }
      toast('Reunión eliminada definitivamente');
      return;
    }

    const previousEvent = targetId ? plannerEvents.find((ev) => eventIdOf(ev) === targetId) || target : target;

    if (targetId) {
      setPlannerEvents((prev) => prev.filter((ev) => eventIdOf(ev) !== targetId));
      setArchivedPlannerEvents((prev) => [
        {
          ...target,
          eventId: targetId,
          archived: true,
          archivedAt: new Date().toISOString(),
        },
        ...prev.filter((ev) => eventIdOf(ev) !== targetId),
      ]);
      try {
        await deletePlannerSessionById(targetId);
      } catch (error) {
        setArchivedPlannerEvents((prev) => prev.filter((ev) => eventIdOf(ev) !== targetId));
        setPlannerEvents((prev) => [previousEvent, ...prev.filter((ev) => eventIdOf(ev) !== targetId)]);
        toast(`No se pudo archivar la reunión: ${describeSyncError(error)}`);
        return;
      }
    }

    // Si la sesión afectada es la que estaba abierta
    const isCurrentSession = !targetId || targetId === currentId;
    if (isCurrentSession) {
      await finalizeIntoCurrentSession();
      const clean = resetToCleanSession();
      plannerStateRef.current = clean;
      setPlannerState(clean);
      commitSessionState(createEmptyLiveSession(clean), {push: false, stamp: false});
      setSelectedEventId(null);
      setIsEditing(false);
      clearUndo();
      handleTabChange('home');
    }

    toast('Reunión archivada. Puedes restaurarla desde “Archivadas”.');
  }, [deleteSessionModal.session, deleteSessionModal.action, plannerEvents, clearUndo, commitSessionState, finalizeIntoCurrentSession, handleTabChange]);

  const handledInitialTabRef = useRef(null);
  useEffect(() => {
    // Run once per initialTab value: callback identities may change when the
    // parent re-renders, and re-running would create another blank meeting.
    if (handledInitialTabRef.current === initialTab) return;
    handledInitialTabRef.current = initialTab;
    if (initialTab === 'new') {
      void handleCleanSession();
    } else if (initialTab === 'demo' && shouldLoadDemoFixture()) {
      handleLoadDemo();
      handleTabChange('agenda');
    }
  }, [initialTab, handleCleanSession, handleLoadDemo, handleTabChange]);

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  /**
   * "Editar" ↔ "Listo". Edits are saved continuously; "Listo" sends whatever
   * is still pending and only says "guardados" once the server confirmed it.
   */
  const handleToggleEditMode = useCallback(async () => {
    if (!isEditingRef.current) {
      setIsEditing(true);
      return;
    }
    setIsEditing(false);
    const engine = syncEngineRef.current;
    const id = plannerStateRef.current?.id;
    if (!engine) {
      // Outside Discord (preview): there is no server, only this device.
      toast('Cambios guardados en este dispositivo');
      return;
    }
    if (!id || !engine.hasPendingPlanner(id)) return;
    await engine.flushPlanner(id);
    toast(engine.hasPendingPlanner(id)
      ? 'Todavía no se pudieron guardar los cambios. Reintentaremos automáticamente.'
      : 'Cambios guardados');
  }, []);

  const handleUpdateHeaderField = useCallback((field, value) => {
    updatePlanner((previous) => ({...previous, [field]: value}));
  }, [updatePlanner]);

  const handleUpdateBlock = useCallback((blockId, updates) => {
    updatePlanner((previous) => ({
      ...previous,
      blocks: previous.blocks.map((block) => (block.id === blockId ? {...block, ...updates} : block)),
    }));
  }, [updatePlanner]);

  const handleAddBlock = useCallback((atIndex = null) => {
    const newId = `b-${Date.now().toString(36)}`;
    // Explicit type: a bloque never becomes a descanso because of its title.
    const newBlock = createAgendaBlock({id: newId, topicId: `p-${Date.now().toString(36)}`});
    updatePlanner((previous) => {
      const blocks = [...(previous.blocks || [])];
      if (typeof atIndex === 'number' && atIndex >= 0) blocks.splice(atIndex, 0, newBlock);
      else blocks.push(newBlock);
      return {...previous, blocks};
    });
    toast('Bloque agregado');
  }, [updatePlanner]);

  /** Empty agenda in view mode: add the first bloque and switch to editing it. */
  const handleAddFirstBlock = useCallback(() => {
    handleAddBlock();
    setIsEditing(true);
  }, [handleAddBlock]);

  const handleAddBreak = useCallback((atIndex = null) => {
    const breakBlock = createBreakBlock({id: `b-${Date.now().toString(36)}`});
    updatePlanner((previous) => {
      const blocks = [...(previous.blocks || [])];
      if (typeof atIndex === 'number' && atIndex >= 0) blocks.splice(atIndex, 0, breakBlock);
      else blocks.push(breakBlock);
      return {...previous, blocks};
    });
    toast('Descanso agregado');
  }, [updatePlanner]);

  const handleDeleteBlock = useCallback((blockId) => {
    let removed = null;
    updatePlanner((previous) => {
      const result = removeBlock(previous, blockId);
      removed = result.removed;
      return result.state;
    });
    if (!removed) return;
    const isBreak = removed.block?.type === 'break' || removed.block?.isBreak;
    offerUndo(isBreak ? 'Descanso eliminado' : 'Bloque eliminado', () => {
      updatePlanner((previous) => restoreRemoved(previous, removed));
    });
  }, [offerUndo, updatePlanner]);

  const handleMoveBlock = useCallback((blockId, direction) => {
    updatePlanner((previous) => {
      const blocks = [...previous.blocks];
      const index = blocks.findIndex((b) => b.id === blockId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= blocks.length) return previous;
      const [moved] = blocks.splice(index, 1);
      blocks.splice(targetIndex, 0, moved);
      return {...previous, blocks};
    });
  }, [updatePlanner]);

  const handleAddSubpoint = useCallback((blockId) => {
    const newPointId = `p-${Date.now()}`;
    updatePlanner((previous) => ({
      ...previous,
      blocks: previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          subpoints: [
            ...(block.subpoints || []),
            {id: newPointId, title: '', presenter: '', status: 'pending'},
          ],
        };
      }),
    }));
  }, [updatePlanner]);

  const handleUpdateSubpoint = useCallback((blockId, pointId, updates) => {
    updatePlanner((previous) => ({
      ...previous,
      blocks: previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          subpoints: (block.subpoints || []).map((point) => (point.id === pointId ? {...point, ...updates} : point)),
        };
      }),
    }));
  }, [updatePlanner]);

  const handleDeleteSubpoint = useCallback((blockId, pointId) => {
    let removed = null;
    updatePlanner((previous) => {
      const result = removeTopic(previous, blockId, pointId);
      removed = result.removed;
      return result.state;
    });
    if (!removed) return;
    offerUndo('Tema eliminado', () => {
      updatePlanner((previous) => restoreRemoved(previous, removed));
    });
  }, [offerUndo, updatePlanner]);

  const handleMoveSubpoint = useCallback((blockId, pointId, direction) => {
    updatePlanner((previous) => {
      let changed = false;
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const subpoints = [...(block.subpoints || [])];
        const index = subpoints.findIndex((p) => p.id === pointId);
        const targetIndex = index + direction;
        if (index === -1 || targetIndex < 0 || targetIndex >= subpoints.length) return block;
        const [moved] = subpoints.splice(index, 1);
        subpoints.splice(targetIndex, 0, moved);
        changed = true;
        return {...block, subpoints};
      });
      return changed ? {...previous, blocks} : previous;
    });
  }, [updatePlanner]);

  const isLive = sessionState.status === SESSION_STATUS.RUNNING || sessionState.status === SESSION_STATUS.PAUSED;
  // Not while editing: starting from the banner would leave the meeting live
  // but still in edit mode (no live controls).
  // Only announce a meeting that exists in the list: the blank placeholder
  // agenda (no meetings yet) must not say "empieza en 16 min".
  const openMeetingId = plannerState?.id || plannerState?.eventId || plannerState?.sessionId;
  const openMeetingIsSaved = Boolean(openMeetingId) && plannerEvents.some((ev) => eventIdOf(ev) === openMeetingId);
  const showUpcomingBanner = !isLive &&
    openMeetingIsSaved &&
    !isEditing &&
    sessionState.status === SESSION_STATUS.IDLE &&
    !dismissedUpcomingBanner &&
    assistantEvaluation.event === ASSISTANT_EVENT.SESSION_UPCOMING;
  const recordingContext = recordingControllerRef.current?.getCurrentContext();
  const _activeBlock = getActiveBlock(plannerState, sessionState);
  const _activePoint = getActivePoint(plannerState, sessionState);
  const elapsedMinutes = Math.round(getElapsedSessionMs(sessionState, nowTimestamp) / (60 * 1000));
  const recordingsCount = (sessionState.recordings || []).length;
  const decisionsCount = (sessionState.decisions || []).length;
  const pendingTemasCount = (() => {
    const counts = getPointCounts(plannerState, sessionState);
    // The active tema stays pending only when ending from the menu or by
    // skipping the bloque (advance marks it tratado, skip-point saltado).
    const mode = interruptModal.mode || 'finish';
    const activeCountsAsPending = (mode === 'finish' || mode === 'skip-block') && sessionState.liveActivePointId ? 1 : 0;
    return Math.max(0, counts.pending + activeCountsAsPending);
  })();

  return (
    <div className="planner-module-root w-full px-4 pt-[calc(var(--bardo-topbar,52px)+12px)] relative min-h-screen">
      {syncStatus && (syncStatus.state === 'error' || syncStatus.state === 'offline') && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive shadow-sm backdrop-blur"
          style={{top: 'calc(var(--bardo-topbar,52px) + 6px)'}}
        >
          {syncStatus.state === 'offline' ? 'Sin conexión · los cambios se guardarán al reconectar' : (syncStatus.message || 'No se pudo guardar la reunión')}
        </div>
      )}

      {showUpcomingBanner && (
        <PlannerUpcomingBanner
          plannerState={plannerState}
          onStartSession={handleStartSession}
          onDismiss={() => setDismissedUpcomingBanner(true)}
        />
      )}

      {/* ── Home del Planner ──────────────────────────────────────────────── */}
      {activeTab === 'home' && (
        <PlannerHomeView
          plannerState={plannerState}
          sessionState={sessionState}
          events={plannerEvents}
          archivedEvents={archivedPlannerEvents}
          selectedEventId={selectedEventId}
          onSelectEvent={handleSelectEvent}
          onDeleteSession={handleDeleteSessionPrompt}
          onRestoreSession={handleRestoreSession}
          onPermanentDeleteSession={(ev) => handleDeleteSessionPrompt(ev, 'permanent-delete')}
          onStartSession={() => {
            handleStartSession();
            handleTabChange('agenda');
          }}
          onResumeSession={() => {
            handleResumeSession();
            handleTabChange('agenda');
          }}
          onViewAgenda={() => handleTabChange('agenda')}
          onViewMinutes={() => handleTabChange('minutes')}
          onViewRecap={() => handleTabChange('recap')}
          onNewCleanSession={handleCleanSession}
        />
      )}

      {activeTab === 'agenda' && (
        <PlannerSessionHeader
          state={plannerState}
          sessionState={sessionState}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isEditing={isEditing}
          onToggleEditMode={handleToggleEditMode}
          onUpdateHeaderField={handleUpdateHeaderField}
          onCopyAnnouncement={handleCopyAnnouncement}
          onNewCleanSession={handleCleanSession}
          onDeleteSession={handleDeleteSessionPrompt}
          onStartSession={handleStartSession}
          onResumeSession={handleResumeSession}
          onInterruptSession={handleOpenInterrupt}
          onGoHome={() => handleTabChange('home')}
        />
      )}

      {activeTab === 'agenda' && (
        <PlannerAgendaView
          state={plannerState}
          sessionState={sessionState}
          nowTimestamp={nowTimestamp}
          recordingStatus={recordingStatus}
          recordingElapsedMs={recordingElapsedMs}
          isEditing={isEditing}
          onAdvance={handleAdvance}
          onAdvanceBlock={handleAdvanceBlock}
          onSkipBlock={handleSkipBlock}
          onPrimaryAction={handleLivePrimary}
          isTransitioning={isTransitioning}
          onUpdateBlock={handleUpdateBlock}
          onAddBlock={handleAddBlock}
          onAddFirstBlock={handleAddFirstBlock}
          onAddBreak={handleAddBreak}
          onDeleteBlock={handleDeleteBlock}
          onMoveBlock={handleMoveBlock}
          onAddSubpoint={handleAddSubpoint}
          onUpdateSubpoint={handleUpdateSubpoint}
          onDeleteSubpoint={handleDeleteSubpoint}
          onMoveSubpoint={handleMoveSubpoint}
          dockSlot={isLive && !isEditing ? (
            <SessionDock
              plannerState={plannerState}
              sessionState={sessionState}
              recordingStatus={recordingStatus}
              recordingElapsedMs={recordingElapsedMs}
              recordingContext={recordingContext}
              isTransitioning={isTransitioning}
              onPauseSession={handlePauseSession}
              onResumeSession={handleResumeSession}
              onPrimaryAction={handleLivePrimary}
              onSkipPoint={handleSkipPoint}
              onSkipBlock={handleSkipBlock}
              onExtendBlock={handleExtendBlock}
              onSetUnlimited={handleSetUnlimited}
              onStartRecording={handleStartRecording}
              onFinalizeRecording={handleFinalizeRecording}
              onPauseRecording={handlePauseRecording}
              onResumeRecording={handleResumeRecording}
              onDismissRecordingPrompt={handleDismissRecordingPrompt}
              onOpenDecisionCapture={() => handleOpenDecisionCapture()}
              onRequestFinish={() => handleRequestFinish('finish')}
            />
          ) : null}
          onToggleSubpointStatus={handleToggleSubpointStatus}
          onOpenCapture={(kind, blockId) => handleOpenDecisionCapture(blockId)}
          onDeleteDecision={handleDeleteDecision}
        />
      )}

      {activeTab === 'recap' && (
        <SessionRecapView
          plannerState={plannerState}
          sessionState={sessionState}
          onResumeSession={handleResumeSession}
          onReopenSession={handleReopenSession}
          onNewSession={handleCleanSession}
          onRenameRecording={handleRenameRecording}
          onDeleteRecording={handleDeleteRecording}
          onSaveDocToLibrary={onSaveDocToLibrary}
        />
      )}

      <PlannerCaptureModal
        isOpen={captureModal.isOpen}
        onClose={() => setCaptureModal((previous) => ({...previous, isOpen: false}))}
        onSubmit={handleCaptureSubmit}
        initialBlockId={captureModal.blockId}
        blocks={plannerState.blocks}
      />

      <RecordingSaveModal
        isOpen={saveRecordingModal.isOpen}
        recordingEntity={saveRecordingModal.recordingEntity}
        onClose={handleSaveRecordingConfirmed}
        onSave={handleSaveRecordingConfirmed}
        onDiscard={handleDiscardRecording}
      />

      <FinishMeetingDialog
        isOpen={interruptModal.isOpen}
        hasActiveRecording={recordingControllerRef.current?.isActive()}
        activeRecordingName={recordingContext?.recordingName}
        elapsedMinutes={elapsedMinutes}
        leftOpen={wasMeetingLeftOpen(elapsedMinutes, getPlannedSchedule(plannerState).plannedMinutes)}
        recordingsCount={recordingsCount}
        decisionsCount={decisionsCount}
        pendingTemasCount={pendingTemasCount}
        onClose={() => setInterruptModal({isOpen: false})}
        onConfirm={handleConfirmFinish}
      />

      <AlertDialog
        open={deleteSessionModal.isOpen}
        onOpenChange={(open) => !open && setDeleteSessionModal({isOpen: false, session: null, action: 'archive'})}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteSessionModal.action === 'permanent-delete'
                ? 'Eliminar reunión definitivamente'
                : 'Archivar reunión'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSessionModal.action === 'permanent-delete'
                ? `“${deleteSessionModal.session?.title || 'Esta reunión'}” se eliminará para todos, con su agenda y sus acuerdos. Esta acción no se puede deshacer.`
                : `“${deleteSessionModal.session?.title || 'Esta reunión'}” se moverá a “Archivadas”. Desde ahí puedes restaurarla o eliminarla definitivamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteSessionModal({isOpen: false, session: null, action: 'archive'})}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant={deleteSessionModal.action === 'permanent-delete' ? 'destructive' : 'default'}
              onClick={handleConfirmDeleteSession}
            >
              {deleteSessionModal.action === 'permanent-delete' ? 'Eliminar definitivamente' : 'Archivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PlannerUndoToast toast={undoToast} onUndo={handleUndo} onDismiss={handleDismissUndo} />

      {/* FAB móvil persistente y sin glow al inicio/edición/reanudación */}
      {/* Never leave a state without a visible way back: while editing the
          FAB shows "Listo" even if the meeting is live (the dock is hidden). */}
      {activeTab === 'agenda' && (!isLive || isEditing) && (() => {
        const hasBlocks = (plannerState.blocks || []).length > 0;
        let fabLabel = hasBlocks ? 'Iniciar reunión' : 'Agrega al menos un bloque';
        let fabIcon = <Play width={13} height={13} />;
        let fabAction = handleStartSession;
        let fabDisabled = !hasBlocks;

        if (isEditing) {
          fabLabel = 'Listo';
          fabIcon = <Check width={14} height={14} />;
          fabAction = handleToggleEditMode;
          fabDisabled = false;
        } else if (sessionState.status === SESSION_STATUS.INTERRUPTED) {
          fabLabel = 'Reanudar';
          fabIcon = <Play width={13} height={13} />;
          fabAction = handleResumeSession;
          fabDisabled = false;
        } else if (sessionState.status === SESSION_STATUS.COMPLETED) {
          fabLabel = 'Ver resumen';
          fabIcon = <FileText width={13} height={13} />;
          fabAction = () => handleTabChange('recap');
          fabDisabled = false;
        }

        return (
          <div
            className="fixed right-4 z-50 sm:hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
            style={{
              bottom: 'calc(var(--bardo-visual-viewport-bottom, 0px) + var(--bardo-safe-bottom, 0px) + 16px)',
            }}
          >
            <Button
              variant="default"
              size="default"
              onClick={fabAction}
              disabled={fabDisabled}
              title={fabDisabled ? 'Agrega al menos un bloque para poder iniciar la reunión' : undefined}
              className="font-semibold text-xs rounded-full h-11 px-5 flex items-center gap-2 transition-all shadow-lg border border-white/10"
            >
              {fabIcon}
              <span>{fabLabel}</span>
            </Button>
          </div>
        );
      })()}
    </div>
  );
}
