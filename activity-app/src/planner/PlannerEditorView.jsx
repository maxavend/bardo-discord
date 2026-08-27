import {useState, useEffect} from 'react';
import {
  AlertDialog,
  Button,
  Calendar,
  Card,
  DateField,
  DatePicker,
  TimeField,
  Input,
  TextArea,
  TextField,
  Label,
  ProgressBar,
  Dropdown,
  Description,
  toast,
} from '@heroui/react';
import {parseDate, parseTime} from '@internationalized/date';
import {
  Plus,
  TrashBin,
  Check,
  ChevronUp,
  ChevronDown,
  EllipsisVertical,
  Clock,
  TriangleExclamation,
} from '@gravity-ui/icons';
import {
  computePlannerTimes,
  parseSmartDuration,
  formatShortDuration,
} from './time-engine.js';
import {PlannerMemberPicker} from './PlannerMemberPicker.jsx';

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

  const updateBlockDuration = (bIdx, value) => {
    const parsed = parseSmartDuration(value);
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      nextBlocks[bIdx] = {
        ...nextBlocks[bIdx],
        durationMinutes: parsed || 30,
      };
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const addBlock = () => {
    const newId = `b-${Date.now()}`;
    setFormData((prev) => {
      const nextBlocks = [
        ...prev.blocks,
        {
          id: newId,
          title: `Bloque #${prev.blocks.length + 1}`,
          durationMinutes: 30,
          leader: '',
          participants: '',
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
    const newPointId = `p-${Date.now()}`;
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = [
        ...(nextBlocks[bIdx].subpoints || []),
        {
          id: newPointId,
          title: '',
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

  const removeSubpoint = (bIdx, pIdx) => {
    const target = formData.blocks[bIdx]?.subpoints?.[pIdx];
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const subpoints = nextBlocks[bIdx].subpoints.filter((_, idx) => idx !== pIdx);
      nextBlocks[bIdx] = {...nextBlocks[bIdx], subpoints};
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
    if (target?.title) {
      toast('Punto eliminado');
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
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar (no contained) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Editor de sesión</h1>
          <p className="text-xs text-muted">
            Configura los detalles de la reunión, bloques de tiempo y participantes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onPress={handleSave}>
            <Check width={14} height={14} /> Guardar cambios
          </Button>
        </div>
      </div>

      {/* 1. Información General */}
      <Card className="p-4 sm:p-5 flex flex-col gap-3.5">
        <h2 className="text-sm font-semibold text-foreground">
          Información general
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField className="w-full">
            <Label className="text-xs font-medium text-muted">
              Título de la sesión
            </Label>
            <Input
              value={formData.title}
              onChange={(e) => updateHeaderField('title', e.target.value)}
              placeholder="Ej: Weekly de Producto"
            />
          </TextField>

          <TextField className="w-full">
            <Label className="text-xs font-medium text-muted">
              Organizador / Conduce
            </Label>
            <Input
              value={formData.host || ''}
              onChange={(e) => updateHeaderField('host', e.target.value)}
              placeholder="Ej: Paula Molina"
            />
          </TextField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DatePicker
            className="w-full"
            value={formData.date ? (() => {
              try {
                return parseDate(formData.date);
              } catch {
                return null;
              }
            })() : null}
            onChange={(val) => {
              if (val) {
                updateHeaderField(
                  'date',
                  `${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`
                );
              } else {
                updateHeaderField('date', '');
              }
            }}
          >
            <Label className="text-xs font-medium text-muted">Fecha</Label>
            <DateField.Group fullWidth>
              <DateField.Input>
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateField.Suffix>
                <DatePicker.Trigger>
                  <DatePicker.TriggerIndicator />
                </DatePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            <DatePicker.Popover>
              <Calendar aria-label="Fecha de la sesión">
                <Calendar.Header>
                  <Calendar.YearPickerTrigger>
                    <Calendar.YearPickerTriggerHeading />
                    <Calendar.YearPickerTriggerIndicator />
                  </Calendar.YearPickerTrigger>
                  <Calendar.NavButton slot="previous" />
                  <Calendar.NavButton slot="next" />
                </Calendar.Header>
                <Calendar.Grid>
                  <Calendar.GridHeader>
                    {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                  </Calendar.GridHeader>
                  <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                </Calendar.Grid>
                <Calendar.YearPickerGrid>
                  <Calendar.YearPickerGridBody>
                    {({year}) => <Calendar.YearPickerCell year={year} />}
                  </Calendar.YearPickerGridBody>
                </Calendar.YearPickerGrid>
              </Calendar>
            </DatePicker.Popover>
          </DatePicker>

          <TimeField
            className="w-full"
            value={formData.startTime ? (() => {
              try {
                return parseTime(formData.startTime);
              } catch {
                return null;
              }
            })() : null}
            onChange={(val) => {
              if (val) {
                updateHeaderField(
                  'startTime',
                  `${String(val.hour).padStart(2, '0')}:${String(val.minute).padStart(2, '0')}`
                );
              } else {
                updateHeaderField('startTime', '10:00');
              }
            }}
          >
            <Label className="text-xs font-medium text-muted">Hora de inicio</Label>
            <TimeField.Group fullWidth>
              <TimeField.Input>
                {(segment) => <TimeField.Segment segment={segment} />}
              </TimeField.Input>
            </TimeField.Group>
          </TimeField>

          <TextField className="w-full">
            <Label className="text-xs font-medium text-muted">
              Presupuesto objetivo
            </Label>
            <Input
              value={targetDurationInput}
              onChange={(e) => handleTargetDurationChange(e.target.value)}
              placeholder="ej: 1h, 60m, 3h"
            />
          </TextField>
        </div>

        <TextField className="w-full">
          <Label className="text-xs font-medium text-muted">
            Contexto y objetivos (opcional)
          </Label>
          <TextArea
            value={formData.description || ''}
            onChange={(e) => updateHeaderField('description', e.target.value)}
            placeholder="Describe el propósito y lo que se espera lograr en la reunión..."
          />
        </TextField>

        <div className="flex flex-col gap-1.5 w-full">
          <Label className="text-xs font-medium text-muted">
            Participantes convocados (@menciones de Discord)
          </Label>
          <PlannerMemberPicker
            value={formData.mentions || ''}
            onChange={(val) => updateHeaderField('mentions', val)}
          />
        </div>
      </Card>

      {/* 2. Presupuesto de Tiempo */}
      <Card className="p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <Clock width={14} height={14} className="text-muted" />
            <strong className="text-foreground">Presupuesto de tiempo</strong>
          </div>
          <div className="text-muted text-xs flex items-center gap-1.5">
            <strong className="text-foreground">{totalAllocated}m</strong> / {targetDuration}m
            {isOverBudget ? (
              <span className="text-danger font-semibold ml-2 flex items-center gap-1">
                <TriangleExclamation width={12} height={12} />
                <span>Excedido en {diffMinutes}m</span>
              </span>
            ) : diffMinutes === 0 ? (
              <span className="text-success font-medium ml-2">· Tiempo exacto</span>
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

      {/* 3. Bloques de la Agenda */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Bloques de la agenda</h2>
            <p className="text-xs text-muted">
              Organiza los temas en bloques secuenciales con su respectiva duración.
            </p>
          </div>
          <Button variant="secondary" size="sm" onPress={addBlock}>
            <Plus width={14} height={14} /> Añadir bloque
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
            return (
              <Card key={block.id || bIdx} className="p-4 sm:p-5 flex flex-col gap-3.5">
                {/* Header del bloque */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded">
                      Bloque 0{bIdx + 1}
                    </span>
                    <span className="text-xs text-muted font-medium">
                      {block.durationMinutes} min
                    </span>
                  </div>

                  <Dropdown>
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      aria-label={`Opciones del bloque ${block.title}`}
                    >
                      <EllipsisVertical width={14} height={14} />
                    </Button>
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

                {/* Título y metadatos principales */}
                <div className="flex flex-col gap-2.5">
                  <TextField className="w-full">
                    <Label className="text-xs font-medium text-muted">
                      Título del bloque
                    </Label>
                    <Input
                      value={block.title}
                      onChange={(e) => updateBlockField(bIdx, 'title', e.target.value)}
                      placeholder="Título del bloque..."
                      className="font-semibold text-foreground text-sm"
                    />
                  </TextField>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Conduce
                      </Label>
                      <Input
                        value={block.leader || ''}
                        onChange={(e) => updateBlockField(bIdx, 'leader', e.target.value)}
                        placeholder="Ej: Paula, Cami"
                      />
                    </TextField>

                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Participantes
                      </Label>
                      <Input
                        value={block.participants || ''}
                        onChange={(e) => updateBlockField(bIdx, 'participants', e.target.value)}
                        placeholder="Ej: Todo el equipo"
                      />
                    </TextField>

                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Duración del bloque
                      </Label>
                      <Input
                        value={`${block.durationMinutes}m`}
                        onChange={(e) => updateBlockDuration(bIdx, e.target.value)}
                        placeholder="ej: 30m, 1h"
                        className="text-center font-medium"
                      />
                    </TextField>
                  </div>
                </div>

                {/* Sección de Puntos de Revisión con Progressive Disclosure (sin tiempo individual) */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-xs text-muted font-medium">
                    <span>Puntos de revisión ({block.subpoints?.length || 0})</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {(block.subpoints || []).map((p, pIdx) => {
                      return (
                        <div
                          key={p.id || pIdx}
                          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-lg bg-surface-secondary/40"
                        >
                          {/* Flechitas directas para cambiar de posición */}
                          <div className="flex items-center gap-0.5 shrink-0 self-end sm:self-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, -1)}
                              isDisabled={pIdx === 0}
                              aria-label="Subir punto"
                            >
                              <ChevronUp width={14} height={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              onPress={() => moveSubpoint(bIdx, pIdx, 1)}
                              isDisabled={pIdx === (block.subpoints.length - 1)}
                              aria-label="Bajar punto"
                            >
                              <ChevronDown width={14} height={14} />
                            </Button>
                          </div>

                          {/* Input del Título del punto */}
                          <div className="flex-1 min-w-0">
                            <Input
                              value={p.title}
                              onChange={(e) => updateSubpointField(bIdx, pIdx, 'title', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addSubpoint(bIdx);
                                }
                              }}
                              placeholder="Tema a revisar... [Enter para añadir siguiente]"
                              className="font-medium text-foreground text-sm w-full"
                              aria-label={`Tema del punto ${pIdx + 1}`}
                            />
                          </div>

                          {/* Input del Responsable */}
                          <div className="w-full sm:w-48 shrink-0">
                            <Input
                              value={p.presenter || ''}
                              onChange={(e) => updateSubpointField(bIdx, pIdx, 'presenter', e.target.value)}
                              placeholder="Responsable (@Nombre)"
                              className="text-xs w-full"
                              aria-label="Responsable asignado"
                            />
                          </div>

                          {/* Botón Eliminar */}
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            onPress={() => removeSubpoint(bIdx, pIdx)}
                            aria-label={`Eliminar punto ${p.title || pIdx + 1}`}
                            className="text-danger shrink-0 self-end sm:self-center"
                          >
                            <TrashBin width={14} height={14} />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => addSubpoint(bIdx)}
                    className="w-full justify-start text-xs text-muted hover:text-foreground mt-1"
                  >
                    <Plus width={13} height={13} /> Añadir punto de revisión
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
          className="w-full py-3 font-semibold"
        >
          <Plus width={15} height={15} /> Añadir nuevo bloque a la agenda
        </Button>
      </div>

      {/* AlertDialog de confirmación destructiva */}
      {blockToDelete && (
        <AlertDialog isOpen={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-[420px]">
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
                    onPress={() => executeDeleteBlock(blockToDelete.index)}
                  >
                    Eliminar bloque
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
