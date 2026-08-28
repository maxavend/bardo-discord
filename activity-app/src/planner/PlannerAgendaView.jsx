import {useState, useEffect} from 'react';
import {
  Avatar,
  Button,
  Card,
  Dropdown,
  Label,
  Description,
  Header,
} from '@heroui/react';
import {
  Plus,
  EllipsisVertical,
  TrashBin,
  Cup,
  CircleCheck,
  SquareCheck,
  Microphone,
  ChevronUp,
  ChevronDown,
  ArrowRight,
} from '@gravity-ui/icons';
import {clockToMinutes, minutesToClock} from './time-engine.js';
import {
  POINT_STATUS,
  getElapsedActiveBlockMs,
  getBlockPlannedMs,
} from './session-runner.js';
import {getAssistantContextDetails} from './session-assistant-engine.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';
import {MaterialWavyProgress} from './MaterialWavyProgress.jsx';
import {MaterialMorphShape} from './MaterialMorphShape.jsx';
import {
  DEFAULT_DISCORD_MEMBERS,
  getAllDiscordEntities,
} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

export function PlannerAgendaView({
  state,
  sessionState,
  isEditing = false,
  dockSlot = null,
  onAdvance,
  isTransitioning = false,
  onUpdateBlock,
  onAddBlock,
  onAddBreak,
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

  const renderBlockLeader = (block) => {
    const leaderStr = block.leader || 'Todo el equipo';

    if (!isEditing) {
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-muted">Conduce:</span>
          <strong className="font-semibold text-foreground">{leaderStr}</strong>
        </span>
      );
    }

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="inline-flex items-center gap-1 cursor-pointer text-xs text-muted hover:text-foreground transition-colors p-0 bg-transparent border-0 outline-none group"
          >
            <span className="text-muted">Conduce:</span>
            <span className="font-semibold text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
              {leaderStr}
            </span>
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-[260px] p-1.5 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl">
          <Dropdown.Menu onAction={(key) => onUpdateBlock?.(block.id, {leader: String(key)})} className="p-0">
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-foreground px-3 pt-2 pb-2 border-b border-border/40 mb-1">
                Conduce el bloque
              </Header>
              <Dropdown.Item id="Todo el equipo" textValue="Todo el equipo" className="px-3 py-2 rounded-xl">
                <Avatar name="Todo el equipo" size="xs" className="w-5 h-5 text-[9px] font-bold shrink-0" />
                <Label className="text-xs font-semibold text-foreground leading-none">Todo el equipo</Label>
              </Dropdown.Item>
              {DEFAULT_DISCORD_MEMBERS.map((member) => (
                <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName} className="px-3 py-2 rounded-xl">
                  <Avatar
                    name={member.globalName}
                    size="xs"
                    className="w-5 h-5 text-[9px] font-bold shrink-0"
                    style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                  />
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-xs font-semibold text-foreground leading-none">{member.globalName}</Label>
                    <Description className="text-[11px] text-muted leading-tight">{member.tag}</Description>
                  </div>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  };

  const renderBlockParticipants = (block) => {
    const rawParticipants = block.participants || '';
    const participantsStr = rawParticipants || 'Diseño & SD + Carol, Karola y Nico';
    const {members, roles} = getAllDiscordEntities();

    const participantsList = rawParticipants
      ? rawParticipants.split(/(?:,|\s+y\s+|\s+and\s+|\s*\+\s*|\s+)/i).map((s) => s.trim().replace(/^@/, '')).filter(Boolean)
      : ['Diseño & SD', 'Carol', 'Karola', 'Nico'];

    const selectedKeys = new Set(
      participantsList.map((tag) => {
        const found = [...members, ...roles].find(
          (m) =>
            m.tag.toLowerCase() === tag.toLowerCase() ||
            `@${(m.globalName || m.name || '').toLowerCase()}` === tag.toLowerCase() ||
            (m.globalName || m.name || '').toLowerCase() === tag.toLowerCase()
        );
        return found ? found.tag : tag.startsWith('@') ? tag : `@${tag}`;
      })
    );

    if (!isEditing) {
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-muted">Participantes:</span>
          <span className="text-muted font-normal">{participantsStr}</span>
        </span>
      );
    }

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="inline-flex items-center gap-1 cursor-pointer text-xs text-muted hover:text-foreground transition-colors p-0 bg-transparent border-0 outline-none group"
            aria-label="Editar participantes del bloque"
          >
            <span className="text-muted">Participantes:</span>
            <span className="text-foreground font-normal underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
              {participantsStr}
            </span>
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end" className="min-w-[280px] max-h-80 overflow-y-auto p-1.5 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl">
          <Dropdown.Menu
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) => {
              const arr = Array.from(keys);
              onUpdateBlock?.(block.id, {participants: arr.join(', ')});
            }}
            className="p-0"
          >
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-foreground px-3 pt-2 pb-2 border-b border-border/40 mb-1">
                Roles del servidor
              </Header>
              {roles.map((role) => (
                <Dropdown.Item key={role.tag} id={role.tag} textValue={role.name} className="px-3 py-2 rounded-xl">
                  <span
                    className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                    style={{backgroundColor: role.color}}
                  >
                    #
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-xs font-semibold text-foreground leading-none">{role.name}</Label>
                    <Description className="text-[11px] text-muted leading-tight">{role.tag}</Description>
                  </div>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Section>

            <Dropdown.Section>
              <Header className="text-xs font-semibold text-foreground px-3 pt-2 pb-2 border-b border-border/40 my-1">
                Miembros del servidor y canal
              </Header>
              {members.map((member) => (
                <Dropdown.Item key={member.tag} id={member.tag} textValue={member.globalName} className="px-3 py-2 rounded-xl">
                  <Avatar
                    name={member.globalName}
                    size="xs"
                    className="w-5 h-5 text-[9px] font-bold shrink-0"
                    style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                  />
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-xs font-semibold text-foreground leading-none">{member.globalName}</Label>
                    <Description className="text-[11px] text-muted leading-tight">{member.tag}</Description>
                  </div>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  };

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
                  <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs text-muted transition-all ${
                    isLive
                      ? 'bg-accent/10 border-accent/40 shadow-xs'
                      : 'bg-surface-secondary/40 border-border/40'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Cup width={14} height={14} className={isLive ? 'text-accent shrink-0' : 'text-muted/80 shrink-0'} />
                      <span className={`font-semibold truncate ${isLive ? 'text-accent font-bold' : 'text-foreground'}`}>{block.title}</span>
                      {block.introDesc && <span className="truncate hidden sm:inline">· {block.introDesc}</span>}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span>{blockDuration} min</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={onAdvance}
                        isDisabled={isTransitioning}
                        className="h-6.5 px-2.5 rounded-full text-xs font-medium text-foreground/90 hover:text-foreground bg-surface/90 hover:bg-surface border border-border/60 shadow-2xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                      >
                        <span>Continuar</span>
                        <ArrowRight width={11} height={11} className="text-muted shrink-0" />
                      </Button>
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
                            <Dropdown>
                              <Dropdown.Trigger>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-muted hover:text-foreground px-2 py-0.5 rounded-lg bg-surface-secondary/50 hover:bg-surface-secondary transition-colors cursor-pointer"
                                >
                                  {block.durationMinutes || 30} min
                                </button>
                              </Dropdown.Trigger>
                              <Dropdown.Popover placement="bottom end" className="min-w-[160px] max-h-60 overflow-y-auto">
                                <Dropdown.Menu onAction={(key) => onUpdateBlock?.(block.id, {durationMinutes: Number(key) || 30})}>
                                  <Dropdown.Section>
                                    <Header className="text-xs font-semibold text-muted px-2 py-1">Duración del bloque</Header>
                                    {[5, 10, 15, 20, 25, 30, 45, 60, 90, 120].map((mins) => (
                                      <Dropdown.Item key={mins} id={String(mins)} textValue={`${mins} min`}>
                                        <Label>{mins} min</Label>
                                      </Dropdown.Item>
                                    ))}
                                  </Dropdown.Section>
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown>
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

                      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                        {renderBlockLeader(block)}
                        <span className="text-muted/40">·</span>
                        {renderBlockParticipants(block)}
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
                              className={`group relative flex flex-col justify-center px-4 py-3 sm:px-4.5 sm:py-3.5 rounded-xl gap-2 transition-all ${
                                isPointActive
                                  ? 'bg-accent/15 text-accent shadow-xs'
                                  : isDone || isPointSkipped
                                    ? 'bg-surface-secondary/40 text-muted'
                                    : 'bg-surface-secondary/50 hover:bg-surface-secondary/70 text-foreground'
                              }`}
                            >
                              {/* Fila 1: Título del punto y Estado/Acción */}
                              <div className="flex items-center justify-between gap-3 min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {isDone && !isPointActive && (
                                    <CircleCheck width={14} height={14} className="text-success shrink-0" />
                                  )}

                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={point.title}
                                      onChange={(e) => onUpdateSubpoint?.(block.id, point.id, {title: e.target.value})}
                                      placeholder="Título del punto..."
                                      className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-[140px] focus:ring-0 leading-normal"
                                    />
                                  ) : (
                                    <span
                                      onClick={() => !isPointActive && onToggleSubpointStatus?.(block.id, point.id, !isDone)}
                                      className={`text-sm leading-normal truncate ${
                                        isDone
                                          ? 'line-through text-foreground/60 font-normal cursor-pointer'
                                          : isPointSkipped
                                            ? 'text-muted font-normal cursor-pointer'
                                            : isPointActive
                                              ? 'font-bold text-accent'
                                              : 'font-semibold text-foreground cursor-pointer hover:text-accent'
                                      }`}
                                    >
                                      {point.title || '(Punto sin título)'}
                                    </span>
                                  )}
                                </div>

                                {!isEditing && (
                                  <div className="flex items-center gap-1.5 text-xs shrink-0">
                                    {isDone && !isPointActive ? (
                                      <span className="text-success font-semibold">Revisado</span>
                                    ) : isPointSkipped ? (
                                      <span className="text-muted font-medium">Saltado</span>
                                    ) : isPointActive && !onAdvance ? (
                                      <span className="text-accent font-bold">
                                        Punto {pointIndex + 1} · En curso
                                      </span>
                                    ) : null}
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

                              {/* Descripción opcional */}
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={point.description || ''}
                                  onChange={(e) => onUpdateSubpoint?.(block.id, point.id, {description: e.target.value})}
                                  placeholder="Añadir descripción o detalle..."
                                  className="text-xs text-muted bg-transparent border-0 outline-none p-0 w-full focus:ring-0"
                                />
                              ) : point.description ? (
                                <p className={`text-xs line-clamp-2 leading-relaxed ${
                                  isPointActive ? 'text-accent/85' : 'text-muted'
                                }`}>
                                  {point.description}
                                </p>
                              ) : null}

                              {/* Fila inferior: Presentador a la izquierda y Botón de avance abajo a la derecha (abajo en mobile) */}
                              {(isEditing || presenterList.length > 0 || (isPointActive && onAdvance)) && (
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-0.5 min-w-0">
                                  {(isEditing || presenterList.length > 0) ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                      {isEditing ? (
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
                                          <Dropdown.Popover placement="bottom start" className="min-w-[220px]">
                                            <Dropdown.Menu onAction={(key) => onUpdateSubpoint?.(block.id, point.id, {presenter: String(key)})}>
                                              <Dropdown.Section>
                                                <Header className="text-xs font-semibold text-muted px-2 py-1">Responsable del punto</Header>
                                                <Dropdown.Item id="Todos" textValue="Todos">
                                                  <Avatar name="Todos" size="xs" className="w-5 h-5 text-[9px] font-bold shrink-0" />
                                                  <Label>Todos</Label>
                                                </Dropdown.Item>
                                                {DEFAULT_DISCORD_MEMBERS.map((member) => (
                                                  <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                                                    <Avatar
                                                      name={member.globalName}
                                                      size="xs"
                                                      className="w-5 h-5 text-[9px] font-bold shrink-0"
                                                      style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                                                    />
                                                    <div className="flex flex-col">
                                                      <Label>{member.globalName}</Label>
                                                      <Description>{member.tag}</Description>
                                                    </div>
                                                  </Dropdown.Item>
                                                ))}
                                              </Dropdown.Section>
                                            </Dropdown.Menu>
                                          </Dropdown.Popover>
                                        </Dropdown>
                                      ) : (
                                        <div className="flex items-center gap-1.5">
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
                                      )}
                                    </div>
                                  ) : (
                                    <div />
                                  )}

                                  {/* Botón de avance activo: alineado abajo a la derecha en desktop, abajo en mobile */}
                                  {!isEditing && isPointActive && onAdvance && (() => {
                                    const assistantDetails = getAssistantContextDetails(state, sessionState);
                                    const label = isTransitioning ? 'Guardando…' : assistantDetails.nextAction.label;
                                    return (
                                      <div className="flex items-center justify-end w-full sm:w-auto shrink-0">
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onPress={onAdvance}
                                          isDisabled={isTransitioning}
                                          className="w-full sm:w-auto h-7 px-3.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 shadow-xs"
                                        >
                                          <span>{label}</span>
                                          {!isTransitioning && assistantDetails.nextAction.target !== 'session' && (
                                            <ArrowRight width={12} height={12} />
                                          )}
                                        </Button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
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
                                <SquareCheck width={14} height={14} className="text-muted shrink-0 mt-0.5" />
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full">
                <button
                  type="button"
                  onClick={() => onAddBlock?.()}
                  className="flex-1 py-3 px-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-accent/60 bg-surface-secondary/20 hover:bg-surface-secondary/40 text-xs font-semibold text-muted hover:text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                >
                  <Plus width={14} height={14} className="text-accent" />
                  <span>Añadir bloque a la agenda</span>
                </button>

                <button
                  type="button"
                  onClick={() => (onAddBreak ? onAddBreak() : onAddBlock?.({title: 'Break', type: 'break', durationMinutes: 10, isBreak: true, subpoints: []}))}
                  className="py-3 px-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-accent/60 bg-surface-secondary/20 hover:bg-surface-secondary/40 text-xs font-semibold text-muted hover:text-foreground transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none sm:w-auto"
                >
                  <Cup width={13} height={13} className="text-muted/70" />
                  <span>Añadir break</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
