import {
  Button,
  Card,
} from '@heroui/react';
import {
  Copy,
  ArrowUturnCcwLeft,
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
    title,
    date,
    host,
    totalCalculatedDuration,
    blocks = [],
  } = state;

  const decisions = [];
  const tasks = [];

  blocks.forEach((b) => {
    (b.decisions || []).forEach((d) => decisions.push({...d, origin: b.title}));
    (b.tasks || []).forEach((t) => tasks.push({...t, origin: b.title}));
  });

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onPress={onBack} className="text-xs h-7 px-2">
              <ArrowUturnCcwLeft width={13} height={13} /> Volver a la Agenda
            </Button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Acta y Minuta Oficial</h1>
          <p className="text-xs text-muted">
            Resumen consolidado de acuerdos tomados, tareas asignadas y temas tratados durante la sesión.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onPress={onCopyMarkdown} className="font-medium">
            <Copy width={14} height={14} /> Copiar Markdown
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              if (window.__bardoPublishDocument) {
                const md = generateMinutesMarkdown(state);
                window.__bardoPublishDocument(`minutes-${Date.now()}`, {content: md});
              } else {
                onCopyMarkdown();
              }
            }}
            className="font-semibold"
          >
            📢 Publicar en Discord
          </Button>
        </div>
      </div>

      {/* Main Minutes Canvas */}
      <Card className="p-6 bg-surface border border-border rounded-2xl flex flex-col gap-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">Acta de Acuerdos · {title}</h2>
          <div className="flex items-center gap-3 text-xs text-muted font-medium font-mono">
            <span>Fecha: {date}</span>
            <span>·</span>
            <span>Conduce: {host}</span>
            <span>·</span>
            <span>Duración: {totalCalculatedDuration} min</span>
          </div>
        </div>

        {/* 1. Decisiones */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
            <span>🟢</span> 1. Decisiones y Acuerdos Tomados
          </h3>
          {decisions.length > 0 ? (
            <div className="flex flex-col gap-1.5 pl-2">
              {decisions.map((d, idx) => (
                <div
                  key={d.id || idx}
                  className="p-3 rounded-xl bg-success/10 border border-success/20 text-xs text-foreground leading-relaxed"
                >
                  <strong className="text-foreground font-semibold">{d.content}</strong>
                  <span className="text-muted block mt-1 text-[11px]">Ref. Bloque: {d.origin}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic pl-2">No se registraron decisiones formales.</p>
          )}
        </section>

        {/* 2. Tareas */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
            <span>🟣</span> 2. Compromisos y Tareas Asignadas
          </h3>
          {tasks.length > 0 ? (
            <div className="flex flex-col gap-1.5 pl-2">
              {tasks.map((t, idx) => (
                <div
                  key={t.id || idx}
                  className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-xs text-foreground flex items-start justify-between gap-3"
                >
                  <div>
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-muted block mt-1 text-[11px]">Ref. Bloque: {t.origin}</span>
                  </div>
                  {t.assignee && (
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-muted font-medium text-[11px] shrink-0">
                      {t.assignee}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic pl-2">No se asignaron tareas.</p>
          )}
        </section>

        {/* 3. Resumen de Puntos */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <span>📋</span> 3. Resumen de Temas Tratados
          </h3>
          <div className="flex flex-col gap-3 pl-2">
            {blocks.map((b, idx) => (
              <div key={b.id || idx} className="text-xs">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <span>{b.title}</span>
                  <span className="text-muted font-mono font-normal">({b.durationMinutes} min)</span>
                </div>
                {(b.subpoints || []).length > 0 && (
                  <ul className="pl-4 mt-1.5 space-y-1 text-muted">
                    {b.subpoints.map((p, pIdx) => (
                      <li key={p.id || pIdx} className="flex items-center gap-2">
                        <span className={p.status === 'done' ? 'text-success font-bold' : 'text-muted'}>
                          {p.status === 'done' ? '✓' : '•'}
                        </span>
                        <span className={p.status === 'done' ? 'line-through text-muted/80' : 'text-foreground'}>
                          {p.title}
                        </span>
                        {p.durationMinutes > 0 && (
                          <span className="font-mono text-[11px] text-muted">({p.durationMinutes}m)</span>
                        )}
                        {p.presenter && (
                          <span className="text-muted text-[11px]">· {p.presenter}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </Card>
    </div>
  );
}
