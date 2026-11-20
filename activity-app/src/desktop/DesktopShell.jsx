// Capa de Bardo Desktop sobre la app: recibe los comandos del menú
// nativo, ofrece el selector rápido de canales (⌘P) y el diálogo de atajos, y
// avisa a la ventana del tema para que la barra de título lo acompañe.
import {useCallback, useEffect, useMemo, useState} from 'react';
import {FilePlus, Hashtag, Microphone, Server} from '@gravity-ui/icons';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {channelPickerHref, goToChannel, readRecentChannels} from '../web/web-session.js';
import {desktopBridge, gateFetch} from './desktop-bridge.js';
import {desktopShortcuts, ShortcutKeys} from './shortcuts.jsx';

const ROUTES = {'go-home': '#home', 'go-docs': '#docs', 'go-planner': '#planner', 'go-kanban': '#kanban'};
const VOICE_TYPES = new Set([2, 13]);
const inChannel = () => Boolean(window.__BARDO_CHANNEL_ID__);

function useThemeToWindow(bridge) {
  useEffect(() => {
    if (!bridge) return undefined;
    const root = document.documentElement;
    const push = () => void bridge.setTheme(root.dataset.bardoTheme === 'light' ? 'light' : 'dark').catch(() => {});
    push();
    const observer = new MutationObserver(push);
    observer.observe(root, {attributes: true, attributeFilter: ['data-bardo-theme']});
    return () => observer.disconnect();
  }, [bridge]);
}

function QuickSwitcher({open, onOpenChange}) {
  const [state, setState] = useState({status: 'idle', guilds: []});
  const user = window.__BARDO_USER__;

  useEffect(() => {
    if (!open || state.status === 'ready' || state.status === 'loading') return;
    let cancelled = false;
    setState(previous => ({...previous, status: 'loading'}));
    gateFetch('channels')
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !Array.isArray(payload?.guilds)) throw new Error(payload?.message);
        setState({status: 'ready', guilds: payload.guilds});
      })
      .catch(error => {
        if (!cancelled) setState({status: 'error', guilds: [], message: error?.message || 'No pudimos leer tus canales. Inténtalo de nuevo.'});
      });
    return () => { cancelled = true; };
  }, [open, state.status]);

  const recents = useMemo(() => (user?.id ? readRecentChannels(user.id) : []).flatMap(({guildId, channelId}) => {
    const guild = state.guilds.find(item => item.id === guildId);
    const channel = guild?.channels.find(item => item.id === channelId);
    return channel && channelId !== window.__BARDO_CHANNEL_ID__ ? [{guild, channel}] : [];
  }), [state.guilds, user?.id]);

  const open_ = (guildId, channelId) => {
    onOpenChange(false);
    if (channelId !== window.__BARDO_CHANNEL_ID__) goToChannel(guildId, channelId);
  };
  const channelItem = (guild, channel, prefix) => {
    const Icon = VOICE_TYPES.has(channel.type) ? Microphone : Hashtag;
    return (
      <CommandItem key={`${prefix}-${channel.id}`} value={`${prefix} ${channel.name} ${guild.name} ${channel.id}`} onSelect={() => open_(guild.id, channel.id)}>
        <Icon aria-hidden="true" className="text-muted-foreground" />
        <span className="truncate">{channel.name}</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">{guild.name}</span>
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Ir a un canal" description="Busca un canal de tus servidores para abrirlo.">
      <Command>
      <CommandInput placeholder="Buscar canal o servidor…" />
      <CommandList>
        <CommandEmpty>Ningún canal coincide.</CommandEmpty>
        {state.status !== 'ready' && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
          {state.status === 'error' ? state.message : 'Buscando tus canales…'}
        </p>}
        <CommandGroup heading="Acciones">
          {inChannel() && <CommandItem value="acción nuevo documento" onSelect={() => { onOpenChange(false); window.dispatchEvent(new CustomEvent('bardo:desktop-command', {detail: 'new-document'})); }}>
            <FilePlus aria-hidden="true" className="text-muted-foreground" />Nuevo documento<CommandShortcut><ShortcutKeys keys={desktopShortcuts()[1].keys} /></CommandShortcut>
          </CommandItem>}
          <CommandItem value="acción mis servidores" onSelect={() => { onOpenChange(false); window.location.assign(channelPickerHref()); }}>
            <Server aria-hidden="true" className="text-muted-foreground" />Mis servidores<CommandShortcut><ShortcutKeys keys={desktopShortcuts()[6].keys} /></CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {recents.length > 0 && <CommandGroup heading="Recientes">{recents.map(({guild, channel}) => channelItem(guild, channel, 'reciente'))}</CommandGroup>}
        {state.guilds.map(guild => guild.channels.length > 0 && (
          <CommandGroup key={guild.id} heading={guild.name}>{guild.channels.map(channel => channelItem(guild, channel, 'canal'))}</CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

function ShortcutsDialog({open, onOpenChange}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan en toda la app, también mientras escribes un documento.</DialogDescription>
        </DialogHeader>
        <ul className="desktop-shortcut-list">
          {desktopShortcuts().map(item => <li key={item.label}><span>{item.label}</span><ShortcutKeys keys={item.keys} /></li>)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function DesktopShell() {
  const bridge = desktopBridge();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useThemeToWindow(bridge);

  const run = useCallback(command => {
    if (ROUTES[command]) {
      if (inChannel()) window.location.hash = ROUTES[command];
      return;
    }
    if (command === 'new-document') {
      if (inChannel()) window.dispatchEvent(new CustomEvent('bardo:desktop-command', {detail: 'new-document'}));
      else setSwitcherOpen(true);
      return;
    }
    if (command === 'quick-switcher') {
      // Antes de iniciar sesión no hay canales que mostrar.
      if (window.__BARDO_USER__) setSwitcherOpen(open => !open);
      return;
    }
    if (command === 'servers') {
      if (window.__BARDO_USER__) window.location.assign(channelPickerHref());
      return;
    }
    if (command === 'shortcuts') setShortcutsOpen(true);
  }, []);

  useEffect(() => bridge?.onCommand(run), [bridge, run]);

  if (!bridge) return null;
  return (
    <>
      <QuickSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

