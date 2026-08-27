import {
  Button,
  Card,
  Chip,
  toast,
} from '@heroui/react';
import {
  CircleCheck,
  Clock,
  Microphone,
  Copy,
  FileText,
  ArrowRotateRight,
  Play,
  CircleExclamation,
} from '@gravity-ui/icons';
import {
  computeSessionRecap,
} from './session-assistant-engine.js';
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
    text += `⏱ **Duración:** ${recap.actualDurationMinutes} min ${isInterrupted ? 'transcurridos' : 'reales'} (de ${recap.plannedDurationMinutes} min planificados)\n`;
    text += `✅ **Puntos:** ${recap.completedCount} de ${recap.totalBlocksCount} tratados`;
    if (recap.skippedCount > 0) text += ` · ${recap.skippedCount} saltados`;
    text += `\n`;
    if (recap.totalRecordingsCount > 0) {
      text += `🎙 **Grabaciones:** ${recap.totalRecordingsCount} grabaciones (${recap.totalRecordedMinutes} min de audio)\n`;
    }
    if (recap.decisions.length > 0) {
      text += `\n**Decisiones y acuerdos:**\n`;
      recap.decisions.forEach(d => {
        text += `- ${d.content}\n`;
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
        {/* Timeline Spacer */}
        <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />

        {/* Content Column */}
        <div className="flex flex-col gap-4 min-w-0 w-full">
          {/* Header bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Chip size="sm" variant="soft" color={recap.statusBadgeColor}>
                  {recap.statusLabel}
                </Chip>
                <span className="text-xs text-muted">Session Recap</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {recap.recapTitle}
              </h1>
              <p className="text-xs text-muted">
                {recap.recapDescription}
              </p>
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
                <FileText width={13} height={13} /> Ver acta oficial
              </Button>
              <Button variant="ghost" size="sm" onPress={onNewSession} className="h-8 px-2.5 text-muted hover:text-foreground">
                <ArrowRotateRight width={13} height={13} /> Nueva sesión
              </Button>
            </div>
          </div>

          {/* Metrics Highlights Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Metric 1: Time */}
            <Card className="p-4 flex flex-col gap-1 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
                <Clock width={13} height={13} />
                <span>{recap.timeEffectiveLabel}</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                {recap.actualDurationMinutes} min
              </span>
              <span className="text-[11px] text-muted">
                {recap.timeEffectiveSubtext}
              </span>
            </Card>

            {/* Metric 2: Blocks progress */}
            <Card className="p-4 flex flex-col gap-1 rounded-xl">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${isInterrupted ? 'text-warning' : 'text-success'}`}>
                {isInterrupted ? <CircleExclamation width={13} height={13} /> : <CircleCheck width={13} height={13} />}
                <span>Puntos tratados</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                {recap.completedCount} / {recap.totalBlocksCount}
              </span>
              <span className="text-[11px] text-muted">
                {recap.blocksProgressSubtext}
              </span>
            </Card>

            {/* Metric 3: Recordings */}
            <Card className="p-4 flex flex-col gap-1 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs text-accent font-medium">
                <Microphone width={13} height={13} className="text-accent" />
                <span>Grabaciones</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                {recap.totalRecordingsCount} {recap.totalRecordingsCount === 1 ? 'grabación' : 'grabaciones'}
              </span>
              <span className="text-[11px] text-muted">
                {recap.totalRecordedMinutes} min de audio
              </span>
            </Card>

            {/* Metric 4: Decisions */}
            <Card className="p-4 flex flex-col gap-1 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                <CircleCheck width={13} height={13} />
                <span>Decisiones</span>
              </div>
              <span className="text-xl font-bold text-foreground">
                {recap.decisions.length}
              </span>
              <span className="text-[11px] text-muted">
                registradas durante la sesión
              </span>
            </Card>
          </div>

          {/* Audio Recordings Section */}
          {recap.recordings.length > 0 && (
            <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Microphone width={14} height={14} className="text-accent" />
                  <span>Grabaciones de la sesión ({recap.recordings.length})</span>
                </h2>
                <span className="text-xs text-muted">
                  {recap.totalRecordedMinutes} min de audio total
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {recap.recordings.map((rec) => (
                  <PlannerAudioPlayer
                    key={rec.id}
                    recording={rec}
                    onRename={onRenameRecording}
                    onDelete={onDeleteRecording}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Decisions & Agreements Section */}
          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CircleCheck width={14} height={14} className="text-success" />
              <span>Decisiones y acuerdos registrados ({recap.decisions.length})</span>
            </h2>

            {recap.decisions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {recap.decisions.map((d, idx) => (
                  <div
                    key={d.id || idx}
                    className="p-3 rounded-lg bg-surface-secondary/40 border border-border/40 text-xs text-foreground leading-relaxed"
                  >
                    <strong className="font-semibold">{d.content}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted italic">
                No se anotaron acuerdos durante esta sesión.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
