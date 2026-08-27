import {useState, useEffect} from 'react';
import {
  Button,
  ProgressBar,
  Dropdown,
  Popover,
  Label,
  Description,
} from '@heroui/react';
import {
  ChevronLeft,
  FileText,
  Pencil,
  Copy,
  Plus,
  ArrowRotateLeft,
  EllipsisVertical,
  Play,
  Check,
  ArrowRotateRight,
} from '@gravity-ui/icons';
import {
  SESSION_STATUS,
  getPointCounts,
  recalculateEstimatedEndTime,
} from './session-runner.js';
import {DEFAULT_DISCORD_MEMBERS} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function getInitials(name = '') {
  const clean = name.replace(/^@/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    const dayName = date.toLocaleDateString('es-ES', {weekday: 'short'});
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', '');
    const monthName = date.toLocaleDateString('es-ES', {month: 'short'}).replace('.', '');
    return `${capitalizedDay} ${d} ${monthName}`;
  } catch {
    return dateStr;
  }
}

function formatHeaderDuration(minutes = 0) {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours > 0 && rem === 0) return `${hours} h`;
  if (hours > 0) return `${hours} h ${rem} min`;
  return `${minutes} min`;
}

export function PlannerSessionHeader({
  state,
  sessionState,
  activeTab,
  onTabChange,
  onOpenEditor,
  onCopyAnnouncement,
  onNewCleanSession,
  onLoadDemo,
  onStartSession,
  onResumeSession,
  onInterruptSession,
}) {
  const [isSticky, setIsSticky] = useState(false);

  const {
    title = 'Sesión sin título',
    date = '',
    startTime = '10:00',
    totalCalculatedDuration = 0,
    host = '',
    mentions = '',
  } = state;

  const pointCounts = sessionState?.status && sessionState.status !== SESSION_STATUS.IDLE
    ? getPointCounts(state, sessionState)
    : {
        total: (state.blocks || []).reduce((acc, block) => acc + (block.subpoints || []).length, 0),
        done: (state.blocks || []).reduce(
          (acc, block) => acc + (block.subpoints || []).filter((point) => point.status === 'done').length,
          0
        ),
        skipped: (state.blocks || []).reduce(
          (acc, block) => acc + (block.subpoints || []).filter((point) => point.status === 'skipped').length,
          0
        ),
      };
  const totalPoints = pointCounts.total;
  const completedPoints = pointCounts.done;
  const skippedPoints = pointCounts.skipped || 0;
  const progressPercent = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  const isRunning = sessionState?.status === SESSION_STATUS.RUNNING;
  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isCompleted = sessionState?.status === SESSION_STATUS.COMPLETED;
  const isInterrupted = sessionState?.status === SESSION_STATUS.INTERRUPTED;

  const formattedDate = formatSessionDate(date);
  const estimatedEndTime = recalculateEstimatedEndTime(state, sessionState);
  const formattedDuration = formatHeaderDuration(totalCalculatedDuration);
  const participantsList = parseMentions(mentions);

  useEffect(() => {
    const handleScroll = () => setIsSticky(window.scrollY > 140);
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="w-full max-w-4xl mx-auto pt-2 pb-3 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
        <div className="hidden sm:flex items-center justify-end pr-2 pt-1 select-none">
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'editor' || activeTab === 'minutes' || activeTab === 'recap') onTabChange('agenda');
              else window.location.hash = '';
            }}
            aria-label="Volver"
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors cursor-pointer"
          >
            <ChevronLeft width={16} height={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 min-w-0 w-full">
          <div className="flex sm:hidden items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'editor' || activeTab === 'minutes' || activeTab === 'recap') onTabChange('agenda');
                else window.location.hash = '';
              }}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground font-medium transition-colors cursor-pointer"
            >
              <ChevronLeft width={14} height={14} />
              <span>Volver</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border/40 pb-3">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">{title}</h1>

                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> En curso
                  </span>
                )}
                {isPaused && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning select-none">En pausa</span>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/15 text-success select-none">
                    <Check width={11} height={11} /> Finalizada
                  </span>
                )}
                {isInterrupted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning select-none">Interrumpida</span>
                )}
                {!isRunning && !isPaused && !isCompleted && !isInterrupted && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-muted select-none">Próxima</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {!isRunning && !isPaused && (
                <Button variant="ghost" size="sm" onPress={onCopyAnnouncement} className="text-xs text-muted hover:text-foreground hidden sm:inline-flex h-8 px-2.5 font-medium">
                  <Copy width={13} height={13} /> <span>Copiar anuncio</span>
                </Button>
              )}

              {!isRunning && !isPaused && (
                <Button variant="ghost" size="sm" onPress={onOpenEditor} className="text-xs text-muted hover:text-foreground hidden md:inline-flex h-8 px-2.5 font-medium">
                  <Pencil width={13} height={13} /> <span>Editar</span>
                </Button>
              )}

              <Dropdown>
                <Dropdown.Trigger>
                  <Button variant="ghost" size="sm" isIconOnly aria-label="Más opciones de la sesión" className="h-8 w-8 text-muted hover:text-foreground">
                    <EllipsisVertical width={14} height={14} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    onAction={(key) => {
                      if (key === 'view-minutes') onTabChange('minutes');
                      if (key === 'view-recap') onTabChange('recap');
                      if (key === 'edit') onOpenEditor();
                      if (key === 'copy-announcement') onCopyAnnouncement();
                      if (key === 'new-clean') onNewCleanSession();
                      if (key === 'load-demo') onLoadDemo();
                      if (key === 'interrupt' && onInterruptSession) onInterruptSession();
                    }}
                  >
                    <Dropdown.Item id="view-minutes" textValue="Ver acta y acuerdos">
                      <FileText />
                      <Label>Ver acta y acuerdos</Label>
                      <Description>Decisiones y temas tratados</Description>
                    </Dropdown.Item>
                    {(isCompleted || isInterrupted) && (
                      <Dropdown.Item id="view-recap" textValue="Ver resumen (Session Recap)">
                        <ArrowRotateRight />
                        <Label>Ver resumen (Recap)</Label>
                        <Description>Métricas y grabaciones de la sesión</Description>
                      </Dropdown.Item>
                    )}
                    {(isRunning || isPaused) && (
                      <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                        <ArrowRotateLeft />
                        <Label>Interrumpir sesión</Label>
                        <Description>Pausar y conservar grabaciones</Description>
                      </Dropdown.Item>
                    )}
                    <Dropdown.Item id="edit" textValue="Editar estructura">
                      <Pencil />
                      <Label>Editar sesión</Label>
                      <Description>Configurar bloques y puntos</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="copy-announcement" textValue="Copiar anuncio">
                      <Copy />
                      <Label>Copiar anuncio</Label>
                      <Description>Para compartir en canales de Discord</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="new-clean" textValue="Nueva sesión limpia">
                      <Plus />
                      <Label>Nueva sesión limpia</Label>
                      <Description>Empezar una agenda desde cero</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="load-demo" textValue="Cargar demo semanal">
                      <ArrowRotateLeft />
                      <Label>Cargar demo semanal</Label>
                      <Description>Ejemplo de diseño & producto</Description>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              {isInterrupted && onResumeSession && (
                <Button variant="primary" size="sm" onPress={onResumeSession} className="font-medium h-8 px-3.5">
                  <Play width={13} height={13} /> <span>Reanudar sesión</span>
                </Button>
              )}

              {!isRunning && !isPaused && !isCompleted && !isInterrupted && (
                <Button variant="primary" size="sm" onPress={onStartSession} className="font-medium h-8 px-3.5">
                  <Play width={13} height={13} /> <span>Iniciar sesión</span>
                </Button>
              )}

              {(isRunning || isPaused) && (
                <Button variant="secondary" size="sm" onPress={() => onTabChange('minutes')} className="font-medium h-8 px-3">
                  <FileText width={13} height={13} /> <span>Ver acta</span>
                </Button>
              )}

              {isCompleted && (
                <Button variant="primary" size="sm" onPress={() => onTabChange('recap')} className="font-medium h-8 px-3.5">
                  <FileText width={13} height={13} /> <span>Ver resumen</span>
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted font-normal">
            {formattedDate && <span>{formattedDate}</span>}
            {formattedDate && <span className="text-muted/40">·</span>}
            <span>{startTime}–{estimatedEndTime}</span>
            <span className="text-muted/40">·</span>
            <span>{formattedDuration}</span>
            {host && <span className="text-muted/40">·</span>}
            {host && <span className="text-foreground/90 font-medium">{host}</span>}

            {participantsList.length > 0 && (
              <>
                <span className="text-muted/40">·</span>
                <Popover>
                  <Popover.Trigger>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer select-none"
                      aria-label={`Ver ${participantsList.length} participantes convocados`}
                    >
                      <div className="flex items-center -space-x-1.5">
                        {participantsList.slice(0, 3).map((tag, i) => {
                          const matched = DEFAULT_DISCORD_MEMBERS.find(
                            (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                          );
                          const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                          return (
                            <div
                              key={i}
                              style={{backgroundColor: `${color}35`, color}}
                              className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-bold shadow-2xs"
                            >
                              {getInitials(matched?.globalName || tag)}
                            </div>
                          );
                        })}
                      </div>
                      {participantsList.length > 3 && <span className="text-[11px] font-medium text-muted">+{participantsList.length - 3}</span>}
                    </button>
                  </Popover.Trigger>
                  <Popover.Content className="w-64 p-3 rounded-xl bg-surface border border-border shadow-xl">
                    <Popover.Dialog>
                      <Popover.Heading className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border/40">
                        Convocados a la sesión ({participantsList.length})
                      </Popover.Heading>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {participantsList.map((tag, i) => {
                          const matched = DEFAULT_DISCORD_MEMBERS.find(
                            (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                          );
                          const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                              <div
                                style={{backgroundColor: `${color}25`, color}}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                              >
                                {getInitials(matched?.globalName || tag)}
                              </div>
                              <span className="font-medium text-foreground truncate">{matched?.globalName || tag}</span>
                            </div>
                          );
                        })}
                      </div>
                    </Popover.Dialog>
                  </Popover.Content>
                </Popover>
              </>
            )}
          </div>

          {!isRunning && !isPaused && totalPoints > 0 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs font-medium text-foreground shrink-0">
                {completedPoints} de {totalPoints} puntos tratados{skippedPoints > 0 ? ` · ${skippedPoints} saltados` : ''}
              </span>
              <ProgressBar aria-label="Progreso de puntos tratados en la sesión" value={progressPercent} color="accent" size="sm" className="flex-1 max-w-sm">
                <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
              </ProgressBar>
              <span className="text-xs font-semibold text-muted shrink-0 tabular-nums">{progressPercent}%</span>
            </div>
          )}
        </div>
      </div>

      {isSticky && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b border-border py-2.5 px-4 shadow-sm transition-all animate-in fade-in duration-200">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold text-foreground truncate">{title}</span>
              {totalPoints > 0 && <span className="text-xs text-muted hidden sm:inline">·</span>}
              {totalPoints > 0 && (
                <span className="text-xs text-muted/90 font-medium shrink-0 hidden sm:inline">
                  {completedPoints}/{totalPoints} tratados{skippedPoints > 0 ? ` · ${skippedPoints} saltados` : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isRunning && !isPaused && !isCompleted && (
                <Button variant="primary" size="sm" onPress={onStartSession}>
                  <Play width={12} height={12} /> <span>Iniciar</span>
                </Button>
              )}
              {isCompleted && (
                <Button variant="primary" size="sm" onPress={() => onTabChange('recap')}>
                  <FileText width={12} height={12} /> <span>Resumen</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" isIconOnly onPress={onOpenEditor} aria-label="Editar sesión">
                <Pencil width={13} height={13} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
