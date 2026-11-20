import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {ChevronRight, Hashtag, Microphone} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {gateFetch} from '../desktop/desktop-bridge.js';

const VOICE_TYPES = new Set([2, 13]);
const dateFormat = new Intl.DateTimeFormat('es', {day: 'numeric', month: 'short', year: 'numeric'});
const counts = [['documents', 'documento', 'documentos'], ['meetings', 'reunión', 'reuniones'], ['tasks', 'tarea', 'tareas']];
const hasContent = summary => counts.some(([key]) => summary[key] > 0);

export function ChannelRow({channel, guild, showGuild, onOpen, opening, summary}) {
  const descriptionId = useId();
  const Icon = VOICE_TYPES.has(channel.type) ? Microphone : Hashtag;
  const busy = opening === channel.id;
  return (
    <li>
      <button type="button" className="web-gate-channel" data-web-channel-id={channel.id} disabled={Boolean(opening)} aria-busy={busy}
        aria-label={summary ? channel.name : undefined} aria-describedby={summary ? descriptionId : undefined}
        onClick={() => onOpen(guild.id, channel.id)}>
        <Icon width={16} height={16} aria-hidden="true" />
        <span className="web-gate-channel-text">
          <span className="web-gate-channel-name" title={channel.name}>{channel.name}</span>
          {showGuild && <span className="web-gate-channel-detail">{guild.name}</span>}
          {summary && <span id={descriptionId} className="web-channel-summary">
            <span className="web-channel-counts">{counts.filter(([key]) => summary[key] > 0).map(([key, singular, plural]) =>
              <span key={key}>{summary[key]} {summary[key] === 1 ? singular : plural}</span>
            )}</span>
            {channel.category && <span className="web-channel-context">{channel.category}</span>}
            {summary.updatedAt && <time className="web-channel-context" dateTime={new Date(summary.updatedAt).toISOString()}>Actualizado el {dateFormat.format(summary.updatedAt)}</time>}
          </span>}
        </span>
        <span className="web-gate-channel-action">{busy ? 'Abriendo…' : <ChevronRight width={16} height={16} aria-hidden="true" />}</span>
      </button>
    </li>
  );
}

function Categories({channels, ...props}) {
  const categories = new Map();
  for (const channel of channels) {
    const name = channel.category || 'Canales';
    if (!categories.has(name)) categories.set(name, []);
    categories.get(name).push(channel);
  }
  return [...categories].map(([category, list]) => <div className="web-gate-group web-home-channel-group" key={category}>
    <h3 className="web-gate-group-title">{category}</h3>
    <ul>{list.map(channel => <ChannelRow key={channel.id} channel={channel} {...props} />)}</ul>
  </div>);
}

function ContentSection({title, count, description, children}) {
  const id = useId();
  return <section className="web-server-section" aria-labelledby={id}>
    <div className="web-server-section-heading">
      <h2 id={id}>{title}</h2><span className="web-server-section-count" aria-label={`${count} ${count === 1 ? 'canal' : 'canales'}`}>{count}</span>
    </div>
    {description && <p className="web-server-section-description">{description}</p>}
    {children}
  </section>;
}

/** El directorio sigue siendo utilizable mientras se consulta su contenido. */
export function ServerChannels({server, channels, onOpen, opening, onExpired}) {
  const [state, setState] = useState({data: null, loading: true, error: false});
  const request = useRef(null);
  const container = useRef(null);
  const pendingFocus = useRef(null);
  const rememberFocus = () => {
    const active = document.activeElement;
    pendingFocus.current = container.current?.contains(active) ? active.dataset.webChannelId : null;
  };
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const button = [...container.current.querySelectorAll('[data-web-channel-id]')]
      .find(element => element.dataset.webChannelId === pendingFocus.current);
    button?.focus();
    pendingFocus.current = null;
  }, [state.data]);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setState(previous => ({...previous, loading: true, error: false}));
    try {
      const response = await gateFetch('channel-content', {query: {guild_id: server.id}, signal: controller.signal});
      if (controller.signal.aborted) return;
      if (response.status === 401) { onExpired(true); return; }
      if (response.status === 403) {
        rememberFocus();
        setState({data: null, loading: false, error: true});
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.guildId !== server.id || !Array.isArray(payload?.channels)
        || !payload.channels.every(item => typeof item?.id === 'string'
          && counts.every(([key]) => Number.isSafeInteger(item[key]) && item[key] >= 0)
          && (item.updatedAt === null || (Number.isSafeInteger(item.updatedAt) && item.updatedAt > 0 && item.updatedAt <= 8640000000000000)))) {
        throw new Error('content_unavailable');
      }
      if (!controller.signal.aborted) {
        rememberFocus();
        setState({data: new Map(payload.channels.map(item => [item.id, item])), loading: false, error: false});
      }
    } catch {
      if (request.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setState(previous => ({...previous, loading: false, error: true}));
    } finally { clearTimeout(timeout); }
  }, [server.id, onExpired]);

  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load, server]);

  const rows = {guild: server, onOpen, opening};
  const populated = channels.filter(channel => state.data?.has(channel.id) && hasContent(state.data.get(channel.id)))
    .sort((a, b) => (state.data.get(b.id).updatedAt || 0) - (state.data.get(a.id).updatedAt || 0));
  const empty = channels.filter(channel => state.data?.has(channel.id) && !hasContent(state.data.get(channel.id)));
  const unknown = channels.filter(channel => !state.data?.has(channel.id));

  return <div className="web-server-channels" ref={container}>
    {state.loading && <p className="web-server-summary-status" role="status">{state.data ? 'Actualizando el contenido…' : 'Consultando el contenido de tus canales…'}</p>}
    {state.error && <div className="web-gate-alert web-home-notice" role="alert">
      <p>{state.data ? 'No pudimos actualizar el contenido. Mostramos el último resumen disponible.' : 'No pudimos consultar el contenido. Puedes entrar a cualquier canal o reintentar.'}</p>
      <Button variant="outline" onClick={load}>Reintentar resumen</Button>
    </div>}
    {populated.length > 0 && <ContentSection title="Con contenido" count={populated.length} description="Contenido sin archivar. Los cambios más recientes aparecen primero.">
      <ul className="web-server-content-list">{populated.map(channel => <ChannelRow key={channel.id} channel={channel} summary={state.data.get(channel.id)} {...rows} />)}</ul>
    </ContentSection>}
    {empty.length > 0 && <ContentSection title="Canales sin contenido" count={empty.length} description="Entra a un canal para crear un documento, reunión o tarea.">
      <Categories channels={empty} {...rows} />
    </ContentSection>}
    {unknown.length > 0 && <ContentSection title={state.data ? 'Contenido sin consultar' : 'Todos los canales'} count={unknown.length}
      description={state.data ? 'Estos canales siguen disponibles, pero aún no tenemos su resumen.' : null}>
      <Categories channels={unknown} {...rows} />
    </ContentSection>}
  </div>;
}
