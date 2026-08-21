import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckSquare2,
  Clock3,
  Columns3,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../components/ui/button.jsx';
import { EmptyState } from '../../components/bardo/empty-state.jsx';

const SOURCES = [
  { key: 'events', limit: 8 },
  { key: 'tasks', limit: 8 },
  { key: 'documents', limit: 8 },
  { key: 'boards', limit: 8 },
];

const EMPTY_DATA = { events: [], tasks: [], documents: [], boards: [] };
const relativeFormatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

function timestampOf(value, now = Date.now()) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  const normalized = String(value).trim().toLowerCase();
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  if (normalized === 'hoy') return date.getTime();
  if (normalized === 'mañana') return date.getTime() + 86_400_000;
  return Number.NaN;
}

function relativeCopy(value, now = Date.now()) {
  const timestamp = typeof value === 'number' ? value : timestampOf(value, now);
  if (!Number.isFinite(timestamp)) return null;
  const delta = timestamp - now;
  const absolute = Math.abs(delta);
  if (absolute < 60_000) return 'ahora';
  if (absolute < 3_600_000) return relativeFormatter.format(Math.round(delta / 60_000), 'minute');
  if (absolute < 86_400_000) return relativeFormatter.format(Math.round(delta / 3_600_000), 'hour');
  return relativeFormatter.format(Math.round(delta / 86_400_000), 'day');
}

function taskStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['in_progress', 'in-progress', 'doing', 'en progreso'].includes(normalized)) return 'En progreso';
  return 'Tarea activa';
}

function attentionSignals(data, now = Date.now()) {
  const eventSignals = data.events.flatMap((event) => {
    const timestamp = timestampOf(event.starts_at, now);
    const delta = timestamp - now;
    if (!Number.isFinite(timestamp) || delta < -300_000 || delta > 86_400_000) return [];
    return [{
      id: `event:${event.id}`,
      entityId: event.id,
      type: 'event',
      kind: 'Agenda',
      title: event.title,
      meta: delta <= 3_600_000 ? `Empieza ${relativeCopy(timestamp, now)}` : `${event.event_date || 'Próximo evento'}${event.start_time ? ` · ${event.start_time}` : ''}`,
      timestamp,
      severity: delta <= 3_600_000 ? 'urgent' : 'active',
      Icon: CalendarDays,
    }];
  });

  const taskSignals = data.tasks.flatMap((task) => {
    const due = timestampOf(task.due_at, now);
    const priority = String(task.priority || '').toLowerCase();
    const dueSoon = Number.isFinite(due) && due - now <= 172_800_000;
    if (!['urgente', 'urgent', 'alta', 'high'].includes(priority) && !dueSoon) return [];
    const overdue = Number.isFinite(due) && due < now;
    return [{
      id: `task:${task.id}`,
      entityId: task.id,
      type: 'task',
      kind: 'Tarea',
      title: task.title,
      meta: overdue ? `Venció ${relativeCopy(due, now)}` : Number.isFinite(due) ? `Vence ${relativeCopy(due, now)}` : `${task.board_name || 'Tarea'} · prioridad ${priority}`,
      timestamp: Number.isFinite(due) ? due : now,
      severity: overdue || ['urgente', 'urgent'].includes(priority) ? 'urgent' : 'active',
      Icon: CheckSquare2,
    }];
  });

  return [...eventSignals, ...taskSignals]
    .sort((a, b) => (a.severity === b.severity ? a.timestamp - b.timestamp : a.severity === 'urgent' ? -1 : 1))
    .slice(0, 3);
}

function continuationItems(data, attention, now = Date.now()) {
  const excludedTasks = new Set(attention.filter((item) => item.type === 'task').map((item) => item.entityId));
  return [
    ...data.tasks.filter((item) => !excludedTasks.has(item.id)).map((item) => ({
      id: `task:${item.id}`, entityId: item.id, type: 'task', kind: 'Tarea', Icon: CheckSquare2,
      title: item.title, meta: [taskStatus(item.status), item.board_name].filter(Boolean).join(' · '), timestamp: timestampOf(item.updated_at, now),
    })),
    ...data.documents.map((item) => ({
      id: `document:${item.id}`, entityId: item.id, type: 'document', kind: 'Documento', Icon: FileText,
      title: item.title, meta: 'Documento reciente', timestamp: timestampOf(item.created_at, now),
    })),
    ...data.boards.map((item) => ({
      id: `board:${item.id}`, entityId: item.id, type: 'board', kind: 'Tablero', Icon: Columns3,
      title: item.name, meta: item.description || 'Tablero del equipo', timestamp: timestampOf(item.updated_at, now),
    })),
  ].sort((a, b) => (Number.isFinite(b.timestamp) ? b.timestamp : 0) - (Number.isFinite(a.timestamp) ? a.timestamp : 0)).slice(0, 5);
}

