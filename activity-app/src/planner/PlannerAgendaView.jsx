import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Plus,
  MoreVertical,
  Trash2,
  Coffee,
  CheckCircle2,
  Handshake,
  Check,
  Play,
  Pause,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { clockToMinutes, minutesToClock } from './time-engine.js';
import {
  POINT_STATUS,
  SESSION_STATUS,
  getElapsedActiveBlockMs,
  getElapsedActivePointMs,
  getBlockPlannedMs,
} from './session-runner.js';
import { formatMsToClock } from './session-assistant-engine.js';
import { RECORDING_STATUS } from './recording-controller.js';
import { MaterialWavyProgress } from './MaterialWavyProgress.jsx';
import { MaterialMorphShape } from './MaterialMorphShape.jsx';
import {
  downloadPointAudio,
  exportBlockRecordingsCombined,
  exportBlockRecordingsAsZip,
  getRecordingBlob,
} from './audio-exporter.js';
import { fieldValue } from './planner-field-value.js';
import {
  getAllDiscordEntities,
  SearchableParticipantMenu,
} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

export function PlannerAgendaView({
  state,
  sessionState,
  nowTimestamp,
  recordingStatus = RECORDING_STATUS.IDLE,
  recordingElapsedMs = 0,
  isEditing = false,
  dockSlot = null,
  onAdvance,
  onAdvanceBlock,
  onSkipBlock,
  isTransitioning = false,
  onUpdateBlock,
  onAddBlock,
  onAddBreak,
  onDeleteBlock,
  onMoveBlock,
  onUpdateSubpoint,
  onAddSubpoint,
  onDeleteSubpoint,
  onMoveSubpoint,
  onToggleSubpointStatus,
  onOpenCapture,
  onDeleteDecision,
}) {
  const blocks = state?.blocks || [];
  const sessionStatus = sessionState?.status || SESSION_STATUS.IDLE;
  const isRunning = sessionStatus === SESSION_STATUS.RUNNING;
  const isPaused = sessionStatus === SESSION_STATUS.PAUSED;
  const isSessionActive = isRunning || isPaused;

  const isRecording = recordingStatus === RECORDING_STATUS.RECORDING;
  const isRecordingPaused = recordingStatus === RECORDING_STATUS.PAUSED;
  const isRecordingActive = isRecording || isRecordingPaused;

  const activeBlockId = sessionState?.liveActiveBlockId || sessionState?.activeBlockId || (isSessionActive ? blocks[0]?.id : null);
  const activePointId = sessionState?.liveActivePointId || sessionState?.activePointId;
  const blockStatuses = sessionState?.blockStatuses || {};
  const { members: discordMembers, roles: discordRoles } = getAllDiscordEntities();

  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioProgress, setAudioProgress] = useState({});

  const handleTogglePlay = async (point, firstPointRecording, durationMs) => {
    const pointId = point.id;
    const audioEl = document.getElementById(`audio-element-${pointId}`);
    if (!audioEl) return;

    if (playingAudioId === pointId) {
      audioEl.pause();
      setPlayingAudioId(null);
      return;
    }

    document.querySelectorAll('audio.bardo-point-audio').forEach((a) => {
      if (a !== audioEl) a.pause();
    });

    if (!audioEl.src || audioEl.src === window.location.href) {
      const blob = await getRecordingBlob(firstPointRecording || { pointTitle: point.title, durationMs });
      audioEl.src = URL.createObjectURL(blob);
    }

    try {
      await audioEl.play();
      setPlayingAudioId(pointId);
    } catch {
      setPlayingAudioId(null);
    }
  };

  const handleTimeUpdate = (pointId, e) => {
    const el = e.currentTarget;
    const currentMs = (el.currentTime || 0) * 1000;
    const totalMs = el.duration && !isNaN(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
    const percent = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;
    setAudioProgress((prev) => ({
      ...prev,
      [pointId]: { currentMs, percent },
    }));
  };

  const handleEnded = (pointId) => {
    setPlayingAudioId(null);
    setAudioProgress((prev) => ({
      ...prev,
      [pointId]: { currentMs: 0, percent: 0 },
    }));
  };

  const handleSeek = (pointId, e, totalDurationMs) => {
    e.stopPropagation();
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const audioEl = document.getElementById(`audio-element-${pointId}`);
    if (audioEl && audioEl.duration) {
      audioEl.currentTime = ratio * audioEl.duration;
    }
    setAudioProgress((prev) => ({
      ...prev,
      [pointId]: { currentMs: ratio * totalDurationMs, percent: ratio * 100 },
    }));
  };

  const [, setTicker] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Render facilitador del bloque
  const renderBlockLeader = (block) => {
    const leaderName = block.leader || '';
    const matched = discordMembers.find(
      (m) =>
        m.globalName.toLowerCase() === leaderName.toLowerCase() ||
        m.tag.toLowerCase() === `@${leaderName.toLowerCase()}`
    );
    const color = matched?.avatarColor || DISCORD_PALETTES[Math.abs(leaderName.charCodeAt(0) || 0) % DISCORD_PALETTES.length];

    if (isEditing) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 hover:text-foreground text-foreground text-xs cursor-pointer select-none group"
              >
                {leaderName ? (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground">Facilita</span>
                    <Avatar
                      size="xs"
                      className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                      style={{ backgroundColor: `${color}35`, color }}
                    >
                      <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                        {leaderName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                      {leaderName}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground group-hover:text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                    Asignar facilitador
                  </span>
                )}
              </button>
            }
          />
          <DropdownMenuContent align="start" className="p-0">
            <SearchableParticipantMenu
              singleSelect
              hideRoles
              selectedKeys={leaderName ? new Set([leaderName]) : new Set()}
              onSelectionChange={(keys) => {
                const selectedLeader = keys[0] ? keys[0].replace(/^@/, '') : '';
                onUpdateBlock?.(block.id, { leader: selectedLeader });
              }}
              onAddCustomParticipant={(tag) => {
                const clean = tag.replace(/^@/, '');
                onUpdateBlock?.(block.id, { leader: clean });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    if (!leaderName) return null;
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Facilita</span>
        <Avatar
          size="xs"
          className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
          style={{ backgroundColor: `${color}35`, color }}
        >
          <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
            {leaderName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <strong className="text-foreground font-semibold">{leaderName}</strong>
      </div>
    );
  };

  // Render participantes del bloque
  const renderBlockParticipants = (block) => {
    const raw = block.participants || '';
    const mentions = raw
      .split(/(?:,|\s+y\s+|\s+and\s+|\s*\+\s*)/i)
      .map((s) => s.trim().replace(/^@/, ''))
      .filter(Boolean);

    const selectedKeys = new Set(
      mentions.map((tag) => {
        const found = [...discordMembers, ...discordRoles].find(
          (m) =>
            m.tag.toLowerCase() === tag.toLowerCase() ||
            `@${(m.globalName || m.name || '').toLowerCase()}` === tag.toLowerCase() ||
            (m.globalName || m.name || '').toLowerCase() === tag.toLowerCase()
        );
        return found ? found.tag : tag.startsWith('@') ? tag : `@${tag}`;
      })
    );

    if (isEditing) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 hover:text-foreground text-foreground text-xs cursor-pointer select-none group"
              >
                {mentions.length > 0 ? (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="text-muted-foreground">Participan</span>
                    <div className="flex items-center -space-x-1.5">
                      {mentions.slice(0, 3).map((pName, pIdx) => {
                        const matched = discordMembers.find(
                          (m) =>
                            m.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                            m.tag.toLowerCase().includes(pName.toLowerCase())
                        );
                        const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
                        return (
                          <Avatar
                            key={pIdx}
                            size="xs"
                            className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                            style={{ backgroundColor: `${color}35`, color }}
                          >
                            <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                              {(matched?.globalName || pName).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </div>
                    <span className="font-semibold text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                      {mentions.join(', ')}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground group-hover:text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                    Asignar participantes
                  </span>
                )}
              </button>
            }
          />
          <DropdownMenuContent align="start" className="p-0">
            <SearchableParticipantMenu
              selectedKeys={selectedKeys}
              onSelectionChange={(keys) => {
                const names = keys.map((k) => {
                  const found = [...discordMembers, ...discordRoles].find(
                    (m) => m.tag.toLowerCase() === k.toLowerCase() || (m.globalName || m.name || '').toLowerCase() === k.replace(/^@/, '').toLowerCase()
                  );
                  return found ? (found.globalName || found.name) : k.replace(/^@/, '');
                });
                onUpdateBlock?.(block.id, { participants: names.join(', ') });
              }}
              onAddCustomParticipant={(tag) => {
                const cleanName = tag.replace(/^@/, '');
                const updated = mentions.includes(cleanName) ? mentions : [...mentions, cleanName];
                onUpdateBlock?.(block.id, { participants: updated.join(', ') });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    if (mentions.length === 0) return null;

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-muted-foreground">Participan</span>
        <div className="flex items-center -space-x-1.5">
          {mentions.slice(0, 4).map((pName, pIdx) => {
            const matched = discordMembers.find(
              (m) =>
                m.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                m.tag.toLowerCase().includes(pName.toLowerCase())
            );
            const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
            return (
              <Avatar
                key={pIdx}
                size="xs"
                className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                style={{ backgroundColor: `${color}35`, color }}
              >
                <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                  {(matched?.globalName || pName).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            );
          })}
        </div>
        <span className="text-foreground font-medium">{mentions.join(', ')}</span>
      </div>
    );
  };

  // Calculation of cumulative start/end times
  let runningMinutes = clockToMinutes(state?.startTime || '10:00');

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-28 pt-2 sm:px-0 flex flex-col gap-4 animate-in fade-in duration-150">
      {dockSlot}

      {blocks.length === 0 ? (
        <Card className="p-8 text-center flex flex-col items-center gap-3 rounded-2xl bg-card border-border">
          <p className="text-sm text-muted-foreground">No hay bloques en la agenda.</p>
          {isEditing && (
            <Button variant="default" size="sm" onClick={() => onAddBlock?.()} className="mt-2">
              <Plus className="size-3.5" /> Agregar primer bloque
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block, index) => {
            const isLast = index === blocks.length - 1;
            const blockDuration = Number(block.durationMinutes) || 15;
            const blockStart = minutesToClock(runningMinutes);
            runningMinutes += blockDuration;
            const blockEnd = minutesToClock(runningMinutes);
            const activeBlockIndex = isSessionActive ? blocks.findIndex((b) => b.id === activeBlockId) : -1;
            const isLive = isSessionActive && block.id === activeBlockId;
            const completedBlockIds = sessionState?.completedBlockIds || [];
            const areAllSubpointsDone =
              (block.subpoints || []).length > 0 &&
              (block.subpoints || []).every(
                (p) =>
                  sessionState?.pointStatuses?.[p.id] === POINT_STATUS.DONE ||
                  sessionState?.pointStatuses?.[p.id] === POINT_STATUS.SKIPPED
              );
            const isCompleted =
              !isLive &&
              (completedBlockIds.includes(block.id) ||
                areAllSubpointsDone ||
                (activeBlockIndex >= 0 && index < activeBlockIndex));
            const isSkipped = blockStatuses[block.id] === 'skipped';
            const liveActivePointId = isLive ? activePointId : null;

            // Timer & Progress metrics for live block
            const elapsedBlockMs = isLive ? getElapsedActiveBlockMs(sessionState, nowTimestamp) : 0;
            const plannedBlockMs = getBlockPlannedMs(block, sessionState);
            const isOvertime = isLive && elapsedBlockMs > plannedBlockMs;
            const is5MinWarning = isLive && !isOvertime && plannedBlockMs - elapsedBlockMs <= 5 * 60 * 1000;
            const progressPercent = plannedBlockMs > 0 ? Math.min(100, (elapsedBlockMs / plannedBlockMs) * 100) : 0;
            const blockColor = isPaused ? 'warning' : isOvertime ? 'danger' : is5MinWarning ? 'warning' : 'accent';

            const blockRecordings = (sessionState?.recordings || []).filter(
              (r) => r.blockId === block.id
            );

            const subpointRecordings = (block.subpoints || []).map((p, pIdx) => {
              const existing = blockRecordings.find(
                (r) => r.pointId === p.id || (r.pointTitle && r.pointTitle === p.title)
              );
              if (existing) return existing;
              return {
                id: `rec-${block.id}-${p.id || pIdx}`,
                blockId: block.id,
                blockTitle: block.title,
                pointId: p.id,
                pointTitle: p.title || `Punto ${pIdx + 1}`,
                durationMs: p.recordingDurationMs || p.durationMs || 15000,
              };
            });

            const effectiveBlockRecordings = subpointRecordings.length > 0
              ? subpointRecordings
              : (blockRecordings.length > 0
                  ? blockRecordings
                  : [{
                      id: `rec-block-${block.id}`,
                      blockId: block.id,
                      blockTitle: block.title,
                      durationMs: 30000,
                    }]);

            // Bloque tipo Break / Descanso
            if (block.isBreak || block.type === 'break') {
              return (
                <div key={block.id} className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-center">
                  {/* Timeline lateral izquierdo */}
                  <div className="flex flex-col items-center text-[11px] sm:text-xs text-muted-foreground font-medium select-none">
                    <span className="text-muted-foreground/80">{blockStart}</span>
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground/50">{blockEnd}</span>
                  </div>

                  {/* Tarjeta de Break */}
                  <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs text-xs text-muted-foreground transition-all">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Coffee className="size-4 text-muted-foreground/80 shrink-0 stroke-[1.75]" />
                      {isEditing ? (
                        <input
                          type="text"
                          value={block.title}
                          onChange={(e) => onUpdateBlock?.(block.id, { title: fieldValue(e.target.value) })}
                          placeholder="Break"
                          className="text-xs sm:text-sm font-medium text-foreground bg-transparent border-0 outline-none p-0 focus:ring-0"
                        />
                      ) : (
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground truncate select-none">
                          {block.title || 'Break'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{blockDuration} min</span>
                          <button
                            type="button"
                            onClick={() => onDeleteBlock?.(block.id)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="Eliminar break"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : isCompleted ? (
                        <div className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground select-none">
                          <Check className="size-3.5 text-emerald-500 stroke-[2]" />
                          <span>Terminado</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (isLive ? onAdvance?.() : onSkipBlock ? onSkipBlock(block.id) : onAdvance?.())}
                          disabled={isTransitioning}
                          className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-muted/70 hover:bg-muted text-foreground font-medium text-xs shadow-2xs border-0 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          <span>Terminar break</span>
                          <ChevronRight className="size-3.5 text-foreground/80 stroke-[1.75]" />
                        </button>
                      )}
                    </div>
                  </Card>
                </div>
              );
            }

            const blockCardElement = (
              <Card
                className={`p-4 sm:p-5 flex flex-col gap-3 rounded-2xl transition-all shadow-2xs ${
                  isLive && !isEditing
                    ? 'border-primary/60 ring-1 ring-primary/20 bg-card'
                    : isSkipped && !isEditing
                      ? 'opacity-60 bg-muted/30 border-border/40'
                      : 'bg-card border-border'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {isEditing ? (
                      <input
                        type="text"
                        value={block.title}
                        onChange={(e) => onUpdateBlock?.(block.id, { title: fieldValue(e.target.value) })}
                        placeholder="Título del bloque"
                        className="text-base font-bold tracking-tight text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-0 focus:ring-0"
                      />
                    ) : (
                      <h3 className="text-base font-bold tracking-tight text-foreground min-w-0">{block.title}</h3>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                              >
                                {block.durationMinutes || 30} min
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-36 p-1">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Duración</DropdownMenuLabel>
                              <div
                                className="max-h-52 overflow-y-auto overscroll-contain pr-0.5"
                                onWheel={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                              >
                                {[5, 10, 15, 20, 25, 30, 45, 60, 90, 120].map((mins) => (
                                  <DropdownMenuItem
                                    key={mins}
                                    onClick={() => onUpdateBlock?.(block.id, { durationMinutes: mins })}
                                  >
                                    {mins} min
                                  </DropdownMenuItem>
                                ))}
                              </div>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground font-medium">{block.durationMinutes || 30} min</span>
                      )}

                      {isEditing ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-xs" aria-label="Opciones del bloque" className="text-muted-foreground hover:text-foreground">
                                <MoreVertical className="size-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Bloque</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => onMoveBlock?.(block.id, -1)}>
                                <ChevronUp className="size-4 text-muted-foreground" />
                                <span>Mover arriba</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onMoveBlock?.(block.id, 1)}>
                                <ChevronDown className="size-4 text-muted-foreground" />
                                <span>Mover abajo</span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuItem variant="destructive" onClick={() => onDeleteBlock?.(block.id)}>
                                <Trash2 className="size-4 text-destructive" />
                                <span>Eliminar bloque</span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : isCompleted ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Opciones de descarga del bloque"
                                className="text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <MoreVertical className="size-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Grabaciones del bloque</DropdownMenuLabel>
                              <DropdownMenuItem
                                className="cursor-pointer gap-2"
                                onClick={async () => {
                                  await exportBlockRecordingsCombined(block.title, effectiveBlockRecordings);
                                }}
                              >
                                <Download className="size-4 text-muted-foreground" />
                                <span>Descargar bloque completo</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer gap-2"
                                onClick={async () => {
                                  await exportBlockRecordingsAsZip(block.title, effectiveBlockRecordings);
                                }}
                              >
                                <Download className="size-4 text-muted-foreground" />
                                <span>Descargar grabaciones por punto</span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <textarea
                      rows={1}
                      value={block.introDesc || ''}
                      onChange={(e) => onUpdateBlock?.(block.id, { introDesc: fieldValue(e.target.value) })}
                      placeholder="Contexto o descripción del bloque..."
                      className="text-xs text-muted-foreground bg-transparent border-0 outline-none p-0 w-full resize-none leading-relaxed focus:ring-0 field-sizing-content max-h-[9rem] overflow-y-hidden"
                    />
                  ) : (
                    block.introDesc && (
                      <Tooltip>
                        <TooltipTrigger render={<p className="text-xs text-muted-foreground leading-relaxed line-clamp-6 cursor-default">{block.introDesc}</p>} />
                        {block.introDesc.length > 200 && (
                          <TooltipContent className="max-w-sm text-xs leading-relaxed">
                            {block.introDesc}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-0.5">
                    {renderBlockLeader(block)}
                    <span className="text-muted-foreground/40">·</span>
                    {renderBlockParticipants(block)}
                  </div>
                </div>

                {((block.subpoints || []).length > 0 || isEditing) && (
                  <div className="flex flex-col gap-2 pt-1">
                    {(block.subpoints || []).map((point, pointIndex) => {
                      const storedStatus = sessionState?.pointStatuses?.[point.id] || point.status || POINT_STATUS.PENDING;
                      const isPointActive = isLive && point.id === liveActivePointId && !isEditing;
                      const isDone = storedStatus === POINT_STATUS.DONE;
                      const isPointSkipped = storedStatus === POINT_STATUS.SKIPPED;
                      const rawPointParticipants = point.presenter || '';
                      const pointPresenterList = rawPointParticipants
                        ? rawPointParticipants.split(/(?:,|\s+y\s+|\s+and\s+|\s*\+\s*)/i).map((s) => s.trim().replace(/^@/, '')).filter(Boolean)
                        : [];

                      const selectedPointKeys = new Set(
                        pointPresenterList.map((tag) => {
                          const found = [...discordMembers, ...discordRoles].find(
                            (m) =>
                              m.tag.toLowerCase() === tag.toLowerCase() ||
                              `@${(m.globalName || m.name || '').toLowerCase()}` === tag.toLowerCase() ||
                              (m.globalName || m.name || '').toLowerCase() === tag.toLowerCase()
                          );
                          return found ? found.tag : tag.startsWith('@') ? tag : `@${tag}`;
                        })
                      );

                      const pointRecordings = (sessionState?.recordings || []).filter(
                        (r) => r.pointId === point.id || (r.pointTitle && r.pointTitle === point.title)
                      );
                      const fixtureRecordingDuration = point.recordingDurationMs || point.durationMs || 0;
                      const rawPointDuration = fixtureRecordingDuration || pointRecordings.reduce((sum, r) => sum + (r.durationMs || 0), 0);
                      const pointRecordingDurationMs = rawPointDuration > 0 ? rawPointDuration : 15000;
                      const elapsedPointMs = isPointActive ? getElapsedActivePointMs(sessionState, nowTimestamp) : 0;
                      const firstPointRecording = pointRecordings[0] || null;
                      const isCurrentPlaying = playingAudioId === point.id;

                      if (isEditing) {
                        return (
                          <div
                            key={point.id}
                            className="group relative flex flex-col justify-center px-4 py-3 sm:px-4.5 sm:py-3.5 rounded-xl gap-2 transition-all bg-muted/50 hover:bg-muted/70 text-foreground"
                          >
                            {/* Fila 1: Título e íconos de orden/eliminar */}
                            <div className="flex items-center justify-between gap-3 min-w-0">
                              <input
                                type="text"
                                value={point.title}
                                onChange={(e) => onUpdateSubpoint?.(block.id, point.id, { title: fieldValue(e.target.value) })}
                                placeholder="Título del punto..."
                                className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-[140px] focus:ring-1 focus:ring-primary/40 rounded px-1 -mx-1 transition-all leading-normal"
                              />
                              <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => onMoveSubpoint?.(block.id, point.id, -1)}
                                  disabled={pointIndex === 0}
                                  aria-label="Mover punto arriba"
                                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                                >
                                  <ChevronUp className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onMoveSubpoint?.(block.id, point.id, 1)}
                                  disabled={pointIndex === (block.subpoints || []).length - 1}
                                  aria-label="Mover punto abajo"
                                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                                >
                                  <ChevronDown className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteSubpoint?.(block.id, point.id)}
                                  aria-label="Eliminar punto"
                                  className="p-1 text-muted-foreground hover:text-destructive cursor-pointer ml-0.5"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Fila 2: Descripción */}
                            <textarea
                              rows={1}
                              value={point.description || ''}
                              onChange={(e) => onUpdateSubpoint?.(block.id, point.id, { description: fieldValue(e.target.value) })}
                              placeholder="Agregar descripción o detalle..."
                              className="text-xs text-muted-foreground bg-transparent border-0 outline-none p-0 w-full resize-none leading-relaxed focus:ring-0 field-sizing-content max-h-[9rem] overflow-y-hidden"
                            />

                            {/* Fila 3: Responsables */}
                            <div className="flex items-center justify-between gap-3 pt-0.5 min-w-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1.5 hover:text-foreground text-foreground text-xs cursor-pointer select-none group"
                                    >
                                      {pointPresenterList.length > 0 ? (
                                        <div className="inline-flex items-center gap-1.5">
                                          <div className="flex items-center -space-x-1.5">
                                            {pointPresenterList.slice(0, 3).map((pName, pIdx) => {
                                              const matched = discordMembers.find(
                                                (m) =>
                                                  m.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                                                  m.tag.toLowerCase().includes(pName.toLowerCase())
                                              );
                                              const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
                                              return (
                                                <Avatar
                                                  key={pIdx}
                                                  size="xs"
                                                  className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                                                  style={{ backgroundColor: `${color}35`, color }}
                                                >
                                                  <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                                                    {(matched?.globalName || pName).slice(0, 2).toUpperCase()}
                                                  </AvatarFallback>
                                                </Avatar>
                                              );
                                            })}
                                          </div>
                                          <span className="text-muted-foreground group-hover:text-foreground font-medium underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                                            {pointPresenterList.join(', ')}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground group-hover:text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
                                          Asignar responsable
                                        </span>
                                      )}
                                    </button>
                                  }
                                />
                                <DropdownMenuContent align="start" className="p-0">
                                  <SearchableParticipantMenu
                                    selectedKeys={selectedPointKeys}
                                    onSelectionChange={(keys) => {
                                      const names = keys.map((k) => {
                                        const found = [...discordMembers, ...discordRoles].find(
                                          (m) => m.tag.toLowerCase() === k.toLowerCase() || (m.globalName || m.name || '').toLowerCase() === k.replace(/^@/, '').toLowerCase()
                                        );
                                        return found ? (found.globalName || found.name) : k.replace(/^@/, '');
                                      });
                                      onUpdateSubpoint?.(block.id, point.id, { presenter: names.join(', ') });
                                    }}
                                    onAddCustomParticipant={(tag) => {
                                      const cleanName = tag.replace(/^@/, '');
                                      const updated = pointPresenterList.includes(cleanName)
                                        ? pointPresenterList
                                        : [...pointPresenterList, cleanName];
                                      onUpdateSubpoint?.(block.id, point.id, { presenter: updated.join(', ') });
                                    }}
                                  />
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      }

                      if (isPointActive) {
                        const isLastPointInBlock = pointIndex === (block.subpoints || []).length - 1;
                        const nextActionLabel = isLast && isLastPointInBlock
                          ? 'Finalizar sesión'
                          : isLastPointInBlock
                            ? 'Siguiente bloque'
                            : 'Siguiente subpunto';

                        return (
                          <div
                            key={point.id}
                            className="group relative flex flex-col justify-between p-3.5 sm:px-4 sm:py-3.5 rounded-2xl gap-2.5 transition-all bg-primary/10 shadow-xs"
                          >
                            {/* Fila 1: Título activo (púrpura bold) y Estado de tiempo (rojo sin fondo de píldora) */}
                            <div className="flex items-center justify-between gap-3 min-w-0">
                              <span className="text-sm font-bold text-primary truncate leading-normal">
                                {point.title || '(Punto sin título)'}
                              </span>

                              {isRecordingActive && (
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive shrink-0 select-none">
                                  <span className={`size-2 rounded-full bg-destructive ${isRecordingPaused ? '' : 'animate-pulse'}`} />
                                  <span>{isRecordingPaused ? 'En pausa' : 'En curso'}</span>
                                  <span className="opacity-60">·</span>
                                  <span className="font-mono tabular-nums">
                                    {formatMsToClock(recordingElapsedMs || elapsedPointMs)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {point.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {point.description}
                              </p>
                            )}

                            {/* Fila 2: Responsable (texto púrpura) y Botón de avance */}
                            <div className="flex items-center justify-between gap-3 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {pointPresenterList.length > 0 && (
                                  <>
                                    <div className="flex items-center -space-x-1.5">
                                      {pointPresenterList.map((pName, pIdx) => {
                                        const matched = discordMembers.find(
                                          (member) =>
                                            member.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                                            member.tag.toLowerCase().includes(pName.toLowerCase())
                                        );
                                        const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
                                        return (
                                          <Avatar
                                            key={pIdx}
                                            size="xs"
                                            className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                                            style={{ backgroundColor: `${color}35`, color }}
                                          >
                                            <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                                              {(matched?.globalName || pName).slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                        );
                                      })}
                                    </div>
                                    <span className="text-xs text-primary font-medium truncate">
                                      {pointPresenterList.join(', ')}
                                    </span>
                                  </>
                                )}
                              </div>

                              {onAdvance && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAdvance();
                                  }}
                                  disabled={isTransitioning}
                                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-background hover:bg-background/90 text-primary font-medium text-xs shadow-xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                >
                                  <span className="font-medium">{nextActionLabel}</span>
                                  <ChevronRight strokeWidth={1.75} className="size-3.5 text-primary stroke-[1.75]" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={point.id}
                          className={`group relative flex items-center justify-between px-4 py-3 sm:px-4.5 sm:py-3.5 rounded-xl gap-3 sm:gap-4 transition-all ${
                            isDone || isPointSkipped
                              ? 'bg-muted/40 text-muted-foreground'
                              : 'bg-muted/50 hover:bg-muted/70 text-foreground'
                          }`}
                        >
                          {/* Columna Izquierda: Checkbox/Título, Descripción y Responsable */}
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              {isDone && (
                                <CheckCircle2
                                  onClick={() => onToggleSubpointStatus?.(block.id, point.id, false)}
                                  className="size-4 text-emerald-500 shrink-0 cursor-pointer"
                                />
                              )}
                              <span
                                onClick={() => onToggleSubpointStatus?.(block.id, point.id, !isDone)}
                                className={`text-sm leading-normal truncate ${
                                  isDone
                                    ? 'text-foreground/90 font-medium cursor-pointer'
                                    : isPointSkipped
                                      ? 'text-muted-foreground font-normal cursor-pointer'
                                      : 'font-semibold text-foreground cursor-pointer hover:text-primary'
                                }`}
                              >
                                {point.title || '(Punto sin título)'}
                              </span>
                            </div>

                            {point.description && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed cursor-default pl-6">
                                      {point.description}
                                    </p>
                                  }
                                />
                                {point.description.length > 100 && (
                                  <TooltipContent className="max-w-sm text-xs leading-relaxed">
                                    {point.description}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            )}

                            {pointPresenterList.length > 0 && (
                              <div className={`flex items-center gap-1.5 ${isDone ? 'pl-6' : ''}`}>
                                <div className="flex items-center -space-x-1.5">
                                  {pointPresenterList.map((pName, pIdx) => {
                                    const matched = discordMembers.find(
                                      (member) =>
                                        member.globalName.toLowerCase().includes(pName.toLowerCase()) ||
                                        member.tag.toLowerCase().includes(pName.toLowerCase())
                                    );
                                    const color = matched?.avatarColor || DISCORD_PALETTES[pIdx % DISCORD_PALETTES.length];
                                    return (
                                      <Avatar
                                        key={pIdx}
                                        size="xs"
                                        className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                                        style={{ backgroundColor: `${color}35`, color }}
                                      >
                                        <AvatarFallback style={{ backgroundColor: `${color}35`, color }}>
                                          {(matched?.globalName || pName).slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    );
                                  })}
                                </div>
                                <span className="text-xs text-muted-foreground font-normal">
                                  {pointPresenterList.join(', ')}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Columna Derecha: Reproductor inline si isDone, o saltado */}
                          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                            {isDone ? (
                              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                                <audio
                                  id={`audio-element-${point.id}`}
                                  className="bardo-point-audio hidden"
                                  onTimeUpdate={(e) => handleTimeUpdate(point.id, e)}
                                  onEnded={() => handleEnded(point.id)}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePlay(point, firstPointRecording, pointRecordingDurationMs);
                                  }}
                                  aria-label={isCurrentPlaying ? 'Pausar audio' : 'Reproducir audio'}
                                  className="size-6 sm:size-7 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                >
                                  {isCurrentPlaying ? (
                                    <Pause className="size-3.5 fill-primary text-primary" />
                                  ) : (
                                    <Play className="size-3.5 fill-primary text-primary ml-0.5" />
                                  )}
                                </button>
                                <div
                                  role="slider"
                                  aria-label={`Progreso de audio de ${point.title}`}
                                  aria-valuenow={Math.round(audioProgress[point.id]?.percent || 0)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  tabIndex={0}
                                  onClick={(e) => handleSeek(point.id, e, pointRecordingDurationMs)}
                                  className="w-28 sm:w-44 h-1.5 bg-muted/80 hover:bg-muted rounded-full overflow-hidden relative cursor-pointer select-none"
                                >
                                  <div
                                    className="h-full bg-primary rounded-full transition-all duration-100"
                                    style={{ width: `${audioProgress[point.id]?.percent || 0}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-muted-foreground tabular-nums select-none min-w-[36px]">
                                  {formatMsToClock(audioProgress[point.id]?.currentMs || 0)}
                                </span>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await downloadPointAudio(point.title, firstPointRecording || { pointTitle: point.title, durationMs: pointRecordingDurationMs });
                                  }}
                                  aria-label={`Descargar audio de ${point.title}`}
                                  title={`Descargar audio: ${point.title}`}
                                  className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/50"
                                >
                                  <Download className="size-4" />
                                </button>
                              </div>
                            ) : isPointSkipped ? (
                              <span className="text-muted-foreground font-medium text-xs">Saltado</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => onAddSubpoint?.(block.id)}
                        className="text-xs text-muted-foreground/70 hover:text-foreground flex items-center gap-1.5 py-1 px-1 transition-colors self-start mt-0.5 cursor-pointer font-medium"
                      >
                        <Plus className="size-3 text-primary" /> <span>Agregar tema</span>
                      </button>
                    )}
                  </div>
                )}

                {(block.decisions || []).length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
                    {block.decisions.map((decision) => {
                      const point = (block.subpoints || []).find((candidate) => candidate.id === decision.pointId);
                      const rawOwner = (decision.owner || '').trim().replace(/^@/, '');
                      const ownerMember = rawOwner
                        ? discordMembers.find(
                            (m) =>
                              m.globalName.toLowerCase() === rawOwner.toLowerCase() ||
                              m.tag.toLowerCase() === `@${rawOwner.toLowerCase()}` ||
                              m.globalName.toLowerCase().includes(rawOwner.toLowerCase()) ||
                              rawOwner.toLowerCase().includes(m.globalName.toLowerCase())
                          )
                        : null;
                      const ownerColor =
                        ownerMember?.avatarColor ||
                        DISCORD_PALETTES[
                          Math.abs(
                            rawOwner
                              .split('')
                              .reduce((acc, c) => acc + c.charCodeAt(0), 0)
                          ) % DISCORD_PALETTES.length
                        ] ||
                        '#E67E22';
                      const ownerDisplayName = ownerMember?.globalName || rawOwner;

                      return (
                        <div
                          key={decision.id}
                          className="group px-3 py-2 rounded-lg bg-muted/40 text-xs text-foreground flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Handshake className="size-4 text-foreground/80 shrink-0 mt-0.5" />
                            <span className="min-w-0">
                              <span className="font-medium break-words leading-snug">{decision.content}</span>
                              {point && <span className="block text-xs text-muted-foreground mt-0.5">{point.title}</span>}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {ownerDisplayName && (
                              <div className="inline-flex items-center gap-1.5">
                                <Avatar
                                  size="xs"
                                  className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                                  style={{ backgroundColor: `${ownerColor}35`, color: ownerColor }}
                                >
                                  <AvatarFallback style={{ backgroundColor: `${ownerColor}35`, color: ownerColor }}>
                                    {ownerDisplayName.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground font-medium">{ownerDisplayName}</span>
                              </div>
                            )}

                            {isEditing && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Eliminar acuerdo"
                                className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
                                onClick={() => onDeleteDecision?.(block.id, decision.id)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/30 text-xs text-muted-foreground gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCapture('decision', block.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 px-1 rounded-md transition-colors cursor-pointer font-medium select-none"
                    >
                      <Plus className="size-3.5 text-muted-foreground/80" />
                      <span>Acuerdo</span>
                    </button>

                    {isLive && (onAdvanceBlock || onAdvance) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onAdvanceBlock || onAdvance}
                        disabled={isTransitioning}
                        className="h-8 px-3.5 text-xs font-semibold rounded-full gap-1.5 cursor-pointer shadow-xs ml-auto"
                      >
                        <span>{isLast ? 'Finalizar sesión' : 'Siguiente bloque'}</span>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );

            if (isEditing) {
              return (
                <div key={block.id} className="w-full min-w-0">
                  {blockCardElement}
                </div>
              );
            }

            return (
              <div key={block.id} className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-stretch">
                {/* Timeline lateral izquierdo */}
                <div className="flex flex-col items-center justify-between text-[11px] sm:text-xs text-muted-foreground font-medium select-none py-1 min-h-[130px] sm:min-h-[140px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={isLive ? 'text-primary font-bold' : isCompleted ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                      {blockStart}
                    </span>
                    <span className={`text-[10px] sm:text-[11px] ${isLive ? 'text-primary/70 font-medium' : isCompleted ? 'text-muted-foreground/70 font-normal' : 'text-muted-foreground/60'}`}>
                      {blockEnd}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 font-normal">
                      {block.durationMinutes || 30}m
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col items-center my-1 relative w-full">
                    <div className="relative my-1 z-10 flex items-center justify-center">
                      {isLive ? (
                        <MaterialMorphShape
                          size={18}
                          color={blockColor}
                          isPaused={isPaused}
                          isActive={true}
                          isCompleted={false}
                        />
                      ) : isCompleted ? (
                        <div className="size-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                          <Check className="size-3 stroke-[2.5]" />
                        </div>
                      ) : (
                        <span className="size-1.5 rounded-full bg-border ring-2 ring-card block" />
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
                        <div className="w-[3px] sm:w-[3.5px] h-full bg-emerald-400/50 dark:bg-emerald-500/40 rounded-full" />
                      ) : (
                        <div className="w-[3px] sm:w-[3.5px] h-full bg-border/40 rounded-full" />
                      )}
                    </div>

                    {isLast && (
                      <div className="relative mb-2 z-10 flex items-center justify-center">
                        <span className={`size-2 rounded-full ring-2 ring-card block ${
                          isCompleted ? 'bg-emerald-500' : 'bg-border'
                        }`} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 w-full">
                  {blockCardElement}
                </div>
              </div>
            );
          })}

          {isEditing && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full min-w-0 mt-3">
              <button
                type="button"
                onClick={() => onAddBlock?.()}
                className="flex-1 py-3 px-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
              >
                <Plus className="size-3.5 text-primary" />
                <span>Agregar bloque</span>
              </button>

              <button
                type="button"
                onClick={() => (onAddBreak ? onAddBreak() : onAddBlock?.({ title: 'Descanso', type: 'break', durationMinutes: 10, isBreak: true, subpoints: [] }))}
                className="py-3 px-4 rounded-2xl border-2 border-dashed border-border/70 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none sm:w-auto"
              >
                <Coffee className="size-3.5 text-muted-foreground/70" />
                <span>Agregar descanso</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
