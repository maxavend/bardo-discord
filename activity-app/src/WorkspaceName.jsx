import {useWorkspace} from './workspace.js';

/** Nombre del espacio en el header. Solo texto: se cambia en Ajustes › Espacio. */
export function WorkspaceName() {
  const workspace = useWorkspace();
  return (
    <span className="topbar-title workspace-label">
      <span className="workspace-name">{workspace.displayName}</span>
    </span>
  );
}
