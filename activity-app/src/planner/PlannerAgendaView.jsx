import {useState, useEffect} from 'react';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Popover,
  Label,
  Description,
} from '@heroui/react';
import {
  Plus,
  EllipsisVertical,
  TrashBin,
  Cup,
  CircleCheck,
  Microphone,
  ChevronUp,
  ChevronDown,
} from '@gravity-ui/icons';
import {clockToMinutes, minutesToClock} from './time-engine.js';
import {
  POINT_STATUS,
  getElapsedActiveBlockMs,
  getBlockPlannedMs,
} from './session-runner.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';
import {MaterialWavyProgress} from './MaterialWavyProgress.jsx';
import {MaterialMorphShape} from './MaterialMorphShape.jsx';
import {DEFAULT_DISCORD_MEMBERS} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

export function PlannerAgendaView({
  state,
  sessionState,
  isEditing = false,
  dockSlot = null,
  onUpdateBlock,
  onAddBlock,
  onDeleteBlock,
  onMoveBlock,
  onAddSubpoint,
  onUpdateSubpoint,
  onDeleteSubpoint,
  onMoveSubpoint,
  onToggleSubpointStatus,
  onOpenCapture,
  onDeleteDecision,
}) {
  const {
    startTime = '10:00',
    blocks = [],
  } = state;

  const liveActiveBlockId = sessionState?.liveActiveBlockId || state.liveActiveBlockId || null;
  const liveActivePointId = sessionState?.liveActivePointId || null;
  const isPaused = sessionState?.isPaused || false;
  let cursorMinutes = clockToMinutes(startTime);

  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!sessionState?.liveActiveBlockId || sessionState?.status === 'PAUSED' || sessionState?.status === 'COMPLETED') {
      return;
    }
    const interval = setInterval(() => {
      setClockTick((t) => (t + 1) % 100000);
    }, 500);
    return () => clearInterval(interval);
  }, [sessionState?.liveActiveBlockId, sessionState?.status, sessionState?.activeBlockStartedAt]);

  return (
    <div className="planner-agenda-container w-full max-w-4xl mx-auto pb-24 pt-2 flex flex-col gap-3">
      {dockSlot && (
        <div
          className="session-toolbar-sticky w-full"
          style={{
            position: 'sticky',
            top: 'calc(var(--bardo-visual-viewport-top, 0px) + var(--bardo-safe-top, 0px) + var(--bardo-topbar, 52px) + var(--bardo-toolbar-gap, 12px))',
            zIndex: 40,
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
            <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
            <div className="min-w-0 w-full">
              {dockSlot}
            </div>
          </div>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
          <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
          <div className="p-8 border border-dashed border-border rounded-xl text-center bg-surface-secondary/20 flex flex-col items-center gap-2 min-w-0 w-full">
            <p className="text-sm font-semibold text-foreground">Agenda sin bloques</p>
            <p className="text-xs text-muted max-w-sm">
              Aún no has agregado bloques a esta sesión. Añade tu primer bloque para estructurar los temas.
            </p>
            {onAddBlock && (
              <Button variant="primary" size="sm" onPress={() => onAddBlock()} className="mt-2">
                <Plus width={13} height={13} /> Añadir primer bloque
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col gap-3">
          {blocks.map((block, blockIndex) => {
            const blockStart = minutesToClock(cursorMinutes);
            const blockDuration = block.durationMinutes || 30;
            const blockEnd = minutesToClock(cursorMinutes + blockDuration);
            cursorMinutes += blockDuration;

            const isLive = block.id === liveActiveBlockId;
            const isCompleted = (sessionState?.completedBlockIds || []).includes(block.id);
            const isSkipped = (sessionState?.skippedBlockIds || []).includes(block.id);
            const lowerTitle = block.title.toLowerCase();
            const isBreak = lowerTitle.includes('break') || lowerTitle.includes('receso') || lowerTitle.includes('pausa');
            const isLast = blockIndex === blocks.length - 1;
            const blockRecordings = (sessionState?.recordings || []).filter((recording) => recording.blockId === block.id);

            let progressPercent = 0;
            let blockColor = 'accent';

            if (isLive && sessionState?.activeBlockStartedAt) {
              const elapsedMs = getElapsedActiveBlockMs(sessionState, Date.now());
              const plannedMs = getBlockPlannedMs(block, sessionState);
              if (plannedMs > 0) {
                progressPercent = Math.min(100, Math.round((elapsedMs / plannedMs) * 100));
                const remainingMs = plannedMs - elapsedMs;
                if (remainingMs <= 0) {
                  blockColor = 'danger';
                } else if (remainingMs <= 5 * 60 * 1000) {
                  blockColor = 'warning';
                }
              }
            } else if (isCompleted) {
              progressPercent = 100;
              blockColor = 'success';
            }

            if (isBreak && !isEditing) {
              return (
                <div key={block.id} className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-center">
                  <div className="flex flex-col items-center justify-center text-[11px] sm:text-xs text-muted font-medium select-none">
                    <span>{blockStart}</span>
                    <span className="text-[10px] sm:text-[11px] text-muted/60">{blockEnd}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-surface-secondary/40 border border-border/40 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <Cup width={14} height={14} className="text-muted/80 shrink-0" />
                      <span className="font-semibold text-foreground">{block.title}</span>
                      {block.introDesc && <span>· {block.introDesc}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span>{blockDuration} min</span>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={block.id} className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-stretch">
                {/* Timeline lateral izquierdo (visible en mobile y desktop) */}
                <div className="flex flex-col items-center justify-between text-[11px] sm:text-xs text-muted font-medium select-none py-1 min-h-[130px] sm:min-h-[140px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={isLive ? 'text-accent font-bold' : isCompleted ? 'text-success font-semibold' : 'text-muted'}>
                      {blockStart}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-muted/60">{blockEnd}</span>
                    <span className="text-[9px] sm:text-[10px] text-muted/50 mt-0.5">{blockDuration}m</span>
                  </div>

                  <div className="flex-1 flex flex-col items-center my-1 relative w-full">
                    <div className="relative my-1 z-10 flex items-center justify-center">
                      {isLive ? (
                        <MaterialMorphShape
                          size={18}
                          color={blockColor}
                          isPaused={isPaused}
                        />
                      ) : isCompleted ? (
                        <span className="h-2 w-2 rounded-full bg-success ring-2 ring-surface block" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-border/80 ring-2 ring-surface block" />
                      )}
                    </div>

                    <div className="flex-1 w-full relative flex justify-center items-stretch my-2 min-h-[32px]">
                      {isLive ? (
                        <MaterialWavyProgress
                          value={progressPercent}
                          color={blockColor}
                          isPaused={isPaused}
                          orientation="vertical"
                          strokeWidth={4.5}
                          wavelength={72}
                          amplitude={3.5}
                        />
                      ) : isCompleted ? (
                        <div className="w-[4.5px] h-full bg-success rounded-full" />
                      ) : (
                        <div className="w-[4.5px] h-full bg-border/40 rounded-full" />
                      )}
                    </div>

                    {isLast && (
                      <div className="relative mb-2 z-10 flex items-center justify-center">
                        <span className={`h-2 w-2 rounded-full ring-2 ring-surface block ${
                          isCompleted ? 'bg-success' : 'bg-border'
                        }`} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 w-full">
                  <Card
                    className={`p-4 sm:p-4.5 flex flex-col gap-2.5 rounded-2xl transition-all shadow-2xs ${
                      isLive && !isEditing
                        ? 'border-accent/60 ring-1 ring-accent/20 bg-surface'
                        : isCompleted && !isEditing
                          ? 'opacity-85 bg-surface border-border/60'
                          : isSkipped && !isEditing
                            ? 'opacity-60 bg-surface-secondary/30 border-border/40'
                            : 'bg-surface border-border/80'
                    }`}
                  >
                                   <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={block.title}
                            onChange={(e) => onUpdateBlock?.(block.id, {title: e.target.value})}
                            placeholder="Título del bloque"
                            className="text-base font-bold tracking-tight text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-0 focus:ring-0"
                          />
                        ) : (
                          <h3 className="text-base font-bold tracking-tight text-foreground min-w-0">{block.title}</h3>
                        )}

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isEditing ? (
                            <Popover placement="bottom end">
                              <Popover.Trigger>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-muted hover:text-foreground px-2 py-0.5 rounded-lg bg-surface-secondary/50 hover:bg-surface-secondary transition-colors cursor-pointer"
                                >
                                  {block.durationMinutes || 30} min
                                </button>
                              </Popover.Trigger>
                              <Popover.Content className="p-3 rounded-xl bg-surface border border-border shadow-xl">
                                <div className="flex flex-col gap-2">
                                  <Label className="text-xs font-semibold text-foreground">Duración del bloque (min)</Label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="240"
                                    value={block.durationMinutes || 30}
                                    onChange={(e) => onUpdateBlock?.(block.id, {durationMinutes: Number(e.target.value) || 15})}
                                    className="px-2.5 py-1.5 rounded-lg bg-field text-xs text-foreground border border-border outline-none focus:border-accent w-24"
                                  />
                                </div>
                              </Popover.Content>
                            </Popover>
                          ) : (
                            <span className="text-xs text-muted font-medium">{block.durationMinutes || 30} min</span>
                          )}

                          {isEditing && (
                            <Dropdown>
                              <Dropdown.Trigger>
                                <Button variant="ghost" size="sm" isIconOnly aria-label="Opciones del bloque" className="h-7 w-7 text-muted hover:text-foreground">
                                  <EllipsisVertical width={13} height={13} />
                                </Button>
                              </Dropdown.Trigger>
                              <Dropdown.Popover placement="bottom end">
                                <Dropdown.Menu
                                  onAction={(key) => {
                                    if (key === 'move-up' && onMoveBlock) onMoveBlock(block.id, -1);
                                    if (key === 'move-down' && onMoveBlock) onMoveBlock(block.id, 1);
                                    if (key === 'delete' && onDeleteBlock) onDeleteBlock(block.id);
                                  }}
                                >
                                  <Dropdown.Item id="move-up" textValue="Mover bloque arriba">
                                    <ChevronUp />
                                    <Label>Mover arriba</Label>
                                  </Dropdown.Item>
                                  <Dropdown.Item id="move-down" textValue="Mover bloque abajo">
                                    <ChevronDown />
                                    <Label>Mover abajo</Label>
                                  </Dropdown.Item>
                                  <Dropdown.Item id="delete" variant="danger" textValue="Eliminar bloque">
                                    <TrashBin />
                                    <Label>Eliminar bloque</Label>
                                  </Dropdown.Item>
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
                        <span>Conduce:</span>
                        {isEditing ? (
                          <Dropdown>
                            <Dropdown.Trigger>
                              <button
                                type="button"
                                className="font-semibold text-foreground hover:text-accent transition-colors cursor-pointer"
                              >
                                {block.leader || 'Todo el equipo'}
                              </button>
                            </Dropdown.Trigger>
                            <Dropdown.Popover placement="bottom start">
                              <Dropdown.Menu onAction={(key) => onUpdateBlock?.(block.id, {leader: String(key)})}>
                                <Dropdown.Item id="Todo el equipo" textValue="Todo el equipo">
                                  <Label>Todo el equipo</Label>
                                </Dropdown.Item>
                                {DEFAULT_DISCORD_MEMBERS.map((member) => (
                                  <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                                    <Label>{member.globalName}</Label>
                                    <Description>{member.tag}</Description>
                                  </Dropdown.Item>
                                ))}
                              </Dropdown.Menu>
                            </Dropdown.Popover>
                          </Dropdown>
                        ) : (
                          <strong className="font-semibold text-foreground">{block.leader || 'Todo el equipo'}</strong>
                        )}

                        <span className="text-muted/40">·</span>
                        <span>Participantes:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={block.participants || ''}
                            onChange={(e) => onUpdateBlock?.(block.id, {participants: e.target.value})}
                            placeholder="Diseño & SD + Carol, Karola y Nico"
                            className="text-xs text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-[140px] focus:ring-0"
                          />
                        ) : (
                          <span>{block.participants || 'Todos los convocados'}</span>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <textarea
                        rows={1}
                        value={block.introDesc || ''}
                        onChange={(e) => onUpdateBlock?.(block.id, {introDesc: e.target.value})}
                        placeholder="Contexto o descripción del bloque..."
                        className="text-xs text-muted bg-transparent border-0 outline-none p-0 w-full resize-none leading-relaxed focus:ring-0"
                      />
                    ) : (
                      block.introDesc && (
                        <p className="text-xs text-muted leading-relaxed">{block.introDesc}</p>
                      )
                    )}

                    {((block.subpoints || []).length > 0 || isEditing) && (
                      <div className="flex flex-col gap-2 pt-1">
                        {(block.subpoints || []).map((point, pointIndex) => {
                          const storedStatus = sessionState?.pointStatuses?.[point.id] || point.status || POINT_STATUS.PENDING;
                          const isPointActive = isLive && point.id === liveActivePointId && !isEditing;
                          const isDone = storedStatus === POINT_STATUS.DONE;
                          const isPointSkipped = storedStatus === POINT_STATUS.SKIPPED;
                          const presenterList = (point.presenter || '')
                            .split(/[/,]/)
                            .map((p) => p.trim())
                            .filter(Boolean);

                          return (
                            <div
                              key={point.id}
                              className={`group relative flex items-start gap-3 p-3 rounded-lg transition-all ${
                                isPointActive
                                  ? 'bg-accent/15 text-accent shadow-xs'
                                  : isDone || isPointSkipped
                                    ? 'bg-surface-secondary/40 text-muted'
                                    : 'bg-surface-secondary/50 hover:bg-surface-secondary/70 text-foreground'
                              }`}
                            >
                              <Checkbox
                                size="sm"
                                isSelected={isDone}
                                onChange={(event) => onToggleSubpointStatus(block.id, point.id, event.target.checked)}
                                className="mt-0.5 shrink-0 pl-1"
                              />

                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={point.title}
                                      onChange={(e) => onUpdateSubpoint?.(block.id, point.id, {title: e.target.value})}
                                      placeholder="Título del punto..."
                                      className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-[140px] focus:ring-0"
                                    />
                                  ) : (
                                    <span className={`text-sm leading-snug ${
                                      isDone
                                        ? 'line-through text-foreground/60 font-normal'
                                        : isPointSkipped
                                          ? 'text-muted font-normal'
                                          : isPointActive
                                            ? 'font-bold text-accent'
                                            : 'font-semibold text-foreground'
                                    }`}>
                                      {point.title || '(Punto sin título)'}
                                    </span>
                                  )}

                                  {!isEditing && (
                                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                                      {isPointActive && (
                                        <span className="text-accent font-bold">
                                          Punto {pointIndex + 1} · En curso
                                        </span>
                                      )}
                                      {!isPointActive && isDone && (
                                        <span className="text-success font-semibold">Revisado</span>
                                      )}
                                      {!isPointActive && isPointSkipped && (
                                        <span className="text-muted font-medium">Saltado</span>
                                      )}
                                    </div>
                                  )}

                                  {isEditing && (
                                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0 ml-auto">
                                      <button
                                        type="button"
                                        onClick={() => onMoveSubpoint?.(block.id, point.id, -1)}
                                        disabled={pointIndex === 0}
                                        aria-label="Mover punto arriba"
                                        className="p-1 text-muted hover:text-foreground disabled:opacity-20 cursor-pointer"
                                      >
                                        <ChevronUp width={12} height={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onMoveSubpoint?.(block.id, point.id, 1)}
                                        disabled={pointIndex === (block.subpoints || []).length - 1}
                                        aria-label="Mover punto abajo"
                                        className="p-1 text-muted hover:text-foreground disabled:opacity-20 cursor-pointer"
                                      >
                                        <ChevronDown width={12} height={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onDeleteSubpoint?.(block.id, point.id)}
                                        aria-label="Eliminar punto"
                                        className="p-1 text-muted hover:text-danger cursor-pointer ml-0.5"
                                      >
                                        <TrashBin width={12} height={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={point.description || ''}
                                    onChange={(e) => onUpdateSubpoint?.(block.id, point.id, {description: e.target.value})}
                                    placeholder={point.description ? '' : 'Añadir descripción o detalle...'}
                                    className="text-xs text-muted bg-transparent border-0 outline-none p-0 w-full focus:ring-0 mt-0.5"
                                  />
                                ) : (
                                  point.description && (
                                    <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${
                                      isPointActive ? 'text-accent/85' : 'text-muted'
                                    }`}>
                                      {point.description}
                                    </p>
                                  )
                                )}

                                {isEditing ? (
                                  <div className="flex items-center gap-2 mt-2 pt-0.5">
                                    <Dropdown>
                                      <Dropdown.Trigger>
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1.5 hover:text-foreground text-foreground text-xs cursor-pointer select-none"
                                        >
                                          {point.presenter ? (
                                            <>
                                              <Avatar
                                                name={point.presenter}
                                                size="xs"
                                                className="w-4.5 h-4.5 text-[8.5px] font-bold shrink-0 shadow-2xs"
                                                style={{
                                                  backgroundColor: `${
                                                    DEFAULT_DISCORD_MEMBERS.find((m) => m.globalName.toLowerCase().includes(point.presenter.toLowerCase()))?.avatarColor ||
                                                    DISCORD_PALETTES[0]
                                                  }30`,
                                                  color:
                                                    DEFAULT_DISCORD_MEMBERS.find((m) => m.globalName.toLowerCase().includes(point.presenter.toLowerCase()))?.avatarColor ||
                                                    DISCORD_PALETTES[0],
                                                }}
                                              />
                                              <span className="text-muted hover:text-foreground font-medium">{point.presenter}</span>
                                            </>
                                          ) : (
                                            <span className="text-muted hover:text-foreground">Asignar responsable</span>
                                          )}
                                        </button>
                                      </Dropdown.Trigger>
                                      <Dropdown.Popover placement="bottom start">
                                        <Dropdown.Menu onAction={(key) => onUpdateSubpoint?.(block.id, point.id, {presenter: String(key)})}>
                                          <Dropdown.Item id="Todos" textValue="Todos">
                                            <Label>Todos</Label>
                                          </Dropdown.Item>
                                          {DEFAULT_DISCORD_MEMBERS.map((member) => (
                                            <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                                              <Label>{member.globalName}</Label>
                                              <Description>{member.tag}</Description>
                                            </Dropdown.Item>
                                          ))}
                                        </Dropdown.Menu>
                                      </Dropdown.Popover>
                                    </Dropdown>
                                  </div>
                                ) : (
                                  presenterList.length > 0 && (
                                    <div className="flex items-center gap-2 mt-2 pt-0.5">
                                      <div className="flex items-center -space-x-1.5">
                                        {presenterList.map((pName, pIdx) => {
                                          const matched = DEFAULT_DISCORD_MEMBERS.find(
                                            (member) =>
                                              member.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                                              member.tag.toLowerCase().includes(pName.toLowerCase())
                                          );
                                          const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
                                          return (
                                            <Avatar
                                              key={pIdx}
                                              name={matched?.globalName || pName}
                                              size="xs"
                                              className="w-5 h-5 border border-background text-[9px] font-bold shadow-2xs shrink-0"
                                              style={{backgroundColor: `${color}35`, color}}
                                            />
                                          );
                                        })}
                                      </div>
                                      <span className={`text-xs ${isPointActive ? 'text-accent/90 font-medium' : 'text-muted font-normal'}`}>
                                        {point.presenter}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onAddSubpoint?.(block.id)}
                            className="text-xs text-muted/70 hover:text-foreground flex items-center gap-1.5 py-1 px-1 transition-colors self-start mt-0.5 cursor-pointer font-medium"
                          >
                            <Plus width={12} height={12} className="text-accent" /> <span>Añadir punto</span>
                          </button>
                        )}
                      </div>
                    )}

                    {(block.decisions || []).length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
                        {block.decisions.map((decision) => {
                          const point = (block.subpoints || []).find((candidate) => candidate.id === decision.pointId);
                          return (
                            <div
                              key={decision.id}
                              className="group px-3 py-2.5 rounded-lg bg-surface-secondary/60 text-xs text-foreground flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <CircleCheck width={14} height={14} className="text-success shrink-0 mt-0.5" />
                                <span className="min-w-0">
                                  <span className="font-medium break-words leading-snug">{decision.content}</span>
                                  {point && <span className="block text-xs text-muted mt-0.5">{point.title}</span>}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                aria-label="Eliminar acuerdo"
                                className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 h-6 w-6 text-muted hover:text-danger shrink-0 transition-opacity"
                                onPress={() => onDeleteDecision?.(block.id, decision.id)}
                              >
                                <TrashBin width={12} height={12} />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {blockRecordings.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                          <Microphone width={12} height={12} className="text-accent" />
                          Grabaciones ({blockRecordings.length})
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {blockRecordings.map((recording) => (
                            <PlannerAudioPlayer key={recording.id} recording={recording} />
                          ))}
                        </div>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/30 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          {block.phases && (
                            <span className="text-[11px]">
                              {block.phases.context}m ctx · {block.phases.review}m rev · {block.phases.closing}m cierre
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() => onOpenCapture('decision', block.id)}
                            className="h-7 text-xs text-muted hover:text-foreground"
                          >
                            <Plus width={12} height={12} /> Acuerdo
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            );
          })}

          {isEditing && (
            <div className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-stretch mt-3">
              <div className="w-[52px] sm:w-16 shrink-0" />
              <button
                type="button"
                onClick={() => onAddBlock?.()}
                className="w-full py-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-accent/60 bg-surface-secondary/20 hover:bg-surface-secondary/40 text-xs font-semibold text-muted hover:text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
              >
                <Plus width={15} height={15} className="text-accent" />
                <span>Añadir bloque a la agenda</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
