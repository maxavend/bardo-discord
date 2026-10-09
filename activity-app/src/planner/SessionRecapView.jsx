import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import {
  CheckCircle2,
  Clock,
  Mic,
  MoreVertical,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button.jsx';
import {
  PlayIcon,
  CopyIcon,
  FileTextIcon,
} from '@/components/ui/animated-icons';
import { computeSessionRecap } from './session-assistant-engine.js';
import { generateMinutesMarkdown } from './planner-store.js';
import { todayLocalIso } from './date-utils.js';
import { formatSpokenDuration, getPlannedSchedule } from './time-engine.js';
import { PlannerAudioPlayer } from './PlannerAudioPlayer.jsx';

/** Clipboard write with a fallback for webviews where the async API is blocked. */
async function copyTextWithFallback(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function formatRecapDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return '';
  const text = new Intl.DateTimeFormat('es-CL', {weekday: 'short', day: 'numeric', month: 'short'})
    .format(new Date(year, month - 1, day))
    .replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({icon = null, label, value, hint = null}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <strong className="text-lg font-semibold text-foreground tabular-nums">{value}</strong>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function SessionRecapView({
  plannerState,
  sessionState,
  onResumeSession,
  onReopenSession,
  _onViewMinutes,
  onNewSession,
  onRenameRecording,
  onDeleteRecording,
  onSaveDocToLibrary,
}) {
  const recap = computeSessionRecap(plannerState, sessionState);
  const isInterrupted = recap.isInterrupted;
  const canReopen = recap.isCompleted && (plannerState?.blocks || []).length > 0;

  const handleSaveDoc = () => {
    if (!onSaveDocToLibrary) return;
    const md = generateMinutesMarkdown(plannerState, sessionState);
    onSaveDocToLibrary({
      // Stable per meeting so saving again updates the same acta.
      id: `minutes-${plannerState.id || plannerState.eventId || Date.now().toString(36)}`,
      plannerSessionId: plannerState.id || null,
      title: `Acta: ${plannerState.title || 'Reunión'}`,
      description: `Acta y acuerdos de la reunión del ${plannerState.date || todayLocalIso()}`,
      body: md,
    });
  };

  const handleCopyRecap = async () => {
    let text = `📋 **Resumen · ${recap.recapTitle}**\n`;
    text += recap.leftOpen
      ? `⏱ **Tiempo:** no medible (la reunión quedó abierta) · ${formatSpokenDuration(recap.plannedDurationMinutes)} planificados\n`
      : `⏱ **Tiempo:** ${formatSpokenDuration(recap.actualDurationMinutes)} de ${formatSpokenDuration(recap.plannedDurationMinutes)} planificados\n`;
    text += `📚 **Bloques:** ${recap.completedCount} de ${recap.totalBlocksCount} completados`;
    if (recap.skippedCount > 0) text += ` · ${recap.skippedCount} saltados`;
    text += '\n';
    text += `✅ **Temas tratados:** ${recap.completedPointsCount} de ${recap.totalPointsCount}`;
    if (recap.skippedPointsCount > 0) text += ` · ${recap.skippedPointsCount} saltados`;
    text += '\n';
    text += `🎙 **Grabaciones:** ${recap.totalRecordingsCount} (${formatSpokenDuration(recap.totalRecordedMinutes)} de audio)\n`;
    text += `📝 **Acuerdos:** ${recap.decisions.length}\n`;
    if (recap.decisions.length > 0) {
      text += '\n**Acuerdos:**\n';
      recap.decisions.forEach((decision) => {
        const ownerTag = decision.owner ? ` (@${decision.owner.replace(/^@/, '')})` : '';
        text += `- ${decision.content}${ownerTag}\n`;
      });
    }
    const copied = await copyTextWithFallback(text);
    toast(copied ? 'Resumen copiado' : 'No se pudo copiar el resumen. Intenta de nuevo.');
  };

  const schedule = getPlannedSchedule(plannerState || {});
  const metaLine = [
    formatRecapDate(plannerState?.date),
    plannerState?.startTime ? `${plannerState.startTime}–${schedule.plannedEnd}` : null,
    plannerState?.host ? `Facilita ${plannerState.host}` : null,
  ].filter(Boolean).join(' · ');
  const hasDecisions = recap.decisions.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto pb-16 pt-2 animate-in fade-in duration-150">
      <div className="flex flex-col gap-5 min-w-0 w-full">
        {/* Título → estado y fecha → una acción principal, ícono para copiar, "⋯" para el resto. */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-balance">{recap.recapTitle}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <Badge variant={isInterrupted ? 'destructive' : 'secondary'}>{recap.statusLabel}</Badge>
              {metaLine && <span>{metaLine}</span>}
            </div>
            {recap.recapDescription && <p className="text-sm text-muted-foreground mt-2">{recap.recapDescription}</p>}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <IconButton label="Copiar resumen" onClick={handleCopyRecap}>
              <CopyIcon className="size-4" />
            </IconButton>
            {isInterrupted && onResumeSession ? (
              <Button variant="default" size="sm" onClick={onResumeSession} className="font-semibold h-8 px-3.5 ml-1">
                <PlayIcon className="size-3.5" /> Reanudar reunión
              </Button>
            ) : onSaveDocToLibrary ? (
              <Button variant="default" size="sm" onClick={handleSaveDoc} className="font-semibold h-8 px-3.5 ml-1">
                <FileTextIcon className="size-3.5" /> Guardar acta en Documentos
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Más opciones del resumen"
                    title="Más opciones"
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                {isInterrupted && onSaveDocToLibrary && (
                  <DropdownMenuItem onClick={handleSaveDoc}>
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <span>Guardar acta en Documentos</span>
                  </DropdownMenuItem>
                )}
                {canReopen && onReopenSession && (
                  <DropdownMenuItem onClick={onReopenSession}>
                    <RotateCcw className="size-4 text-muted-foreground" />
                    <span>Reabrir reunión</span>
                  </DropdownMenuItem>
                )}
                {onNewSession && (
                  <DropdownMenuItem onClick={onNewSession}>
                    <Plus className="size-4 text-muted-foreground" />
                    <span>Nueva reunión</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

          {hasDecisions && (
            <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-2xl">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Acuerdos ({recap.decisions.length})
              </h2>
              <div className="flex flex-col gap-2">
                {recap.decisions.map((decision, index) => {
                  const block = plannerState.blocks.find((candidate) => candidate.id === decision.blockId);
                  const point = (block?.subpoints || []).find((candidate) => candidate.id === decision.pointId);
                  const ownerName = decision.owner ? decision.owner.trim().replace(/^@/, '') : null;
                  return (
                    <div key={decision.id || index} className="py-2 border-b border-border/30 last:border-0 text-xs text-foreground leading-relaxed flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="font-semibold">{decision.content}</strong>
                        {(point || block) && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {point ? `${block?.title} → ${point.title}` : block?.title}
                          </span>
                        )}
                      </div>
                      {ownerName && (
                        <span className="text-[11px] text-muted-foreground font-medium shrink-0 bg-muted/60 px-2 py-0.5 rounded-full">
                          {ownerName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-4 sm:p-5 rounded-2xl">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4">
              <Stat
                icon={<Clock className="size-3" />}
                label={recap.timeEffectiveLabel}
                value={recap.leftOpen ? '—' : formatSpokenDuration(recap.actualDurationMinutes)}
                hint={recap.leftOpen
                  ? `Quedó abierta ${formatSpokenDuration(recap.actualDurationMinutes)}; no se puede medir`
                  : `de ${formatSpokenDuration(recap.plannedDurationMinutes)} planificados`}
              />
              <Stat
                label="Bloques"
                value={`${recap.completedCount} de ${recap.totalBlocksCount}`}
                hint={recap.skippedCount > 0 ? `${recap.skippedCount} saltados` : null}
              />
              <Stat
                label="Temas tratados"
                value={recap.totalPointsCount > 0 ? `${recap.completedPointsCount} de ${recap.totalPointsCount}` : '—'}
                hint={recap.totalPointsCount === 0 ? 'Sin temas' : recap.skippedPointsCount > 0 ? `${recap.skippedPointsCount} saltados` : null}
              />
              <Stat
                icon={<Mic className="size-3" />}
                label="Grabaciones"
                value={recap.totalRecordingsCount}
                hint={recap.totalRecordingsCount > 0 ? `${formatSpokenDuration(recap.totalRecordedMinutes)} de audio` : 'Sin audio'}
              />
              <Stat
                icon={<CheckCircle2 className="size-3" />}
                label="Acuerdos"
                value={recap.decisions.length}
                hint={hasDecisions ? (recap.decisions.length === 1 ? 'registrado' : 'registrados') : 'Ninguno anotado'}
              />
            </div>
          </Card>

          {recap.groupedRecordings.length > 0 && (
            <Card className="p-4 sm:p-5 flex flex-col gap-4 rounded-2xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Mic className="size-3.5 text-primary" /> Grabaciones
                </h2>
                <span className="text-xs text-muted-foreground">{recap.totalRecordedMinutes} min en total</span>
              </div>

              <div className="flex flex-col gap-5">
                {recap.groupedRecordings.map(({ block, pointGroups, blockFallbackRecordings }) => (
                  <section key={block.id} className="flex flex-col gap-2.5">
                    <h3 className="text-xs font-semibold text-muted-foreground">{block.title}</h3>
                    {pointGroups.map(({ point, recordings }) => (
                      <div key={point.id} className="flex flex-col gap-1.5">
                        <div className="text-sm font-semibold text-foreground">{point.title}</div>
                        {recordings.map((recording) => (
                          <PlannerAudioPlayer
                            key={recording.id}
                            recording={recording}
                            onRename={onRenameRecording}
                            onDelete={onDeleteRecording}
                          />
                        ))}
                      </div>
                    ))}
                    {blockFallbackRecordings.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {pointGroups.length > 0 && <div className="text-xs font-medium text-muted-foreground">Grabaciones del bloque</div>}
                        {blockFallbackRecordings.map((recording) => (
                          <PlannerAudioPlayer
                            key={recording.id}
                            recording={recording}
                            onRename={onRenameRecording}
                            onDelete={onDeleteRecording}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </Card>
          )}

        </div>
    </div>
  );
}
