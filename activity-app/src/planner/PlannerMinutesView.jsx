import {useState} from 'react';
import {Button, Avatar, toast} from '@heroui/react';
import {
  Copy,
  ChevronLeft,
  ArrowUpRightFromSquare,
  Calendar,
  Clock,
  CircleCheck,
  FileText,
  Check,
} from '@gravity-ui/icons';
import {generateMinutesMarkdown} from './planner-store.js';
import {POINT_STATUS, getPointStatus} from './session-runner.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';

function parseMentions(mentionsStr) {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^\s@]+/g);
  if (matches) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function buildMinutesHtml(state, sessionState, decisions) {
  const {
    _title = 'Sesión',
    date = '',
    startTime = '10:00',
    host = '',
    totalCalculatedDuration = 0,
    blocks = [],
  } = state;

  let html = `<h2>🎯 Resumen Ejecutivo</h2>`;
  html += `<p>Duración planificada: <strong>${totalCalculatedDuration} minutos</strong> (inicio ${startTime}) · Facilitador: <strong>${host || 'Sin asignar'}</strong> · Fecha: <strong>${date || 'Sin fecha'}</strong>.</p>`;

  html += `<h2>📋 Acuerdos y Decisiones (${decisions.length})</h2>`;
  if (decisions.length === 0) {
    html += `<p><em>No se registraron decisiones formales en esta sesión.</em></p>`;
  } else {
    html += `<ul>`;
    for (const decision of decisions) {
      const originInfo = decision.origin ? ` <em>(Origen: ${decision.origin})</em>` : '';
      html += `<li><strong>${decision.content}</strong>${originInfo}</li>`;
    }
    html += `</ul>`;
  }

  html += `<h2>⏱️ Desglose de Agenda y Temas Tratados</h2>`;
  if (blocks.length === 0) {
    html += `<p><em>Sin bloques registrados en la agenda.</em></p>`;
  } else {
    for (const [idx, block] of blocks.entries()) {
      html += `<h3>${idx + 1}. ${block.title} (${block.durationMinutes} min)</h3>`;
      if (block.introDesc) {
        html += `<p>${block.introDesc}</p>`;
      }
      if (block.leader) {
        html += `<p>Conduce: <strong>${block.leader}</strong></p>`;
      }
      if ((block.subpoints || []).length > 0) {
        html += `<ul>`;
        for (const point of block.subpoints) {
          const status = sessionState ? getPointStatus(sessionState, point.id) : point.status;
          const isDone = status === POINT_STATUS.DONE;
          const isSkipped = status === POINT_STATUS.SKIPPED;
          const statusText = isDone ? ' ✅ <strong>[Tratado]</strong>' : isSkipped ? ' ⏭️ <em>[Saltado]</em>' : '';
          const presenterText = point.presenter ? ` · <em>${point.presenter}</em>` : '';
          html += `<li>${point.title}${presenterText}${statusText}</li>`;
        }
        html += `</ul>`;
      }
    }
  }

  return html;
}

