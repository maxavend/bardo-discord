import {
  Button,
  Card,
  Chip,
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
  ListCheck,
  FileText,
  Check,
} from '@gravity-ui/icons';
import {
  generateMinutesMarkdown,
} from './planner-store.js';

export function PlannerMinutesView({
  state,
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
  const tasks = [];

  blocks.forEach((b) => {
    (b.decisions || []).forEach((d) => decisions.push({...d, origin: b.title}));
    (b.tasks || []).forEach((t) => tasks.push({...t, origin: b.title}));
  });

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
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar (no contained) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Button variant="ghost" size="sm" onPress={onBack}>
              <ChevronLeft width={14} height={14} /> Volver a la agenda
            </Button>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Acta y minuta oficial</h1>
          <p className="text-xs text-muted">
            Resumen consolidado de acuerdos tomados, tareas asignadas y temas tratados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onPress={onCopyMarkdown}>
            <Copy width={14} height={14} /> Copiar Markdown
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={handlePublishDiscord}
          >
            <ArrowUpRightFromSquare width={14} height={14} /> Publicar en Discord
          </Button>
        </div>
      </div>

      {/* Main Minutes Canvas */}
      <Card className="p-4 sm:p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-1">Acta de acuerdos · {title}</h2>
          <div className="flex items-center gap-3 text-xs text-muted font-medium flex-wrap">
            {date && (
              <span className="flex items-center gap-1">
                <Calendar width={12} height={12} />
                <span>Fecha: {date}</span>
              </span>
            )}
            {date && host && <span>·</span>}
            {host && (
              <span className="flex items-center gap-1">
                <Person width={12} height={12} />
                <span>Conduce: {host}</span>
              </span>
            )}
            {host && <span>·</span>}
            <span className="flex items-center gap-1">
              <Clock width={12} height={12} />
              <span>Duración: {totalCalculatedDuration} min</span>
            </span>
          </div>
        </div>

        {/* 1. Decisiones */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold text-success flex items-center gap-1.5">
            <CircleCheck width={14} height={14} />
            <span>1. Decisiones y acuerdos tomados ({decisions.length})</span>
          </h3>
          {decisions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {decisions.map((d, idx) => (
                <div
                  key={d.id || idx}
                  className="p-3 rounded-lg bg-surface-secondary/40 border border-border/40 text-xs text-foreground leading-relaxed"
                >
                  <strong className="text-foreground font-semibold">{d.content}</strong>
                  <span className="text-muted block mt-1 text-xs">Ref. Bloque: {d.origin}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic pl-1">No se registraron decisiones formales en esta sesión.</p>
          )}
        </section>

        {/* 2. Tareas */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold text-accent flex items-center gap-1.5">
            <ListCheck width={14} height={14} />
            <span>2. Compromisos y tareas asignadas ({tasks.length})</span>
          </h3>
          {tasks.length > 0 ? (
            <div className="flex flex-col gap-2">
              {tasks.map((t, idx) => (
                <div
                  key={t.id || idx}
                  className="p-3 rounded-lg bg-surface-secondary/40 border border-border/40 text-xs text-foreground flex items-start justify-between gap-3"
                >
                  <div>
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-muted block mt-1 text-xs">Ref. Bloque: {t.origin}</span>
                  </div>
                  {t.assignee && (
                    <Chip size="sm" variant="secondary" className="shrink-0">
                      {t.assignee}
                    </Chip>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic pl-1">No se asignaron tareas en esta sesión.</p>
          )}
        </section>

        {/* 3. Resumen de Puntos */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText width={14} height={14} />
            <span>3. Resumen de temas tratados</span>
          </h3>
          {blocks.length === 0 ? (
            <p className="text-xs text-muted italic pl-1">Sin bloques registrados en la sesión.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {blocks.map((b, idx) => (
                <div key={b.id || idx} className="text-xs bg-surface-secondary/40 p-3 rounded-lg border border-border/40">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span>{b.title}</span>
                    <span className="text-muted font-normal text-xs">({b.durationMinutes} min)</span>
                  </div>
                  {(b.subpoints || []).length > 0 && (
                    <ul className="pl-3.5 mt-2 space-y-1.5 text-muted">
                      {b.subpoints.map((p, pIdx) => (
                        <li key={p.id || pIdx} className="flex items-center gap-2">
                          {p.status === 'done' ? (
                            <Check width={12} height={12} className="text-success shrink-0" />
                          ) : (
                            <span className="text-muted text-xs shrink-0">•</span>
                          )}
                          <span className={p.status === 'done' ? 'text-muted/80' : 'text-foreground font-medium'}>
                            {p.title}
                          </span>
                          {p.presenter && (
                            <span className="text-xs text-muted">· {p.presenter}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}
