// Pantallas previas a un canal en la web: entrar con Discord y elegir dónde
// trabajar. Usan el mismo lenguaje visual que el arranque de Bardo.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, ArrowRotateRight, ChevronRight, Magnifier, Plus, Server} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {UserMenu} from '../UserMenu.jsx';
import {Empty, EmptyHeader, EmptyDescription, EmptyMedia, EmptyContent} from '@/components/ui/empty';
import {goToChannel, readRecentChannels, signInUrl} from './web-session.js';
import {ChannelRow, ServerChannels} from './ServerChannels.jsx';

const INSTALL_URL = 'https://discord.com/oauth2/authorize?client_id=1539704001535156254';
const selectedServer = () => new URLSearchParams(window.location.search).get('server');
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

function DiscordMark() {
  return (
    <svg className="web-gate-discord" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M19.27 5.33A17.6 17.6 0 0 0 15 4l-.2.4a12 12 0 0 1 3.6 1.8 13.6 13.6 0 0 0-12.8 0A12 12 0 0 1 9.2 4.4L9 4a17.6 17.6 0 0 0-4.27 1.33C2.03 9.36 1.3 13.3 1.66 17.18A17.8 17.8 0 0 0 7 19.9l1.15-1.87a11 11 0 0 1-1.8-.87l.44-.34a12.7 12.7 0 0 0 10.42 0l.44.34c-.57.34-1.17.63-1.8.87L17 19.9a17.8 17.8 0 0 0 5.34-2.72c.43-4.5-.72-8.4-3.07-11.85ZM8.68 15.1c-1.03 0-1.88-.95-1.88-2.11s.83-2.11 1.88-2.11 1.9.95 1.88 2.11c0 1.16-.83 2.11-1.88 2.11Zm6.64 0c-1.03 0-1.88-.95-1.88-2.11s.83-2.11 1.88-2.11 1.9.95 1.88 2.11c0 1.16-.82 2.11-1.88 2.11Z" />
    </svg>
  );
}

function SignIn({message}) {
  return (
    <main className="web-gate web-gate--center">
      <section className="web-gate-card" aria-labelledby="web-gate-title">
        <span className="workspace-mark web-gate-mark" aria-hidden="true" />
        <h1 id="web-gate-title">Entra a Bardo</h1>
        <p>Tus documentos, reuniones y tareas de cada canal de Discord, ahora también en el navegador.</p>
        {message && <p className="web-gate-alert" role="alert">{message}</p>}
        <Button size="lg" className="web-gate-primary" nativeButton={false} render={<a href={signInUrl()} />}>
          <DiscordMark /> Continuar con Discord
        </Button>
        <p className="web-gate-note">Bardo no crea una cuenta aparte: solo pide tu nombre y avatar de Discord, y verás lo mismo que puedes ver allí.</p>
      </section>
    </main>
  );
}

