import {useState, useCallback} from 'react';
import {
  Button,
  Tabs,
  Dropdown,
  Label,
  Description,
  toast,
} from '@heroui/react';
import {
  Calendar,
  Pencil,
  FileText,
  Plus,
  EllipsisVertical,
  ArrowRotateLeft,
} from '@gravity-ui/icons';
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
  resetToDemoFixture,
  resetToCleanSession,
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
    toast(kind === 'decision' ? '🟢 Decisión guardada en la minuta' : '🟣 Tarea guardada');
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
    toast('✨ Datos de demostración cargados');
  }, []);

  const handleCleanSession = useCallback(() => {
    const clean = resetToCleanSession();
    setPlannerState(clean);
    toast('🧹 Sesión limpia iniciada');
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
              <Tabs.Tab id="agenda" className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Calendar width={14} height={14} />
                <span className="hidden xs:inline sm:inline">Agenda</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="editor" className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Pencil width={14} height={14} />
                <span className="hidden xs:inline sm:inline">Editor</span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="minutes" className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <FileText width={14} height={14} />
                <span className="hidden xs:inline sm:inline">Minuta</span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="flex items-center gap-2">
          {activeTab === 'agenda' && (
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onPress={() => handleOpenCapture('decision', plannerState.blocks[0]?.id)}
                aria-label="Registrar decisión rápida"
              >
                <Plus width={12} height={12} /> Decisión
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => handleOpenCapture('task', plannerState.blocks[0]?.id)}
                aria-label="Asignar tarea rápida"
              >
                <Plus width={12} height={12} /> Tarea
              </Button>
            </div>
          )}

          {/* Session Management Options */}
          <Dropdown>
            <Dropdown.Trigger>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                aria-label="Opciones de sesión"
              >
                <EllipsisVertical width={14} height={14} />
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === 'new-clean') handleCleanSession();
                  if (key === 'load-demo') handleLoadDemo();
                }}
              >
                <Dropdown.Item id="new-clean" textValue="Nueva sesión limpia">
                  <Plus />
                  <Label>Nueva sesión limpia</Label>
                  <Description>Empezar una agenda desde cero</Description>
                </Dropdown.Item>
                <Dropdown.Item id="load-demo" textValue="Cargar datos de demo">
                  <ArrowRotateLeft />
                  <Label>Cargar demo semanal</Label>
                  <Description>Ver ejemplo de weekly de diseño</Description>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
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
