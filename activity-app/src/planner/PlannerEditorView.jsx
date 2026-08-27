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
  toast,
} from '@heroui/react';
import {
  Plus,
  TrashBin,
  Check,
  ChevronUp,
  ChevronDown,
} from '@gravity-ui/icons';
import {
  computePlannerTimes,
  parseSmartDuration,
  formatShortDuration,
} from './time-engine.js';

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
          leader: 'Equipo',
          participants: 'Todo el equipo',
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
    // Si el bloque está completamente vacío, lo eliminamos sin confirmación
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
      toast(`Punto "${target.title.slice(0, 20)}..." eliminado`);
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
  const targetDuration = formData.targetDuration || 180;
  const budgetPercentage = Math.min(Math.round((totalAllocated / targetDuration) * 100), 100);
  const isOverBudget = totalAllocated > targetDuration;
  const diffMinutes = Math.abs(targetDuration - totalAllocated);

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/40 p-3 rounded-xl border border-border/50">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Editor de Agenda & Sesión</h1>
          <p className="text-xs text-muted">
            Configura los bloques, time budget y presentadores asignados.
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
      <Card className="p-4 sm:p-5 bg-surface border border-border rounded-xl flex flex-col gap-3.5 shadow-none">
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
              placeholder="Ej: Weekly Diseño & SD"
              className="text-xs font-medium h-9"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Organizador / Conduce
            </Label>
            <Input
              value={formData.host}
              onChange={(e) => updateHeaderField('host', e.target.value)}
              placeholder="Ej: Paula Molina"
              className="text-xs h-9"
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
              value={formData.date}
              onChange={(e) => updateHeaderField('date', e.target.value)}
              className="text-xs h-9"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Hora de Inicio
            </Label>
            <Input
              type="time"
              value={formData.startTime}
              onChange={(e) => updateHeaderField('startTime', e.target.value)}
              className="text-xs font-mono h-9"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Presupuesto Objetivo
            </Label>
            <Input
              value={targetDurationInput}
              onChange={(e) => handleTargetDurationChange(e.target.value)}
              placeholder="ej: 3h, 180 min"
              className="text-xs font-mono h-9"
            />
          </TextField>
        </div>

        <TextField className="w-full">
          <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Mensaje de Contexto para el Equipo
          </Label>
          <TextArea
            value={formData.description}
            onChange={(e) => updateHeaderField('description', e.target.value)}
            placeholder="Escribe el contexto y objetivos de la sesión..."
            className="min-h-[60px] text-xs"
          />
        </TextField>

        <TextField className="w-full">
          <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Participantes Convocados (@menciones de Discord)
          </Label>
          <Input
            value={formData.mentions}
            onChange={(e) => updateHeaderField('mentions', e.target.value)}
            placeholder="@Usuario1 @Usuario2"
            className="text-xs font-mono h-9"
          />
        </TextField>
      </Card>

      {/* 2. Time Budget Bar (Calendly Style with HeroUI native ProgressBar) */}
      <Card className="p-4 bg-surface border border-border rounded-xl shadow-none">
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
              <span className="text-muted ml-2">· {diffMinutes}m libres</span>
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
          <ProgressBar.Track className="h-2 rounded-full bg-surface-secondary">
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
              Los subpuntos calculan automáticamente la duración del bloque y el horario acumulado.
            </p>
          </div>
          <Button variant="secondary" size="sm" onPress={addBlock} className="text-xs h-8">
            <Plus width={13} height={13} /> Añadir Bloque
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
              <Card key={block.id || bIdx} className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-3 shadow-none">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded uppercase tracking-wider">
                      Bloque #{bIdx + 1}
                    </span>
                    <span className="text-xs text-muted font-mono font-medium">
                      {block.durationMinutes} min {block.isAutoCalculated && '(suma automática)'}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => confirmDeleteBlock(bIdx)}
                    className="text-danger hover:text-danger text-xs h-7 px-2"
                    aria-label={`Eliminar bloque ${block.title}`}
                  >
                    <TrashBin width={13} height={13} /> Eliminar
                  </Button>
                </div>

                {/* Accessible Title input */}
                <TextField className="w-full">
                  <Label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Título del Bloque
                  </Label>
                  <Input
                    value={block.title}
                    onChange={(e) => updateBlockField(bIdx, 'title', e.target.value)}
                    placeholder="Título del bloque..."
                    className="text-sm font-semibold text-foreground h-9"
                  />
                </TextField>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <TextField className="w-full">
                    <Label className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Conduce
                    </Label>
                    <Input
                      value={block.leader || ''}
                      onChange={(e) => updateBlockField(bIdx, 'leader', e.target.value)}
                      placeholder="Ej: Paula, Cami"
                      className="text-xs h-8"
                    />
                  </TextField>

                  <TextField className="w-full">
                    <Label className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Participantes
                    </Label>
                    <Input
                      value={block.participants || ''}
                      onChange={(e) => updateBlockField(bIdx, 'participants', e.target.value)}
                      placeholder="Ej: Todo el equipo"
                      className="text-xs h-8"
                    />
                  </TextField>

                  <TextField className="w-full">
                    <Label className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Duración Manual
                    </Label>
                    <Input
                      value={hasPoints ? `${block.durationMinutes} min (auto)` : `${block.manualDuration || block.durationMinutes} min`}
                      disabled={hasPoints}
                      onChange={(e) => updateBlockManualDuration(bIdx, e.target.value)}
                      className="text-xs font-mono text-center h-8"
                      title={hasPoints ? 'La duración se calcula automáticamente con la suma de los puntos' : 'Duración asignada manualmente'}
                    />
                  </TextField>
                </div>

                {/* Subpoints section */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-[11px] text-muted font-semibold uppercase tracking-wider">
                    <span>Puntos de Revisión ({block.subpoints?.length || 0})</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {(block.subpoints || []).map((p, pIdx) => {
                      const currentRaw = (p.rawTime || '').trim().toLowerCase();
                      return (
                        <div
                          key={p.id || pIdx}
                          className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-secondary/40 border border-border/50"
                        >
                          {/* Reorder controls */}
                          <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, -1)}
                              disabled={pIdx === 0}
                              className="h-5 w-5 min-w-0 p-0 text-muted hover:text-foreground disabled:opacity-20"
                              aria-label="Subir punto"
                            >
                              <ChevronUp width={12} height={12} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, 1)}
                              disabled={pIdx === (block.subpoints.length - 1)}
                              className="h-5 w-5 min-w-0 p-0 text-muted hover:text-foreground disabled:opacity-20"
                              aria-label="Bajar punto"
                            >
                              <ChevronDown width={12} height={12} />
                            </Button>
                          </div>

                          <div className="flex-1 flex flex-col gap-2">
                            <TextField className="w-full">
                              <Input
                                value={p.title}
                                onChange={(e) => updateSubpointField(bIdx, pIdx, 'title', e.target.value)}
                                placeholder="Tema a revisar (ej: Prototipo navegable - Mi Plan)..."
                                aria-label={`Tema del punto ${pIdx + 1}`}
                                className="w-full text-xs font-medium text-foreground bg-transparent h-7 px-1"
                              />
                            </TextField>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted font-medium">Presets:</span>
                                {['10m', '15m', '20m', '30m'].map((timePreset) => {
                                  const isSelected = currentRaw === timePreset || currentRaw === `${timePreset.replace('m', '')} min`;
                                  return (
                                    <Button
                                      key={timePreset}
                                      variant={isSelected ? 'primary' : 'secondary'}
                                      size="sm"
                                      onPress={() => setQuickSubpointTime(bIdx, pIdx, timePreset)}
                                      className={`h-6 px-1.5 py-0 text-[10px] font-mono ${
                                        isSelected ? 'font-semibold' : ''
                                      }`}
                                    >
                                      {timePreset}
                                    </Button>
                                  );
                                })}

                                <TextField className="w-16">
                                  <Input
                                    value={p.rawTime || ''}
                                    onChange={(e) => updateSubpointField(bIdx, pIdx, 'rawTime', e.target.value)}
                                    placeholder="Tiempo"
                                    aria-label="Tiempo personalizado"
                                    className="h-6 px-1.5 text-[11px] font-mono text-center"
                                  />
                                </TextField>

                                <TextField className="w-28">
                                  <Input
                                    value={p.presenter || ''}
                                    onChange={(e) => updateSubpointField(bIdx, pIdx, 'presenter', e.target.value)}
                                    placeholder="👤 Presentador"
                                    aria-label="Presentador asignado"
                                    className="h-6 px-1.5 text-[11px]"
                                  />
                                </TextField>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                onPress={() => removeSubpoint(bIdx, pIdx)}
                                className="text-danger hover:text-danger h-6 w-6 p-0 min-w-0"
                                aria-label={`Eliminar punto ${p.title || pIdx + 1}`}
                              >
                                <TrashBin width={12} height={12} />
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
                    className="w-full border-dashed text-xs mt-1 h-8"
                  >
                    <Plus width={12} height={12} /> Añadir Punto de Revisión
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
          className="w-full border-dashed py-3 font-semibold text-xs"
        >
          <Plus width={14} height={14} /> Añadir Nuevo Bloque a la Agenda
        </Button>
      </div>

      {/* AlertDialog de confirmación destructiva oficial de HeroUI v3 */}
      {blockToDelete && (
        <AlertDialog isOpen={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
          <AlertDialog.Backdrop>
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
                    Se eliminará permanentemente <strong>&ldquo;{blockToDelete.title}&rdquo;</strong> con sus{' '}
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
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
    </div>
  );
}

