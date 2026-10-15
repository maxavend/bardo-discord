import {useEffect, useState} from 'react';
import {Button, buttonVariants} from '@/components/ui/button';
import {Calendar, FileText, ChevronRight, LayoutColumns3, Plus} from '@gravity-ui/icons';
import {loadPlannerEvents, loadPlannerState, loadLiveSessionState, isDefaultEmptySession} from './planner/planner-store.js';
import {currentUserId, ensureKanbanLoaded, useKanbanSnapshot} from './kanban/kanban-runtime.js';
import {assignedOpenCards, doneColumnId, todayIso} from './kanban/kanban-store.js';
import {formatDueDate} from './kanban/kanban-ui.jsx';
import {useWorkspace} from './workspace.js';

function HomeTasks() {
  const {view, loaded} = useKanbanSnapshot();
  useEffect(() => {
    void ensureKanbanLoaded();
  }, []);
  const userId = currentUserId();
  const today = todayIso();
  const doneId = doneColumnId(view.board);
  const open = Object.values(view.cards).filter(card => card.columnId !== doneId);
  const mine = assignedOpenCards(view, userId);
  const list = userId ? mine : [...open].sort((a, b) => b.number - a.number).slice(0, 4);
  const columnName = id => view.board?.columns.find(column => column.id === id)?.name || '';

  return (
    <section className="library-section" aria-labelledby="home-tasks">
      <div className="home-section-heading">
        <h2 id="home-tasks" className="section-title"><LayoutColumns3 width={18} height={18} aria-hidden="true" /> Tareas</h2>
        <a className={buttonVariants({variant: 'secondary', size: 'sm'})} href="#kanban"><Plus aria-hidden="true" /> Nueva tarea</a>
      </div>
      {list.length ? <ul className="home-list" aria-label={userId ? 'Tareas asignadas a ti' : 'Tareas abiertas'}>
        {list.map(card => <li key={card.id}>
          <a className="home-item" href={`#kanban-card:${encodeURIComponent(card.id)}`}>
            <span className="continue-copy"><strong>{card.title}</strong><span>#{card.number} · {columnName(card.columnId)}{card.dueDate ? ` · ${card.dueDate < today ? 'Vencida' : 'Vence'} ${formatDueDate(card.dueDate, today).toLowerCase()}` : ''}</span></span>
            <ChevronRight width={18} height={18} aria-hidden="true" />
          </a>
        </li>)}
      </ul> : <p className="home-empty">{!loaded
        ? 'Cargando tareas…'
        : userId && open.length
          ? `No tienes tareas asignadas. Hay ${open.length === 1 ? '1 tarea abierta' : `${open.length} tareas abiertas`} en el canal.`
          : 'Todavía no hay tareas. Crea la primera aquí o con /tarea en Discord.'}</p>}
      <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#kanban">Abrir Tareas <ChevronRight aria-hidden="true" /></a>
    </section>
  );
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', {day: 'numeric', month: 'short'}).format(date);
}

function readMeetings() {
  const events = loadPlannerEvents();
  const current = loadPlannerState();
  const live = loadLiveSessionState(current);
  const byId = new Map(events.map(event => [event.id || event.eventId, event]));
  if (current?.id && (!isDefaultEmptySession(current) || byId.has(current.id))) {
    byId.set(current.id, {...byId.get(current.id), ...current,
      eventStatus: live?.status === 'running' || live?.status === 'paused' ? 'in_progress' : live?.status === 'completed' ? 'finished' : byId.get(current.id)?.eventStatus,
    });
  }
  const now = Date.now();
  const meetingTime = event => Date.parse(`${event.date}T${event.startTime || '00:00'}`) || 0;
  return [...byId.values()].filter(event => event.eventStatus !== 'archived').sort((a, b) => {
    const active = Number(b.eventStatus === 'in_progress') - Number(a.eventStatus === 'in_progress');
    const aTime = meetingTime(a);
    const bTime = meetingTime(b);
    const upcoming = Number(bTime >= now) - Number(aTime >= now);
    return active || upcoming || (aTime >= now ? aTime - bTime : bTime - aTime);
  }).slice(0, 4);
}

