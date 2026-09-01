import {useState, useEffect} from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dropdown } from '@/components/ui/dropdown-menu';
import { Modal } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
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


export function PlannerEditorView({
  initialState,
  onSave,
  onCancel,
}) {
  const [formData, setFormData] = useState(() => {
    return initialState ? JSON.parse(JSON.stringify(initialState)) : {
      title: 'Nueva reunión',
      date: new Date().toISOString().split('T')[0],
      startTime: '10:00',
      targetDuration: 60,
      description: '',
      mentions: '',
      blocks: [
        {
          id: 'b-1',
          title: 'Apertura y Objetivos',
          durationMinutes: 15,
          leader: '',
          participants: '',
          subpoints: [
            {id: 'sp-1', title: 'Bienvenida y contexto', presenter: ''},
          ],
        },
      ],
    };
  });

  const [targetDurationInput, setTargetDurationInput] = useState(() => {
    return formatShortDuration(formData.targetDuration || 60);
  });

  const [blockToDelete, setBlockToDelete] = useState(null);

  useEffect(() => {
    const computed = computePlannerTimes(formData);
    setFormData((prev) => ({
      ...prev,
      ...computed,
    }));
  }, []);

  const updateHeaderField = (field, value) => {
    setFormData((prev) => {
      const next = {...prev, [field]: value};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const handleTargetDurationChange = (rawInput) => {
    setTargetDurationInput(rawInput);
    const parsed = parseSmartDuration(rawInput);
    if (parsed !== null && parsed > 0) {
      updateHeaderField('targetDuration', parsed);
    }
  };

  const updateBlockField = (blockIndex, field, value) => {
    setFormData((prev) => {
      const blocks = [...prev.blocks];
      blocks[blockIndex] = {...blocks[blockIndex], [field]: value};
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const updateBlockDuration = (blockIndex, rawValue) => {
    const parsed = parseSmartDuration(rawValue);
    if (parsed !== null && parsed > 0) {
      updateBlockField(blockIndex, 'durationMinutes', parsed);
    }
  };

  const addBlock = () => {
    setFormData((prev) => {
      const newBlock = {
        id: `b-${Date.now()}`,
        title: `Bloque ${prev.blocks.length + 1}`,
        durationMinutes: 15,
        leader: '',
        participants: '',
        subpoints: [],
      };
      const blocks = [...prev.blocks, newBlock];
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const confirmDeleteBlock = (blockIndex) => {
    const target = formData.blocks[blockIndex];
    if (!target) return;
    setBlockToDelete({
      index: blockIndex,
      title: target.title || `Bloque ${blockIndex + 1}`,
      pointsCount: target.subpoints?.length || 0,
    });
  };

  const executeDeleteBlock = (blockIndex) => {
    setFormData((prev) => {
      const blocks = prev.blocks.filter((_, idx) => idx !== blockIndex);
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
    setBlockToDelete(null);
    toast('Bloque eliminado');
  };

  const addSubpoint = (blockIndex) => {
    setFormData((prev) => {
      const blocks = [...prev.blocks];
      const block = blocks[blockIndex];
      const newSubpoint = {
        id: `sp-${Date.now()}`,
        title: '',
        presenter: '',
      };
      blocks[blockIndex] = {
        ...block,
        subpoints: [...(block.subpoints || []), newSubpoint],
      };
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const updateSubpointField = (blockIndex, subpointIndex, field, value) => {
    setFormData((prev) => {
      const blocks = [...prev.blocks];
      const block = blocks[blockIndex];
      const subpoints = [...(block.subpoints || [])];
      subpoints[subpointIndex] = {...subpoints[subpointIndex], [field]: value};
      blocks[blockIndex] = {...block, subpoints};
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const removeSubpoint = (blockIndex, subpointIndex) => {
    setFormData((prev) => {
      const blocks = [...prev.blocks];
      const block = blocks[blockIndex];
      const subpoints = (block.subpoints || []).filter((_, idx) => idx !== subpointIndex);
      blocks[blockIndex] = {...block, subpoints};
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
    });
  };

  const moveSubpoint = (blockIndex, subpointIndex, direction) => {
    setFormData((prev) => {
      const blocks = [...prev.blocks];
      const block = blocks[blockIndex];
      const subpoints = [...(block.subpoints || [])];
      const targetIndex = subpointIndex + direction;
      if (targetIndex < 0 || targetIndex >= subpoints.length) return prev;
      const [moved] = subpoints.splice(subpointIndex, 1);
      subpoints.splice(targetIndex, 0, moved);
      blocks[blockIndex] = {...block, subpoints};
      const next = {...prev, blocks};
      return {...next, ...computePlannerTimes(next)};
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
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {initialState?.id ? 'Editar reunión' : 'Nueva reunión'}
              </h1>
              <p className="text-xs text-muted-foreground">
                Configura la agenda, facilidades y participantes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 px-3">
                Cancelar
              </Button>
              <Button variant="default" size="sm" onClick={handleSave} className="h-8 px-3.5">
                <Check width={14} height={14} /> {initialState?.id ? 'Guardar cambios' : 'Crear reunión'}
              </Button>
            </div>
          </div>

          {/* 1. Detalles */}
          <Card className="p-5 sm:p-6 flex flex-col gap-4 rounded-xl">
            <h2 className="text-sm font-semibold text-foreground">
              Detalles
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-medium text-foreground">Nombre</label>
                <Input
                  value={formData.title}
                  onChange={(e) => updateHeaderField('title', e.target.value)}
                  placeholder="Nombre de la reunión"
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-medium text-foreground">Organiza</label>
                <Input
                  value={formData.host || ''}
                  onChange={(e) => updateHeaderField('host', e.target.value)}
                  placeholder="Buscar persona"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-medium text-foreground">Fecha</label>
                <Input
                  type="date"
                  value={formData.date || ''}
                  onChange={(e) => updateHeaderField('date', e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-medium text-foreground">Hora</label>
                <Input
                  type="time"
                  value={formData.startTime || '10:00'}
                  onChange={(e) => updateHeaderField('startTime', e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-medium text-foreground">Duración prevista</label>
                <Input
                  value={targetDurationInput}
                  onChange={(e) => handleTargetDurationChange(e.target.value)}
                  placeholder="60 min"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-medium text-foreground">Objetivo</label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => updateHeaderField('description', e.target.value)}
                rows={2}
              />
              <span className="text-xs text-muted-foreground">
                Resume qué necesita resolver, revisar o decidir el equipo.
              </span>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-medium text-foreground">Participantes</label>
              <PlannerMemberPicker
                value={formData.mentions || ''}
                onChange={(val) => updateHeaderField('mentions', val)}
              />
            </div>
          </Card>

          {/* 2. Agenda */}
          <div className="flex flex-col gap-4">
            <div className="flex items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Agenda</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formData.blocks.length} {formData.blocks.length === 1 ? 'bloque' : 'bloques'} · {totalAllocated} de {targetDuration} min
                  {isOverBudget ? (
                    <>
                      {' · '}
                      <span className="text-amber-500 font-medium">
                        La agenda supera la duración prevista por {diffMinutes} min
                      </span>
                    </>
                  ) : diffMinutes > 0 ? (
                    <>
                      {' · '}
                      <span>Quedan {diffMinutes} min por asignar</span>
                    </>
                  ) : null}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={addBlock} className="h-8 px-3 shrink-0">
                <Plus width={14} height={14} /> Agregar bloque
              </Button>
            </div>

            {formData.blocks.length === 0 ? (
              <Card className="p-8 border border-dashed border-border/70 rounded-2xl text-center flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">No hay bloques en la agenda.</p>
                <Button variant="default" size="sm" onClick={addBlock}>
                  <Plus width={14} height={14} /> Crear primer bloque
                </Button>
              </Card>
            ) : (
              formData.blocks.map((block, bIdx) => {
                return (
                  <Card key={block.id || bIdx} className="p-5 sm:p-6 flex flex-col gap-4 rounded-2xl">
                    {/* Header del bloque */}
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                          Bloque {bIdx + 1}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {block.durationMinutes} min
                        </span>
                      </div>

                      <Dropdown>
                        <Dropdown.Trigger>
                          <Button
                            variant="ghost"
                            size="sm"
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
                            <Dropdown.Item id="delete" textValue="Eliminar bloque" className="text-destructive">
                              <div className="flex items-center gap-2">
                                <TrashBin />
                                <span className="text-destructive font-medium">Eliminar bloque</span>
                              </div>
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown>
                    </div>

                    {/* Título y metadatos principales */}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-medium text-foreground">Nombre</label>
                        <Input
                          value={block.title}
                          onChange={(e) => updateBlockField(bIdx, 'title', e.target.value)}
                          placeholder="Nombre del bloque"
                          className="font-semibold text-foreground text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-xs font-medium text-foreground">Facilita</label>
                          <Input
                            value={block.leader || ''}
                            onChange={(e) => updateBlockField(bIdx, 'leader', e.target.value)}
                            placeholder="Buscar persona"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-xs font-medium text-foreground">Participan</label>
                          <Input
                            value={block.participants || ''}
                            onChange={(e) => updateBlockField(bIdx, 'participants', e.target.value)}
                            placeholder="Buscar personas o roles"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-xs font-medium text-foreground">Duración</label>
                          <Input
                            value={`${block.durationMinutes}m`}
                            onChange={(e) => updateBlockDuration(bIdx, e.target.value)}
                            placeholder="30 min"
                            className="text-center font-medium"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sección de Temas */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                        <span>Temas ({block.subpoints?.length || 0})</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {(block.subpoints || []).map((p, pIdx) => {
                          return (
                            <Card
                              key={p.id || pIdx}
                              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl border border-border/40"
                            >
                              {/* Flechitas directas para cambiar de posición */}
                              <div className="flex items-center gap-0.5 shrink-0 self-end sm:self-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveSubpoint(bIdx, pIdx, -1)}
                                  disabled={pIdx === 0}
                                  title="Mover arriba"
                                  aria-label={`Mover «${p.title || 'tema'}» arriba`}
                                >
                                  <ChevronUp width={14} height={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveSubpoint(bIdx, pIdx, 1)}
                                  disabled={pIdx === (block.subpoints.length - 1)}
                                  title="Mover abajo"
                                  aria-label={`Mover «${p.title || 'tema'}» abajo`}
                                >
                                  <ChevronDown width={14} height={14} />
                                </Button>
                              </div>

                              {/* Input del Título del tema */}
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
                                  placeholder="Nombre del tema"
                                  className="font-medium text-foreground text-sm w-full"
                                  aria-label={`Nombre del tema ${pIdx + 1}`}
                                />
                              </div>

                              {/* Input del Responsable */}
                              <div className="w-full sm:w-48 shrink-0">
                                <Input
                                  value={p.presenter || ''}
                                  onChange={(e) => updateSubpointField(bIdx, pIdx, 'presenter', e.target.value)}
                                  placeholder="Buscar persona"
                                  className="text-xs w-full"
                                  aria-label="Responsable asignado"
                                />
                              </div>

                              {/* Botón Eliminar */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSubpoint(bIdx, pIdx)}
                                title="Eliminar tema"
                                aria-label={`Eliminar «${p.title || 'tema'}»`}
                                className="text-destructive shrink-0 self-end sm:self-center"
                              >
                                <TrashBin width={14} height={14} />
                              </Button>
                            </Card>
                          );
                        })}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addSubpoint(bIdx)}
                        className="w-full justify-start text-xs text-muted-foreground hover:text-foreground mt-1"
                      >
                        <Plus width={13} height={13} /> Agregar tema
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}

            <Button
              variant="secondary"
              size="default"
              onClick={addBlock}
              className="w-full py-3 font-semibold"
            >
              <Plus width={15} height={15} /> Agregar nuevo bloque a la agenda
            </Button>
          </div>

          {/* Dialog de confirmación destructiva */}
          {blockToDelete && (
            <Modal isOpen={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
              <Modal.Backdrop>
                <Modal.Container size="sm">
                  <Modal.Dialog className="sm:max-w-[420px] p-6 flex flex-col gap-4">
                    <h3 className="text-base font-bold text-foreground">
                      ¿Eliminar «{blockToDelete.title}»?
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      También se eliminarán sus {blockToDelete.pointsCount} temas y las notas asociadas. Esta acción no se puede deshacer.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" onClick={() => setBlockToDelete(null)}>
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => executeDeleteBlock(blockToDelete.index)}
                      >
                        Eliminar bloque
                      </Button>
                    </div>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
          )}
        </div>
      </div>
    </div>
  );
}
