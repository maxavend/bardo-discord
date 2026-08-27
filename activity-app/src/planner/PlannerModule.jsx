import {useState, useCallback} from 'react';
import {
  Button,
  Tabs,
  toast,
} from '@heroui/react';
import {
  PlannerAgendaView,
} from './PlannerAgendaView.jsx';
import {
  PlannerEditorView,
} from './PlannerEditorView.jsx';
import {
  PlannerMinutesView,
} from './PlannerMinutesView.jsx';
import {
  PlannerCaptureModal,
} from './PlannerCaptureModal.jsx';
import {
  loadPlannerState,
  savePlannerState,
  generateDiscordAnnouncement,
  generateMinutesMarkdown,
} from './planner-store.js';
import {
  computePlannerTimes,
} from './time-engine.js';

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

  const handleCopyAnnouncement = useCallback(async () => {
    const text = generateDiscordAnnouncement(plannerState);
    try {
      await navigator.clipboard.writeText(text);
      toast('📢 ¡Anuncio con formato de Discord copiado!');
    } catch {
      toast('No se pudo copiar el anuncio');
    }
  }, [plannerState]);

  const handleCopyMinutes = useCallback(async () => {
    const text = generateMinutesMarkdown(plannerState);
    try {
      await navigator.clipboard.writeText(text);
      toast('📋 ¡Markdown de la minuta copiado!');
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
    toast(kind === 'decision' ? '🟢 Decisión guardada en la minuta' : '🟣 Tarea asignada guardada');
  }, []);

  return (
    <div className="planner-module-root w-full px-3 sm:px-4 pt-3 sm:pt-4">
      {/* Module Tabs Navigation */}
      <div className="max-w-4xl mx-auto mb-4 sm:mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(k) => handleTabChange(String(k))}
          className="w-full sm:w-auto"
        >
          <Tabs.ListContainer className="bg-surface-secondary/80 p-1 rounded-xl border border-border w-full sm:w-auto">
            <Tabs.List aria-label="Vistas del Planner" className="w-full sm:w-auto justify-between sm:justify-start">
              <Tabs.Tab id="agenda" className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <span>🗓️</span>
                <span className="hidden xs:inline sm:inline">Agenda & Sesión</span>
                <span className="inline xs:hidden sm:hidden">Agenda</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="editor" className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <span>✏️</span>
                <span className="hidden xs:inline sm:inline">Editor de Evento</span>
                <span className="inline xs:hidden sm:hidden">Editor</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="minutes" className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <span>📄</span>
                <span className="hidden xs:inline sm:inline">Minuta Final</span>
                <span className="inline xs:hidden sm:hidden">Minuta</span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        {activeTab === 'agenda' && (
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onPress={() => handleOpenCapture('decision', plannerState.blocks[0]?.id)}
              className="text-xs h-8"
              aria-label="Registrar decisión rápida"
            >
              + Decisión
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => handleOpenCapture('task', plannerState.blocks[0]?.id)}
              className="text-xs h-8"
              aria-label="Asignar tarea rápida"
            >
              + Tarea
            </Button>
          </div>
        )}
      </div>

      {/* Main Views Container */}
      {activeTab === 'agenda' && (
        <PlannerAgendaView
          state={plannerState}
          onOpenEditor={() => handleTabChange('editor')}
          onOpenMinutes={() => handleTabChange('minutes')}
          onCopyAnnouncement={handleCopyAnnouncement}
          onToggleSubpointStatus={handleToggleSubpointStatus}
          onOpenCapture={handleOpenCapture}
        />
      )}

      {activeTab === 'editor' && (
        <PlannerEditorView
          initialState={plannerState}
          onSave={(next) => {
            handleStateUpdate(next);
            handleTabChange('agenda');
            toast('✅ ¡Agenda guardada con éxito!');
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
