import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckSquare2, Columns3, FileText, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button.jsx';
import { EmptyState } from '../../components/bardo/empty-state.jsx';

const SECTIONS = [
  { key: 'events', title: 'Próximos eventos', icon: CalendarDays, type: 'event' },
  { key: 'tasks', title: 'Mis tareas activas', icon: CheckSquare2, type: 'task' },
  { key: 'documents', title: 'Documentos recientes', icon: FileText, type: 'document' },
  { key: 'boards', title: 'Tableros', icon: Columns3, type: 'board' },
];

function itemCopy(section, item) {
  if (section.key === 'events') return { title: item.title, meta: [item.event_date, item.start_time].filter(Boolean).join(' · ') };
  if (section.key === 'tasks') return { title: item.title, meta: [item.board_name, item.due_at ? `Vence ${item.due_at}` : null].filter(Boolean).join(' · ') };
  if (section.key === 'documents') return { title: item.title, meta: 'Documento' };
  return { title: item.name, meta: item.description || 'Tablero del equipo' };
}

async function navigateTo(type, id) {
  if (globalThis.__bardoNavigate) return globalThis.__bardoNavigate(type, id);
  const response = await fetch('/api/navigation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!response.ok) throw new Error('No pudimos abrir este recurso.');
  const payload = await response.json();
  location.assign(payload.route);
}

async function openResource(type, id) {
  try {
    await navigateTo(type, id);
  } catch (error) {
    globalThis.__bardoToast?.error(error?.message || 'No pudimos abrir este recurso.');
  }
}

function ResourceSection({ section }) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const response = await fetch(`/api/home/${section.key}?limit=5`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setState({ status: 'ready', items: Array.isArray(payload.items) ? payload.items : [] });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ status: 'error', items: [] });
    }
  }, [section.key]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const Icon = section.icon;
  return (
    <section className="bardo-home-panel" aria-labelledby={`home-${section.key}-title`}>
      <header className="bardo-home-panel-header">
        <span className="bardo-home-panel-icon"><Icon aria-hidden="true" size={17} /></span>
        <h2 id={`home-${section.key}-title`}>{section.title}</h2>
        <span className="bardo-home-panel-count" role="status">
          {state.status === 'loading' ? 'Cargando…' : state.status === 'ready' ? `${state.items.length} ${state.items.length === 1 ? 'recurso' : 'recursos'}` : 'Sin conexión'}
        </span>
      </header>

      {state.status === 'loading' ? (
        <div className="bardo-home-skeletons" aria-hidden="true"><i /><i /><i /></div>
      ) : state.status === 'error' ? (
        <EmptyState icon={RefreshCw} title="No pudimos cargar esta sección" description="Revisa tu conexión e inténtalo otra vez." actionLabel="Reintentar" onAction={() => void load()} />
      ) : state.items.length ? (
        <div className="bardo-home-resources">
          {state.items.map((item) => {
            const copy = itemCopy(section, item);
            return (
              <button className="bardo-home-resource" type="button" key={item.id} onClick={() => void openResource(section.type, item.id)}>
                <span><strong>{copy.title}</strong>{copy.meta ? <small>{copy.meta}</small> : null}</span>
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Icon} title="Nada por aquí todavía" description="Los recursos nuevos aparecerán aquí." />
      )}
    </section>
  );
}

export default function HomePage() {
  const jumpTo = (key) => document.querySelector(`#home-${key}-title`)?.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });

  return (
    <main id="bardo-main-content" className="bardo-home-v2" data-bardo-main-content>
      <section className="bardo-home-intro">
        <div className="bardo-home-intro-copy">
          <p className="bardo-eyebrow">Inicio</p>
          <h1>Lo importante,<br />sin ruido.</h1>
          <p>Tu trabajo reciente en Discord, ordenado para que sepas dónde retomar.</p>
        </div>
        <nav className="bardo-home-shortcuts" aria-label="Acciones rápidas">
          <Button variant="secondary" onClick={() => jumpTo('documents')}><FileText aria-hidden="true" size={16} />Documentos</Button>
          <Button variant="secondary" onClick={() => jumpTo('boards')}><Columns3 aria-hidden="true" size={16} />Tableros</Button>
          <Button variant="secondary" onClick={() => jumpTo('events')}><CalendarDays aria-hidden="true" size={16} />Agenda</Button>
        </nav>
      </section>
      <div className="bardo-home-grid">
        {SECTIONS.map((section) => <ResourceSection key={section.key} section={section} />)}
      </div>
    </main>
  );
}
