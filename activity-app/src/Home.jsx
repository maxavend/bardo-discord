import {useEffect, useState} from 'react';
import {Button, buttonVariants} from '@/components/ui/button';
import {Calendar, FileText, ChevronRight, LayoutColumns3, Lock, Persons, Plus} from '@gravity-ui/icons';
import {loadPlannerEvents, loadPlannerState, loadLiveSessionState, isDefaultEmptySession, isDemoPlannerState, shouldLoadDemoFixture} from './planner/planner-store.js';
import {currentUserId, ensureKanbanLoaded, useKanbanSnapshot} from './kanban/kanban-runtime.js';
import {doneColumnId, todayIso} from './kanban/kanban-store.js';
import {DueChip} from './kanban/kanban-ui.jsx';
import {useWorkspace} from './workspace.js';
import {eventStatusLabel} from './planner/copy-tokens.js';
import {docSpaceNote, isPersonalDoc, isSharedWithMe} from './doc-space.js';
import {focusMeeting, groupTasksByUrgency, longDate, meetingList, meetingWhen, recentDocuments} from './home-model.js';

// Un clic normal navega dentro de la app; con modificadores, el navegador decide.
function plainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** La hora avanza sola: «En 25 min» no puede quedarse congelado. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', {day: 'numeric', month: 'short'}).format(date);
}

const meetingId = meeting => meeting.id || meeting.eventId;

function readMeetings() {
  const events = loadPlannerEvents();
  const current = loadPlannerState();
  const live = loadLiveSessionState(current);
  const byId = new Map(events.map(event => [meetingId(event), event]));
  const demoAllowed = shouldLoadDemoFixture();
  if (current?.id && (demoAllowed || !isDemoPlannerState(current)) && (!isDefaultEmptySession(current) || byId.has(current.id))) {
    byId.set(current.id, {...byId.get(current.id), ...current,
      eventStatus: live?.status === 'running' || live?.status === 'paused' ? 'in_progress' : live?.status === 'completed' ? 'finished' : byId.get(current.id)?.eventStatus,
    });
  }
  return [...byId.values()].filter(event => event.eventStatus !== 'archived');
}

