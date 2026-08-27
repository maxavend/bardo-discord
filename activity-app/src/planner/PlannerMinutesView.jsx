import {
  Button,
  Card,
  toast,
} from '@heroui/react';
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
import {
  generateMinutesMarkdown,
} from './planner-store.js';

export function PlannerMinutesView({
  state,
  sessionState,
  onBack,
  onCopyMarkdown,
}) {
  const {
    title = 'Sesión',
    date = '',
    host = '',
    totalCalculatedDuration = 0,
    blocks = [],
  } = state;

  const decisions = [];

  blocks.forEach((b) => {
    (b.decisions || []).forEach((d) => decisions.push({...d, origin: b.title}));
  });

  if (sessionState?.decisions) {
    sessionState.decisions.forEach((d) => {
      const block = blocks.find((b) => b.id === d.blockId);
      if (!decisions.some((existing) => existing.content === d.content)) {
        decisions.push({...d, origin: block ? block.title : 'Sesión en vivo'});
      }
    });
  }

  const handlePublishDiscord = () => {
    if (typeof window !== 'undefined' && window.__bardoPublishDocument) {
      const md = generateMinutesMarkdown(state);
      window.__bardoPublishDocument(`minutes-${Date.now()}`, {content: md});
      toast('Minuta enviada al canal de Discord');
    } else {
      onCopyMarkdown();
      toast('Copiado al portapapeles (Listo para enviar en Discord)');
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
              <div className="flex items-center gap-1.5 mb-1">
                <Button variant="ghost" size="sm" onPress={onBack} className="h-7 px-2 text-xs text-muted hover:text-foreground">
                  <ChevronLeft width={13} height={13} /> Volver a la agenda
                </Button>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Acta y minuta oficial</h1>
              <p className="text-xs text-muted">
                Resumen consolidado de acuerdos tomados y temas tratados en la sesión.
              </p>
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

          {/* Metadata Card */}
          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText width={14} height={14} className="text-accent" />
              <span>{title}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted">
              {date && (
                <div className="flex items-center gap-1.5">
                  <Calendar width={13} height={13} className="text-muted" />
                  <span>{date}</span>
                </div>
              )}
              {host && (
                <div className="flex items-center gap-1.5">
                  <Person width={13} height={13} className="text-muted" />
                  <span>Facilitador: <strong className="font-semibold text-foreground">{host}</strong></span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Clock width={13} height={13} className="text-muted" />
                <span>Duración estimada: <strong className="font-semibold text-foreground">{totalCalculatedDuration} min</strong></span>
              </div>
            </div>
          </Card>

          {/* Acuerdos y Decisiones Consolidadas */}
          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CircleCheck width={14} height={14} className="text-success" />
              <span>Acuerdos y decisiones tomadas ({decisions.length})</span>
            </h2>

            {decisions.length === 0 ? (
              <p className="text-xs text-muted italic">
                No se registraron decisiones específicas en esta sesión.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {decisions.map((d, i) => (
                  <div
                    key={d.id || i}
                    className="p-3 rounded-lg bg-surface-secondary/40 border border-border/40 flex items-start gap-2.5"
                  >
                    <CircleCheck width={14} height={14} className="text-success mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-foreground">{d.content}</span>
                      {d.origin && (
                        <span className="text-[11px] text-muted">En: {d.origin}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Puntos de Agenda Revisados */}
          <Card className="p-4 sm:p-5 flex flex-col gap-3 rounded-xl">
            <h2 className="text-sm font-bold text-foreground">
              Desglose de temas tratados
            </h2>

            <div className="flex flex-col gap-3">
              {blocks.map((b) => (
                <div key={b.id} className="flex flex-col gap-1.5 pb-2.5 border-b border-border/30 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{b.title}</span>
                    <span className="text-muted font-mono">{b.durationMinutes} min</span>
                  </div>

                  {(b.subpoints || []).length > 0 && (
                    <ul className="flex flex-col gap-1 pl-1">
                      {b.subpoints.map((p) => (
                        <li key={p.id} className="text-xs text-muted flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          <span className={p.status === 'done' ? 'text-foreground font-medium' : ''}>
                            {p.title}
                          </span>
                          {p.presenter && (
                            <span className="text-muted/70 text-[11px]">({p.presenter})</span>
                          )}
                          {p.status === 'done' && (
                            <span className="text-success text-[10px] font-semibold flex items-center gap-0.5 ml-auto">
                              <Check width={10} height={10} /> Tratado
                            </span>
                          )}
                        </li>
                      ))}
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
