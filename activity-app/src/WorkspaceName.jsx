import {useState} from 'react';
import {ChevronDown, Gear} from '@gravity-ui/icons';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {BetaChip, BetaNote} from './BetaNotice.jsx';
import {useWorkspace} from './workspace.js';

/** Ícono del servidor de Discord; sin imagen, sus iniciales, como en Discord. */
function ServerIcon({name, src}) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return (
    <span className="workspace-icon" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

/**
 * Identidad del header: el símbolo de Bardo y, al lado, el espacio. En
 * escritorio, un chip con el canal (las pestañas ya dicen el módulo); en
 * móvil, el título del módulo con su punto. Los dos abren el mismo menú:
 * servidor, canal, el aviso de beta y los ajustes del canal.
 */
export function WorkspaceName({moduleLabel, onOpenSettings}) {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  // Dónde estás: con nombre propio, «#canal en Servidor»; sin él, el nombre
  // ya es «#canal» y basta el servidor.
  const where = workspace.customName && workspace.channelName
    ? `#${workspace.channelName}${workspace.guildName ? ` en ${workspace.guildName}` : ''}`
    : workspace.guildName;

  return (
    <span className="header-identity">
      <span className="workspace-mark" aria-hidden="true" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={(
            <button type="button" className="workspace-chip" title={[workspace.displayName, where].filter(Boolean).join(' · ')}>
              <span className="workspace-chip-module">{moduleLabel}</span>
              <span className="workspace-chip-space">
                <span className="workspace-name">{workspace.displayName}</span>
              </span>
              <span className="sr-only">, espacio y ajustes</span>
              <ChevronDown className="workspace-chip-chevron" width={12} height={12} aria-hidden="true" />
            </button>
          )}
        />
        <PopoverContent align="start" sideOffset={8} className="workspace-popover w-80 gap-3 p-3">
          <div className="workspace-popover-head">
            {workspace.guildName
              ? <ServerIcon name={workspace.guildName} src={workspace.guildIcon} />
              : <span className="workspace-mark" aria-hidden="true" />}
            <span className="flex min-w-0 flex-col">
              <span className="workspace-popover-name">{workspace.displayName}</span>
              <span className="workspace-popover-where">{where || 'Sin Discord: todo queda en este dispositivo'}</span>
            </span>
          </div>
          <BetaNote className="md:hidden" />
          {onOpenSettings && (
            <button type="button" className="workspace-popover-action" onClick={() => { setOpen(false); onOpenSettings('space'); }}>
              <Gear width={16} height={16} aria-hidden="true" />
              {workspace.channelName ? 'Ajustes de este canal' : 'Ajustes del espacio'}
            </button>
          )}
        </PopoverContent>
      </Popover>
      <span className="max-md:hidden"><BetaChip /></span>
    </span>
  );
}