function activityItems(data, now = Date.now()) {
  return [
    ...data.tasks.map((item) => ({ id: `task:${item.id}`, title: item.title, detail: 'Tarea actualizada', timestamp: timestampOf(item.updated_at, now) })),
    ...data.documents.map((item) => ({ id: `document:${item.id}`, title: item.title, detail: 'Documento creado', timestamp: timestampOf(item.created_at, now) })),
    ...data.boards.map((item) => ({ id: `board:${item.id}`, title: item.name, detail: 'Tablero actualizado', timestamp: timestampOf(item.updated_at, now) })),
  ].filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);
}

function destinations(data) {
  return [
    { key: 'documents', label: 'Documentos', description: 'Notas, decisiones y minutas', type: 'document', target: data.documents[0], Icon: FileText },
    { key: 'boards', label: 'Tableros', description: 'Trabajo compartido del equipo', type: 'board', target: data.boards[0], Icon: Columns3 },
    { key: 'events', label: 'Agenda', description: 'Reuniones y próximos momentos', type: 'event', target: data.events[0], Icon: CalendarDays },
    { key: 'tasks', label: 'Tareas', description: 'Pendientes y trabajo en curso', type: 'task', target: data.tasks[0], Icon: CheckSquare2 },
  ];
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

function openResource(type, id) {
  void navigateTo(type, id).catch((error) => {
    globalThis.__bardoToast?.error(error?.message || 'No pudimos abrir este recurso.');
  });
}

function useHomeData() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: EMPTY_DATA, failed: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: EMPTY_DATA, failed: [] });
    void Promise.allSettled(SOURCES.map(async ({ key, limit }) => {
      const response = await fetch(`/api/home/${key}?limit=${limit}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return { key, items: Array.isArray(payload.items) ? payload.items : [] };
    })).then((results) => {
      if (controller.signal.aborted) return;
      const data = { ...EMPTY_DATA };
      const failed = [];
      results.forEach((result, index) => {
        const key = SOURCES[index].key;
        if (result.status === 'fulfilled') data[key] = result.value.items;
        else failed.push(key);
      });
      setState({ status: failed.length === SOURCES.length ? 'error' : 'ready', data, failed });
    });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}

function SectionHeader({ id, title, status }) {
  return (
    <header className="bardo-home-section-header">
      <h2 id={id}>{title}</h2>
      <span className="bardo-home-section-status">{status}</span>
    </header>
  );
}

function SkeletonRows({ count = 3 }) {
  return <div className="bardo-home-skeletons" aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

function PausedRows({ count = 3 }) {
  return <div className="bardo-home-paused" aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

function DestinationSkeletons() {
  return <div className="bardo-home-destinations bardo-home-destinations--loading" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>;
}

function ResourceRow({ item, className = '', severity, includeWhen = true }) {
  const Icon = item.Icon;
  const when = relativeCopy(item.timestamp);
  return (
    <button
      className={`bardo-home-resource ${className}`.trim()}
      data-kind={item.kind}
      data-severity={severity}
      type="button"
      onClick={() => openResource(item.type, item.entityId)}
    >
      {Icon ? <span className="bardo-home-resource-icon"><Icon aria-hidden="true" size={16} /></span> : null}
      <span className="bardo-home-resource-copy">
        <strong>{item.title}</strong>
        <small>{[item.meta, includeWhen ? when : null].filter(Boolean).join(' · ')}</small>
      </span>
      <ArrowRight className="bardo-home-resource-arrow" aria-hidden="true" size={15} />
    </button>
  );
}

function GlobalNotice({ status, failed, onRetry }) {
  if (status !== 'error' && failed.length === 0) return null;
  const globalFailure = status === 'error';
  return (
    <aside className="bardo-home-notice" data-tone={globalFailure ? 'error' : 'warning'} aria-live="polite">
      <div>
        <strong>{globalFailure ? 'No pudimos actualizar Inicio' : 'Parte de Inicio no está disponible'}</strong>
        <p>{globalFailure ? 'Conservamos la estructura para que puedas reintentar sin perder el contexto.' : 'Mostramos el trabajo disponible mientras recuperamos el resto.'}</p>
      </div>
      <Button size="compact" variant="ghost" onClick={onRetry}><RefreshCw aria-hidden="true" size={14} />Reintentar</Button>
    </aside>
  );
}

function NowSection({ loading, paused, incomplete, signals }) {
  const urgent = signals.some((item) => item.severity === 'urgent');
  const emphasis = paused ? 'paused' : urgent ? 'urgent' : signals.length ? 'active' : 'quiet';
  return (
    <section className="bardo-home-section bardo-home-now" data-emphasis={emphasis} aria-labelledby="bardo-home-now-title">
      <SectionHeader id="bardo-home-now-title" title="Ahora" status={loading ? 'Actualizando…' : paused ? 'Sin datos' : incomplete ? 'Datos parciales' : signals.length ? `${signals.length} ${signals.length === 1 ? 'señal' : 'señales'}` : 'Todo tranquilo'} />
      {loading ? <SkeletonRows count={2} /> : paused ? <PausedRows count={2} /> : signals.length ? (
        <div className="bardo-home-resources">{signals.map((item) => <ResourceRow key={item.id} item={item} severity={item.severity} includeWhen={false} />)}</div>
      ) : incomplete ? (
        <div className="bardo-home-calm"><RefreshCw aria-hidden="true" size={17} /><span><strong>No pudimos comprobar todas las señales.</strong><small>El resto de Inicio continúa disponible.</small></span></div>
      ) : (
        <div className="bardo-home-calm"><Clock3 aria-hidden="true" size={17} /><span><strong>Nada requiere atención inmediata.</strong><small>Tu trabajo reciente sigue disponible abajo.</small></span></div>
      )}
    </section>
  );
}

function ResumeSection({ loading, paused, incomplete, items }) {
  return (
    <section className="bardo-home-section bardo-home-resume" aria-labelledby="bardo-home-resume-title">
      <SectionHeader id="bardo-home-resume-title" title="Retomar" status={loading ? 'Ordenando…' : paused ? 'Sin datos' : incomplete ? `${items.length} disponibles` : `${items.length} para continuar`} />
      {loading ? <SkeletonRows count={4} /> : paused ? <PausedRows count={4} /> : items.length ? (
        <div className="bardo-home-resources bardo-home-resources--flat">{items.map((item) => <ResourceRow key={item.id} item={item} />)}</div>
      ) : <EmptyState icon={Clock3} title="Todavía no hay trabajo reciente" description="Los elementos que uses aparecerán aquí para que puedas retomarlos." />}
    </section>
  );
}

function ActivitySection({ loading, paused, incomplete, items }) {
  return (
    <section className="bardo-home-section bardo-home-activity" aria-labelledby="bardo-home-activity-title">
      <SectionHeader id="bardo-home-activity-title" title="Actividad reciente" status={loading ? 'Actualizando…' : paused ? 'Sin datos' : incomplete ? `${items.length} disponibles` : `${items.length} ${items.length === 1 ? 'cambio' : 'cambios'}`} />
      {loading ? <SkeletonRows count={3} /> : paused ? <PausedRows count={3} /> : items.length ? (
        <ol className="bardo-home-timeline">
          {items.map((item) => (
            <li key={item.id}>
              <time dateTime={new Date(item.timestamp).toISOString()}>{relativeCopy(item.timestamp)}</time>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </li>
          ))}
        </ol>
      ) : <EmptyState icon={Activity} title="Sin cambios recientes" description="La actividad conocida por Bardo aparecerá aquí en orden temporal." />}
    </section>
  );
}

function ExploreSection({ loading, paused, failed, items }) {
  return (
    <section className="bardo-home-section bardo-home-explore" aria-labelledby="bardo-home-explore-title">
      <SectionHeader id="bardo-home-explore-title" title="Explorar" status={loading ? 'Comprobando espacios…' : paused ? 'Sin datos' : '4 espacios'} />
      {loading ? <DestinationSkeletons /> : paused ? <PausedRows count={2} /> : (
        <div className="bardo-home-destinations">
          {items.map(({ key, label, description, type, target, Icon }) => (
            <button key={key} type="button" disabled={!target?.id} onClick={() => target?.id && openResource(type, target.id)}>
              <Icon aria-hidden="true" size={16} />
              <span><strong>{label}</strong><small>{target?.id ? description : failed.includes(key) ? 'No disponible' : 'Todavía sin contenido'}</small></span>
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const { status, data, failed, retry } = useHomeData();
  const loading = status === 'loading';
  const paused = status === 'error';
  const attentionIncomplete = failed.includes('events') || failed.includes('tasks');
  const continuationIncomplete = failed.some((key) => ['tasks', 'documents', 'boards'].includes(key));
  const activityIncomplete = continuationIncomplete;
  const signals = useMemo(() => attentionSignals(data), [data]);
  const continuation = useMemo(() => continuationItems(data, signals), [data, signals]);
  const activity = useMemo(() => activityItems(data), [data]);
  const explore = useMemo(() => destinations(data), [data]);
  const summary = loading
    ? 'Ordenando tu trabajo reciente…'
    : paused
      ? 'Inicio conserva su mapa mientras recuperamos la conexión.'
      : failed.length
        ? 'Mostramos lo disponible mientras recuperamos parte del contexto.'
        : signals.length
        ? `${signals.length} ${signals.length === 1 ? 'señal próxima' : 'señales próximas'}; el resto queda listo para retomar.`
        : 'Nada reclama atención inmediata; tu trabajo reciente queda listo para retomar.';

  return (
    <main id="bardo-main-content" className="bardo-home-v2" data-bardo-main-content>
      <header className="bardo-home-intro">
        <h1>Lo importante, sin ruido.</h1>
        <p role="status">{summary}</p>
      </header>
      <div className="bardo-home-layout">
        <GlobalNotice status={status} failed={failed} onRetry={retry} />
        <NowSection loading={loading} paused={paused} incomplete={attentionIncomplete} signals={signals} />
        <ResumeSection loading={loading} paused={paused} incomplete={continuationIncomplete} items={continuation} />
        <ActivitySection loading={loading} paused={paused} incomplete={activityIncomplete} items={activity} />
        <ExploreSection loading={loading} paused={paused} failed={failed} items={explore} />
      </div>
    </main>
  );
}
