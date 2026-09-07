import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar.jsx';
import {
  FileText,
  Pencil,
  Copy,
  Plus,
  RotateCcw,
  MoreVertical,
  Play,
  Check,
  RotateCw,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import {
  SESSION_STATUS,
  recalculateEstimatedEndTime,
} from './session-runner.js';
import {
  getAllDiscordEntities,
  SearchableParticipantMenu,
  parseMentionsToArray,
  resolveDiscordEntity,
  entityIdsFromSelection,
  discordColorFor,
} from './PlannerMemberPicker.jsx';

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Seleccionar fecha';
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
  hasPreviousMeeting = false,
  onRestorePreviousMeeting,
  _onLoadDemo,
  onStartSession,
  onResumeSession,
  onInterruptSession,
  onGoHome: _onGoHome,
}) {
  const {
    title = 'Reunión sin título',
    description = '',
    date = '',
    startTime = '17:45',
    blocks = [],
    totalCalculatedDuration = 0,
    host = '',
    hostId = null,
    mentions = '',
    participantIds = [],
  } = state || {};

  const totalPlannedMinutes = (blocks || []).reduce(
    (accumulator, b) => accumulator + (b.durationMinutes || 0),
    0
  ) || totalCalculatedDuration || 0;
  const estimatedEndTime = recalculateEstimatedEndTime(
    startTime,
    totalPlannedMinutes
  );

  const status = sessionState?.status || SESSION_STATUS.IDLE;
  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isInterrupted = status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = status === SESSION_STATUS.COMPLETED;

  const { members } = getAllDiscordEntities();
  void hostId;
  void participantIds;
  const selectedKeys = new Set(parseMentionsToArray(mentions));

  const formatHeaderDate = (isoDate) => {
    if (!isoDate) return 'Fecha por definir';
    try {
      const [y, m, d] = isoDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(dateObj);
    } catch {
      return isoDate;
    }
  };

  return (
    <header className="w-full max-w-4xl mx-auto px-4 py-3 sm:px-0 sm:py-4 animate-in fade-in duration-150">
      <div className="flex flex-col min-w-0 w-full">
        {/* Fila 1: Título alineado con el botón ⋮ y acciones principales */}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            {isEditing ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel>Fecha</FieldLabel>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0 justify-between text-xs font-medium"
                      >
                        <span className="truncate">{formatDisplayDate(date)}</span>
                        <Calendar className="size-4 shrink-0 text-muted-foreground" />
                      </Button>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-0">
                    <CalendarComponent
                      selected={date}
                      onSelect={(newDate) => onUpdateHeaderField?.('date', newDate)}
                    />
                  </PopoverContent>
                </Popover>
              </Field>

              <Field>
                <FieldLabel htmlFor="meeting-start-time">Hora de inicio</FieldLabel>
                <Input
                  id="meeting-start-time"
                  type="time"
                  value={startTime || '10:00'}
                  onChange={(e) => onUpdateHeaderField?.('startTime', e.target.value)}
                  className="text-center text-xs font-medium"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="meeting-end-time">Término</FieldLabel>
                <Input
                  id="meeting-end-time"
                  value={estimatedEndTime || '—'}
                  readOnly
                  aria-readonly="true"
                  className="text-center text-xs font-medium text-muted-foreground"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="meeting-duration">Duración</FieldLabel>
                <Input
                  id="meeting-duration"
                  value={totalPlannedMinutes >= 60 ? `${Math.floor(totalPlannedMinutes / 60)}h${totalPlannedMinutes % 60 ? ` ${totalPlannedMinutes % 60}m` : ''}` : `${totalPlannedMinutes}m`}
                  readOnly
                  aria-readonly="true"
                  className="text-center text-xs font-medium text-muted-foreground"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel>Facilita</FieldLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0 justify-between text-xs font-medium"
                      >
                        {host ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {(() => {
                              const matched = members.find(
                                (m) =>
                                  m.globalName.toLowerCase() === host.toLowerCase() ||
                                  m.tag.toLowerCase() === `@${host.toLowerCase()}`
                              );
                              const color = matched?.avatarColor || discordColorFor(host);
                              return (
                                <>
                                  <Avatar
                                    size="xs"
                                    className="size-5 shrink-0 text-xs font-bold shadow-2xs"
                                    style={{ backgroundColor: `${color}30`, color }}
                                  >
                                    <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>
                                      {host.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate">{host}</span>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="truncate text-muted-foreground">Buscar persona</span>
                        )}
                        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start" className="p-0">
                    <SearchableParticipantMenu
                      singleSelect
                      hideRoles
                      selectedKeys={host ? new Set([host]) : new Set()}
                      onSelectionChange={(keys) => {
                        const selectedTag = keys[0] || '';
                        const selectedEntity = resolveDiscordEntity(selectedTag);
                        const selectedHost = selectedEntity?.globalName || selectedTag.replace(/^@/, '');
                        onUpdateHeaderField?.('host', selectedHost);
                        onUpdateHeaderField?.('hostId', selectedEntity?.id || null);
                      }}
                      onAddCustomParticipant={(tag) => {
                        const clean = tag.replace(/^@/, '');
                        const entity = resolveDiscordEntity(tag);
                        onUpdateHeaderField?.('host', clean);
                        onUpdateHeaderField?.('hostId', entity?.id || null);
                      }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </Field>

              <Field className="sm:col-span-3">
                <FieldLabel>Participan</FieldLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full min-w-0 justify-between text-xs font-medium"
                      >
                        {selectedKeys.size > 0 ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                            <div className="flex shrink-0 items-center -space-x-1.5">
                              {Array.from(selectedKeys).slice(0, 4).map((tag, idx) => {
                                const cleanName = tag.replace(/^[@#]/, '');
                                const matched = members.find(
                                  (m) =>
                                    m.globalName.toLowerCase() === cleanName.toLowerCase() ||
                                    m.tag.toLowerCase() === tag.toLowerCase() ||
                                    `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                                );
                                const isRole = tag.startsWith('#') || (!matched && tag.startsWith('@'));
                                const color = matched?.avatarColor || discordColorFor(tag, idx + 1);

                                return (
                                  <Avatar
                                    key={tag}
                                    size="xs"
                                    className="size-5 shrink-0 border border-card text-xs font-bold shadow-2xs ring-1 ring-background"
                                    style={{ backgroundColor: `${color}30`, color }}
                                  >
                                    <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>
                                      {isRole ? '#' : cleanName.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                );
                              })}
                            </div>
                            <span className="min-w-0 truncate">
                              {Array.from(selectedKeys).map((tag) => tag.replace(/^[@#]/, '')).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="truncate text-muted-foreground">Buscar personas o roles</span>
                        )}
                        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start" className="p-0">
                    <SearchableParticipantMenu
                      selectedKeys={selectedKeys}
                      onSelectionChange={(nextKeys) => {
                        onUpdateHeaderField?.('mentions', nextKeys.join(' '));
                        onUpdateHeaderField?.('participantIds', entityIdsFromSelection(nextKeys));
                      }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </Field>
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
                · {totalPlannedMinutes} min
              </span>

              {host && (
                <div className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground font-normal">
                  <span>Organiza</span>
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
                          matched?.avatarColor || discordColorFor(tag, i);
                        const name = matched?.globalName || tag.replace(/^@/, '');
                        return (
                          <Avatar
                            key={i}
                            size="sm"
                            className="size-5 text-xs font-bold border-2 border-background shadow-2xs shrink-0"
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
      </div>
    </header>
  );
}
