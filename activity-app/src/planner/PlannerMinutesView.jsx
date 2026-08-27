import {
  Button,
  Card,
  Chip,
  toast,
} from '@heroui/react';
import {
  Copy,
  ArrowUturnCcwLeft,
  ArrowUpRightFromSquare,
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
    if (window.__bardoPublishDocument) {
      const md = generateMinutesMarkdown(state);
      window.__bardoPublishDocument(`minutes-${Date.now()}`, {content: md});
      toast('📢 Minuta enviada al canal de Discord');
    } else {
      onCopyMarkdown();
      toast('📋 Copiado al portapapeles (Listo para enviar en Discord)');
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/40 p-3 rounded-xl border border-border">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Button variant="ghost" size="sm" onPress={onBack}>
              <ArrowUturnCcwLeft width={14} height={14} /> Volver a la Agenda
            </Button>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Acta y Minuta Oficial</h1>
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
            className="font-semibold"
          >
            <ArrowUpRightFromSquare width={14} height={14} /> Publicar en Discord
          </Button>
        </div>
      </div>

      {/* Main Minutes Canvas */}
      <Card className="p-4 sm:p-5 bg-surface border border-border rounded-xl flex flex-col gap-5">
        <div>
          <h2 className="text-base font-bold text-foreground mb-1">Acta de Acuerdos · {title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted font-medium">
            {date && <span>Fecha: {date}</span>}
            {date && host && <span>·</span>}
            {host && <span>Conduce: {host}</span>}
            {host && <span>·</span>}
            <span>Duración: {totalCalculatedDuration} min</span>
          </div>
        </div>

        {/* 1. Decisiones */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
            <span>🟢</span> 1. Decisiones y Acuerdos Tomados ({decisions.length})
          </h3>
          {decisions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {decisions.map((d, idx) => (
                <div
                  key={d.id || idx}
                  className="p-2.5 rounded-lg bg-success/10 border border-success/20 text-xs text-foreground leading-relaxed"
                >
                  <strong className="text-foreground font-semibold">{d.content}</strong>
                  <span className="text-muted block mt-0.5 text-xs">Ref. Bloque: {d.origin}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic pl-1">No se registraron decisiones formales en esta sesión.</p>
          )}
        </section>

        {/* 2. Tareas */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
            <span>🟣</span> 2. Compromisos y Tareas Asignadas ({tasks.length})
          </h3>
          {tasks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {tasks.map((t, idx) => (
                <div
                  key={t.id || idx}
                  className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-foreground flex items-start justify-between gap-3"
                >
                  <div>
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-muted block mt-0.5 text-xs">Ref. Bloque: {t.origin}</span>
                  </div>
                  {t.assignee && (
                    <Chip size="sm" variant="secondary" className="shrink-0 text-xs">
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
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <span>📋</span> 3. Resumen de Temas Tratados
          </h3>
          {blocks.length === 0 ? (
            <p className="text-xs text-muted italic pl-1">Sin bloques registrados.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {blocks.map((b, idx) => (
                <div key={b.id || idx} className="text-xs bg-surface-secondary/30 p-2.5 rounded-lg border border-border/40">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span>{b.title}</span>
                    <span className="text-muted font-normal text-xs">({b.durationMinutes} min)</span>
                  </div>
                  {(b.subpoints || []).length > 0 && (
                    <ul className="pl-3.5 mt-1.5 space-y-1 text-muted">
                      {b.subpoints.map((p, pIdx) => (
                        <li key={p.id || pIdx} className="flex items-center gap-2">
                          <span className={p.status === 'done' ? 'text-success font-bold text-xs' : 'text-muted text-xs'}>
                            {p.status === 'done' ? '✓' : '•'}
                          </span>
                          <span className={p.status === 'done' ? 'line-through text-muted/80' : 'text-foreground'}>
                            {p.title}
                          </span>
                          {p.durationMinutes > 0 && (
                            <span className="text-xs text-muted font-mono">({p.durationMinutes}m)</span>
                          )}
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
