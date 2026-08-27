import {useState, useCallback} from 'react';
import {toast} from '@heroui/react';
import {PlannerSessionHeader} from './PlannerSessionHeader.jsx';
import {PlannerAgendaView} from './PlannerAgendaView.jsx';
import {PlannerEditorView} from './PlannerEditorView.jsx';
import {PlannerMinutesView} from './PlannerMinutesView.jsx';
import {PlannerCaptureModal} from './PlannerCaptureModal.jsx';
import {
  loadPlannerState,
  savePlannerState,
  resetToDemoFixture,
  resetToCleanSession,
  generateDiscordAnnouncement,
  generateMinutesMarkdown,
} from './planner-store.js';
import {computePlannerTimes} from './time-engine.js';

export function PlannerModule({initialTab = 'agenda', onSwitchTab}) {
  const [plannerState, setPlannerState] = useState(loadPlannerState);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [captureModal, setCaptureModal] = useState({
    isOpen: false,
    kind: 'decision',
    blockId: null,
  });

  const handleTabChange = (key) => {
    setActiveTab(key);
    onSwitchTab?.(key);
  };

  const handleStateUpdate = useCallback((next) => {
    const computed = computePlannerTimes(next);
    setPlannerState(computed);
    savePlannerState(computed);
  }, []);

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

  const handleStartOrContinueSession = useCallback(() => {
    setPlannerState((prev) => {
      if (!prev.liveActiveBlockId && (prev.blocks || []).length > 0) {
        const next = {...prev, liveActiveBlockId: prev.blocks[0].id};
        savePlannerState(next);
        toast('Sesión iniciada');
        return next;
      }
      toast('Sesión en curso');
      return prev;
    });
    setActiveTab('agenda');
  }, []);

  const handleCopyAnnouncement = useCallback(async () => {
    const text = generateDiscordAnnouncement(plannerState);
    try {
      await navigator.clipboard.writeText(text);
      toast('Anuncio para Discord copiado al portapapeles');
    } catch {
      toast('No se pudo copiar el anuncio');
    }
  }, [plannerState]);

  const handleCopyMinutes = useCallback(async () => {
    const text = generateMinutesMarkdown(plannerState);
    try {
      await navigator.clipboard.writeText(text);
      toast('Markdown de la minuta copiado al portapapeles');
    } catch {
      toast('No se pudo copiar la minuta');
    }
  }, [plannerState]);

  const handleOpenCapture = useCallback((kind, blockId) => {
    setCaptureModal({
      isOpen: true,
      kind,
      blockId,
    });
  }, []);

  const handleCaptureSubmit = useCallback(({kind, blockId, content, assignee}) => {
    setPlannerState((prev) => {
      const nextBlocks = prev.blocks.map((b) => {
        if (b.id !== blockId && b.id !== (blockId || prev.blocks[0]?.id)) return b;
        if (kind === 'decision') {
          const decisions = [...(b.decisions || []), {id: `d-${Date.now()}`, content}];
          return {...b, decisions};
        } else {
          const tasks = [...(b.tasks || []), {id: `t-${Date.now()}`, title: content, assignee}];
          return {...b, tasks};
        }
      });
      const next = computePlannerTimes({...prev, blocks: nextBlocks});
      savePlannerState(next);
      return next;
    });
    toast(kind === 'decision' ? 'Decisión guardada en la minuta' : 'Tarea guardada');
  }, []);

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
    toast('Decisión eliminada');
  }, []);

  const handleDeleteTask = useCallback((blockId, taskId) => {
    setPlannerState((prev) => {
      const nextBlocks = prev.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const tasks = (b.tasks || []).filter((t) => t.id !== taskId);
        return {...b, tasks};
      });
      const next = computePlannerTimes({...prev, blocks: nextBlocks});
      savePlannerState(next);
      return next;
    });
    toast('Tarea eliminada');
  }, []);

  const handleLoadDemo = useCallback(() => {
    const demo = resetToDemoFixture();
    setPlannerState(demo);
    toast('Datos de demostración cargados');
  }, []);

  const handleCleanSession = useCallback(() => {
    const clean = resetToCleanSession();
    setPlannerState(clean);
    toast('Sesión limpia iniciada');
  }, []);

  return (
    <div className="planner-module-root w-full px-3 sm:px-4 pt-2 sm:pt-3">
      {/* Context Header (Notion + Calendly hierarchy) */}
      {activeTab !== 'editor' && (
        <PlannerSessionHeader
          state={plannerState}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenEditor={() => handleTabChange('editor')}
          onCopyAnnouncement={handleCopyAnnouncement}
          onNewCleanSession={handleCleanSession}
          onLoadDemo={handleLoadDemo}
          onStartSession={handleStartOrContinueSession}
        />
      )}

      {/* Main Views Container */}
      {activeTab === 'agenda' && (
        <PlannerAgendaView
          state={plannerState}
          onOpenEditor={() => handleTabChange('editor')}
          onToggleSubpointStatus={handleToggleSubpointStatus}
          onOpenCapture={handleOpenCapture}
          onDeleteDecision={handleDeleteDecision}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {activeTab === 'editor' && (
        <PlannerEditorView
          initialState={plannerState}
          onSave={(next) => {
            handleStateUpdate(next);
            handleTabChange('agenda');
            toast('Agenda guardada con éxito');
          }}
          onCancel={() => handleTabChange('agenda')}
        />
      )}

      {activeTab === 'minutes' && (
        <PlannerMinutesView
          state={plannerState}
          onBack={() => handleTabChange('agenda')}
          onCopyMarkdown={handleCopyMinutes}
        />
      )}

      {/* Quick Capture Modal */}
      <PlannerCaptureModal
        isOpen={captureModal.isOpen}
        onClose={() => setCaptureModal((prev) => ({...prev, isOpen: false}))}
        onSubmit={handleCaptureSubmit}
        kind={captureModal.kind}
        initialBlockId={captureModal.blockId}
        blocks={plannerState.blocks}
      />
    </div>
  );
}
