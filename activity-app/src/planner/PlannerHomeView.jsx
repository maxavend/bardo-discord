import {Button, Chip, Avatar} from '@heroui/react';
import {
  Play,
  FileText,
  Plus,
  ArrowRotateLeft,
  Clock,
  Calendar,
  CircleCheck,
  Microphone,
  ArrowRotateRight,
} from '@gravity-ui/icons';
import {SESSION_STATUS, recalculateEstimatedEndTime} from './session-runner.js';
import {getAllDiscordEntities} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) return matches.map((m) => m.trim()).filter(Boolean);
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function PlannerHomeView({
  plannerState,
  sessionState,
  onStartSession,
  onResumeSession,
  onViewAgenda,
  onViewMinutes,
  onViewRecap,
  onLoadDemo,
  onNewCleanSession,
}) {
  const {
    title = 'Sesión sin título',
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

  const StatusBadge = () => {
    if (isRunning) return <Chip size="sm" color="success" variant="soft" className="text-[10.5px] font-semibold">En curso</Chip>;
    if (isPaused) return <Chip size="sm" color="warning" variant="soft" className="text-[10.5px] font-semibold">Pausada</Chip>;
    if (isInterrupted) return <Chip size="sm" color="danger" variant="soft" className="text-[10.5px] font-semibold">Interrumpida</Chip>;
    if (isCompleted) return <Chip size="sm" color="success" variant="soft" className="text-[10.5px] font-semibold">Completada</Chip>;
    return <Chip size="sm" variant="flat" className="text-[10.5px] font-semibold text-muted">Pendiente</Chip>;
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-0 pt-4 pb-28 flex flex-col gap-6 animate-in fade-in duration-200">

      {/* ── Tarjeta principal de sesión ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">

        {isLive && (
          <div className="h-1 w-full bg-gradient-to-r from-accent via-accent/80 to-accent/40" />
        )}
        {isCompleted && (
          <div className="h-1 w-full bg-gradient-to-r from-success via-success/60 to-transparent" />
        )}

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge />
            {formattedDate && (
              <span className="text-xs text-muted flex items-center gap-1">
                <Calendar width={11} height={11} />
                {formattedDate}
              </span>
            )}
            {startTime && (
              <span className="text-xs text-muted flex items-center gap-1">
                <Clock width={11} height={11} />
                {startTime}–{estimatedEnd} · {formattedDuration}
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight mb-1">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted leading-relaxed line-clamp-2">{description}</p>
          )}

          {participantsList.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {host && (() => {
                const hostMember = members.find(
                  (m) => m.globalName.toLowerCase() === (host || '').toLowerCase()
                );
                const color = hostMember?.avatarColor || DISCORD_PALETTES[0];
                return (
                  <Avatar
                    name={hostMember?.globalName || host}
                    size="xs"
                    className="w-5 h-5 text-[8.5px] font-bold border border-background shadow-2xs shrink-0"
                    style={{backgroundColor: `${color}30`, color}}
                  />
                );
              })()}
              <div className="flex items-center -space-x-1.5">
                {participantsList.slice(0, 5).map((tag, i) => {
                  const matched = members.find(
                    (m) => m.tag.toLowerCase() === tag.toLowerCase() ||
                      `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                  );
                  const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                  return (
                    <Avatar
                      key={i}
                      name={matched?.globalName || tag.replace(/^@/, '')}
                      size="xs"
                      className="w-5 h-5 text-[8.5px] font-bold border-2 border-surface shadow-2xs shrink-0"
                      style={{backgroundColor: `${color}30`, color}}
                    />
                  );
                })}
              </div>
              {participantsList.length > 5 && (
                <span className="text-xs text-muted font-medium">+{participantsList.length - 5}</span>
              )}
              {host && <span className="text-xs text-muted ml-1">{host}</span>}
            </div>
          )}

          {(isLive || isCompleted || isInterrupted) && (totalPoints > 0 || decisions.length > 0 || recordings.length > 0) && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50 flex-wrap">
              {totalPoints > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <CircleCheck width={12} height={12} className="text-success" />
                  <span><strong className="text-foreground">{completedPoints}</strong>/{totalPoints} puntos</span>
                </span>
              )}
              {decisions.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <FileText width={12} height={12} className="text-accent" />
                  <span><strong className="text-foreground">{decisions.length}</strong> acuerdos</span>
                </span>
              )}
              {recordings.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Microphone width={12} height={12} className="text-accent" />
                  <span><strong className="text-foreground">{recordings.length}</strong> {recordings.length === 1 ? 'grabación' : 'grabaciones'}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 sm:px-5 sm:pb-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {isIdle && (
            <>
              <Button
                variant="primary"
                size="md"
                onPress={onStartSession}
                className="flex-1 sm:flex-none font-semibold text-sm h-10 px-5 flex items-center justify-center gap-2"
              >
                <Play width={14} height={14} /> Iniciar sesión
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={onViewAgenda}
                className="flex-1 sm:flex-none text-xs font-medium h-9 px-4"
              >
                Ver agenda
              </Button>
            </>
          )}
          {isLive && (
            <>
              <Button
                variant="primary"
                size="md"
                onPress={onViewAgenda}
                className="flex-1 sm:flex-none font-semibold text-sm h-10 px-5 flex items-center justify-center gap-2"
              >
                <ArrowRotateRight width={14} height={14} /> Continuar sesión
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={onViewMinutes}
                className="flex-1 sm:flex-none text-xs font-medium h-9 px-4 flex items-center gap-1.5"
              >
                <FileText width={13} height={13} /> Ver acta
              </Button>
            </>
          )}
          {isInterrupted && (
            <>
              <Button
                variant="primary"
                size="md"
                onPress={onResumeSession}
                className="flex-1 sm:flex-none font-semibold text-sm h-10 px-5 flex items-center justify-center gap-2"
              >
                <Play width={14} height={14} /> Reanudar sesión
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={onViewMinutes}
                className="flex-1 sm:flex-none text-xs font-medium h-9 px-4 flex items-center gap-1.5"
              >
                <FileText width={13} height={13} /> Ver acta
              </Button>
            </>
          )}
          {isCompleted && (
            <>
              <Button
                variant="primary"
                size="md"
                onPress={onViewRecap}
                className="flex-1 sm:flex-none font-semibold text-sm h-10 px-5 flex items-center justify-center gap-2"
              >
                <ArrowRotateRight width={14} height={14} /> Ver resumen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={onViewMinutes}
                className="flex-1 sm:flex-none text-xs font-medium h-9 px-4 flex items-center gap-1.5"
              >
                <FileText width={13} height={13} /> Ver acta
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Preview agenda ───────────────────────────────────────────────────── */}
      {blocks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider px-0.5">Agenda</h3>
          <div className="flex flex-col gap-1.5">
            {blocks.map((block, i) => {
              const donePoints = (block.subpoints || []).filter((p) => p.status === 'done').length;
              const totalBlockPoints = (block.subpoints || []).length;
              const isBlockActive = sessionState?.liveActiveBlockId === block.id;
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={onViewAgenda}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left w-full cursor-pointer ${
                    isBlockActive
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border/60 bg-surface hover:bg-surface-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`text-[11px] font-bold w-4 shrink-0 ${isBlockActive ? 'text-accent' : 'text-muted/60'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`text-sm font-medium truncate ${isBlockActive ? 'text-accent' : 'text-foreground'}`}>
                      {block.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {totalBlockPoints > 0 && (
                      <span className="text-xs text-muted">{donePoints}/{totalBlockPoints}</span>
                    )}
                    <span className="text-xs text-muted">{block.durationMinutes} min</span>
                    {isBlockActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Acciones secundarias ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider px-0.5">Acciones</h3>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onNewCleanSession}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-surface hover:bg-surface-secondary/50 transition-colors text-left cursor-pointer"
          >
            <Plus width={14} height={14} className="text-muted shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground">Nueva sesión</span>
              <span className="text-xs text-muted ml-2">Comenzar con agenda vacía</span>
            </div>
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-surface hover:bg-surface-secondary/50 transition-colors text-left cursor-pointer"
          >
            <ArrowRotateLeft width={14} height={14} className="text-muted shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground">Cargar demo Weekly</span>
              <span className="text-xs text-muted ml-2">Agenda de Diseño & SD de ejemplo</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
