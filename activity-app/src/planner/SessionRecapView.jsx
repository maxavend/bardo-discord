import {Button, Card, Chip, toast} from '@heroui/react';
import {
  CircleCheck,
  Clock,
  Microphone,
  Copy,
  FileText,
  ArrowRotateRight,
  Play,
} from '@gravity-ui/icons';
import {computeSessionRecap} from './session-assistant-engine.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';

export function SessionRecapView({
  plannerState,
  sessionState,
  onResumeSession,
  onViewMinutes,
  onNewSession,
  onRenameRecording,
  onDeleteRecording,
}) {
  const recap = computeSessionRecap(plannerState, sessionState);
  const isInterrupted = recap.isInterrupted;

  const handleCopyRecap = async () => {
    let text = `📋 **${recap.recapTitle}**\n`;
    text += `⏱ **Tiempo:** ${recap.actualDurationMinutes} min de ${recap.plannedDurationMinutes} min planificados\n`;
    text += `📚 **Bloques:** ${recap.completedCount} / ${recap.totalBlocksCount} completados`;
    if (recap.skippedCount > 0) text += ` · ${recap.skippedCount} saltados`;
    text += '\n';
    text += `✅ **Puntos tratados:** ${recap.completedPointsCount} / ${recap.totalPointsCount}`;
    if (recap.skippedPointsCount > 0) text += ` · ${recap.skippedPointsCount} saltados`;
    text += '\n';
    text += `🎙 **Grabaciones:** ${recap.totalRecordingsCount} (${recap.totalRecordedMinutes} min de audio)\n`;
    text += `📝 **Decisiones:** ${recap.decisions.length}\n`;
    if (recap.decisions.length > 0) {
      text += '\n**Decisiones y acuerdos:**\n';
      recap.decisions.forEach((decision) => {
        text += `- ${decision.content}\n`;
      });
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Resumen copiado al portapapeles');
    } catch {
      toast('No se pudo copiar el resumen');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto pb-16 pt-2 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
        <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-4 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Chip size="sm" variant="soft" color={recap.statusBadgeColor}>{recap.statusLabel}</Chip>
                <span className="text-xs text-muted">Session Recap</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{recap.recapTitle}</h1>
              <p className="text-xs text-muted mt-1">{recap.recapDescription}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isInterrupted && onResumeSession && (
                <Button variant="primary" size="sm" onPress={onResumeSession} className="font-semibold h-8 px-3">
                  <Play width={13} height={13} /> Reanudar sesión
                </Button>
              )}
              <Button variant="secondary" size="sm" onPress={handleCopyRecap} className="h-8 px-3">
                <Copy width={13} height={13} /> Copiar resumen
              </Button>
              <Button variant="ghost" size="sm" onPress={onViewMinutes} className="h-8 px-2.5 text-muted hover:text-foreground">
                <FileText width={13} height={13} /> Ver acta
              </Button>
              <Button variant="ghost" size="sm" onPress={onNewSession} className="h-8 px-2.5 text-muted hover:text-foreground">
                <ArrowRotateRight width={13} height={13} /> Nueva sesión
              </Button>
            </div>
          </div>

          <Card className="p-4 sm:p-5 rounded-xl">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted flex items-center gap-1"><Clock width={12} height={12} /> Tiempo efectivo</span>
                <strong className="text-base text-foreground">{recap.actualDurationMinutes} min</strong>
                <span className="text-[11px] text-muted">de {recap.plannedDurationMinutes} min</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">Bloques</span>
                <strong className="text-base text-foreground">{recap.completedCount} / {recap.totalBlocksCount}</strong>
                {recap.skippedCount > 0 && <span className="text-[11px] text-muted">{recap.skippedCount} saltados</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted">Puntos tratados</span>
                <strong className="text-base text-foreground">{recap.completedPointsCount} / {recap.totalPointsCount}</strong>
                {recap.skippedPointsCount > 0 && <span className="text-[11px] text-muted">{recap.skippedPointsCount} saltados</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted flex items-center gap-1"><Microphone width={12} height={12} /> Grabaciones</span>
                <strong className="text-base text-foreground">{recap.totalRecordingsCount}</strong>
                <span className="text-[11px] text-muted">{recap.totalRecordedMinutes} min de audio</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted flex items-center gap-1"><CircleCheck width={12} height={12} /> Decisiones</span>
                <strong className="text-base text-foreground">{recap.decisions.length}</strong>
                <span className="text-[11px] text-muted">registradas</span>
              </div>
            </div>
          </Card>

          {recap.groupedRecordings.length > 0 && (
            <Card className="p-4 sm:p-5 flex flex-col gap-4 rounded-xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Microphone width={14} height={14} className="text-accent" /> Grabaciones
                </h2>
                <span className="text-xs text-muted">{recap.totalRecordedMinutes} min en total</span>
              </div>

              <div className="flex flex-col gap-5">
                {recap.groupedRecordings.map(({block, pointGroups, blockFallbackRecordings}) => (
                  <section key={block.id} className="flex flex-col gap-2.5">
                    <h3 className="text-xs font-semibold text-muted">{block.title}</h3>
                    {pointGroups.map(({point, recordings}) => (
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
                        {pointGroups.length > 0 && <div className="text-xs font-medium text-muted">Grabaciones del bloque</div>}
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

          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CircleCheck width={14} height={14} className="text-success" />
              Decisiones y acuerdos ({recap.decisions.length})
            </h2>
            {recap.decisions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {recap.decisions.map((decision, index) => {
                  const block = plannerState.blocks.find((candidate) => candidate.id === decision.blockId);
                  const point = (block?.subpoints || []).find((candidate) => candidate.id === decision.pointId);
                  return (
                    <div key={decision.id || index} className="py-2 border-b border-border/30 last:border-0 text-xs text-foreground leading-relaxed">
                      <strong className="font-semibold">{decision.content}</strong>
                      {(point || block) && (
                        <span className="block text-[11px] text-muted mt-0.5">
                          {point ? `${block?.title} → ${point.title}` : block?.title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted italic">No se anotaron acuerdos durante esta sesión.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
