import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/badge';
import {
  FileText,
  Plus,
  Clock,
  Calendar,
  CircleCheck,
  Microphone,
  ChevronRight,
} from '@gravity-ui/icons';
import {SESSION_STATUS, recalculateEstimatedEndTime} from './session-runner.js';
import {getAllDiscordEntities} from './PlannerMemberPicker.jsx';
import {pluralize, formatTopicsCountLabel, formatRecordingsCountLabel} from './copy-tokens.js';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) return matches.map((m) => m.trim()).filter(Boolean);
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function isDefaultEmptySession(plannerState) {
  if (!plannerState) return true;
  const {title, blocks = []} = plannerState;
  const hasDefaultTitle = title === 'Nueva sesión de trabajo' || title === 'Nueva reunión' || !title;
  const hasOnlyDefaultBlock = blocks.length === 1 && blocks[0]?.id === 'b-default-1';
  return hasDefaultTitle && hasOnlyDefaultBlock;
}

export function PlannerHomeView({
  plannerState,
  sessionState,
  onViewAgenda,
  onNewCleanSession,
  events = [],
  selectedEventId = null,
  onSelectEvent,
}) {
  const {
    title = 'Reunión sin título',
    description = '',
    date = '',
    startTime = '10:00',
    blocks = [],
    host = '',
    mentions = '',
  } = plannerState || {};

  const status = sessionState?.status || SESSION_STATUS.IDLE;
  const isIdle = status === SESSION_STATUS.IDLE;
  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isInterrupted = status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = status === SESSION_STATUS.COMPLETED;
  const isLive = isRunning || isPaused;

  const isEmpty = isDefaultEmptySession(plannerState);

  const totalMinutes = (blocks || []).reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
  const estimatedEnd = recalculateEstimatedEndTime(startTime, totalMinutes);

  let formattedDate = date;
  try {
    const [year, month, day] = (date || '').split('-').map(Number);
    if (year && month && day) {
      const d = new Date(year, month - 1, day);
      const weekday = new Intl.DateTimeFormat('es-ES', {weekday: 'short'}).format(d);
      const monthName = new Intl.DateTimeFormat('es-ES', {month: 'short'}).format(d);
      formattedDate = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${monthName}`;
    }
  } catch {
    formattedDate = date;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedDuration = hours > 0 ? (mins > 0 ? `${hours} h ${mins} min` : `${hours} h`) : `${mins} min`;

  const participantsList = parseMentions(mentions);
  const {members} = getAllDiscordEntities();

  const decisions = (sessionState?.decisions || []);
  const recordings = (sessionState?.recordings || []);
  const completedPoints = (blocks || []).flatMap((b) =>
    (b.subpoints || []).filter((p) => p.status === 'done')
  ).length;
  const totalPoints = (blocks || []).flatMap((b) => b.subpoints || []).length;

  // ─── Status badge ─────────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (isRunning) return <Chip size="sm" color="success" variant="soft" className="text-[10.5px] font-semibold">En curso</Chip>;
    if (isPaused) return <Chip size="sm" color="warning" variant="soft" className="text-[10.5px] font-semibold">Pausada</Chip>;
    if (isInterrupted) return <Chip size="sm" color="danger" variant="soft" className="text-[10.5px] font-semibold">Interrumpida</Chip>;
    if (isCompleted) return <Chip size="sm" color="success" variant="soft" className="text-[10.5px] font-semibold">Finalizada</Chip>;
    return <Chip size="sm" variant="tertiary" className="text-[10.5px] font-semibold text-muted">Pendiente</Chip>;
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-0 pt-2 pb-28 flex flex-col gap-5 animate-in fade-in duration-200">

      {/* ── Reunión actual / Empty state ─────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        {isEmpty && isIdle ? (
          /* Empty state */
          <Card className="p-5 flex flex-col items-center gap-3 rounded-2xl shadow-2xs border-border/80 bg-surface text-center">
            <div className="w-10 h-10 rounded-xl bg-surface-secondary/70 border border-border/60 flex items-center justify-center">
              <Calendar width={18} height={18} className="text-muted/60" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Todavía no hay reuniones</p>
              <p className="text-xs text-muted mt-0.5">Organiza agendas, conduce reuniones y registra acuerdos.</p>
            </div>
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              <Button variant="primary" size="sm" onPress={onNewCleanSession}
                className="text-xs font-semibold h-8 px-4 flex items-center justify-center gap-1.5">
                <Plus width={13} height={13} /> Nueva reunión
              </Button>
            </div>
          </Card>
        ) : (
          /* Session card — mismo estilo que block cards */
          <Card
            role="button"
            tabIndex={0}
            onClick={onViewAgenda}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onViewAgenda?.();
              }
            }}
            className={`p-4 sm:p-4.5 flex flex-col gap-2.5 rounded-2xl transition-all duration-200 shadow-2xs cursor-pointer hover:border-primary hover:shadow-xs focus-visible:outline-2 focus-visible:outline-focus ${
            isLive
              ? 'border-accent/60 ring-1 ring-accent/20 bg-surface'
              : isCompleted
                ? 'border-success/40 bg-surface'
                : 'border-border/80 bg-surface'
          }`}>
            {/* Status + fecha + horario */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {formattedDate && (
                <span className="text-xs text-muted flex items-center gap-1">
                  <Calendar width={11} height={11} className="shrink-0" />
                  {formattedDate}
                </span>
              )}
              {startTime && totalMinutes > 0 && (
                <span className="text-xs text-muted flex items-center gap-1">
                  <Clock width={11} height={11} className="shrink-0" />
                  {startTime}–{estimatedEnd} · {formattedDuration}
                </span>
              )}
              <span className="ml-auto"><StatusBadge /></span>
            </div>

            {/* Título */}
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground leading-tight">
                {title}
              </h2>
              {description && (
                <p className="text-xs text-muted leading-relaxed line-clamp-2 mt-0.5">{description}</p>
              )}
            </div>

            {/* Participantes */}
            {participantsList.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center -space-x-1.5">
                  {(host ? [host, ...participantsList] : participantsList).slice(0, 6).map((tag, i) => {
                    const matched = members.find(
                      (m) => m.globalName.toLowerCase() === tag.toLowerCase().replace(/^@/, '') ||
                        m.tag.toLowerCase() === tag.toLowerCase() ||
                        `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                    );
                    const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                    return (
                      <Avatar
                        key={i}
                        name={matched?.globalName || tag.replace(/^@/, '')}
                        size="sm"
                        className="w-5 h-5 text-[8.5px] font-bold border-2 border-surface shadow-2xs shrink-0"
                        style={{backgroundColor: `${color}30`, color}}
                      />
                    );
                  })}
                </div>
                {participantsList.length > 5 && (
                  <span className="text-xs text-muted font-medium">+{participantsList.length - 5}</span>
                )}
                {host && <span className="text-xs text-muted">Organiza {host}</span>}
              </div>
            )}

            {/* Métricas en vivo / post-sesión */}
            {(isLive || isCompleted || isInterrupted) && (totalPoints > 0 || decisions.length > 0 || recordings.length > 0) && (
              <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/40">
                {totalPoints > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <CircleCheck width={12} height={12} className="text-success shrink-0" />
                    <strong className="text-foreground">{completedPoints}</strong> de {formatTopicsCountLabel(totalPoints)}
                  </span>
                )}
                {decisions.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <FileText width={12} height={12} className="text-accent shrink-0" />
                    <strong className="text-foreground">{pluralize(decisions.length, 'decisión', 'decisiones')}</strong>
                  </span>
                )}
                {recordings.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Microphone width={12} height={12} className="text-accent shrink-0" />
                    <strong className="text-foreground">{formatRecordingsCountLabel(recordings.length)}</strong>
                  </span>
                )}
              </div>
            )}

          </Card>
        )}
      </section>

      {/* ── Event index / stress fixture ─────────────────────────────────── */}
      {events.length > 0 && (
        <section className="library-section recent-section">
          <div className="flex items-center justify-between gap-3">
            <h3 className="section-title mb-0">Eventos ({events.length})</h3>
            <span className="text-[11px] text-muted self-center">Explora tus agendas</span>
          </div>
          <div className="docs-list">
            {events.map((event) => {
              const eventMinutes = (event.blocks || []).reduce((sum, block) => sum + (block.durationMinutes || 0), 0);
              const eventDate = event.date
                ? new Intl.DateTimeFormat('es-ES', {weekday: 'short', day: 'numeric', month: 'short'}).format(new Date(`${event.date}T12:00:00`))
                : 'Fecha por confirmar';
              const eventStatus = event.eventStatus === 'completed'
                ? 'Completado'
                : event.eventStatus === 'in_progress'
                  ? 'En curso'
                  : 'Programado';
              const isSelected = selectedEventId === event.eventId;
              return (
                <article className={`doc-row ${isSelected ? 'event-row-selected' : ''}`} key={event.eventId}>
                  <span className="doc-symbol">
                    {event.eventStatus === 'completed' ? <CircleCheck width={18} height={18} className="text-success" /> : <Calendar width={18} height={18} />}
                  </span>
                  <button
                    className="doc-row-main"
                    type="button"
                    onClick={() => onSelectEvent?.(event)}
                    aria-label={`Abrir evento ${event.title}`}
                  >
                    <strong>{event.title}</strong>
                    <span>{eventStatus} · {eventDate} · {event.startTime} · {event.blocks?.length || 0} bloques · {eventMinutes >= 60 && eventMinutes % 60 === 0 ? `${eventMinutes / 60} h` : `${eventMinutes} min`}</span>
                  </button>
                  <ChevronRight width={16} height={16} className="text-muted" aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
