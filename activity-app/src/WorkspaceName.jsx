import {useState} from 'react';
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
 * Espacio en el header: ícono del servidor, nombre del espacio y canal.
 * Solo texto: el nombre se cambia en Ajustes › Espacio.
 */
export function WorkspaceName() {
  const workspace = useWorkspace();
  // Sin nombre propio, el nombre ya es «#canal»: no se repite debajo.
  const channel = workspace.customName && workspace.channelName ? `#${workspace.channelName}` : null;
  return (
    <span className="topbar-title workspace-label">
      {workspace.guildName && <ServerIcon name={workspace.guildName} src={workspace.guildIcon} />}
      <span className="workspace-text">
        <span className="workspace-name">{workspace.displayName}</span>
        {channel && <span className="workspace-channel">{channel}{workspace.guildName ? ` en ${workspace.guildName}` : ''}</span>}
      </span>
    </span>
  );
}
