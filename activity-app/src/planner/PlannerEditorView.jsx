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
} from '@gravity-ui/icons';
import {
  computePlannerTimes,
  parseSmartDuration,
  formatShortDuration,
} from './time-engine.js';
import {PlannerMemberPicker} from './PlannerMemberPicker.jsx';
import {fieldValue} from './planner-field-value.js';

function formatDurationCompact(minutes = 0) {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours > 0 && rem === 0) return `${hours}h`;
  if (hours > 0) return `${hours}h${rem < 10 ? `0${rem}` : rem}`;
  return `${minutes} min`;
}

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
    if (parsed > 0) {
      updateHeaderField('targetDuration', parsed);
    }
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
        },
      ];
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
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

  const _moveBlock = (index, direction) => {
    setFormData((prev) => {
      const nextBlocks = [...prev.blocks];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextBlocks.length) return prev;
      const [moved] = nextBlocks.splice(index, 1);
      nextBlocks.splice(targetIndex, 0, moved);
      return computePlannerTimes({...prev, blocks: nextBlocks});
    });
  };

  const confirmDeleteBlock = (bIdx) => {
    const target = formData.blocks[bIdx];
    if (!target) return;
    if ((target.subpoints || []).length === 0 && (target.decisions || []).length === 0) {
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

  // Time metrics
  const totalAllocated = formData.totalCalculatedDuration || 0;
  const targetDuration = formData.targetDuration || totalAllocated || 60;
  const isOverBudget = totalAllocated > targetDuration;
  const diffMinutes = Math.abs(targetDuration - totalAllocated);

  return (
    <div className="w-full max-w-4xl mx-auto pb-16 pt-2 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
        {/* Timeline Spacer */}
        <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />

        {/* Content Column */}
        <div className="flex flex-col gap-5 min-w-0 w-full">
          {/* Header bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Editor de sesión</h1>
              <p className="text-xs text-muted">
                Configura los detalles de la reunión, bloques de tiempo y participantes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onPress={onCancel} className="h-8 px-3">
                Cancelar
              </Button>
              <Button variant="primary" size="sm" onPress={handleSave} className="h-8 px-3.5">
                <Check width={14} height={14} /> Guardar cambios
              </Button>
            </div>
          </div>

          {/* 1. Información General */}
          <Card className="p-5 sm:p-6 flex flex-col gap-4 rounded-xl">
            <h2 className="text-sm font-semibold text-foreground">
              Información general
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField className="w-full">
                <Label className="text-xs font-medium text-muted">
                  Título de la sesión
                </Label>
                <Input
                  value={formData.title}
                  onChange={(value) => updateHeaderField('title', fieldValue(value))}
                  placeholder="Ej: Weekly de Producto"
                />
              </TextField>

              <TextField className="w-full">
                <Label className="text-xs font-medium text-muted">
                  Organizador / Conduce
                </Label>
                <Input
                  value={formData.host || ''}
                  onChange={(value) => updateHeaderField('host', fieldValue(value))}
                  placeholder="Ej: Paula Molina"
                />
              </TextField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <Label className="text-xs font-medium text-muted">Hora</Label>
                <TimeField.Group fullWidth>
                  <TimeField.Input>
                    {(segment) => <TimeField.Segment segment={segment} />}
                  </TimeField.Input>
                </TimeField.Group>
              </TimeField>

              <TextField className="w-full">
                <Label className="text-xs font-medium text-muted">
                  Duración prevista
                </Label>
                <Input
                  value={targetDurationInput}
                  onChange={(value) => handleTargetDurationChange(fieldValue(value))}
                  placeholder="ej: 1h, 60m, 3h"
                />
              </TextField>
            </div>

            <TextField className="w-full">
              <Label className="text-xs font-medium text-muted">
                Contexto
              </Label>
              <TextArea
                value={formData.description || ''}
                onChange={(value) => updateHeaderField('description', fieldValue(value))}
                placeholder="Describe el propósito y lo que se espera lograr en la reunión..."
              />
            </TextField>

            <div className="flex flex-col gap-1.5 w-full">
              <Label className="text-xs font-medium text-muted">
                Participantes
              </Label>
              <PlannerMemberPicker
                value={formData.mentions || ''}
                onChange={(val) => updateHeaderField('mentions', val)}
              />
            </div>
          </Card>

          {/* 2. Bloques de la Agenda */}
          <div className="flex flex-col gap-4">
            <div className="flex items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Bloques de la agenda</h2>
                <p className="text-xs text-muted mt-0.5">
                  {formData.blocks.length} {formData.blocks.length === 1 ? 'bloque' : 'bloques'} · {formatDurationCompact(totalAllocated)}
                  {isOverBudget ? (
                    <>
                      {' · '}
                      <span className="text-warning font-medium">
                        {diffMinutes} min sobre la duración prevista
                      </span>
                    </>
                  ) : diffMinutes > 0 ? (
                    <>
                      {' · '}
                      <span>Quedan {diffMinutes} min sin asignar</span>
                    </>
                  ) : null}
                </p>
              </div>
              <Button variant="secondary" size="sm" onPress={addBlock} className="h-8 px-3 shrink-0">
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
              <Card key={block.id || bIdx} className="p-5 sm:p-6 flex flex-col gap-4">
                {/* Header del bloque */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded">
                      Bloque 0{bIdx + 1}
                    </span>
                    <span className="text-xs text-muted font-medium">
                      {block.durationMinutes} min
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
                    <Dropdown.Popover placement="bottom end">
                      <Dropdown.Menu
                        onAction={(key) => {
                          if (key === 'delete') confirmDeleteBlock(bIdx);
                        }}
                      >
                        <Dropdown.Item id="delete" textValue="Eliminar bloque" className="text-danger">
                          <TrashBin />
                          <Label className="text-danger">Eliminar bloque</Label>
                          <Description>Quitar de la agenda</Description>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>

                {/* Título y metadatos principales */}
                <div className="flex flex-col gap-3">
                  <TextField className="w-full">
                    <Label className="text-xs font-medium text-muted">
                      Título del bloque
                    </Label>
                    <Input
                      value={block.title}
                      onChange={(value) => updateBlockField(bIdx, 'title', fieldValue(value))}
                      placeholder="Título del bloque..."
                      className="font-semibold text-foreground text-sm"
                    />
                  </TextField>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Conduce
                      </Label>
                      <Input
                        value={block.leader || ''}
                        onChange={(value) => updateBlockField(bIdx, 'leader', fieldValue(value))}
                        placeholder="Ej: Paula, Cami"
                      />
                    </TextField>

                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Participantes
                      </Label>
                      <Input
                        value={block.participants || ''}
                        onChange={(value) => updateBlockField(bIdx, 'participants', fieldValue(value))}
                        placeholder="Ej: Todo el equipo"
                      />
                    </TextField>

                    <TextField className="w-full">
                      <Label className="text-xs font-medium text-muted">
                        Duración del bloque
                      </Label>
                      <Input
                        value={`${block.durationMinutes}m`}
                        onChange={(value) => updateBlockDuration(bIdx, fieldValue(value))}
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
                              onChange={(value) => updateSubpointField(bIdx, pIdx, 'title', fieldValue(value))}
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
                              onChange={(value) => updateSubpointField(bIdx, pIdx, 'presenter', fieldValue(value))}
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
      </div>
    </div>
  );
}
