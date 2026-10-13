import {useEffect, useState} from 'react';
import {Button, buttonVariants} from '@/components/ui/button';
import {Calendar, FileText, ChevronRight, Plus} from '@gravity-ui/icons';
import {loadPlannerEvents, loadPlannerState, loadLiveSessionState, isDefaultEmptySession} from './planner/planner-store.js';

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
  const context = window.__bardoChannelContext || {};
  const channel = context.channelName || context.channel?.name;
  const guild = context.guildName || context.guild?.name;
  const isDiscord = Boolean(window.__BARDO_PRODUCTION__);
  const recentDocs = [...docs].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 4);
  const errors = Object.entries(status).filter(([, value]) => value === 'error').map(([key]) => ({docs: 'Documentos', planner: 'Reuniones', context: 'el contexto del canal'}[key])).filter(Boolean);

  return (
    <section className="library route-active home" aria-labelledby="home-title">
      <div className="library-inner">
        <div className="home-intro">
          <h1 id="home-title" tabIndex={-1}>Tu espacio en Bardo</h1>
          <p className="home-context">{isDiscord
            ? [guild || (window.__BARDO_GUILD_ID__ ? `Servidor ${window.__BARDO_GUILD_ID__}` : 'Discord'), channel ? `#${channel}` : (window.__BARDO_CHANNEL_ID__ ? `Canal ${window.__BARDO_CHANNEL_ID__}` : 'Canal actual')].join(' · ')
            : 'Espacio local · Abre Bardo en Discord para trabajar con tu canal.'}</p>
        </div>

        {errors.length > 0 && <div className="home-notice" role="status">
          <p>No pudimos actualizar {errors.join(', ')}. El contenido disponible puede estar incompleto.</p>
          <Button variant="secondary" size="sm" onClick={() => location.reload()}>Reintentar conexión</Button>
        </div>}
        {window.__BARDO_UNOWNED_LOCAL_DATA__ && <div className="home-notice" role="status">
          <p>Hay datos locales de una versión anterior conservados en este dispositivo. No se cargan automáticamente porque no podemos verificar a qué cuenta pertenecen. Conserva los datos del navegador y solicita ayuda para recuperarlos.</p>
        </div>}

        {draft && <section className="library-section continue-section" aria-labelledby="home-draft">
          <h2 id="home-draft" className="section-title">Borrador pendiente</h2>
          <a className="continue-row" href="#new">
            <span className="continue-copy"><strong>{draft.title || 'Documento sin título'}</strong><span>Continuar escribiendo · Guardado en este dispositivo</span></span>
            <ChevronRight width={18} height={18} aria-hidden="true" />
          </a>
        </section>}

        <section className="library-section" aria-labelledby="home-docs">
          <div className="home-section-heading">
            <h2 id="home-docs" className="section-title"><FileText width={18} height={18} aria-hidden="true" /> Documentos</h2>
            <Button variant="secondary" size="sm" onClick={onNewDoc}><Plus aria-hidden="true" /> Crear documento</Button>
          </div>
          <p className="home-description">Escribe, importa y comparte el trabajo de tu canal.</p>
          {recentDocs.length ? <ul className="home-list" aria-label="Documentos recientes">
            {recentDocs.map(doc => <li key={doc.id}>
              <a className="home-item" href={`#doc-${encodeURIComponent(doc.id)}`} onClick={event => {
                if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpenDoc(doc.id); }
              }}>
                <span className="continue-copy"><strong>{doc.title || 'Sin título'}</strong><span>Actualizado {dateLabel(doc.updatedAt)}</span></span>
                <ChevronRight width={18} height={18} aria-hidden="true" />
              </a>
            </li>)}
          </ul> : <p className="home-empty">Todavía no hay documentos. Crea el primero o importa un archivo desde Documentos.</p>}
          <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#docs">Abrir Documentos <ChevronRight aria-hidden="true" /></a>
        </section>

        <section className="library-section" aria-labelledby="home-meetings">
          <div className="home-section-heading">
            <h2 id="home-meetings" className="section-title"><Calendar width={18} height={18} aria-hidden="true" /> Reuniones</h2>
            <a className={buttonVariants({variant: 'secondary', size: 'sm'})} href="#planner-new"><Plus aria-hidden="true" /> Nueva reunión</a>
          </div>
          <p className="home-description">Prepara la agenda, reúne al equipo y conserva los acuerdos.</p>
          {meetings.length ? <ul className="home-list" aria-label="Reuniones para continuar">
            {meetings.map(meeting => <li key={meeting.id || meeting.eventId}>
              <a className="home-item" href={`#planner-session:${encodeURIComponent(meeting.id || meeting.eventId)}`}>
                <span className="continue-copy"><strong>{meeting.title || 'Reunión sin título'}</strong><span>{meeting.eventStatus === 'in_progress' ? 'En curso' : meeting.eventStatus === 'finished' ? 'Finalizada' : 'Agenda'}{meeting.date ? ` · ${dateLabel(`${meeting.date}T12:00:00`)} · ${meeting.startTime || ''}` : ''}</span></span>
                <ChevronRight width={18} height={18} aria-hidden="true" />
              </a>
            </li>)}
          </ul> : <p className="home-empty">Todavía no hay reuniones. Crea una agenda para empezar.</p>}
          <a className={buttonVariants({variant: 'ghost', size: 'sm'})} href="#planner">Abrir Reuniones <ChevronRight aria-hidden="true" /></a>
        </section>
      </div>
    </section>
  );
}
