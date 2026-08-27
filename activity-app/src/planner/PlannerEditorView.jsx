import {useState, useEffect} from 'react';
import {
  AlertDialog,
  Button,
  Card,
  Input,
  TextArea,
  TextField,
  Label,
  ProgressBar,
  ToggleButtonGroup,
  ToggleButton,
  Dropdown,
  Description,
  toast,
} from '@heroui/react';
import {
  Plus,
  TrashBin,
  Check,
  ChevronUp,
  ChevronDown,
  EllipsisVertical,
} from '@gravity-ui/icons';
import {
  computePlannerTimes,
  parseSmartDuration,
  formatShortDuration,
} from './time-engine.js';

const PRESET_DURATIONS = ['10m', '15m', '20m', '30m'];

export function PlannerEditorView({
  initialState,
  onSave,
  onCancel,
}) {
  const [formData, setFormData] = useState(() => computePlannerTimes(initialState));
  const [targetDurationInput, setTargetDurationInput] = useState(() =>
    formatShortDuration(initialState.targetDuration || initialState.totalCalculatedDuration || 180)
  );
  const [blockToDelete, setBlockToDelete] = useState(null);

  useEffect(() => {
    setFormData(computePlannerTimes(initialState));
    setTargetDurationInput(
      formatShortDuration(initialState.targetDuration || initialState.totalCalculatedDuration || 180)
    );
  }, [initialState]);

  const updateHeaderField = (field, value) => {
    setFormData((prev) => {
      const next = {...prev, [field]: value};
      return computePlannerTimes(next);
    });
  };

  const handleTargetDurationChange = (val) => {
    setTargetDurationInput(val);
    const parsed = parseSmartDuration(val);
    if (parsed && parsed > 0) {
      setFormData((prev) => ({...prev, targetDuration: parsed}));
    }
  };

  const updateBlockField = (bIdx, field, value) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      nextBlocks[bIdx] = {...nextBlocks[bIdx], [field]: value};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const updateBlockManualDuration = (bIdx, value) => {
    const parsed = parseSmartDuration(value);
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      nextBlocks[bIdx] = {
        ...nextBlocks[bIdx],
        manualDuration: parsed || 30,
        durationMinutes: parsed || 30,
      };
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const addBlock = () => {
    setFormData((prev) => {
      const nextBlocks = [
        ...prev.blocks,
        {
          id: `b-${Date.now()}`,
          emoji: '📌',
          title: `Bloque #${prev.blocks.length + 1}`,
          durationMinutes: 30,
          manualDuration: 30,
          leader: '',
          participants: '',
          phases: {context: 5, review: 20, closing: 5},
          subpoints: [],
          decisions: [],
          tasks: [],
        },
      ];
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const confirmDeleteBlock = (bIdx) => {
    const target = formData.blocks[bIdx];
    if (!target) return;
    if ((target.subpoints || []).length === 0 && (target.decisions || []).length === 0 && (target.tasks || []).length === 0) {
      executeDeleteBlock(bIdx);
      return;
    }
    setBlockToDelete({index: bIdx, title: target.title, pointsCount: (target.subpoints || []).length});
  };

  const executeDeleteBlock = (bIdx) => {
    setFormData((prev) => {
      const nextBlocks = prev.blocks.filter((_, idx) => idx !== bIdx);
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
    setBlockToDelete(null);
    toast('Bloque eliminado');
  };

  const addSubpoint = (bIdx) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = [
        ...(nextBlocks[bIdx].subpoints || []),
        {
          id: `p-${Date.now()}`,
          title: '',
          rawTime: '15m',
          durationMinutes: 15,
          presenter: '',
          status: 'pending',
        },
      ];
      nextBlocks[bIdx] = {...nextBlocks[bIdx], subpoints};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const updateSubpointField = (bIdx, pIdx, field, value) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = [...nextBlocks[bIdx].subpoints];
      subpoints[pIdx] = {...subpoints[pIdx], [field]: value};
      nextBlocks[bIdx] = {...nextBlocks[bIdx], subpoints};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const setQuickSubpointTime = (bIdx, pIdx, timeStr) => {
    updateSubpointField(bIdx, pIdx, 'rawTime', timeStr);
  };

  const removeSubpoint = (bIdx, pIdx) => {
    const target = formData.blocks[bIdx]?.subpoints?.[pIdx];
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = nextBlocks[bIdx].subpoints.filter((_, idx) => idx !== pIdx);
      nextBlocks[bIdx] = {...nextBlocks[bIdx], subpoints};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
    if (target?.title) {
      toast(`Punto eliminado`);
    }
  };

  const moveSubpoint = (bIdx, pIdx, direction) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = [...nextBlocks[bIdx].subpoints];
      const targetIdx = pIdx + direction;
      if (targetIdx < 0 || targetIdx >= subpoints.length) return prev;
      const [item] = subpoints.splice(pIdx, 1);
      subpoints.splice(targetIdx, 0, item);
      nextBlocks[bIdx] = {...nextBlocks[bIdx], subpoints};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const handleSave = () => {
    const computed = computePlannerTimes(formData);
    onSave(computed);
  };

  // Time Budget metrics
  const totalAllocated = formData.totalCalculatedDuration || 0;
  const targetDuration = formData.targetDuration || 60;
  const budgetPercentage = Math.min(Math.round((totalAllocated / targetDuration) * 100), 100);
  const isOverBudget = totalAllocated > targetDuration;
  const diffMinutes = Math.abs(targetDuration - totalAllocated);

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/40 p-3 rounded-xl border border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Editor de Sesión & Agenda</h1>
          <p className="text-xs text-muted">
            Configura los detalles de la reunión, bloques de tiempo y participantes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onPress={handleSave} className="font-semibold">
            <Check width={14} height={14} /> Guardar Cambios
          </Button>
        </div>
      </div>

      {/* 1. Metadatos de la Sesión */}
      <Card className="p-4 sm:p-5 bg-surface border border-border rounded-xl flex flex-col gap-3.5">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
          Información General
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Título de la Sesión
            </Label>
            <Input
              value={formData.title}
              onChange={(e) => updateHeaderField('title', e.target.value)}
              placeholder="Ej: Weekly de Producto"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Organizador / Conduce
            </Label>
            <Input
              value={formData.host || ''}
              onChange={(e) => updateHeaderField('host', e.target.value)}
              placeholder="Ej: Paula Molina"
            />
          </TextField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Fecha
            </Label>
            <Input
              type="date"
              value={formData.date || ''}
              onChange={(e) => updateHeaderField('date', e.target.value)}
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Hora de Inicio
            </Label>
            <Input
              type="time"
              value={formData.startTime || '10:00'}
              onChange={(e) => updateHeaderField('startTime', e.target.value)}
              className="font-mono"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Presupuesto Objetivo
            </Label>
            <Input
              value={targetDurationInput}
              onChange={(e) => handleTargetDurationChange(e.target.value)}
              placeholder="ej: 1h, 60m, 3h"
              className="font-mono"
            />
          </TextField>
        </div>

        <TextField className="w-full">
          <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Contexto y Objetivos (Opcional)
          </Label>
          <TextArea
            value={formData.description || ''}
            onChange={(e) => updateHeaderField('description', e.target.value)}
            placeholder="Describe el propósito y lo que se espera lograr en la reunión..."
          />
        </TextField>

        <TextField className="w-full">
          <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Participantes Convocados (@menciones de Discord)
          </Label>
          <Input
            value={formData.mentions || ''}
            onChange={(e) => updateHeaderField('mentions', e.target.value)}
            placeholder="@Usuario1 @Usuario2"
            className="font-mono"
          />
        </TextField>
      </Card>

      {/* 2. Time Budget Bar (Using Native HeroUI v3 ProgressBar Anatomy) */}
      <Card className="p-4 bg-surface border border-border rounded-xl">
        <div className="flex items-center justify-between gap-4 mb-2 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span>⏱️</span>
            <strong className="text-foreground">Presupuesto de Tiempo</strong>
          </div>
          <div className="font-mono text-muted text-xs">
            <strong className="text-foreground">{totalAllocated}m</strong> / {targetDuration}m ({budgetPercentage}%)
            {isOverBudget ? (
              <span className="text-danger font-bold ml-2">⚠️ Excedido en {diffMinutes}m</span>
            ) : (
              <span className="text-muted ml-2">· {diffMinutes}m disponibles</span>
            )}
          </div>
        </div>

        <ProgressBar
          aria-label="Presupuesto de tiempo de la sesión"
          value={budgetPercentage}
          color={isOverBudget ? 'danger' : 'accent'}
          size="sm"
          className="w-full"
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      </Card>

      {/* 3. Bloques y Puntos de Revisión */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Bloques de la Agenda</h2>
            <p className="text-xs text-muted">
              Organiza los temas en bloques secuenciales.
            </p>
          </div>
          <Button variant="secondary" size="sm" onPress={addBlock}>
            <Plus width={14} height={14} /> Añadir Bloque
          </Button>
        </div>

        {formData.blocks.length === 0 ? (
          <div className="p-8 border border-dashed border-border rounded-xl text-center bg-surface-secondary/20 flex flex-col items-center gap-2">
            <p className="text-xs text-muted">No hay bloques en la agenda.</p>
            <Button variant="primary" size="sm" onPress={addBlock}>
              <Plus width={14} height={14} /> Crear primer bloque
            </Button>
          </div>
        ) : (
          formData.blocks.map((block, bIdx) => {
            const hasPoints = (block.subpoints || []).length > 0;
            return (
              <Card key={block.id || bIdx} className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded uppercase tracking-wider">
                      Bloque #{bIdx + 1}
                    </span>
                    <span className="text-xs text-muted font-mono font-medium">
                      {block.durationMinutes} min {block.isAutoCalculated && '(suma automática)'}
                    </span>
                  </div>

                  <Dropdown>
                    <Dropdown.Trigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        isIconOnly
                        aria-label={`Opciones del bloque ${block.title}`}
                      >
                        <EllipsisVertical width={14} height={14} />
                      </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        onAction={(key) => {
                          if (key === 'delete') confirmDeleteBlock(bIdx);
                        }}
                      >
                        <Dropdown.Item id="delete" variant="danger" textValue="Eliminar bloque">
                          <TrashBin />
                          <Label>Eliminar bloque</Label>
                          <Description>Quitar de la agenda</Description>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>

                {/* Title */}
                <TextField className="w-full">
                  <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Título del Bloque
                  </Label>
                  <Input
                    value={block.title}
                    onChange={(e) => updateBlockField(bIdx, 'title', e.target.value)}
                    placeholder="Título del bloque..."
                    className="font-semibold text-foreground"
                  />
                </TextField>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <TextField className="w-full">
                    <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Conduce
                    </Label>
                    <Input
                      value={block.leader || ''}
                      onChange={(e) => updateBlockField(bIdx, 'leader', e.target.value)}
                      placeholder="Ej: Paula, Cami"
                    />
                  </TextField>

                  <TextField className="w-full">
                    <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Participantes
                    </Label>
                    <Input
                      value={block.participants || ''}
                      onChange={(e) => updateBlockField(bIdx, 'participants', e.target.value)}
                      placeholder="Ej: Todo el equipo"
                    />
                  </TextField>

                  <TextField className="w-full">
                    <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Duración Manual
                    </Label>
                    <Input
                      value={hasPoints ? `${block.durationMinutes} min (auto)` : `${block.manualDuration || block.durationMinutes} min`}
                      disabled={hasPoints}
                      onChange={(e) => updateBlockManualDuration(bIdx, e.target.value)}
                      className="font-mono text-center"
                      title={hasPoints ? 'La duración se calcula automáticamente con la suma de los puntos' : 'Duración asignada manualmente'}
                    />
                  </TextField>
                </div>

                {/* Subpoints section */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold uppercase tracking-wider">
                    <span>Puntos de Revisión ({block.subpoints?.length || 0})</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {(block.subpoints || []).map((p, pIdx) => {
                      const currentRaw = (p.rawTime || '').trim().toLowerCase();
                      const matchedPreset = PRESET_DURATIONS.find(
                        (pr) => currentRaw === pr || currentRaw === `${pr.replace('m', '')} min`
                      );

                      return (
                        <div
                          key={p.id || pIdx}
                          className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-secondary/40 border border-border"
                        >
                          {/* Reorder controls */}
                          <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, -1)}
                              disabled={pIdx === 0}
                              className="h-6 w-6 p-0 min-w-0 text-muted hover:text-foreground disabled:opacity-20"
                              aria-label="Subir punto"
                            >
                              <ChevronUp width={14} height={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, 1)}
                              disabled={pIdx === (block.subpoints.length - 1)}
                              className="h-6 w-6 p-0 min-w-0 text-muted hover:text-foreground disabled:opacity-20"
                              aria-label="Bajar punto"
                            >
                              <ChevronDown width={14} height={14} />
                            </Button>
                          </div>

                          <div className="flex-1 flex flex-col gap-2">
                            <TextField className="w-full">
                              <Input
                                value={p.title}
                                onChange={(e) => updateSubpointField(bIdx, pIdx, 'title', e.target.value)}
                                placeholder="Tema a revisar (ej: Prototipo navegable)..."
                                aria-label={`Tema del punto ${pIdx + 1}`}
                                className="w-full font-medium text-foreground bg-transparent"
                              />
                            </TextField>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted font-medium">Presets:</span>
                                <ToggleButtonGroup
                                  selectionMode="single"
                                  size="sm"
                                  selectedKeys={matchedPreset ? [matchedPreset] : []}
                                  onSelectionChange={(keys) => {
                                    const selected = [...keys][0];
                                    if (selected) {
                                      setQuickSubpointTime(bIdx, pIdx, String(selected));
                                    }
                                  }}
                                >
                                  {PRESET_DURATIONS.map((timePreset, i) => (
                                    <ToggleButton key={timePreset} id={timePreset} aria-label={timePreset}>
                                      {i > 0 && <ToggleButtonGroup.Separator />}
                                      {timePreset}
                                    </ToggleButton>
                                  ))}
                                </ToggleButtonGroup>

                                <TextField className="w-20">
                                  <Input
                                    value={p.rawTime || ''}
                                    onChange={(e) => updateSubpointField(bIdx, pIdx, 'rawTime', e.target.value)}
                                    placeholder="Tiempo"
                                    aria-label="Tiempo personalizado"
                                    className="font-mono text-center"
                                  />
                                </TextField>

                                <TextField className="w-32">
                                  <Input
                                    value={p.presenter || ''}
                                    onChange={(e) => updateSubpointField(bIdx, pIdx, 'presenter', e.target.value)}
                                    placeholder="👤 Presentador"
                                    aria-label="Presentador asignado"
                                  />
                                </TextField>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                onPress={() => removeSubpoint(bIdx, pIdx)}
                                className="text-danger hover:text-danger h-7 w-7 p-0 min-w-0"
                                aria-label={`Eliminar punto ${p.title || pIdx + 1}`}
                              >
                                <TrashBin width={14} height={14} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => addSubpoint(bIdx)}
                    className="w-full border-dashed mt-1"
                  >
                    <Plus width={14} height={14} /> Añadir Punto de Revisión
                  </Button>
                </div>
              </Card>
            );
          })
        )}

        <Button
          variant="secondary"
          size="md"
          onPress={addBlock}
          className="w-full border-dashed py-3 font-semibold"
        >
          <Plus width={16} height={16} /> Añadir Nuevo Bloque a la Agenda
        </Button>
      </div>

      {/* AlertDialog de confirmación destructiva oficial de HeroUI v3 */}
      {blockToDelete && (
        <AlertDialog isOpen={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
          <AlertDialog.Backdrop />
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px] p-5 rounded-2xl bg-surface border border-border shadow-2xl">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading className="text-base font-bold text-foreground">
                  ¿Eliminar este bloque de la agenda?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="text-xs text-muted mt-2">
                <p>
                  Se eliminará <strong>&ldquo;{blockToDelete.title}&rdquo;</strong> con sus{' '}
                  <strong>{blockToDelete.pointsCount} puntos de revisión</strong> y notas asociadas.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="mt-4 flex items-center justify-end gap-2">
                <Button slot="close" variant="ghost" size="sm" onPress={() => setBlockToDelete(null)}>
                  Cancelar
                </Button>
                <Button
                  slot="close"
                  variant="danger"
                  size="sm"
                  className="font-semibold"
                  onPress={() => executeDeleteBlock(blockToDelete.index)}
                >
                  Eliminar Bloque
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog>
      )}
    </div>
  );
}