function ServerIcon({guild}) {
  const [failed, setFailed] = useState(false);
  const initials = guild.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const src = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null;
  return (
    <span className="workspace-icon web-gate-server-icon" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

function EmptyState({title, children, action, icon: Icon = Server}) {
  return (
    <Empty className="web-home-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
        <h2>{title}</h2>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

function Search({query, setQuery, server}) {
  return (
    <div className="web-gate-search">
      <Magnifier width={18} height={18} aria-hidden="true" />
      <Input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder={server ? 'Buscar canal' : 'Buscar servidor'}
        aria-label={server ? 'Buscar canal' : 'Buscar servidor'} autoComplete="off" />
    </div>
  );
}

function ChannelPicker({user, message}) {
  const [state, setState] = useState({status: 'loading', guilds: [], truncated: false, partial: false});
  const [query, setQuery] = useState('');
  const [serverId, setServerId] = useState(selectedServer);
  const [opening, setOpening] = useState(null);
  const [expired, setExpired] = useState(false);
  const request = useRef(null);
  const heading = useRef(null);
  const lastServer = useRef(serverId);
  const pendingFocus = useRef(false);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setState(previous => ({...previous, status: previous.status === 'ready' ? 'ready' : 'loading', refreshing: true, message: null}));
    try {
      const response = await fetch('/api/web/channels', {headers: {Accept: 'application/json'}, cache: 'no-store', signal: controller.signal});
      if (response.status === 401) { setExpired(true); return; }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.guilds)) {
        throw new Error(payload?.message || 'No pudimos leer tus servidores de Discord. Inténtalo de nuevo.');
      }
      if (controller.signal.aborted) return;
      setState({status: 'ready', refreshing: false, guilds: payload.guilds, truncated: Boolean(payload.truncated), partial: Boolean(payload.partial)});
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      const detail = timedOut ? 'Discord está tardando demasiado. Inténtalo de nuevo.'
        : error instanceof TypeError ? 'No pudimos conectar con Bardo. Revisa tu conexión e inténtalo de nuevo.' : error.message;
      setState(previous => ({...previous, status: previous.status === 'ready' ? 'ready' : 'error', refreshing: false, message: detail}));
    } finally { clearTimeout(timeout); }
  }, []);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  useEffect(() => {
    const back = () => { setServerId(selectedServer()); setQuery(''); pendingFocus.current = true; };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  useEffect(() => {
    if (!pendingFocus.current || state.status !== 'ready') return;
    const previousLink = !serverId && document.getElementById(`web-server-${lastServer.current}`);
    (previousLink || heading.current)?.focus();
    pendingFocus.current = false;
  }, [serverId, state.status]);

  const navigate = (event, nextServer) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (nextServer || serverId) lastServer.current = nextServer || serverId;
    window.history.pushState(null, '', nextServer ? `/?server=${encodeURIComponent(nextServer)}` : '/');
    pendingFocus.current = true;
    setServerId(nextServer);
    setQuery('');
    window.scrollTo(0, 0);
  };

  const server = state.guilds.find(item => item.id === serverId);
  const normalized = normalize(query.trim());
  const guilds = state.guilds.filter(guild => normalize(guild.name).includes(normalized));
  const channels = (server?.channels || []).filter(channel => normalize(`${channel.name} ${channel.category || ''}`).includes(normalized));
  const recents = useMemo(() => readRecentChannels(user.id).flatMap(({guildId, channelId}) => {
    const guild = state.guilds.find(item => item.id === guildId);
    const channel = guild?.channels.find(item => item.id === channelId);
    return channel ? [{guild, channel}] : [];
  }), [state.guilds, user.id]);

  const open = (guildId, channelId) => { setOpening(channelId); goToChannel(guildId, channelId); };
  const retry = <Button variant="outline" disabled={state.refreshing} onClick={load}>{state.refreshing ? 'Actualizando…' : 'Intentar de nuevo'}</Button>;
  const install = <Button variant={state.status === 'ready' && !state.guilds.length ? 'default' : 'outline'} nativeButton={false} render={<a href={INSTALL_URL} target="_blank" rel="noopener noreferrer" />}><Plus aria-hidden="true" />Agregar Bardo a Discord<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (abre otra pestaña)</span></Button>;

  if (expired) return <SignIn message="Tu sesión venció. Vuelve a entrar para ver tus servidores." />;

  return (
    <main className="web-gate web-home">
      <div className="web-home-shell">
        <header className="web-home-header">
          {serverId ? <nav aria-label="Ubicación"><a href="/" onClick={event => navigate(event, null)} className="web-home-back"><ArrowLeft width={16} height={16} aria-hidden="true" />Mis servidores</a></nav> : <a href="/" onClick={event => navigate(event, null)} className="web-home-brand" aria-label="Bardo, inicio de tu cuenta">
            <span className="workspace-mark" aria-hidden="true" /><span>Bardo</span><span className="web-home-beta">Beta</span>
          </a>}
          <div className="web-home-account"><span>{user.global_name || user.username || 'Tu cuenta'}</span><UserMenu /></div>
        </header>
        <div className="web-home-content">
          <div className="web-home-intro">
            <div className="web-home-heading">
              {server && <ServerIcon key={server.id} guild={server} />}
              <div>
                <p className="web-home-eyebrow">{serverId ? 'Tu servidor' : 'Tu cuenta de Bardo'}</p>
                <h1 ref={heading} tabIndex={-1}>{serverId ? server?.name || 'Canales del servidor' : 'Mis servidores'}</h1>
                <p>{serverId ? 'Elige un canal para abrir sus documentos, reuniones y tareas.' : 'Un lugar para trabajar con tus comunidades de Discord. Elige dónde quieres entrar.'}</p>
              </div>
            </div>
          </div>
          {message && <p className="web-gate-alert" role="alert">{message}</p>}
          {(state.message || state.partial) && <div className="web-gate-alert web-home-notice" role="alert"><p>{state.message || 'No pudimos consultar todos tus servidores. Puedes entrar a los disponibles o intentar de nuevo.'}</p>{retry}</div>}
          {state.truncated && <p className="web-home-notice web-gate-note">Mostramos una parte de tus servidores con Bardo. Para llegar a otro, abre Bardo desde ese canal en Discord.</p>}
          {state.status === 'loading' && <div className="web-home-loading"><p role="status">Buscando tus servidores…</p><div aria-hidden="true" className="web-home-placeholder" /><div aria-hidden="true" className="web-home-placeholder" /></div>}
          {state.status === 'ready' && <>
            <section className="web-home-directory" aria-label={serverId ? 'Canales disponibles' : 'Servidores disponibles'}>
              <div className={`web-home-toolbar${serverId ? ' web-home-toolbar--sticky' : ''}`}>
                <Search query={query} setQuery={setQuery} server={Boolean(serverId)} />
                <Button variant="outline" className="web-home-refresh" aria-label={state.refreshing ? 'Actualizando…' : 'Actualizar'} onClick={load} disabled={state.refreshing}><ArrowRotateRight aria-hidden="true" /><span className="web-home-refresh-label">{state.refreshing ? 'Actualizando…' : 'Actualizar'}</span></Button>
              </div>
              {state.refreshing && <p className="sr-only" role="status">Actualizando tus servidores…</p>}
              {!serverId && state.guilds.length > 0 && <>
                <p className="web-home-count">{state.guilds.length === 1 ? '1 servidor con Bardo' : `${state.guilds.length} servidores con Bardo`}</p>
                <ul className="web-home-servers">{guilds.map(guild => <li key={guild.id}>
                  <a id={`web-server-${guild.id}`} className="web-home-server" href={`/?server=${guild.id}`} onClick={event => navigate(event, guild.id)}>
                    <ServerIcon guild={guild} /><span className="web-home-server-copy"><span className="web-home-server-name">{guild.name}</span><span className="web-home-server-meta">{guild.channels.length === 1 ? '1 canal disponible' : `${guild.channels.length} canales disponibles`}</span></span><ChevronRight width={18} height={18} aria-hidden="true" />
                  </a>
                </li>)}</ul>
              </>}
              {!serverId && !state.guilds.length && <EmptyState title="No encontramos servidores con Bardo">Aquí aparecen los servidores donde estás tú y está instalado Bardo. Agrégalo a un servidor que administres o pide a su administrador que lo instale. Después, pulsa Actualizar; puede tardar un minuto en aparecer.</EmptyState>}
              {serverId && !server && <EmptyState title="Este servidor no está disponible" action={retry}>Comprueba que sigues en el servidor y que Bardo está instalado. También puedes volver a Mis servidores y elegir otro.</EmptyState>}
              {server && !server.channels.length && <EmptyState title="No hay canales disponibles">Bardo está en este servidor, pero no encontramos canales a los que tengas acceso. Pide a su administrador que revise tus permisos y los de Bardo; después, pulsa Actualizar.</EmptyState>}
              {server?.channels.length > 0 && <ServerChannels key={server.id} server={server} channels={channels} onOpen={open} opening={opening} onExpired={setExpired} />}
              {normalized && (serverId ? server?.channels.length > 0 && !channels.length : state.guilds.length > 0 && !guilds.length) && <div className="web-home-no-results">
                <p role="status">{serverId ? 'Ningún canal coincide' : 'Ningún servidor coincide'} con «{query.trim()}».</p><Button variant="outline" onClick={() => setQuery('')}>Limpiar búsqueda</Button>
              </div>}
            </section>
            {!serverId && recents.length > 0 && !query && <section className="web-gate-group web-home-recents" aria-labelledby="web-home-recent">
              <h2 id="web-home-recent">Continuar en un canal</h2>
              <ul>{recents.map(({channel, guild}) => <ChannelRow key={channel.id} channel={channel} guild={guild} showGuild onOpen={open} opening={opening} />)}</ul>
            </section>}
          </>}
          {!serverId && <div className="web-home-install">{install}</div>}
          <footer className="web-home-footer"><Server width={16} height={16} aria-hidden="true" /><p>Solo ves los servidores donde estás tú y Bardo, y los canales a los que tienes acceso en Discord.</p></footer>
        </div>
      </div>
    </main>
  );
}

function GateError({message, onRetry}) {
  return (
    <main className="web-gate web-gate--center">
      <section className="web-gate-card" role="alert">
        <span className="workspace-mark web-gate-mark" aria-hidden="true" />
        <h1>No pudimos abrir Bardo</h1>
        <p>{message}</p>
        <Button size="lg" className="web-gate-primary" onClick={onRetry}>Intentar de nuevo</Button>
      </section>
    </main>
  );
}

export function WebGate({gate, onRetry}) {
  if (gate.gate === 'signin') return <SignIn message={gate.message} />;
  if (gate.gate === 'picker') return <ChannelPicker user={gate.user} message={gate.message} />;
  return <GateError message={gate.message} onRetry={onRetry} />;
}
