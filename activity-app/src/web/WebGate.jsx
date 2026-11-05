// Pantallas previas a un canal en la web: entrar con Discord y elegir dónde
// trabajar. Usan el mismo lenguaje visual que el arranque de Bardo.
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ChevronRight, Hashtag, Magnifier, Microphone} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {goToChannel, readRecentChannels, signInUrl, signOutOfWeb} from './web-session.js';

const VOICE_TYPES = new Set([2, 13]);
const SEARCH_FROM_CHANNELS = 8;

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

function ChannelRow({channel, guild, showGuild, onOpen, opening}) {
  const Icon = VOICE_TYPES.has(channel.type) ? Microphone : Hashtag;
  const detail = showGuild ? guild.name : channel.category;
  const busy = opening === channel.id;
  return (
    <li>
      <button type="button" className="web-gate-channel" disabled={Boolean(opening)} aria-busy={busy} onClick={() => onOpen(guild.id, channel.id)}>
        <Icon width={16} height={16} aria-hidden="true" />
        <span className="web-gate-channel-text">
          <span className="web-gate-channel-name" title={channel.name}>{channel.name}</span>
          {detail && <span className="web-gate-channel-detail">{detail}</span>}
        </span>
        <span className="web-gate-channel-action">{busy ? 'Abriendo…' : <ChevronRight width={16} height={16} aria-hidden="true" />}</span>
      </button>
    </li>
  );
}

function PickerBody({state, guilds, recents, query, opening, onOpen, onRetry}) {
  if (state.status === 'loading') {
    return <p className="web-gate-status" role="status">Buscando tus servidores…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="web-gate-status" role="alert">
        <p>{state.message}</p>
        <Button variant="outline" onClick={onRetry}>Intentar de nuevo</Button>
      </div>
    );
  }
  if (!state.guilds.length) {
    return (
      <div className="web-gate-status">
        <h2>Todavía no hay canales para abrir</h2>
        <p>Aparecen los servidores donde estás tú y también está Bardo. Pide a quien administra tu servidor que lo instale, o abre otra cuenta de Discord.</p>
        <Button variant="outline" onClick={onRetry}>Buscar de nuevo</Button>
      </div>
    );
  }
  if (!guilds.length && !recents.length) {
    return <p className="web-gate-status" role="status">Ningún canal coincide con «{query}».</p>;
  }
  return (
    <>
      {recents.length > 0 && (
        <section className="web-gate-group" aria-labelledby="web-gate-recent">
          <h2 id="web-gate-recent" className="web-gate-group-title">Recientes</h2>
          <ul>
            {recents.map(({channel, guild}) => (
              <ChannelRow key={channel.id} channel={channel} guild={guild} showGuild onOpen={onOpen} opening={opening} />
            ))}
          </ul>
        </section>
      )}
      {guilds.map(guild => (
        <section key={guild.id} className="web-gate-group" aria-labelledby={`web-gate-guild-${guild.id}`}>
          <h2 id={`web-gate-guild-${guild.id}`} className="web-gate-group-title">
            <ServerIcon guild={guild} />
            <span>{guild.name}</span>
          </h2>
          <ul>
            {guild.channels.map(channel => (
              <ChannelRow key={channel.id} channel={channel} guild={guild} onOpen={onOpen} opening={opening} />
            ))}
          </ul>
        </section>
      ))}
      {state.truncated && <p className="web-gate-note">Estás en muchos servidores con Bardo y aquí se muestra solo una parte. Para llegar a otro, abre Bardo desde ese canal en Discord.</p>}
    </>
  );
}

function ChannelPicker({user, message}) {
  const [state, setState] = useState({status: 'loading', guilds: [], truncated: false});
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(null);

  const load = useCallback(async () => {
    setState({status: 'loading', guilds: [], truncated: false});
    try {
      const response = await fetch('/api/web/channels', {headers: {Accept: 'application/json'}, cache: 'no-store'});
      if (response.status === 401) {
        window.location.assign('/');
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.guilds)) {
        throw new Error(payload?.message || 'No pudimos leer tus servidores de Discord. Inténtalo de nuevo.');
      }
      setState({status: 'ready', guilds: payload.guilds, truncated: Boolean(payload.truncated)});
    } catch (error) {
      const offline = error instanceof TypeError;
      setState({status: 'error', guilds: [], truncated: false, message: offline ? 'No pudimos conectar con Bardo. Revisa tu conexión e inténtalo de nuevo.' : error.message});
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalChannels = state.guilds.reduce((sum, guild) => sum + guild.channels.length, 0);
  const normalized = query.trim().toLocaleLowerCase('es');
  const guilds = useMemo(() => {
    if (!normalized) return state.guilds;
    return state.guilds
      .map(guild => (guild.name.toLocaleLowerCase('es').includes(normalized)
        ? guild
        : {...guild, channels: guild.channels.filter(channel => `${channel.name} ${channel.category || ''}`.toLocaleLowerCase('es').includes(normalized))}))
      .filter(guild => guild.channels.length);
  }, [state.guilds, normalized]);
  const recents = useMemo(() => {
    if (normalized || totalChannels <= SEARCH_FROM_CHANNELS) return [];
    return readRecentChannels(user.id).flatMap(({guildId, channelId}) => {
      const guild = state.guilds.find(item => item.id === guildId);
      const channel = guild?.channels.find(item => item.id === channelId);
      return channel ? [{guild, channel}] : [];
    });
  }, [state.guilds, normalized, totalChannels, user.id]);

  const open = (guildId, channelId) => {
    setOpening(channelId);
    goToChannel(guildId, channelId);
  };

  return (
    <main className="web-gate">
      <div className="web-gate-column">
        <header className="web-gate-header">
          <span className="workspace-mark" aria-hidden="true" />
          <span className="web-gate-user">{user.username || 'Tu cuenta'}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOutOfWeb()}>Cerrar sesión</Button>
        </header>
        <h1 className="web-gate-title">¿Dónde quieres trabajar?</h1>
        {message && <p className="web-gate-alert" role="alert">{message}</p>}
        {totalChannels > SEARCH_FROM_CHANNELS && (
          <div className="web-gate-search">
            <Magnifier width={16} height={16} aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar canal o servidor"
              aria-label="Buscar canal o servidor"
              autoComplete="off"
            />
          </div>
        )}
        <PickerBody state={state} guilds={guilds} recents={recents} query={query.trim()} opening={opening} onOpen={open} onRetry={load} />
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
