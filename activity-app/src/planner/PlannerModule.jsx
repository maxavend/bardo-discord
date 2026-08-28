import {useState, useEffect, useRef, useCallback} from 'react';
import {toast, Button} from '@heroui/react';
import {
  Play,
  Check,
  FileText,
} from '@gravity-ui/icons';
import {PlannerSessionHeader} from './PlannerSessionHeader.jsx';
import {PlannerAgendaView} from './PlannerAgendaView.jsx';
import {PlannerEditorView} from './PlannerEditorView.jsx';
import {PlannerMinutesView} from './PlannerMinutesView.jsx';
import {PlannerCaptureModal} from './PlannerCaptureModal.jsx';
import {SessionDock} from './SessionDock.jsx';
import {SessionRecapView} from './SessionRecapView.jsx';
import {PlannerUpcomingBanner} from './PlannerUpcomingBanner.jsx';
import {RecordingSaveModal} from './RecordingSaveModal.jsx';
import {SessionInterruptModal} from './SessionInterruptModal.jsx';
import {
  loadPlannerState,
  savePlannerState,
  loadLiveSessionState,
  saveLiveSessionState,
  resetToDemoFixture,
  resetToCleanSession,
  generateDiscordAnnouncement,
  generateMinutesMarkdown,
} from './planner-store.js';
import {computePlannerTimes} from './time-engine.js';
import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  advanceLiveSession,
  skipActivePoint,
  skipActiveBlock,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  completeLiveSession,
  interruptLiveSession,
  resumeInterruptedSession,
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
} from './session-assistant-engine.js';
import {RecordingController, RECORDING_STATUS} from './recording-controller.js';
import {
  recordingStorage,
  persistRecordingBinary,
  hydrateRecordingBinary,
} from './recording-storage.js';