function SectionHeading({id, Icon, title, count = 0, action}) {
  return (
    <div className="home-section-heading">
      <h2 id={id} className="section-title">
        <Icon width={18} height={18} aria-hidden="true" /> {title}
        {count > 0 && <span className="home-count"><span className="sr-only">: </span>{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Lo que conviene retomar ya: la reunión de ahora, el borrador y la última lectura. */
function HomeNow({meeting, now, draft, continueDoc, onOpenDoc}) {
  const rows = [];
  if (meeting) {
    const live = meeting.eventStatus === 'in_progress' || meeting.eventStatus === 'live';
    rows.push(
      <a key="meeting" className="continue-row home-now-row" data-live={live || undefined} href={`#planner-session:${encodeURIComponent(meetingId(meeting))}`}>
        <span className="continue-accent" aria-hidden="true" />
        <span className="continue-copy">
          <strong>{meeting.title || 'Reunión sin título'}</strong>
          <span>{live ? 'Reunión en curso' : 'Próxima reunión'} · {meetingWhen(meeting, now)}</span>
        </span>
        <span className="home-now-action">{live ? 'Entrar' : 'Abrir'}<ChevronRight width={16} height={16} aria-hidden="true" /></span>
      </a>,
    );
  }
  if (draft) {
    rows.push(
      <a key="draft" className="continue-row" href="#new">
        <span className="continue-accent" aria-hidden="true" />
        <span className="continue-copy">
          <strong>{draft.title || 'Documento sin título'}</strong>
          <span>Borrador sin terminar{isPersonalDoc(draft) ? ' · Personal' : ''} · solo en este dispositivo</span>
        </span>
        <ChevronRight width={18} height={18} aria-hidden="true" />
      </a>,
    );
  }
  if (continueDoc) {
    rows.push(
      <a key="continue" className="continue-row" href={`#doc-${encodeURIComponent(continueDoc.id)}`} onClick={event => {
        if (plainClick(event)) { event.preventDefault(); onOpenDoc(continueDoc.id, true); }
      }}>
        <span className="continue-accent" aria-hidden="true" />
        <span className="continue-copy">
          <strong>{continueDoc.title || 'Sin título'}</strong>
          <span>Seguir leyendo{isPersonalDoc(continueDoc) ? ` · ${docSpaceNote(continueDoc)}` : ''}</span>
        </span>
        <ChevronRight width={18} height={18} aria-hidden="true" />
      </a>,
    );
  }
  if (!rows.length) return null;
  return (
    <section className="library-section home-now" aria-labelledby="home-now">
      <h2 id="home-now" className="section-title">Para retomar</h2>
      <div className="home-now-list">{rows}</div>
    </section>
  );
}

function HomeTasks() {
  const {view, loaded} = useKanbanSnapshot();
  useEffect(() => {
    void ensureKanbanLoaded();
  }, []);
  const userId = currentUserId();
  const today = todayIso();
  const doneId = doneColumnId(view.board);
  const open = Object.values(view.cards).filter(card => card.columnId !== doneId);
  // Con sesión, solo lo tuyo; sin sesión (modo local), lo abierto del canal.
  const candidates = userId ? open.filter(card => card.assignee?.id === userId) : open;
  const {groups, total, overdue, dueToday} = groupTasksByUrgency(candidates, today);
  const columnName = id => view.board?.columns.find(column => column.id === id)?.name || '';
  const summary = [overdue && `${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'}`, dueToday && `${dueToday} para hoy`].filter(Boolean).join(' · ');

  return (
    <section className="library-section" aria-labelledby="home-tasks">
      <SectionHeading
        id="home-tasks"
        Icon={LayoutColumns3}
        title={userId ? 'Tus tareas' : 'Tareas abiertas'}
        count={total}
        action={summary ? <p className="home-section-summary" data-urgent={overdue > 0 || undefined}>{summary}</p> : null}
      />
      {groups.length ? groups.map(group => (
        <div key={group.id} className="home-group" data-group={group.id}>
          <h3 className="home-group-title" id={`home-tasks-${group.id}`}>{group.label}</h3>
          <ul className="home-list" aria-labelledby={`home-tasks-${group.id}`}>
            {group.cards.map(card => <li key={card.id}>
              <a className="home-item" href={`#kanban-card:${encodeURIComponent(card.id)}`}>
                <span className="continue-copy">
                  <strong>{card.title}</strong>
                  <span>#{card.number} · {columnName(card.columnId)}</span>
                </span>
                <span className="home-item-end">
                  <DueChip card={card} today={today} doneId={doneId} />
                  <ChevronRight width={18} height={18} aria-hidden="true" />
                </span>
              </a>
            </li>)}
          </ul>
        </div>
      )) : <p className="home-empty">{!loaded
        ? 'Cargando tareas…'
        : userId && open.length
          ? `No tienes tareas asignadas. Hay ${open.length === 1 ? '1 tarea abierta' : `${open.length} tareas abiertas`} en el canal.`
          : 'Todavía no hay tareas. Crea la primera aquí o con /tarea en Discord.'}</p>}
      <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#kanban">
        {total > groups.reduce((sum, group) => sum + group.cards.length, 0) ? `Ver las ${total} en Tareas` : 'Abrir Tareas'} <ChevronRight aria-hidden="true" />
      </a>
    </section>
  );
}

function HomeDocs({docs, onOpenDoc}) {
  const recent = recentDocuments(docs, 5);
  const personalCount = docs.filter(isPersonalDoc).length;
  return (
    <section className="library-section" aria-labelledby="home-docs">
      <SectionHeading id="home-docs" Icon={FileText} title="Documentos recientes" />
      {recent.length ? <ul className="home-list" aria-labelledby="home-docs">
        {recent.map(doc => {
          const SpaceIcon = isSharedWithMe(doc) ? Persons : isPersonalDoc(doc) ? Lock : null;
          const note = isPersonalDoc(doc) ? docSpaceNote(doc) : 'Canal';
          return <li key={doc.id}>
            <a className="home-item" href={`#doc-${encodeURIComponent(doc.id)}`} onClick={event => {
              if (plainClick(event)) { event.preventDefault(); onOpenDoc(doc.id); }
            }}>
              <span className="continue-copy">
                <strong>{doc.title || 'Sin título'}</strong>
                <span className="home-doc-meta">
                  {SpaceIcon && <SpaceIcon width={12} height={12} aria-hidden="true" />}
                  {note} · {dateLabel(doc.updatedAt)}
                </span>
              </span>
              <ChevronRight width={18} height={18} aria-hidden="true" />
            </a>
          </li>;
        })}
      </ul> : <p className="home-empty">Todavía no hay documentos. Crea uno para el canal o uno personal, solo para ti.</p>}
      <div className="home-links">
        <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#docs">Documentos del canal <ChevronRight aria-hidden="true" /></a>
        <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#docs-personal">
          <Lock aria-hidden="true" /> Personal{personalCount ? ` (${personalCount})` : ''} <ChevronRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function HomeMeetings({meetings, now, focusId}) {
  const {upcoming, past} = meetingList(meetings, now, {exclude: focusId});
  const row = meeting => <li key={meetingId(meeting)}>
    <a className="home-item" href={`#planner-session:${encodeURIComponent(meetingId(meeting))}`}>
      <span className="continue-copy">
        <strong>{meeting.title || 'Reunión sin título'}</strong>
        <span>{meetingWhen(meeting, now)}{meeting.eventStatus === 'finished' || meeting.eventStatus === 'completed' ? ` · ${eventStatusLabel(meeting.eventStatus)}` : ''}</span>
      </span>
      <ChevronRight width={18} height={18} aria-hidden="true" />
    </a>
  </li>;

  return (
    <section className="library-section" aria-labelledby="home-meetings">
      <SectionHeading id="home-meetings" Icon={Calendar} title="Reuniones" />
      {upcoming.length > 0 && <div className="home-group">
        <h3 className="home-group-title" id="home-meetings-next">Próximas</h3>
        <ul className="home-list" aria-labelledby="home-meetings-next">{upcoming.map(row)}</ul>
      </div>}
      {past.length > 0 && <div className="home-group">
        <h3 className="home-group-title" id="home-meetings-past">Recientes</h3>
        <ul className="home-list" aria-labelledby="home-meetings-past">{past.map(row)}</ul>
      </div>}
      {!upcoming.length && !past.length && <p className="home-empty">{focusId ? 'No hay más reuniones programadas.' : 'Todavía no hay reuniones.'}</p>}
      <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#planner">Abrir Reuniones <ChevronRight aria-hidden="true" /></a>
    </section>
  );
}

export function Home({docs, draft, continueDoc = null, onNewDoc, onNewTask, onOpenDoc}) {
  const now = useNow();
  const [meetings] = useState(readMeetings);
  const [status, setStatus] = useState(() => window.__bardoHomeStatus || {});
  useEffect(() => {
    const update = () => setStatus({...window.__bardoHomeStatus});
    window.addEventListener('bardo-home-status', update);
    return () => window.removeEventListener('bardo-home-status', update);
  }, []);
  const {channelName: channel, guildName: guild} = useWorkspace();
  const isDiscord = Boolean(window.__BARDO_PRODUCTION__);
  // El header ya muestra el nombre del espacio: aquí va de dónde viene.
  const placeLabel = channel
    ? `#${channel} en ${guild || 'Discord'}`
    : guild ? `Un canal de ${guild}` : 'Este canal de Discord';
  const errors = Object.entries(status).filter(([, value]) => value === 'error').map(([key]) => ({docs: 'Documentos', planner: 'Reuniones', context: 'los datos del canal'}[key])).filter(Boolean);
  const focus = focusMeeting(meetings, now);
  const resume = continueDoc && !continueDoc.archived ? continueDoc : null;

  return (
    <section className="library route-active home" aria-labelledby="home-title">
      <div className="library-inner">
        <div className="home-intro">
          <h1 id="home-title" tabIndex={-1}>{longDate(now)}</h1>
          <p className="home-context">{isDiscord ? placeLabel : 'Solo en este dispositivo.'}</p>
        </div>

        <div className="home-create" role="group" aria-label="Crear">
          <Button variant="secondary" size="sm" onClick={() => onNewDoc('channel')} aria-label="Nuevo documento del canal">
            <Plus aria-hidden="true" /> Documento
          </Button>
          {/* En pantallas angostas el candado ya dice «personal» junto a «Documento». */}
          <Button variant="secondary" size="sm" onClick={() => onNewDoc('personal')} aria-label="Nuevo documento personal">
            <Lock aria-hidden="true" /> <span className="home-create-long">Documento personal</span><span className="home-create-short">Personal</span>
          </Button>
          <a className={buttonVariants({variant: 'secondary', size: 'sm'})} href="#planner-new" aria-label="Nueva reunión">
            <Plus aria-hidden="true" /> Reunión
          </a>
          <Button variant="secondary" size="sm" onClick={onNewTask} aria-label="Nueva tarea">
            <Plus aria-hidden="true" /> Tarea
          </Button>
        </div>

        {errors.length > 0 && <div className="home-notice" role="status">
          <p>No pudimos cargar {errors.join(' ni ')}. Lo que ves puede estar incompleto.</p>
          <Button variant="secondary" size="sm" onClick={() => location.reload()}>Volver a cargar</Button>
        </div>}

        <HomeNow meeting={focus} now={now} draft={draft} continueDoc={resume} onOpenDoc={onOpenDoc} />
        <HomeTasks />
        <HomeDocs docs={docs} onOpenDoc={onOpenDoc} />
        <HomeMeetings meetings={meetings} now={now} focusId={focus ? meetingId(focus) : null} />
      </div>
    </section>
  );
}
