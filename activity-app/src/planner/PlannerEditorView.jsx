import {useState, useEffect} from 'react';
import {
  Button,
  Card,
  Input,
  TextArea,
  TextField,
  Label,
} from '@heroui/react';
import {
  Plus,
  TrashBin,
  Grip,
  Check,
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
          title: 'Nuevo Bloque de Revisión',
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

  const removeBlock = (bIdx) => {
    setFormData((prev) => {
      const nextBlocks = prev.blocks.filter((_, idx) => idx !== bIdx);
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const addSubpoint = (bIdx) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = [
        ...(nextBlocks[bIdx].subpoints || []),
        {
          id: `p-${Date.now()}`,
          title: 'Nuevo tema de diseño',
          rawTime: '15 min',
          durationMinutes: 15,
          presenter: 'Maxi',
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
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = nextBlocks[bIdx].subpoints.filter((_, idx) => idx !== pIdx);
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
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Editor de Sesión & Agenda</h1>
          <p className="text-xs text-muted">
            Configura la sesión, time budget por bloques y puntos de revisión con cálculo automático.
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
      <Card className="p-6 bg-surface border border-border rounded-2xl flex flex-col gap-4">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
          Información General
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Título de la Sesión
            </Label>
            <Input
              value={formData.title}
              onChange={(e) => updateHeaderField('title', e.target.value)}
              placeholder="Ej: Weekly Diseño & SD"
              className="text-sm font-medium"
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
              className="text-sm"
            />
          </TextField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField className="w-full">
            <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Fecha
            </Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => updateHeaderField('date', e.target.value)}
              className="text-sm"
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
              className="text-sm font-mono"
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
              className="text-sm font-mono"
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
            className="min-h-[70px] text-sm"
          />
        </TextField>

        <TextField className="w-full">
          <Label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Participantes convocados (@menciones de Discord)
          </Label>
          <Input
            value={formData.mentions}
            onChange={(e) => updateHeaderField('mentions', e.target.value)}
            placeholder="@Usuario1 @Usuario2"
            className="text-sm font-mono"
          />
        </TextField>
      </Card>

      {/* 2. Time Budget Bar (Calendly Style) */}
      <Card className="p-5 bg-surface border border-border rounded-2xl">
        <div className="flex items-center justify-between gap-4 mb-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span>⏱️</span>
            <strong className="text-foreground">Presupuesto de Tiempo de la Sesión</strong>
          </div>
          <div className="font-mono text-muted">
            <strong className="text-foreground">{totalAllocated}m</strong> / {targetDuration}m ({budgetPercentage}%)
            {isOverBudget ? (
              <span className="text-danger font-bold ml-2">⚠️ Excedido en {diffMinutes}m</span>
            ) : (
              <span className="text-muted ml-2">· {diffMinutes}m libres</span>
            )}
          </div>
        </div>

        {/* Progress track */}
        <div className="w-full h-2.5 bg-surface-secondary rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-300 ${
              isOverBudget ? 'bg-danger' : 'bg-accent'
            }`}
            style={{width: `${budgetPercentage}%`}}
          />
        </div>
      </Card>

      {/* 3. Bloques y Puntos de Revisión */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Bloques y Puntos de Revisión</h2>
            <p className="text-xs text-muted">
              Los puntos de revisión suman automáticamente el tiempo asignado a cada bloque.
            </p>
          </div>
          <Button variant="secondary" size="sm" onPress={addBlock}>
            <Plus width={14} height={14} /> Añadir Bloque
          </Button>
        </div>

        {formData.blocks.map((block, bIdx) => {
          const hasPoints = (block.subpoints || []).length > 0;
          return (
            <Card key={block.id || bIdx} className="p-5 bg-surface border border-border rounded-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-md uppercase tracking-wider">
                    Bloque #{bIdx + 1}
                  </span>
                  <span className="text-xs text-muted font-mono font-medium">
                    {block.durationMinutes} min {block.isAutoCalculated && '(auto)'}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => removeBlock(bIdx)}
                  className="text-danger hover:text-danger text-xs h-7 px-2"
                >
                  <TrashBin width={13} height={13} /> Eliminar
                </Button>
              </div>

              {/* Ghost title input */}
              <input
                type="text"
                value={block.title}
                onChange={(e) => updateBlockField(bIdx, 'title', e.target.value)}
                placeholder="Título del bloque..."
                className="text-base font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-1 rounded transition-colors"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField className="w-full">
                  <Label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Conduce
                  </Label>
                  <Input
                    value={block.leader || ''}
                    onChange={(e) => updateBlockField(bIdx, 'leader', e.target.value)}
                    placeholder="Ej: Paula, Cami"
                    className="text-xs"
                  />
                </TextField>

                <TextField className="w-full">
                  <Label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Participantes
                  </Label>
                  <Input
                    value={block.participants || ''}
                    onChange={(e) => updateBlockField(bIdx, 'participants', e.target.value)}
                    placeholder="Ej: Todo el equipo"
                    className="text-xs"
                  />
                </TextField>

                <TextField className="w-full">
                  <Label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Duración Bloque
                  </Label>
                  <Input
                    value={hasPoints ? `${block.durationMinutes} min` : `${block.manualDuration || block.durationMinutes} min`}
                    disabled={hasPoints}
                    onChange={(e) => updateBlockManualDuration(bIdx, e.target.value)}
                    className="text-xs font-mono text-center"
                  />
                </TextField>
              </div>

              {/* Subpoints section */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between text-xs text-muted font-semibold uppercase tracking-wider">
                  <span>Puntos de Revisión</span>
                </div>

                <div className="flex flex-col gap-2">
                  {(block.subpoints || []).map((p, pIdx) => (
                    <div
                      key={p.id || pIdx}
                      className="flex items-start gap-2 p-3 rounded-xl bg-surface-secondary/40 border border-border/50"
                    >
                      <div className="text-muted/40 pt-1 select-none">
                        <Grip width={14} height={14} />
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          type="text"
                          value={p.title}
                          onChange={(e) => updateSubpointField(bIdx, pIdx, 'title', e.target.value)}
                          placeholder="Tema a revisar (ej: Prototipo navegable - Mi Plan)..."
                          className="w-full text-xs font-medium text-foreground bg-transparent border-none focus:outline-none"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted font-medium">Presets:</span>
                            {['10m', '15m', '20m', '30m'].map((timePreset) => (
                              <button
                                key={timePreset}
                                type="button"
                                onClick={() => setQuickSubpointTime(bIdx, pIdx, timePreset)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface hover:bg-accent/15 hover:text-accent border border-border transition-colors"
                              >
                                {timePreset}
                              </button>
                            ))}

                            <input
                              type="text"
                              value={p.rawTime || ''}
                              onChange={(e) => updateSubpointField(bIdx, pIdx, 'rawTime', e.target.value)}
                              placeholder="Tiempo"
                              className="w-16 h-6 px-1.5 rounded bg-surface border border-border text-[11px] font-mono text-foreground focus:outline-none focus:border-accent"
                            />

                            <input
                              type="text"
                              value={p.presenter || ''}
                              onChange={(e) => updateSubpointField(bIdx, pIdx, 'presenter', e.target.value)}
                              placeholder="👤 Presentador"
                              className="w-28 h-6 px-1.5 rounded bg-surface border border-border text-[11px] text-foreground focus:outline-none focus:border-accent"
                            />
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() => removeSubpoint(bIdx, pIdx)}
                            className="text-danger h-6 w-6 p-0 min-w-0"
                            aria-label="Eliminar punto"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => addSubpoint(bIdx)}
                  className="w-full border-dashed text-xs mt-1"
                >
                  <Plus width={12} height={12} /> Añadir Punto de Revisión
                </Button>
              </div>
            </Card>
          );
        })}

        <Button
          variant="secondary"
          size="md"
          onPress={addBlock}
          className="w-full border-dashed py-4 font-semibold text-sm"
        >
          <Plus width={16} height={16} /> Añadir Nuevo Bloque a la Agenda
        </Button>
      </div>
    </div>
  );
}
