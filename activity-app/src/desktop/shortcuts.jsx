// Atajos de Bardo para escritorio. Los dispara el menú nativo, así que
// funcionan aunque el foco esté en el editor.
import {modKey, shiftKey} from './desktop-bridge.js';

export function desktopShortcuts() {
  const mod = modKey();
  return [
    {keys: [mod, 'P'], label: 'Ir a un canal'},
    {keys: [mod, 'N'], label: 'Nuevo documento'},
    {keys: [mod, '1'], label: 'Inicio'},
    {keys: [mod, '2'], label: 'Documentos'},
    {keys: [mod, '3'], label: 'Reuniones'},
    {keys: [mod, '4'], label: 'Tareas'},
    {keys: [mod, shiftKey(), 'O'], label: 'Mis servidores'},
    {keys: [mod, '/'], label: 'Ver los atajos'},
  ];
}

export function ShortcutKeys({keys}) {
  return (
    <span className="desktop-keys">
      {keys.map((key, index) => <kbd key={`${key}-${index}`} className="desktop-kbd">{key}</kbd>)}
    </span>
  );
}
