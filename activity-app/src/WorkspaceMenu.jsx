import {useWorkspace} from './workspace.js';

/** Nombre del espacio en el header. Al tocarlo se abren los ajustes del espacio. */
export function WorkspaceMenu({onOpenSettings}) {
  const workspace = useWorkspace();
  return (
    <button
      type="button"
      className="topbar-title home-brand workspace-trigger"
      aria-label={`Espacio: ${workspace.displayName}. Abrir ajustes del espacio`}
      onClick={() => onOpenSettings?.('space')}
    >
      <span className="workspace-name">{workspace.displayName}</span>
    </button>
  );
}