export function PlannerMinutesView({state, sessionState, onBack, onCopyMarkdown, onSaveDocToLibrary}) {
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  const {
    title = 'Sesión',
    description = '',
    date = '',
    startTime = '10:00',
    host = '',
    mentions = '',
    totalCalculatedDuration = 0,
    blocks = [],
  } = state;

  const participantsList = parseMentions(mentions);

  // Recopilar todas las decisiones registradas tanto en la agenda como en vivo
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

  const recordings = sessionState?.recordings || [];

  const handleSaveToDocs = () => {
    setIsSavingDoc(true);
    try {
      const docTitle = `Acta: ${title}`;
      const docDescription = description || `Resumen consolidado y acuerdos de la sesión del ${date || 'día de hoy'}.`;
      const docBody = buildMinutesHtml(state, sessionState, decisions);
      const markdown = generateMinutesMarkdown(state, sessionState);

      const docId = `local-${Date.now().toString(36)}`;
      const newDoc = {
        id: docId,
        title: docTitle,
        description: docDescription,
        body: docBody,
        markdown,
        origin: 'Acta de Bardo Planner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByName: host || 'Bardo Planner',
        updatedByName: host || 'Bardo Planner',
        builtin: false,
        stress: false,
      };

      // Guardar directamente en localStorage para sincronización instantánea
      try {
        const STORE_KEY = 'bardo.docs.heroui.v1';
        const rawStore = localStorage.getItem(STORE_KEY);
        const parsedStore = rawStore ? JSON.parse(rawStore) : {version: 1, docs: [], deletedIds: []};
        parsedStore.docs = [newDoc, ...(parsedStore.docs || []).filter((d) => d.id !== docId)];
        localStorage.setItem(STORE_KEY, JSON.stringify(parsedStore));
      } catch (err) {
        console.warn('No se pudo escribir en store local:', err);
      }

      if (onSaveDocToLibrary) {
        onSaveDocToLibrary(newDoc);
      } else {
        toast('Minuta guardada en Bardo Docs');
        window.location.hash = `#doc-${docId}`;
      }
    } catch (error) {
      console.error('Error al guardar minuta en Docs:', error);
      toast('Error al guardar en Docs');
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handlePublishDiscord = () => {
    if (typeof window !== 'undefined' && window.__bardoPublishDocument) {
      const markdown = generateMinutesMarkdown(state, sessionState);
      window.__bardoPublishDocument(`minutes-${Date.now()}`, {content: markdown});
      toast('Minuta enviada al canal de Discord');
    } else {
      if (onCopyMarkdown) onCopyMarkdown();
      toast('Copiado al portapapeles (listo para enviar en Discord)');
    }
  };

  return (
    <section className="doc-route route-active animate-in fade-in duration-150">
      <article className="document-shell max-w-4xl mx-auto pb-24 px-4 sm:px-0">
        {/* Barra superior de navegación y acciones de Acta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onPress={onBack}
            className="back-button h-8 px-2.5 text-xs text-muted hover:text-foreground font-medium flex items-center gap-1.5 self-start"
          >
            <ChevronLeft width={15} height={15} /> Volver a la agenda
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onPress={handleSaveToDocs}
              isDisabled={isSavingDoc}
              className="h-8 px-3.5 font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <FileText width={14} height={14} /> <span>Guardar en Docs</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={onCopyMarkdown}
              className="h-8 px-3 font-medium flex items-center gap-1.5"
            >
              <Copy width={14} height={14} /> <span>Copiar Markdown</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={handlePublishDiscord}
              className="h-8 px-3 font-medium flex items-center gap-1.5"
            >
              <ArrowUpRightFromSquare width={14} height={14} /> <span>Publicar en canal</span>
            </Button>
          </div>
        </div>

        {/* Cabecera del Documento (Bardo Docs Header Style) */}
        <header className="doc-intro">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted font-medium">
              Acta oficial de la sesión · Generada automáticamente
            </span>
          </div>
          <h1 className="doc-title">Acta: {title}</h1>
          <p className="doc-description">
            {description || 'Resumen consolidado de acuerdos, decisiones y temas tratados durante la sesión.'}
          </p>

          <div className="doc-meta flex items-center gap-4 text-xs text-muted flex-wrap mt-4 pt-3 border-t border-border/40">
            {date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar width={13} height={13} className="text-muted/70 shrink-0" />
                <span>{date}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock width={13} height={13} className="text-muted/70 shrink-0" />
              <span>{startTime} ({totalCalculatedDuration} min)</span>
            </span>
            {host && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={host} size="xs" className="w-4.5 h-4.5 text-[8.5px] font-bold shrink-0" />
                <span>Conduce: <strong className="font-semibold text-foreground">{host}</strong></span>
              </span>
            )}
            {participantsList.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <div className="flex items-center -space-x-1.5">
                  {participantsList.slice(0, 3).map((tag, i) => (
                    <Avatar
                      key={i}
                      name={tag}
                      size="xs"
                      className="w-4.5 h-4.5 text-[8px] font-bold border border-background shadow-2xs shrink-0"
                    />
                  ))}
                </div>
                <span>{participantsList.length} participantes</span>
              </span>
            )}
          </div>
        </header>

        {/* Cuerpo del Documento (Bardo Docs Visual Layout) */}
        <div className="doc-body mt-8">
          {/* Resumen Ejecutivo */}
          <h2>🎯 Resumen Ejecutivo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 not-prose">
            <div className="p-3.5 rounded-xl bg-surface-secondary/50 border border-border/50 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Duración planificada</span>
              <span className="text-lg font-bold text-foreground">{totalCalculatedDuration} min</span>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-secondary/50 border border-border/50 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Acuerdos alcanzados</span>
              <span className="text-lg font-bold text-accent">{decisions.length} decisiones</span>
            </div>
            <div className="p-3.5 rounded-xl bg-surface-secondary/50 border border-border/50 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Bloques de agenda</span>
              <span className="text-lg font-bold text-foreground">{blocks.length} bloques</span>
            </div>
          </div>

          {/* Acuerdos y Decisiones */}
          <h2>📋 Acuerdos y Decisiones ({decisions.length})</h2>
          {decisions.length === 0 ? (
            <p className="italic text-muted">No se registraron decisiones formales en esta sesión.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 my-3 list-none pl-0">
              {decisions.map((decision, index) => (
                <li
                  key={decision.id || index}
                  className="p-3.5 rounded-xl bg-surface-secondary/60 border border-border/40 flex items-start gap-3"
                >
                  <CircleCheck width={16} height={16} className="text-success mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <strong className="text-sm font-semibold text-foreground">{decision.content}</strong>
                    {decision.origin && (
                      <span className="text-xs text-muted">Origen: {decision.origin}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Desglose de Temas Tratados */}
          <h2>⏱️ Desglose de Temas Tratados</h2>
          {blocks.length === 0 ? (
            <p className="italic text-muted">No se configuraron bloques en la agenda.</p>
          ) : (
            <div className="flex flex-col gap-6 my-4">
              {blocks.map((block, bIdx) => (
                <div key={block.id || bIdx} className="border-b border-border/30 pb-5 last:border-0 last:pb-0">
                  <h3 className="flex items-center justify-between text-base font-bold text-foreground">
                    <span>{bIdx + 1}. {block.title}</span>
                    <span className="text-xs font-mono font-normal text-muted">{block.durationMinutes} min</span>
                  </h3>
                  {block.introDesc && (
                    <p className="text-xs text-muted mt-1 mb-2">{block.introDesc}</p>
                  )}
                  {block.leader && (
                    <p className="text-xs text-muted mt-0.5 mb-2">Conduce: <strong className="font-semibold text-foreground">{block.leader}</strong></p>
                  )}

                  {(block.subpoints || []).length > 0 && (
                    <ul className="flex flex-col gap-2 mt-3 list-none pl-1">
                      {block.subpoints.map((point) => {
                        const status = sessionState ? getPointStatus(sessionState, point.id) : point.status;
                        const isDone = status === POINT_STATUS.DONE;
                        const isSkipped = status === POINT_STATUS.SKIPPED;
                        return (
                          <li
                            key={point.id}
                            className="flex items-center justify-between gap-3 text-xs py-1.5 px-3 rounded-lg bg-surface-secondary/30"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-success' : isSkipped ? 'bg-muted' : 'bg-border'}`} />
                              <span className={`truncate ${isDone ? 'font-semibold text-foreground' : 'text-muted'}`}>{point.title}</span>
                              {point.presenter && <span className="text-muted/60">({point.presenter})</span>}
                            </div>
                            <div className="shrink-0">
                              {isDone && <span className="text-success font-semibold flex items-center gap-1"><Check width={11} height={11} /> Tratado</span>}
                              {isSkipped && <span className="text-muted font-medium">Saltado</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Grabaciones y Notas de Audio (si existen) */}
          {recordings.length > 0 && (
            <>
              <h2>🎙️ Grabaciones y Notas de Audio ({recordings.length})</h2>
              <div className="flex flex-col gap-3 my-4">
                {recordings.map((recording) => (
                  <PlannerAudioPlayer key={recording.id} recording={recording} />
                ))}
              </div>
            </>
          )}

          {/* Convocados y Asistencia */}
          <h2>👥 Convocados y Asistencia</h2>
          <div className="flex flex-wrap gap-2 my-3">
            {participantsList.map((tag, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-secondary/50 border border-border/40 text-xs">
                <Avatar name={tag} size="xs" className="w-5 h-5 text-[9px] font-bold" />
                <span className="font-medium text-foreground">{tag}</span>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
