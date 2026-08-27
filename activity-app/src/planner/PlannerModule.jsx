import {useState, useEffect, useRef, useCallback} from 'react';
import {toast} from '@heroui/react';
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
  createLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  advanceToNextBlock,
  skipActiveBlock,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  completeLiveSession,
  interruptLiveSession,
  resumeInterruptedSession,
  saveFinalizedRecording,
  renameRecordingInSession,
  deleteRecordingFromSession,
  dismissBlockRecordingPrompt,
  getElapsedSessionMs,
} from './session-runner.js';
import {
  evaluateSessionAssistant,
  ASSISTANT_EVENT,
  formatMsToClock,
} from './session-assistant-engine.js';
import {
  RecordingController,
  RECORDING_STATUS,
} from './recording-controller.js';

export function PlannerModule({initialTab = 'agenda', onSwitchTab}) {
  const [plannerState, setPlannerState] = useState(loadPlannerState);
  const [sessionState, setSessionState] = useState(loadLiveSessionState);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [recordingStatus, setRecordingStatus] = useState(RECORDING_STATUS.IDLE);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [dismissedUpcomingBanner, setDismissedUpcomingBanner] = useState(false);

  // Modals
  const [captureModal, setCaptureModal] = useState({
    isOpen: false,
    blockId: null,
  });

  const [saveRecordingModal, setSaveRecordingModal] = useState({
    isOpen: false,
    recordingEntity: null,
  });

  const [interruptModal, setInterruptModal] = useState({
    isOpen: false,
  });

  const recordingControllerRef = useRef(null);
  const warned5MinBlockIdsRef = useRef(new Set());

  // Initialize Recording Controller singleton with cleanup
  useEffect(() => {
    const controller = new RecordingController({
      onStatusChange: (status) => setRecordingStatus(status),
      onError: (err) => {
        toast(`Error en el micrófono: ${err.message || 'Permiso no otorgado'}`);
      },
    });
    recordingControllerRef.current = controller;

    return () => {
      controller.cleanup();
    };
  }, []);

  // Real clock tick for UI updates (immune to sleep/throttling)
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

  // Compute assistant state
  const assistantEvaluation = evaluateSessionAssistant(plannerState, sessionState, nowTimestamp);

  // Discrete 5-min warning notification (emitted once per block cycle)
  useEffect(() => {
    if (
      assistantEvaluation.event === ASSISTANT_EVENT.BLOCK_5_MIN_REMAINING &&
      assistantEvaluation.activeBlock &&
      !warned5MinBlockIdsRef.current.has(assistantEvaluation.activeBlock.id)
    ) {
      warned5MinBlockIdsRef.current.add(assistantEvaluation.activeBlock.id);
      toast(`⏱ Quedan 5 minutos para terminar "${assistantEvaluation.activeBlock.title}"`);
    }
  }, [assistantEvaluation]);

  // Tab switching helper
  const handleTabChange = (key) => {
    setActiveTab(key);
    onSwitchTab?.(key);
  };

  // State updates for planner schedule
  const handlePlannerUpdate = useCallback((next) => {
    const computed = computePlannerTimes(next);
    setPlannerState(computed);
    savePlannerState(computed);
  }, []);

  // Start Live Session
  const handleStartSession = useCallback(() => {
    const newSession = createLiveSession(plannerState);
    setSessionState(newSession);
    saveLiveSessionState(newSession);
    setActiveTab('agenda');
    toast('Sesión en vivo iniciada');
  }, [plannerState]);

  // Pause Session
  const handlePauseSession = useCallback(() => {
    setSessionState((prev) => {
      const next = pauseLiveSession(prev);
      saveLiveSessionState(next);
      return next;
    });
    if (recordingControllerRef.current?.isRecording()) {
      recordingControllerRef.current.pauseRecording();
    }
    toast('Sesión en pausa');
  }, []);

  // Resume Session
  const handleResumeSession = useCallback(() => {
    setSessionState((prev) => {
      let next;
      if (prev.status === SESSION_STATUS.INTERRUPTED) {
        next = resumeInterruptedSession(prev);
      } else {
        next = resumeLiveSession(prev);
      }
      saveLiveSessionState(next);
      return next;
    });
    setActiveTab('agenda');
    toast('Sesión reanudada');
  }, []);

  // Internal Navigation Action: Advance to next block
  const doAdvanceBlock = useCallback(() => {
    setSessionState((prev) => {
      const next = advanceToNextBlock(plannerState, prev);
      saveLiveSessionState(next);
      if (next.status === SESSION_STATUS.COMPLETED) {
        setActiveTab('recap');
        toast('Sesión finalizada. Mostrando resumen.');
      } else {
        const nextActive = (plannerState.blocks || []).find((b) => b.id === next.liveActiveBlockId);
        toast(`Avanzado a: ${nextActive?.title || 'Siguiente bloque'}`);
      }
      return next;
    });
  }, [plannerState]);

  // Advance to next block with seamless auto-persist of active recording (zero friction)
  const handleNextBlock = useCallback(async () => {
    if (recordingControllerRef.current?.isActive()) {
      const entity = await recordingControllerRef.current.finalizeRecording();
      if (entity) {
        setSessionState((prev) => {
          const withRec = saveFinalizedRecording(prev, entity);
          const next = advanceToNextBlock(plannerState, withRec);
          saveLiveSessionState(next);
          if (next.status === SESSION_STATUS.COMPLETED) {
            setActiveTab('recap');
          }
          return next;
        });
        toast(`${entity.name} · ${formatMsToClock(entity.durationMs)} guardados`);
        return;
      }
    }
    doAdvanceBlock();
  }, [doAdvanceBlock, plannerState]);

  // Skip block with seamless auto-persist of active recording
  const handleSkipBlock = useCallback(async () => {
    if (recordingControllerRef.current?.isActive()) {
      const entity = await recordingControllerRef.current.finalizeRecording();
      if (entity) {
        setSessionState((prev) => {
          const withRec = saveFinalizedRecording(prev, entity);
          const next = skipActiveBlock(plannerState, withRec);
          saveLiveSessionState(next);
          if (next.status === SESSION_STATUS.COMPLETED) {
            setActiveTab('recap');
          }
          return next;
        });
        toast(`${entity.name} · ${formatMsToClock(entity.durationMs)} guardados`);
        return;
      }
    }
    setSessionState((prev) => {
      const next = skipActiveBlock(plannerState, prev);
      saveLiveSessionState(next);
      if (next.status === SESSION_STATUS.COMPLETED) {
        setActiveTab('recap');
        toast('Sesión finalizada.');
      } else {
        toast('Bloque saltado');
      }
      return next;
    });
  }, [plannerState]);

  // Extend block time
  const handleExtendBlock = useCallback((blockId, minutes = 5) => {
    setSessionState((prev) => {
      const next = extendActiveBlock(prev, blockId, minutes);
      saveLiveSessionState(next);
      return next;
    });
    toast(`Bloque extendido +${minutes} min`);
  }, []);

  // Set unlimited overtime
  const handleSetUnlimited = useCallback((blockId) => {
    setSessionState((prev) => {
      const next = setUnlimitedActiveBlock(prev, blockId);
      saveLiveSessionState(next);
      return next;
    });
    toast('Tiempo extendido sin límite');
  }, []);

  // Finish entire session with seamless auto-persist of active recording
  const handleFinishSession = useCallback(async () => {
    if (recordingControllerRef.current?.isActive()) {
      const entity = await recordingControllerRef.current.finalizeRecording();
      if (entity) {
        setSessionState((prev) => {
          const withRec = saveFinalizedRecording(prev, entity);
          const next = completeLiveSession(withRec);
          saveLiveSessionState(next);
          return next;
        });
        setActiveTab('recap');
        toast(`${entity.name} · ${formatMsToClock(entity.durationMs)} guardados. Sesión finalizada.`);
        return;
      }
    }
    recordingControllerRef.current?.cleanup();
    setSessionState((prev) => {
      const next = completeLiveSession(prev);
      saveLiveSessionState(next);
      return next;
    });
    setActiveTab('recap');
    toast('Sesión finalizada. Mostrando resumen.');
  }, []);

  // Session Interruption
  const handleOpenInterrupt = useCallback(() => {
    setInterruptModal({isOpen: true});
  }, []);

  const handleConfirmInterrupt = useCallback(async () => {
    setInterruptModal({isOpen: false});
    if (recordingControllerRef.current?.isActive()) {
      const recordingEntity = await recordingControllerRef.current.finalizeRecording();
      if (recordingEntity) {
        setSessionState((prev) => {
          const withRec = saveFinalizedRecording(prev, recordingEntity);
          const next = interruptLiveSession(withRec);
          saveLiveSessionState(next);
          return next;
        });
        setActiveTab('recap');
        toast(`${recordingEntity.name} y sesión conservadas`);
        return;
      }
    }
    setSessionState((prev) => {
      const next = interruptLiveSession(prev);
      saveLiveSessionState(next);
      return next;
    });
    setActiveTab('recap');
    toast('Sesión interrumpida. Todo el trabajo fue conservado.');
  }, []);

  // Recording Controls
  const handleStartRecording = useCallback(async (blockId, blockTitle, pointId = null, pointTitle = null) => {
    if (!recordingControllerRef.current) return;
    try {
      await recordingControllerRef.current.startRecording(
        sessionState.sessionId || `session-${Date.now()}`,
        blockId,
        blockTitle,
        pointId,
        pointTitle
      );
      toast(`Grabación iniciada: ${pointTitle || blockTitle}`);
    } catch {
      // Error handled in callback
    }
  }, [sessionState.sessionId]);

  // Explicit user finish -> opens RecordingSaveModal for review / renaming
  const handleFinalizeRecording = useCallback(async () => {
    if (!recordingControllerRef.current) return;
    const entity = await recordingControllerRef.current.finalizeRecording();
    if (entity) {
      setSaveRecordingModal({
        isOpen: true,
        recordingEntity: entity,
      });
    }
  }, []);

  const handleSaveRecordingConfirmed = useCallback((finalizedEntity) => {
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    setSessionState((prev) => {
      const next = saveFinalizedRecording(prev, finalizedEntity);
      saveLiveSessionState(next);
      return next;
    });
    toast('Grabación guardada en la sesión');
  }, []);

  const handleDiscardRecording = useCallback(() => {
    setSaveRecordingModal({isOpen: false, recordingEntity: null});
    recordingControllerRef.current?.discardRecording();
    toast('Grabación descartada');
  }, []);

  const handlePauseRecording = useCallback(() => {
    recordingControllerRef.current?.pauseRecording();
  }, []);

  const handleResumeRecording = useCallback(() => {
    recordingControllerRef.current?.resumeRecording();
  }, []);

  const handleDismissRecordingPrompt = useCallback((blockId) => {
    setSessionState((prev) => {
      const next = dismissBlockRecordingPrompt(prev, blockId);
      saveLiveSessionState(next);
      return next;
    });
  }, []);

  // Rename & Delete recordings in session
  const handleRenameRecording = useCallback((recordingId, newName) => {
    setSessionState((prev) => {
      const next = renameRecordingInSession(prev, recordingId, newName);
      saveLiveSessionState(next);
      return next;
    });
    toast('Grabación renombrada');
  }, []);

  const handleDeleteRecording = useCallback((recordingId) => {
    setSessionState((prev) => {
      const next = deleteRecordingFromSession(prev, recordingId);
      saveLiveSessionState(next);
      return next;
    });
    toast('Grabación eliminada');
  }, []);

  // Toggle subpoint checkbox
  const handleToggleSubpointStatus = useCallback((blockId, subpointId, checked) => {
    setPlannerState((prev) => {
      const nextBlocks = prev.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const nextSubpoints = (b.subpoints || []).map((p) => {
          if (p.id !== subpointId) return p;
          return {...p, status: checked ? 'done' : 'pending'};
        });
        return {...b, subpoints: nextSubpoints};
      });
      const next = computePlannerTimes({...prev, blocks: nextBlocks});
      savePlannerState(next);
      return next;
    });
  }, []);

  // Decision Capture
  const handleOpenDecisionCapture = useCallback((targetBlockId = null) => {
    const resolvedBlockId = targetBlockId || sessionState.liveActiveBlockId || plannerState.blocks[0]?.id;
    setCaptureModal({
      isOpen: true,
      blockId: resolvedBlockId,
    });
  }, [sessionState.liveActiveBlockId, plannerState.blocks]);

  const handleCaptureSubmit = useCallback(({blockId, content}) => {
    const resolvedBlockId = blockId || sessionState.liveActiveBlockId || plannerState.blocks[0]?.id;

    setPlannerState((prev) => {
      const nextBlocks = prev.blocks.map((b) => {
        if (b.id !== resolvedBlockId) return b;
        const decisions = [...(b.decisions || []), {id: `d-${Date.now()}`, content}];
        return {...b, decisions};
      });
      const next = computePlannerTimes({...prev, blocks: nextBlocks});
      savePlannerState(next);
      return next;
    });

    setSessionState((prev) => {
      const next = {
        ...prev,
        decisions: [...(prev.decisions || []), {id: `d-${Date.now()}`, blockId: resolvedBlockId, content, timestamp: Date.now()}],
      };
      saveLiveSessionState(next);
      return next;
    });

    toast('Acuerdo registrado en la minuta');
  }, [sessionState.liveActiveBlockId, plannerState.blocks]);

  const handleDeleteDecision = useCallback((blockId, decisionId) => {
    setPlannerState((prev) => {
      const nextBlocks = prev.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const decisions = (b.decisions || []).filter((d) => d.id !== decisionId);
        return {...b, decisions};
      });
      const next = computePlannerTimes({...prev, blocks: nextBlocks});
      savePlannerState(next);
      return next;
    });
    toast('Acuerdo eliminado');
  }, []);

  const handleCopyAnnouncement = useCallback(async () => {
    const text = generateDiscordAnnouncement(plannerState);
    try {
      await navigator.clipboard.writeText(text);
      toast('Anuncio copiado al portapapeles');
    } catch {
      toast('No se pudo copiar el anuncio');
    }
  }, [plannerState]);

  const handleCopyMinutes = useCallback(async () => {
    const text = generateMinutesMarkdown(plannerState, sessionState);
    try {
      await navigator.clipboard.writeText(text);
      toast('Markdown de la minuta copiado al portapapeles');
    } catch {
      toast('No se pudo copiar la minuta');
    }
  }, [plannerState, sessionState]);

  const handleLoadDemo = useCallback(() => {
    const demo = resetToDemoFixture();
    setPlannerState(demo);
    setSessionState(loadLiveSessionState());
    toast('Datos de demostración cargados');
  }, []);

  const handleCleanSession = useCallback(() => {
    const clean = resetToCleanSession();
    setPlannerState(clean);
    setSessionState(loadLiveSessionState());
    setActiveTab('agenda');
    toast('Sesión limpia iniciada');
  }, []);

  const isLive = sessionState.status === SESSION_STATUS.RUNNING || sessionState.status === SESSION_STATUS.PAUSED;
  const showUpcomingBanner = !isLive && sessionState.status === SESSION_STATUS.IDLE && !dismissedUpcomingBanner && assistantEvaluation.event === ASSISTANT_EVENT.SESSION_UPCOMING;
  const recordingContext = recordingControllerRef.current?.getCurrentContext();

  const elapsedMinutes = Math.round(getElapsedSessionMs(sessionState, nowTimestamp) / (60 * 1000));
  const recordingsCount = (sessionState.recordings || []).length;
  const decisionsCount = (sessionState.decisions || []).length;

  return (
    <div className="planner-module-root w-full px-3 sm:px-4 pt-[calc(var(--bardo-topbar,52px)+12px)] relative min-h-screen">
      {/* Upcoming Intelligent Session Banner */}
      {showUpcomingBanner && (
        <PlannerUpcomingBanner
          plannerState={plannerState}
          onStartSession={handleStartSession}
          onDismiss={() => setDismissedUpcomingBanner(true)}
        />
      )}

      {/* Context Header */}
      {activeTab !== 'editor' && (
        <PlannerSessionHeader
          state={plannerState}
          sessionState={sessionState}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenEditor={() => handleTabChange('editor')}
          onCopyAnnouncement={handleCopyAnnouncement}
          onNewCleanSession={handleCleanSession}
          onLoadDemo={handleLoadDemo}
          onStartSession={handleStartSession}
          onResumeSession={handleResumeSession}
          onInterruptSession={handleOpenInterrupt}
        />
      )}

      {/* Main Views */}
      {activeTab === 'agenda' && (
        <PlannerAgendaView
          state={plannerState}
          sessionState={sessionState}
          dockSlot={
            isLive ? (
              <SessionDock
                plannerState={plannerState}
                sessionState={sessionState}
                recordingStatus={recordingStatus}
                recordingElapsedMs={recordingElapsedMs}
                recordingContext={recordingContext}
                onPauseSession={handlePauseSession}
                onResumeSession={handleResumeSession}
                onNextBlock={handleNextBlock}
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
            ) : null
          }
          onOpenEditor={() => handleTabChange('editor')}
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

      {/* Inline Quick Capture Modal for Agreements */}
      <PlannerCaptureModal
        isOpen={captureModal.isOpen}
        onClose={() => setCaptureModal((prev) => ({...prev, isOpen: false}))}
        onSubmit={handleCaptureSubmit}
        initialBlockId={captureModal.blockId}
        blocks={plannerState.blocks}
      />

      {/* Recording Save / Name Modal (Manual Finalize flow) */}
      <RecordingSaveModal
        isOpen={saveRecordingModal.isOpen}
        recordingEntity={saveRecordingModal.recordingEntity}
        onClose={() => setSaveRecordingModal({isOpen: false, recordingEntity: null})}
        onSave={handleSaveRecordingConfirmed}
        onDiscard={handleDiscardRecording}
      />

      {/* Session Interruption Modal (Single-step safe confirmation) */}
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
    </div>
  );
}