export function PlannerModule({initialTab = 'agenda', onSwitchTab}) {
  const [plannerState, setPlannerState] = useState(loadPlannerState);
  const [sessionState, setSessionState] = useState(() => loadLiveSessionState(plannerState));
  const [activeTab, setActiveTab] = useState(initialTab);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [recordingStatus, setRecordingStatus] = useState(RECORDING_STATUS.IDLE);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [dismissedUpcomingBanner, setDismissedUpcomingBanner] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [captureModal, setCaptureModal] = useState({isOpen: false, blockId: null});
  const [saveRecordingModal, setSaveRecordingModal] = useState({isOpen: false, recordingEntity: null});
  const [interruptModal, setInterruptModal] = useState({isOpen: false});

  const recordingControllerRef = useRef(null);
  const warned5MinBlockIdsRef = useRef(new Set());
  const transitionLockRef = useRef(false);
  const sessionStateRef = useRef(sessionState);
  const plannerStateRef = useRef(plannerState);
  const hydratedSessionIdsRef = useRef(new Set());

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  useEffect(() => {
    plannerStateRef.current = plannerState;
  }, [plannerState]);

  useEffect(() => {
    const controller = new RecordingController({
      onStatusChange: setRecordingStatus,
      onError: (error) => toast(`Error en el micrófono: ${error.message || 'Permiso no otorgado'}`),
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

  // Restore binary audio from IndexedDB after metadata is loaded from localStorage.
  useEffect(() => {
    const sessionId = sessionState.sessionId;
    if (!sessionId || hydratedSessionIdsRef.current.has(sessionId)) return;
    hydratedSessionIdsRef.current.add(sessionId);
    const candidates = (sessionState.recordings || []).filter(
      (recording) => recording.binaryStorage === 'indexeddb' && !recording.blobUrl
    );
    if (candidates.length === 0) return;

    let cancelled = false;
    void Promise.all(candidates.map((recording) => hydrateRecordingBinary(recording))).then((hydrated) => {
      if (cancelled) return;
      setSessionState((previous) => {
        const byId = new Map(hydrated.map((recording) => [recording.id, recording]));
        const next = {
          ...previous,
          recordings: (previous.recordings || []).map((recording) => byId.get(recording.id) || recording),
        };
        sessionStateRef.current = next;
        saveLiveSessionState(next);
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sessionState.sessionId]);

  // MediaRecorder cannot survive reload. This is a best-effort pagehide flush only;
  // the browser is not guaranteed to wait for asynchronous IndexedDB completion.
  useEffect(() => {
    const handlePageHide = () => {
      const controller = recordingControllerRef.current;
      if (!controller?.isActive()) return;
      void controller.finalizeRecording().then(async (entity) => {
        if (!entity) return;
        const persisted = await persistRecordingBinary(entity);
        const next = saveFinalizedRecording(sessionStateRef.current, persisted);
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

  const commitSessionState = useCallback((next) => {
    sessionStateRef.current = next;
    setSessionState(next);
    saveLiveSessionState(next);
  }, []);

  const runAtomicTransition = useCallback(async (operation) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setIsTransitioning(true);
    try {
      await operation();
    } finally {
      transitionLockRef.current = false;
      setIsTransitioning(false);
    }
  }, []);

  const persistCapturedRecording = useCallback(async (entity) => {
    if (!entity) return null;
    const persisted = await persistRecordingBinary(entity);
    if (persisted.status === 'error') {
      toast('No se pudo persistir el audio. Sigue disponible en esta pestaña, pero no recargues hasta resolverlo.');
    }
    return persisted;
  }, []);

  const finalizeActiveRecording = useCallback(async () => {
    const controller = recordingControllerRef.current;
    if (!controller?.isActive()) return null;
    const entity = await controller.finalizeRecording();
    if (!entity) return null;
    return persistCapturedRecording(entity);
  }, [persistCapturedRecording]);

  const handlePlannerUpdate = useCallback((next) => {
    const computed = computePlannerTimes(next);
    plannerStateRef.current = computed;
    setPlannerState(computed);
    savePlannerState(computed);
  }, []);

  const handleStartSession = useCallback(() => {
    const next = createLiveSession(plannerStateRef.current);
    commitSessionState(next);
    setActiveTab('agenda');
    toast('Sesión en vivo iniciada');
  }, [commitSessionState]);

  const handlePauseSession = useCallback(() => {
    const next = pauseLiveSession(sessionStateRef.current);
    commitSessionState(next);
    if (recordingControllerRef.current?.isRecording()) {
      recordingControllerRef.current.pauseRecording();
    }
    toast('Sesión en pausa');
  }, [commitSessionState]);

  const handleResumeSession = useCallback(() => {
    const current = sessionStateRef.current;
    const next = current.status === SESSION_STATUS.INTERRUPTED
      ? resumeInterruptedSession(current)
      : resumeLiveSession(current);
    commitSessionState(next);
    setActiveTab('agenda');
    toast('Sesión reanudada');
  }, [commitSessionState]);

  const handleAdvance = useCallback(() => runAtomicTransition(async () => {
    const outgoing = sessionStateRef.current;
    const activePoint = getActivePoint(plannerStateRef.current, outgoing);
    const activeBlock = getActiveBlock(plannerStateRef.current, outgoing);
    const recording = await finalizeActiveRecording();
    const withRecording = recording ? saveFinalizedRecording(outgoing, recording) : outgoing;
    const next = advanceLiveSession(plannerStateRef.current, withRecording);
    commitSessionState(next);

    if (recording) {
      toast(`${recording.name} · ${formatMsToClock(recording.durationMs)} guardados`);
    }
    if (next.status === SESSION_STATUS.COMPLETED) {
      setActiveTab('recap');
      toast('Sesión finalizada. Mostrando resumen.');
      return;
    }

    if (next.liveActiveBlockId === outgoing.liveActiveBlockId) {
      const nextPoint = getActivePoint(plannerStateRef.current, next);
      toast(`Siguiente punto: ${nextPoint?.title || 'Punto'}`);
    } else {
      const nextBlock = getActiveBlock(plannerStateRef.current, next);
      toast(`Siguiente bloque: ${nextBlock?.title || activeBlock?.title || 'Bloque'}`);
    }

    // `activePoint` is intentionally captured before finalization: recording stays
    // associated with the outgoing Point even after the runner advances.
    void activePoint;
  }), [commitSessionState, finalizeActiveRecording, runAtomicTransition]);

  const handleSkipPoint = useCallback(() => runAtomicTransition(async () => {
    const outgoing = sessionStateRef.current;
    const recording = await finalizeActiveRecording();
    const withRecording = recording ? saveFinalizedRecording(outgoing, recording) : outgoing;
    const next = skipActivePoint(plannerStateRef.current, withRecording);
    commitSessionState(next);
    if (next.status === SESSION_STATUS.COMPLETED) setActiveTab('recap');
    toast('Punto saltado');
  }), [commitSessionState, finalizeActiveRecording, runAtomicTransition]);

  const handleSkipBlock = useCallback(() => runAtomicTransition(async () => {
    const outgoing = sessionStateRef.current;
    const recording = await finalizeActiveRecording();
    const withRecording = recording ? saveFinalizedRecording(outgoing, recording) : outgoing;
    const next = skipActiveBlock(plannerStateRef.current, withRecording);
    commitSessionState(next);
    if (next.status === SESSION_STATUS.COMPLETED) setActiveTab('recap');
    toast('Bloque saltado');
  }), [commitSessionState, finalizeActiveRecording, runAtomicTransition]);

  const handleExtendBlock = useCallback((blockId, minutes = 5) => {
    const next = extendActiveBlock(sessionStateRef.current, blockId, minutes);
    commitSessionState(next);
    toast(`Bloque extendido +${minutes} min`);
  }, [commitSessionState]);

  const handleSetUnlimited = useCallback((blockId) => {
    const next = setUnlimitedActiveBlock(sessionStateRef.current, blockId);
    commitSessionState(next);
    toast('Tiempo del bloque sin límite');
  }, [commitSessionState]);

  const handleFinishSession = useCallback(() => runAtomicTransition(async () => {
    const outgoing = sessionStateRef.current;
    const recording = await finalizeActiveRecording();
    const withRecording = recording ? saveFinalizedRecording(outgoing, recording) : outgoing;
    const next = completeLiveSession(withRecording);
    commitSessionState(next);
    setActiveTab('recap');
    toast('Sesión finalizada. Mostrando resumen.');
  }), [commitSessionState, finalizeActiveRecording, runAtomicTransition]);

  const handleOpenInterrupt = useCallback(() => setInterruptModal({isOpen: true}), []);

  const handleConfirmInterrupt = useCallback(() => runAtomicTransition(async () => {
    setInterruptModal({isOpen: false});
    const outgoing = sessionStateRef.current;
    const recording = await finalizeActiveRecording();
    const withRecording = recording ? saveFinalizedRecording(outgoing, recording) : outgoing;
    const next = interruptLiveSession(withRecording);
    commitSessionState(next);
    setActiveTab('recap');
    toast(recording ? `${recording.name} y sesión conservadas` : 'Sesión interrumpida. Todo el trabajo fue conservado.');
  }), [commitSessionState, finalizeActiveRecording, runAtomicTransition]);

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
      await recordingControllerRef.current.startRecording(
        currentSession.sessionId || `session-${Date.now()}`,
        block.id,
        block.title,
        point?.id || null,
        point?.title || null
      );
      setRecordingElapsedMs(0);
      toast(`Grabación iniciada: ${point?.title || block.title}`);
    } catch {
      // Permission/runtime error is handled by RecordingController callback.
    }
  }, []);

  const handleFinalizeRecording = useCallback(async () => {
    if (!recordingControllerRef.current) return;
    const entity = await recordingControllerRef.current.finalizeRecording();
    if (entity) setSaveRecordingModal({isOpen: true, recordingEntity: entity});
  }, []);

  const handleSaveRecordingConfirmed = useCallback(async (finalizedEntity) => {
    const persisted = await persistCapturedRecording(finalizedEntity);
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    if (!persisted) return;
    const next = saveFinalizedRecording(sessionStateRef.current, persisted);
    commitSessionState(next);
    toast(persisted.status === 'saved' ? 'Grabación guardada en la sesión' : 'Grabación finalizada con error de persistencia');
  }, [commitSessionState, persistCapturedRecording]);

  const handleDiscardRecording = useCallback(() => {
    const entity = saveRecordingModal.recordingEntity;
    if (entity?.blobUrl && typeof URL !== 'undefined') URL.revokeObjectURL(entity.blobUrl);
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    recordingControllerRef.current?.discardRecording();
    toast('Grabación descartada');
  }, [saveRecordingModal.recordingEntity]);

  const handlePauseRecording = useCallback(() => recordingControllerRef.current?.pauseRecording(), []);
  const handleResumeRecording = useCallback(() => recordingControllerRef.current?.resumeRecording(), []);

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
      toast('No se pudo borrar el binario local, pero se retirará de esta sesión.');
    }
    if (recording?.blobUrl && typeof URL !== 'undefined') URL.revokeObjectURL(recording.blobUrl);
    const next = deleteRecordingFromSession(sessionStateRef.current, recordingId);
    commitSessionState(next);
    toast('Grabación eliminada');
  }, [commitSessionState]);

  const handleToggleSubpointStatus = useCallback((blockId, pointId, checked) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          subpoints: (block.subpoints || []).map((point) =>
            point.id === pointId ? {...point, status: checked ? POINT_STATUS.DONE : POINT_STATUS.PENDING} : point
          ),
        };
      });
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });

    if (sessionStateRef.current.status !== SESSION_STATUS.IDLE) {
      const nextSession = setPointStatus(
        sessionStateRef.current,
        pointId,
        checked ? POINT_STATUS.DONE : POINT_STATUS.PENDING
      );
      commitSessionState(nextSession);
    }
  }, [commitSessionState]);

  const handleOpenDecisionCapture = useCallback((targetBlockId = null) => {
    const selectedBlockId = targetBlockId || sessionStateRef.current.liveActiveBlockId || plannerStateRef.current.blocks[0]?.id;
    setCaptureModal({
      isOpen: true,
      blockId: selectedBlockId,
    });
  }, []);

  const handleCaptureSubmit = useCallback(({blockId, content}) => {
    const liveSession = sessionStateRef.current;
    const resolvedBlockId = blockId || liveSession.liveActiveBlockId || plannerStateRef.current.blocks[0]?.id;
    const isTargetLiveBlock = liveSession.liveActiveBlockId === resolvedBlockId;
    const pointId = isTargetLiveBlock ? liveSession.liveActivePointId : null;
    const timestamp = Date.now();
    const decision = {
      id: `d-${timestamp}`,
      sessionId: liveSession.sessionId || null,
      blockId: resolvedBlockId,
      pointId,
      content,
      timestamp,
    };

    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) =>
        block.id === resolvedBlockId
          ? {...block, decisions: [...(block.decisions || []), decision]}
          : block
      );
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });

    const nextSession = {
      ...liveSession,
      decisions: [...(liveSession.decisions || []), decision],
    };
    commitSessionState(nextSession);
    const targetBlock = plannerStateRef.current.blocks.find((b) => b.id === resolvedBlockId);
    toast(`Acuerdo agregado al bloque "${targetBlock?.title || 'seleccionado'}"`);
  }, [commitSessionState]);

  const handleDeleteDecision = useCallback((blockId, decisionId) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) =>
        block.id === blockId
          ? {...block, decisions: (block.decisions || []).filter((decision) => decision.id !== decisionId)}
          : block
      );
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
    const nextSession = {
      ...sessionStateRef.current,
      decisions: (sessionStateRef.current.decisions || []).filter((decision) => decision.id !== decisionId),
    };
    commitSessionState(nextSession);
    toast('Acuerdo eliminado');
  }, [commitSessionState]);

  const handleCopyAnnouncement = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateDiscordAnnouncement(plannerStateRef.current));
      toast('Anuncio copiado al portapapeles');
    } catch {
      toast('No se pudo copiar el anuncio');
    }
  }, []);

  const handleCopyMinutes = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateMinutesMarkdown(plannerStateRef.current, sessionStateRef.current));
      toast('Markdown de la minuta copiado al portapapeles');
    } catch {
      toast('No se pudo copiar la minuta');
    }
  }, []);

  const handleLoadDemo = useCallback(() => {
    const demo = resetToDemoFixture();
    plannerStateRef.current = demo;
    setPlannerState(demo);
    const live = loadLiveSessionState(demo);
    commitSessionState(live);
    toast('Datos de demostración cargados');
  }, [commitSessionState]);

  const handleCleanSession = useCallback(() => {
    const clean = resetToCleanSession();
    plannerStateRef.current = clean;
    setPlannerState(clean);
    const live = loadLiveSessionState(clean);
    commitSessionState(live);
    setActiveTab('agenda');
    toast('Sesión limpia iniciada');
  }, [commitSessionState]);

  const [isEditing, setIsEditing] = useState(false);

  const handleToggleEditMode = useCallback(() => {
    setIsEditing((previous) => {
      const next = !previous;
      if (!next) {
        toast('Cambios guardados en la agenda');
      }
      return next;
    });
  }, []);

  const handleUpdateHeaderField = useCallback((field, value) => {
    setPlannerState((previous) => {
      const next = computePlannerTimes({...previous, [field]: value});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleUpdateBlock = useCallback((blockId, updates) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) =>
        block.id === blockId ? {...block, ...updates} : block
      );
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleAddBlock = useCallback((atIndex = null) => {
    const newId = `b-${Date.now()}`;
    const newBlock = {
      id: newId,
      title: 'Nuevo bloque',
      durationMinutes: 30,
      leader: '',
      participants: '',
      subpoints: [
        {
          id: `p-${Date.now()}`,
          title: 'Punto de partida',
          presenter: '',
          status: 'pending',
        },
      ],
      decisions: [],
    };
    setPlannerState((previous) => {
      const blocks = [...previous.blocks];
      if (typeof atIndex === 'number' && atIndex >= 0) {
        blocks.splice(atIndex, 0, newBlock);
      } else {
        blocks.push(newBlock);
      }
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
    toast('Bloque añadido a la agenda');
  }, []);

  const handleDeleteBlock = useCallback((blockId) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.filter((block) => block.id !== blockId);
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
    toast('Bloque eliminado');
  }, []);

  const handleMoveBlock = useCallback((blockId, direction) => {
    setPlannerState((previous) => {
      const blocks = [...previous.blocks];
      const index = blocks.findIndex((b) => b.id === blockId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= blocks.length) return previous;
      const [moved] = blocks.splice(index, 1);
      blocks.splice(targetIndex, 0, moved);
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleAddSubpoint = useCallback((blockId) => {
    const newPointId = `p-${Date.now()}`;
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const subpoints = [
          ...(block.subpoints || []),
          {
            id: newPointId,
            title: '',
            presenter: '',
            status: 'pending',
          },
        ];
        return {...block, subpoints};
      });
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleUpdateSubpoint = useCallback((blockId, pointId, updates) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const subpoints = (block.subpoints || []).map((point) =>
          point.id === pointId ? {...point, ...updates} : point
        );
        return {...block, subpoints};
      });
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleDeleteSubpoint = useCallback((blockId, pointId) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const subpoints = (block.subpoints || []).filter((point) => point.id !== pointId);
        return {...block, subpoints};
      });
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const handleMoveSubpoint = useCallback((blockId, pointId, direction) => {
    setPlannerState((previous) => {
      const blocks = previous.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const subpoints = [...(block.subpoints || [])];
        const index = subpoints.findIndex((p) => p.id === pointId);
        const targetIndex = index + direction;
        if (index === -1 || targetIndex < 0 || targetIndex >= subpoints.length) return block;
        const [moved] = subpoints.splice(index, 1);
        subpoints.splice(targetIndex, 0, moved);
        return {...block, subpoints};
      });
      const next = computePlannerTimes({...previous, blocks});
      plannerStateRef.current = next;
      savePlannerState(next);
      return next;
    });
  }, []);

  const isLive = sessionState.status === SESSION_STATUS.RUNNING || sessionState.status === SESSION_STATUS.PAUSED;
  const showUpcomingBanner = !isLive &&
    sessionState.status === SESSION_STATUS.IDLE &&
    !dismissedUpcomingBanner &&
    assistantEvaluation.event === ASSISTANT_EVENT.SESSION_UPCOMING;
  const recordingContext = recordingControllerRef.current?.getCurrentContext();
  const activeBlock = getActiveBlock(plannerState, sessionState);
  const activePoint = getActivePoint(plannerState, sessionState);
  const elapsedMinutes = Math.round(getElapsedSessionMs(sessionState, nowTimestamp) / (60 * 1000));
  const recordingsCount = (sessionState.recordings || []).length;
  const decisionsCount = (sessionState.decisions || []).length;

  return (
    <div className="planner-module-root w-full px-3 sm:px-4 pt-[calc(var(--bardo-topbar,52px)+12px)] relative min-h-screen">
      {showUpcomingBanner && (
        <PlannerUpcomingBanner
          plannerState={plannerState}
          onStartSession={handleStartSession}
          onDismiss={() => setDismissedUpcomingBanner(true)}
        />
      )}

      {activeTab !== 'editor' && (
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
          onLoadDemo={handleLoadDemo}
          onStartSession={handleStartSession}
          onResumeSession={handleResumeSession}
          onInterruptSession={handleOpenInterrupt}
        />
      )}

      {activeTab === 'agenda' && (
        <PlannerAgendaView
          state={plannerState}
          sessionState={sessionState}
          isEditing={isEditing}
          onAdvance={handleAdvance}
          isTransitioning={isTransitioning}
          onUpdateBlock={handleUpdateBlock}
          onAddBlock={handleAddBlock}
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
              onAdvance={handleAdvance}
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
              onInterruptSession={handleOpenInterrupt}
              onFinishSession={handleFinishSession}
            />
          ) : null}
          onToggleSubpointStatus={handleToggleSubpointStatus}
          onOpenCapture={(kind, blockId) => handleOpenDecisionCapture(blockId)}
          onDeleteDecision={handleDeleteDecision}
        />
      )}

      {activeTab === 'editor' && (
        <PlannerEditorView
          initialState={plannerState}
          onSave={(next) => {
            handlePlannerUpdate(next);
            handleTabChange('agenda');
            toast('Agenda guardada con éxito');
          }}
          onCancel={() => handleTabChange('agenda')}
        />
      )}

      {activeTab === 'minutes' && (
        <PlannerMinutesView
          state={plannerState}
          sessionState={sessionState}
          onBack={() => handleTabChange('agenda')}
          onCopyMarkdown={handleCopyMinutes}
        />
      )}

      {activeTab === 'recap' && (
        <SessionRecapView
          plannerState={plannerState}
          sessionState={sessionState}
          onResumeSession={handleResumeSession}
          onViewMinutes={() => handleTabChange('minutes')}
          onNewSession={handleCleanSession}
          onRenameRecording={handleRenameRecording}
          onDeleteRecording={handleDeleteRecording}
        />
      )}

      <PlannerCaptureModal
        isOpen={captureModal.isOpen}
        onClose={() => setCaptureModal((previous) => ({...previous, isOpen: false}))}
        onSubmit={handleCaptureSubmit}
        initialBlockId={captureModal.blockId}
        blocks={plannerState.blocks}
        lockContext={false}
        contextLabel={activePoint ? `${activeBlock?.title} → ${activePoint.title}` : activeBlock?.title}
      />

      <RecordingSaveModal
        isOpen={saveRecordingModal.isOpen}
        recordingEntity={saveRecordingModal.recordingEntity}
        onClose={handleDiscardRecording}
        onSave={handleSaveRecordingConfirmed}
        onDiscard={handleDiscardRecording}
      />

      <SessionInterruptModal
        isOpen={interruptModal.isOpen}
        hasActiveRecording={recordingControllerRef.current?.isActive()}
        activeRecordingName={recordingContext?.recordingName}
        elapsedMinutes={elapsedMinutes}
        recordingsCount={recordingsCount}
        decisionsCount={decisionsCount}
        onClose={() => setInterruptModal({isOpen: false})}
        onConfirmInterrupt={handleConfirmInterrupt}
      />

      {/* FAB móvil persistente y sin glow al inicio/edición/reanudación */}
      {activeTab === 'agenda' && !isLive && (() => {
        let fabLabel = 'Iniciar sesión';
        let fabIcon = <Play width={13} height={13} />;
        let fabAction = handleStartSession;

        if (isEditing) {
          fabLabel = 'Listo';
          fabIcon = <Check width={14} height={14} />;
          fabAction = handleToggleEditMode;
        } else if (sessionState.status === SESSION_STATUS.INTERRUPTED) {
          fabLabel = 'Reanudar sesión';
          fabIcon = <Play width={13} height={13} />;
          fabAction = handleResumeSession;
        } else if (sessionState.status === SESSION_STATUS.COMPLETED) {
          fabLabel = 'Ver resumen';
          fabIcon = <FileText width={13} height={13} />;
          fabAction = () => handleTabChange('recap');
        }

        return (
          <div
            className="fixed right-4 z-50 sm:hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
            style={{
              bottom: 'calc(var(--bardo-visual-viewport-bottom, 0px) + var(--bardo-safe-bottom, 0px) + 16px)',
            }}
          >
            <Button
              variant="primary"
              size="md"
              onPress={fabAction}
              className="font-semibold text-xs rounded-full h-11 px-5 flex items-center gap-2 active:scale-95 transition-all shadow-lg border border-white/10"
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
