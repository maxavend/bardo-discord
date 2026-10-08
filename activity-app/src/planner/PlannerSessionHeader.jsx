import { useId, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar.jsx';
import { TimePicker } from '@/components/ui/time-picker.jsx';
import {
  Pencil,
  MoreVertical,
  RotateCw,
  Calendar,
  ChevronDown,
  Archive,
} from 'lucide-react';
import {
  FileTextIcon,
  CopyIcon,
  PlusIcon,
  PlayIcon,
  CircleCheckIcon as CheckIcon,
} from '@/components/ui/animated-icons';
import { toast } from '@/lib/toast';
import { SESSION_STATUS } from './session-runner.js';
import { durationUntil, formatShortDuration, getPlannedSchedule } from './time-engine.js';
import { formatMeetingDuration, MEETING_COPY } from './copy-tokens.js';
import {
  getAllDiscordEntities,
  SearchableParticipantMenu,
  SinglePersonPicker,
} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Sin fecha';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function _format12Hour(timeStr) {
  if (!timeStr) return '10:00 a.m.';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr || '10', 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'p.m.' : 'a.m.';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${String(h).padStart(2, '0')}:${m} ${period}`;
}

export function PlannerSessionHeader({
  state,
  sessionState,
  _activeTab,
  onTabChange,
  isEditing = false,
  onToggleEditMode,
  onUpdateHeaderField,
  onCopyAnnouncement,
  onNewCleanSession,
  onDeleteSession,
  onStartSession,
  onResumeSession,
  onInterruptSession: _onInterruptSession,
  onGoHome: _onGoHome,
}) {
  const {
    title = 'Reunión sin título',
    description = '',
    date = '',
    startTime = '17:45',
    blocks = [],
    targetDuration = 0,
    host = '',
    mentions = '',
  } = state || {};

  const status = sessionState?.status || SESSION_STATUS.IDLE;
  const schedule = getPlannedSchedule({startTime, targetDuration, blocks}, sessionState);
  const totalPlannedMinutes = schedule.plannedMinutes;
  // Live: block extensions push the estimated end past the plan.
  const isLiveStatus = status === SESSION_STATUS.RUNNING || status === SESSION_STATUS.PAUSED;
  const estimatedEndTime = isLiveStatus ? schedule.estimatedEnd : schedule.plannedEnd;

  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isInterrupted = status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = status === SESSION_STATUS.COMPLETED;

  const { members } = getAllDiscordEntities();
  const selectedKeys = new Set(parseMentions(mentions));
  const hasBlocks = (blocks || []).length > 0;
  const fieldId = useId();
  const startHintId = `${fieldId}-start-hint`;
  const [isDateOpen, setIsDateOpen] = useState(false);

  const formatHeaderDate = (isoDate) => {
    if (!isoDate) return 'Fecha por definir';
    try {
      const [y, m, d] = isoDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat('es-CL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(dateObj);
    } catch {
      return isoDate;
    }
  };

  return (
    <header className="w-full max-w-4xl mx-auto py-3 sm:py-4 animate-in fade-in duration-150">
      <div className="flex flex-col min-w-0 w-full">
        {/* Fila 1: Título alineado con el botón ⋮ y acciones principales */}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            {isEditing ? (
              <>
                <textarea
                  rows={1}
                  value={title}
                  onChange={(e) => onUpdateHeaderField?.('title', e.target.value)}
                  placeholder="Nombre de la reunión"
                  className="doc-title doc-title-input field-sizing-content resize-none overflow-y-hidden"
                  aria-label="Nombre de la reunión"
                />
                <textarea
                  rows={1}
                  value={description}
                  onChange={(e) => onUpdateHeaderField?.('description', e.target.value)}
                  placeholder="Agregar objetivo o contexto de la reunión..."
                  className="doc-description bg-transparent border-0 outline-none p-0 w-full resize-none leading-relaxed focus:ring-0 text-muted-foreground placeholder:text-muted-foreground/60 field-sizing-content max-h-[9rem] overflow-y-hidden"
                  aria-label="Objetivo de la reunión"
                />
              </>
            ) : (
              <>
                <h1 className="doc-title">{title || 'Reunión sin título'}</h1>
                {description && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <p className="doc-description line-clamp-6 cursor-default">
                          {description}
                        </p>
                      }
                    />
                    {description.length > 200 && (
                      <TooltipContent className="max-w-md text-xs leading-relaxed">
                        {description}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditing && !isRunning && !isPaused && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCopyAnnouncement}
                className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex h-8 px-2.5 font-medium"
              >
                <CopyIcon className="size-3.5" /> <span>Copiar anuncio</span>
              </Button>
            )}

            {/* On phones the floating button (PlannerModule) is the single primary action. */}
            {isEditing ? (
              <Button
                variant="default"
                size="sm"
                onClick={onToggleEditMode}
                className="hidden sm:inline-flex font-medium h-8 px-3.5"
              >
                <CheckIcon className="size-3.5" /> <span>Listo</span>
              </Button>
            ) : isInterrupted && onResumeSession ? (
              <Button
                variant="default"
                size="sm"
                onClick={onResumeSession}
                className="hidden sm:inline-flex font-medium h-8 px-3.5"
              >
                <PlayIcon className="size-3.5" /> <span>Reanudar</span>
              </Button>
            ) : !isRunning && !isPaused && !isCompleted && !isInterrupted ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onToggleEditMode}
                  aria-label="Editar reunión"
                  className="font-medium h-8 px-2.5 sm:px-3"
                >
                  <Pencil className="size-3.5" /> <span className="hidden sm:inline">Editar</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onStartSession}
                  disabled={!hasBlocks}
                  aria-describedby={!hasBlocks ? startHintId : undefined}
                  title={!hasBlocks ? MEETING_COPY.needsBlock : undefined}
                  className="hidden sm:inline-flex font-medium h-8 px-3.5"
                >
                  <PlayIcon className="size-3.5" /> <span>{MEETING_COPY.startMeeting}</span>
                </Button>
              </>
            ) : isCompleted ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => onTabChange('recap')}
                className="hidden sm:inline-flex font-medium h-8 px-3.5"
              >
                <FileTextIcon className="size-3.5" /> <span>Ver resumen</span>
              </Button>
            ) : null}

            {/* Menú ⋮ alineado exactamente en la misma línea del título */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Más opciones de la reunión"
                    className="text-muted-foreground hover:text-foreground rounded-full"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Reunión</DropdownMenuLabel>
                  {(isCompleted || isInterrupted) && (
                    <DropdownMenuItem onClick={() => onTabChange('recap')}>
                      <RotateCw className="size-4 text-muted-foreground" />
                      <span>Ver resumen</span>
                    </DropdownMenuItem>
                  )}
                  {!isEditing && (
                    <DropdownMenuItem onClick={onToggleEditMode}>
                      <Pencil className="size-4 text-muted-foreground" />
                      <span>Editar reunión</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onCopyAnnouncement}>
                    <CopyIcon className="size-4 text-muted-foreground" />
                    <span>Copiar anuncio</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onNewCleanSession}>
                    <PlusIcon className="size-4 text-muted-foreground" />
                    <span>Nueva reunión</span>
                  </DropdownMenuItem>
                  {onDeleteSession && (
                    // Archiving is the only removal from an open meeting: it can be
                    // restored (or deleted for good) from "Archivadas".
                    <DropdownMenuItem
                      onClick={() => onDeleteSession(state, 'archive')}
                      className="cursor-pointer"
                    >
                      <Archive className="size-4 text-muted-foreground" />
                      <span>Archivar reunión</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Modo edición vs modo lectura */}
        {isEditing ? (
          <div className="flex flex-col gap-3 mt-4">
            {/* Fila 1: Fecha, Hora de inicio, Término, Duración */}
            <div className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_1fr_0.6fr] gap-3 items-end">
              <div>
                <label htmlFor={`${fieldId}-date`} className="text-xs font-semibold text-foreground mb-1.5 block">Fecha</label>
                <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
                  <PopoverTrigger
                    render={
                      <button
                        id={`${fieldId}-date`}
                        type="button"
                        className="w-full h-9 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/50 px-3.5 flex items-center justify-between text-xs font-medium text-foreground transition-colors cursor-pointer"
                      >
                        <span className={date ? '' : 'text-muted-foreground'}>{formatDisplayDate(date)}</span>
                        <Calendar className="size-4 text-foreground/80 shrink-0" />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-0 border-0 bg-transparent shadow-none">
                    <CalendarComponent
                      selected={date}
                      onSelect={(newDate) => {
                        onUpdateHeaderField?.('date', newDate);
                        setIsDateOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label htmlFor={`${fieldId}-start`} className="text-xs font-semibold text-foreground mb-1.5 block">Hora de inicio</label>
                <TimePicker
                  id={`${fieldId}-start`}
                  value={startTime || '10:00'}
                  onChange={(val) => onUpdateHeaderField?.('startTime', val)}
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-end`} className="text-xs font-semibold text-foreground mb-1.5 block">Término</label>
                <TimePicker
                  id={`${fieldId}-end`}
                  value={schedule.plannedEnd}
                  onChange={(newEnd) => {
                    const minutes = durationUntil(startTime, newEnd);
                    if (minutes == null) {
                      toast('El término tiene que ser después de la hora de inicio. Revisa a.m. / p.m.');
                      return;
                    }
                    // The booked time; changing the start later keeps this duration.
                    onUpdateHeaderField?.('targetDuration', minutes);
                  }}
                />
              </div>

              <div>
                <span id={`${fieldId}-duration`} className="text-xs font-semibold text-foreground mb-1.5 block">Duración</span>
                <div aria-labelledby={`${fieldId}-duration`} className="w-full h-9 px-1 flex items-center justify-center text-xs font-medium text-foreground">
                  {formatShortDuration(totalPlannedMinutes)}
                </div>
              </div>
            </div>

            {/* Tiempo asignado a temas vs. tiempo reservado */}
            {schedule.targetMinutes > 0 && (schedule.freeMinutes > 0 || schedule.overMinutes > 0) && (
              <p
                role="status"
                className={`-mt-1 text-xs ${schedule.overMinutes > 0 ? 'text-warning' : 'text-muted-foreground'}`}
              >
                {schedule.overMinutes > 0
                  ? `Los bloques suman ${formatShortDuration(schedule.blocksMinutes)}, ${formatShortDuration(schedule.overMinutes)} más de lo reservado: la reunión terminaría a las ${schedule.plannedEnd}. Acorta los bloques o mueve el término.`
                  : `Bloques: ${formatShortDuration(schedule.blocksMinutes)} de ${formatShortDuration(schedule.targetMinutes)} · quedan ${formatShortDuration(schedule.freeMinutes)} libres`}
              </p>
            )}

            {/* Fila 2: Facilita (1fr), Participan (3fr) */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_3fr] gap-3 items-end">
              <div>
                <label htmlFor={`${fieldId}-host`} className="text-xs font-semibold text-foreground mb-1.5 block">Facilita</label>
                <SinglePersonPicker
                  value={host}
                  onChange={(name) => onUpdateHeaderField?.('host', name)}
                  renderTrigger={() => (
                      <button
                        id={`${fieldId}-host`}
                        type="button"
                        className="w-full h-9 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/50 px-3.5 flex items-center justify-between gap-2 text-xs text-foreground transition-colors cursor-pointer min-w-0"
                      >
                        {host ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {(() => {
                              const matched = members.find(
                                (m) =>
                                  m.globalName.toLowerCase() === host.toLowerCase() ||
                                  m.tag.toLowerCase() === `@${host.toLowerCase()}`
                              );
                              const color = matched?.avatarColor || DISCORD_PALETTES[Math.abs(host.charCodeAt(0) || 0) % DISCORD_PALETTES.length];
                              return (
                                <>
                                  <Avatar
                                    size="xs"
                                    className="size-5 text-[9px] font-bold shrink-0 shadow-2xs"
                                    style={{ backgroundColor: `${color}30`, color }}
                                  >
                                    <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>
                                      {host.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-foreground truncate">{host}</span>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="truncate text-muted-foreground">Elegir persona</span>
                        )}
                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-auto" />
                      </button>
                  )}
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-people`} className="text-xs font-semibold text-foreground mb-1.5 block">Participan</label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        id={`${fieldId}-people`}
                        type="button"
                        className="w-full h-9 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/50 px-3.5 flex items-center justify-between gap-3 text-xs text-foreground transition-colors cursor-pointer min-w-0"
                      >
                        {selectedKeys.size > 0 ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                            <div className="flex items-center -space-x-1.5 shrink-0">
                              {Array.from(selectedKeys).slice(0, 4).map((tag, idx) => {
                                const cleanName = tag.replace(/^[@#]/, '');
                                const matched = members.find(
                                  (m) =>
                                    m.globalName.toLowerCase() === cleanName.toLowerCase() ||
                                    m.tag.toLowerCase() === tag.toLowerCase() ||
                                    `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                                );
                                const isRole = tag.startsWith('#') || (!matched && tag.startsWith('@'));
                                const color = matched?.avatarColor || DISCORD_PALETTES[(idx + 1) % DISCORD_PALETTES.length];

                                return (
                                  <Avatar
                                    key={tag}
                                    size="xs"
                                    className="size-5 text-[8.5px] font-bold shrink-0 shadow-2xs border border-card ring-1 ring-background"
                                    style={{ backgroundColor: `${color}30`, color }}
                                  >
                                    <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>
                                      {isRole ? '#' : cleanName.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                );
                              })}
                            </div>
                            <span className="font-medium text-foreground truncate min-w-0">
                              {Array.from(selectedKeys).map((tag) => tag.replace(/^[@#]/, '')).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="truncate text-muted-foreground">Buscar personas o roles</span>
                        )}
                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-auto" />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="p-0 w-auto overflow-hidden">
                    <SearchableParticipantMenu
                      selectedKeys={selectedKeys}
                      onSelectionChange={(nextKeys) =>
                        onUpdateHeaderField?.('mentions', nextKeys.join(' '))
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        ) : (
          /* Modo lectura: metadata limpia */
          <div className="flex items-center gap-2.5 sm:gap-3 mt-3 sm:mt-3.5 flex-wrap text-sm text-foreground">
              <div className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs sm:text-sm">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span className="capitalize">{formatHeaderDate(date)}</span>
              </div>

              <div className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs sm:text-sm">
                <span>
                  {startTime} – {estimatedEndTime}
                </span>
              </div>

              <span className="text-xs text-muted-foreground select-none font-medium">
                · {formatMeetingDuration(totalPlannedMinutes)}
              </span>

              {host && (
                <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground font-normal">
                  <span>Facilita:</span>
                  <Avatar
                    size="xs"
                    className="size-4.5 border border-card text-[8px] font-bold shadow-2xs shrink-0"
                    style={{ backgroundColor: '#5865F235', color: '#5865F2' }}
                  >
                    <AvatarFallback style={{ backgroundColor: '#5865F235', color: '#5865F2' }}>
                      {host.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground">{host}</span>
                </div>
              )}

              <div className="h-3.5 w-px bg-border/60 hidden sm:block select-none" />

              {selectedKeys.size > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center -space-x-1.5">
                    {Array.from(selectedKeys)
                      .slice(0, 5)
                      .map((tag, i) => {
                        const matched = members.find(
                          (m) =>
                            m.globalName.toLowerCase() ===
                              tag.toLowerCase().replace(/^@/, '') ||
                            m.tag.toLowerCase() === tag.toLowerCase() ||
                            `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                        );
                        const color =
                          matched?.avatarColor ||
                          DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                        const name = matched?.globalName || tag.replace(/^@/, '');
                        return (
                          <Avatar
                            key={i}
                            size="sm"
                            className="size-5 text-[8.5px] font-bold border-2 border-background shadow-2xs shrink-0"
                            style={{ backgroundColor: `${color}30`, color }}
                          >
                            <AvatarFallback
                              style={{ backgroundColor: `${color}30`, color }}
                            >
                              {name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                  </div>
                  {selectedKeys.size > 5 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      +{selectedKeys.size - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
        )}

        {!isEditing && !hasBlocks && !isRunning && !isPaused && !isCompleted && !isInterrupted && (
          <p id={startHintId} role="status" className="mt-2 text-xs text-muted-foreground">
            {MEETING_COPY.needsBlock} para poder iniciar la reunión.
          </p>
        )}
      </div>
    </header>
  );
}
