import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import {
  CheckCircle2,
  Clock,
  Mic,
  RotateCw,
} from 'lucide-react';
import {
  PlayIcon,
  CopyIcon,
  FileTextIcon,
} from '@/components/ui/animated-icons';
import { computeSessionRecap } from './session-assistant-engine.js';
import { generateMinutesMarkdown } from './planner-store.js';
import { PlannerAudioPlayer } from './PlannerAudioPlayer.jsx';

export function SessionRecapView({
  plannerState,
  sessionState,
  onResumeSession,
  _onViewMinutes,
  onNewSession,
  onRenameRecording,
  onDeleteRecording,
  onSaveDocToLibrary,
}) {
  const recap = computeSessionRecap(plannerState, sessionState);
  const isInterrupted = recap.isInterrupted;

  const handleSaveDoc = () => {
    if (!onSaveDocToLibrary) return;
    const md = generateMinutesMarkdown(plannerState, sessionState);
    onSaveDocToLibrary({
      id: `minutes-${Date.now().toString(36)}`,
      title: `Acta: ${plannerState.title || 'Reunión'}`,
      description: `Acta y acuerdos de la sesión del ${plannerState.date || new Date().toISOString().split('T')[0]}`,
      body: md,
    });
  };

  const handleCopyRecap = async () => {
    let text = `📋 **${recap.recapTitle}**\n`;
    text += `⏱ **Tiempo:** ${recap.actualDurationMinutes} min de ${recap.plannedDurationMinutes} min planificados\n`;
    text += `📚 **Bloques:** ${recap.completedCount} / ${recap.totalBlocksCount} completados`;
    if (recap.skippedCount > 0) text += ` · ${recap.skippedCount} saltados`;
    text += '\n';
    text += `✅ **Temas tratados:** ${recap.completedPointsCount} / ${recap.totalPointsCount}`;
    if (recap.skippedPointsCount > 0) text += ` · ${recap.skippedPointsCount} saltados`;
    text += '\n';
    text += `🎙 **Grabaciones:** ${recap.totalRecordingsCount} (${recap.totalRecordedMinutes} min de audio)\n`;
    text += `📝 **Decisiones:** ${recap.decisions.length}\n`;
    if (recap.decisions.length > 0) {
      text += '\n**Decisiones:**\n';
      recap.decisions.forEach((decision) => {
        const ownerTag = decision.owner ? ` (@${decision.owner.replace(/^@/, '')})` : '';
        text += `- ${decision.content}${ownerTag}\n`;
      });
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Resumen copiado');
    } catch {
      toast('No se pudo copiar el resumen');
    }
  };

  const badgeVariant = isInterrupted
    ? 'destructive'
    : recap.completedCount === recap.totalBlocksCount
      ? 'default'
      : 'secondary';

  return (
    <div className="w-full max-w-4xl mx-auto pb-16 pt-2 animate-in fade-in duration-150">
      <div className="flex flex-col gap-4 min-w-0 w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={badgeVariant}>{recap.statusLabel}</Badge>
                <span className="text-xs text-muted-foreground">Resumen de la reunión</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{recap.recapTitle}</h1>
              <p className="text-xs text-muted-foreground mt-1">{recap.recapDescription}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isInterrupted && onResumeSession && (
                <Button variant="default" size="sm" onClick={onResumeSession} className="font-semibold h-8 px-3">
                  <PlayIcon className="size-3.5" /> Reanudar reunión
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={handleCopyRecap} className="h-8 px-3">
                <CopyIcon className="size-3.5" /> Copiar resumen
              </Button>
              {onSaveDocToLibrary && (
                <Button variant="default" size="sm" onClick={handleSaveDoc} className="h-8 px-3 font-semibold">
                  <FileTextIcon className="size-3.5" /> Guardar acta en Docs
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onNewSession} className="h-8 px-2.5 text-muted-foreground hover:text-foreground">
                <RotateCw className="size-3.5" /> Nueva reunión
              </Button>
            </div>
          </div>

          <Card className="p-4 sm:p-5 rounded-2xl">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> Tiempo efectivo</span>
                <strong className="text-base text-foreground">{recap.actualDurationMinutes} min</strong>
                <span className="text-[11px] text-muted-foreground">de {recap.plannedDurationMinutes} min</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">Bloques</span>
                <strong className="text-base text-foreground">{recap.completedCount} / {recap.totalBlocksCount}</strong>
                {recap.skippedCount > 0 && <span className="text-[11px] text-muted-foreground">{recap.skippedCount} saltados</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">Temas tratados</span>
                <strong className="text-base text-foreground">{recap.completedPointsCount} / {recap.totalPointsCount}</strong>
                {recap.skippedPointsCount > 0 && <span className="text-[11px] text-muted-foreground">{recap.skippedPointsCount} saltados</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Mic className="size-3" /> Grabaciones</span>
                <strong className="text-base text-foreground">{recap.totalRecordingsCount}</strong>
                <span className="text-[11px] text-muted-foreground">{recap.totalRecordedMinutes} min de audio</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="size-3" /> Decisiones</span>
                <strong className="text-base text-foreground">{recap.decisions.length}</strong>
                <span className="text-[11px] text-muted-foreground">registradas</span>
              </div>
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

          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-2xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-primary" />
              Decisiones y acuerdos ({recap.decisions.length})
            </h2>
            {recap.decisions.length > 0 ? (
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
            ) : (
              <p className="text-xs text-muted-foreground italic">No se anotaron acuerdos durante esta sesión.</p>
            )}
          </Card>
        </div>
    </div>
  );
}
