import {Button, Card, toast} from '@heroui/react';
import {
  Copy,
  ChevronLeft,
  ArrowUpRightFromSquare,
  Calendar,
  Person,
  Clock,
  CircleCheck,
  FileText,
  Check,
} from '@gravity-ui/icons';
import {generateMinutesMarkdown} from './planner-store.js';
import {POINT_STATUS, getPointStatus} from './session-runner.js';

export function PlannerMinutesView({state, sessionState, onBack, onCopyMarkdown}) {
  const {
    title = 'Sesión',
    date = '',
    host = '',
    totalCalculatedDuration = 0,
    blocks = [],
  } = state;

  const decisions = [];
  blocks.forEach((block) => {
    (block.decisions || []).forEach((decision) => {
      const point = (block.subpoints || []).find((candidate) => candidate.id === decision.pointId);
      decisions.push({
        ...decision,
        origin: point ? `${block.title} → ${point.title}` : block.title,
      });
    });
  });

  for (const decision of sessionState?.decisions || []) {
    const block = blocks.find((candidate) => candidate.id === decision.blockId);
    const point = (block?.subpoints || []).find((candidate) => candidate.id === decision.pointId);
    if (!decisions.some((existing) => existing.id === decision.id || existing.content === decision.content)) {
      decisions.push({
        ...decision,
        origin: point ? `${block?.title} → ${point.title}` : (block?.title || 'Sesión en vivo'),
      });
    }
  }

  const handlePublishDiscord = () => {
    if (typeof window !== 'undefined' && window.__bardoPublishDocument) {
      const markdown = generateMinutesMarkdown(state, sessionState);
      window.__bardoPublishDocument(`minutes-${Date.now()}`, {content: markdown});
      toast('Minuta enviada al canal de Discord');
    } else {
      onCopyMarkdown();
      toast('Copiado al portapapeles (listo para enviar en Discord)');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto pb-16 pt-2 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
        <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-4 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Button variant="ghost" size="sm" onPress={onBack} className="h-7 px-2 text-xs text-muted hover:text-foreground">
                  <ChevronLeft width={13} height={13} /> Volver a la agenda
                </Button>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Acta y minuta oficial</h1>
              <p className="text-xs text-muted">Resumen consolidado de acuerdos y puntos tratados en la sesión.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onPress={onCopyMarkdown} className="h-8 px-3">
                <Copy width={14} height={14} /> Copiar Markdown
              </Button>
              <Button variant="primary" size="sm" onPress={handlePublishDiscord} className="h-8 px-3.5">
                <ArrowUpRightFromSquare width={14} height={14} /> Publicar en canal
              </Button>
            </div>
          </div>

          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText width={14} height={14} className="text-accent" /> {title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted">
              {date && <div className="flex items-center gap-1.5"><Calendar width={13} height={13} />{date}</div>}
              {host && <div className="flex items-center gap-1.5"><Person width={13} height={13} />Facilitador: <strong className="font-semibold text-foreground">{host}</strong></div>}
              <div className="flex items-center gap-1.5"><Clock width={13} height={13} />Planificado: <strong className="font-semibold text-foreground">{totalCalculatedDuration} min</strong></div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CircleCheck width={14} height={14} className="text-success" /> Acuerdos y decisiones ({decisions.length})
            </h2>
            {decisions.length === 0 ? (
              <p className="text-xs text-muted italic">No se registraron decisiones específicas en esta sesión.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {decisions.map((decision, index) => (
                  <div key={decision.id || index} className="p-3 rounded-xl bg-surface-secondary/60 flex items-start gap-2.5">
                    <CircleCheck width={14} height={14} className="text-success mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-foreground">{decision.content}</span>
                      {decision.origin && <span className="text-xs text-muted">En: {decision.origin}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground">Desglose de temas tratados</h2>
            <div className="flex flex-col gap-3">
              {blocks.map((block) => (
                <div key={block.id} className="flex flex-col gap-1.5 pb-2.5 border-b border-border/30 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{block.title}</span>
                    <span className="text-muted font-mono">{block.durationMinutes} min</span>
                  </div>
                  {(block.subpoints || []).length > 0 && (
                    <ul className="flex flex-col gap-1 pl-1">
                      {block.subpoints.map((point) => {
                        const status = sessionState ? getPointStatus(sessionState, point.id) : point.status;
                        const isDone = status === POINT_STATUS.DONE;
                        const isSkipped = status === POINT_STATUS.SKIPPED;
                        return (
                          <li key={point.id} className="text-xs text-muted flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? 'bg-success' : isSkipped ? 'bg-muted' : 'bg-border'}`} />
                            <span className={isDone ? 'text-foreground font-medium' : ''}>{point.title}</span>
                            {point.presenter && <span className="text-muted/70 text-[11px]">({point.presenter})</span>}
                            {isDone && <span className="text-success text-[10px] font-semibold flex items-center gap-0.5 ml-auto"><Check width={10} height={10} /> Tratado</span>}
                            {isSkipped && <span className="text-muted text-[10px] font-semibold ml-auto">Saltado</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
