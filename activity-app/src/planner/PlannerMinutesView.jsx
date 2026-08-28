import {useState} from 'react';
import {Button, Avatar, Dropdown, Label, toast} from '@heroui/react';
import {
  Copy,
  ChevronLeft,
  ArrowUpRightFromSquare,
  Calendar,
  Clock,
  CircleCheck,
  FileText,
  Check,
  EllipsisVertical,
} from '@gravity-ui/icons';
import {generateMinutesMarkdown} from './planner-store.js';
import {POINT_STATUS, getPointStatus, recalculateEstimatedEndTime} from './session-runner.js';
import {getAllDiscordEntities} from './PlannerMemberPicker.jsx';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr) {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^\s@]+/g);
  if (matches) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function formatDateSpanish(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month, day);
    if (!isNaN(dateObj.getTime())) {
      const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${weekdays[dateObj.getDay()]} ${day} ${months[month]}`;
    }
  }
  return dateString;
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
    title = 'Sesión sin título',
    description = '',
    date = '',
    startTime = '17:45',
    host = '',
    mentions = '',
    totalCalculatedDuration = 0,
    blocks = [],
  } = state;

  const participantsList = parseMentions(mentions);
  const formattedDate = formatDateSpanish(date);
  const totalPlannedMinutes = (blocks || []).reduce(
    (accumulator, b) => accumulator + (b.durationMinutes || 0),
    0
  ) || totalCalculatedDuration || 0;
  const estimatedEndTime = recalculateEstimatedEndTime(startTime, totalPlannedMinutes);
  const formattedDuration = totalPlannedMinutes >= 60 && totalPlannedMinutes % 60 === 0
    ? `${totalPlannedMinutes / 60} h`
    : `${totalPlannedMinutes} min`;

  const {members: allDiscordMembers} = getAllDiscordEntities();
  const hostMember = allDiscordMembers.find(
    (m) =>
      m.globalName.toLowerCase() === (host || '').toLowerCase() ||
      m.tag.toLowerCase() === (host || '').toLowerCase() ||
      `@${m.globalName.toLowerCase()}` === (host || '').toLowerCase()
  );
  const hostColor = hostMember?.avatarColor || DISCORD_PALETTES[0];

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
      const docDescription = description || `Resumen consolidado y acuerdos de la sesión del ${formattedDate || 'día de hoy'}.`;
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
        {/* Cabecera del Documento exactamente con el layout de Bardo Docs */}
        <header className="doc-intro">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1 cursor-pointer transition-colors font-medium select-none shrink-0"
            >
              <ChevronLeft width={14} height={14} className="-ml-0.5" />
              <span>Volver al planner</span>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="primary"
                size="sm"
                onPress={handleSaveToDocs}
                isDisabled={isSavingDoc}
                className="h-8 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <FileText width={13} height={13} /> <span>Guardar en Docs</span>
              </Button>

              {/* Acciones secundarias: visibles en desktop, colapsadas en mobile */}
              <div className="hidden sm:flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={onCopyMarkdown}
                  className="h-8 px-3 text-xs font-medium flex items-center gap-1.5"
                >
                  <Copy width={13} height={13} /> <span>Copiar</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={handlePublishDiscord}
                  className="h-8 px-3 text-xs font-medium flex items-center gap-1.5"
                >
                  <ArrowUpRightFromSquare width={13} height={13} /> <span>Publicar</span>
                </Button>
              </div>

              {/* Menú ⋮ en mobile */}
              <div className="sm:hidden">
                <Dropdown>
                  <Dropdown.Trigger>
                    <Button variant="ghost" size="sm" isIconOnly aria-label="Más acciones" className="h-8 w-8 text-muted hover:text-foreground">
                      <EllipsisVertical width={14} height={14} />
                    </Button>
                  </Dropdown.Trigger>
                  <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                      onAction={(key) => {
                        if (key === 'copy') onCopyMarkdown?.();
                        if (key === 'publish') handlePublishDiscord();
                      }}
                    >
                      <Dropdown.Item id="copy" textValue="Copiar Markdown">
                        <Copy />
                        <Label>Copiar Markdown</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="publish" textValue="Publicar en canal">
                        <ArrowUpRightFromSquare />
                        <Label>Publicar en canal</Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
            </div>
          </div>

          <h1 className="doc-title">{title}</h1>
          {description && (
            <p className="doc-description">{description}</p>
          )}

          <div className="doc-meta flex items-center gap-3 sm:gap-4 text-xs text-muted flex-wrap mt-4 pt-3 border-t border-border/40">
            {formattedDate && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar width={13} height={13} className="text-muted/70 shrink-0" />
                <span>{formattedDate}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock width={13} height={13} className="text-muted/70 shrink-0" />
              <span>{startTime}–{estimatedEndTime} · {formattedDuration}</span>
            </span>
            {host && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar
                  name={hostMember?.globalName || host}
                  size="sm"
                  className="w-5 h-5 text-[9.5px] font-bold shrink-0 border border-background shadow-2xs"
                  style={{backgroundColor: `${hostColor}30`, color: hostColor}}
                />
                <span className="font-medium text-foreground">{host}</span>
              </span>
            )}
            {participantsList.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <div className="flex items-center -space-x-2">
                  {participantsList.slice(0, 4).map((tag, i) => {
                    const matched = allDiscordMembers.find(
                      (m) =>
                        m.tag.toLowerCase() === tag.toLowerCase() ||
                        `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                    );
                    const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                    return (
                      <Avatar
                        key={i}
                        name={matched?.globalName || tag}
                        size="sm"
                        className="w-5 h-5 border-2 border-background text-[9px] font-bold shadow-2xs shrink-0"
                        style={{backgroundColor: `${color}35`, color}}
                      />
                    );
                  })}
                </div>
                {participantsList.length > 4 && (
                  <span className="text-xs font-semibold text-muted">
                    +{participantsList.length - 4}
                  </span>
                )}
              </span>
            )}
          </div>
        </header>

        {/* Cuerpo del Documento (Bardo Docs Visual Layout) */}
        <div className="doc-body mt-8">
          {/* Acuerdos y Decisiones */}
          <h2>📋 Acuerdos y decisiones ({decisions.length})</h2>
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
                      <span className="text-xs text-muted">En: {decision.origin}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Desglose de Temas Tratados */}
          <h2>⏱️ Desglose de temas tratados</h2>
          {blocks.length === 0 ? (
            <p className="italic text-muted">No se configuraron bloques en la agenda.</p>
          ) : (
            <div className="flex flex-col gap-6 my-4">
              {blocks.map((block, bIdx) => (
                <div key={block.id || bIdx} className="border-b border-border/30 pb-5 last:border-0 last:pb-0">
                  <h3 className="flex items-center justify-between text-base font-bold text-foreground">
                    <span>{block.title}</span>
                    <span className="text-xs font-mono font-normal text-muted">{block.durationMinutes} min</span>
                  </h3>
                  {block.introDesc && (
                    <p className="text-xs text-muted mt-1 mb-2">{block.introDesc}</p>
                  )}

                  {(block.subpoints || []).length > 0 && (
                    <ul className="flex flex-col gap-1.5 mt-2.5 list-none pl-1">
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
          <h2>👥 Convocados y asistencia</h2>
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
