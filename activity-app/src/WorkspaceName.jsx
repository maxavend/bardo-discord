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
  // Debajo, dónde estás: con nombre propio, «#canal en Servidor»; sin él, el
  // nombre ya es «#canal» y debajo va solo el servidor.
  const channel = workspace.customName && workspace.channelName
    ? `#${workspace.channelName}${workspace.guildName ? ` en ${workspace.guildName}` : ''}`
    : workspace.guildName;
  return (
    <span className="topbar-title workspace-label">
      {/* Sin servidor (modo local), el símbolo de Bardo. */}
      {workspace.guildName
        ? <ServerIcon name={workspace.guildName} src={workspace.guildIcon} />
        : <span className="workspace-mark" aria-hidden="true" />}
      <span className="workspace-text">
        <span className="workspace-name">{workspace.displayName}</span>
        {channel && <span className="workspace-channel">{channel}</span>}
      </span>
    </span>
  );
}