export function Home({docs, draft, onNewDoc, onOpenDoc}) {
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
  const recentDocs = [...docs].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 4);
  const errors = Object.entries(status).filter(([, value]) => value === 'error').map(([key]) => ({docs: 'Documentos', planner: 'Reuniones', context: 'los datos del canal'}[key])).filter(Boolean);

  return (
    <section className="library route-active home" aria-labelledby="home-title">
      <div className="library-inner">
        <div className="home-intro">
          <h1 id="home-title" tabIndex={-1}>Lo último en tu espacio</h1>
          <p className="home-context">{isDiscord
            ? placeLabel
            : 'Solo en este dispositivo.'}</p>
        </div>

        {errors.length > 0 && <div className="home-notice" role="status">
          <p>No pudimos cargar {errors.join(' ni ')}. Lo que ves puede estar incompleto.</p>
          <Button variant="secondary" size="sm" onClick={() => location.reload()}>Volver a cargar</Button>
        </div>}

        {draft && <section className="library-section continue-section" aria-labelledby="home-draft">
          <h2 id="home-draft" className="section-title">Borrador sin terminar</h2>
          <a className="continue-row" href="#new">
            <span className="continue-copy"><strong>{draft.title || 'Documento sin título'}</strong><span>Solo tú lo ves, en este dispositivo</span></span>
            <ChevronRight width={18} height={18} aria-hidden="true" />
          </a>
        </section>}

        <section className="library-section" aria-labelledby="home-docs">
          <div className="home-section-heading">
            <h2 id="home-docs" className="section-title"><FileText width={18} height={18} aria-hidden="true" /> Documentos</h2>
            <Button variant="secondary" size="sm" onClick={onNewDoc}><Plus aria-hidden="true" /> Nuevo documento</Button>
          </div>
          {recentDocs.length ? <ul className="home-list" aria-label="Documentos recientes">
            {recentDocs.map(doc => <li key={doc.id}>
              <a className="home-item" href={`#doc-${encodeURIComponent(doc.id)}`} onClick={event => {
                if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpenDoc(doc.id); }
              }}>
                <span className="continue-copy"><strong>{doc.title || 'Sin título'}</strong><span>Actualizado {dateLabel(doc.updatedAt)}</span></span>
                <ChevronRight width={18} height={18} aria-hidden="true" />
              </a>
            </li>)}
          </ul> : <p className="home-empty">Todavía no hay documentos.</p>}
          <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#docs">Abrir Documentos <ChevronRight aria-hidden="true" /></a>
        </section>

        <section className="library-section" aria-labelledby="home-meetings">
          <div className="home-section-heading">
            <h2 id="home-meetings" className="section-title"><Calendar width={18} height={18} aria-hidden="true" /> Reuniones</h2>
            <a className={buttonVariants({variant: 'secondary', size: 'sm'})} href="#planner-new"><Plus aria-hidden="true" /> Nueva reunión</a>
          </div>
          {meetings.length ? <ul className="home-list" aria-label="Reuniones recientes">
            {meetings.map(meeting => <li key={meeting.id || meeting.eventId}>
              <a className="home-item" href={`#planner-session:${encodeURIComponent(meeting.id || meeting.eventId)}`}>
                <span className="continue-copy"><strong>{meeting.title || 'Reunión sin título'}</strong><span>{meeting.eventStatus === 'in_progress' ? 'En curso' : meeting.eventStatus === 'finished' ? 'Terminada' : 'Programada'}{meeting.date ? ` · ${dateLabel(`${meeting.date}T12:00:00`)}${meeting.startTime ? ` · ${meeting.startTime}` : ''}` : ''}</span></span>
                <ChevronRight width={18} height={18} aria-hidden="true" />
              </a>
            </li>)}
          </ul> : <p className="home-empty">Todavía no hay reuniones.</p>}
          <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#planner">Abrir Reuniones <ChevronRight aria-hidden="true" /></a>
        </section>

        <HomeTasks />
      </div>
    </section>
  );
}
