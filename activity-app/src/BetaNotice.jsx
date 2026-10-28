import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';

/** El aviso de beta: qué significa y dónde avisar si algo falla. */
export function BetaNote({className}) {
  return (
    <p className={['beta-note', className].filter(Boolean).join(' ')}>
      <span className="beta-badge">Beta</span>
      Bardo está en beta. Si algo no funciona, cuéntanos en el chat del canal.
    </p>
  );
}

/**
 * Chip «Beta» del header (escritorio). Ya no ocupa una franja bajo el header:
 * el aviso se abre al tocarlo. En móvil vive dentro del menú del espacio.
 */
export function BetaChip() {
  return (
    <Popover>
      <PopoverTrigger
        render={(
          <button type="button" className="beta-chip" aria-label="Bardo está en beta. Más información">
            <span className="beta-chip-label">Beta</span>
          </button>
        )}
      />
      <PopoverContent align="start" sideOffset={8} className="w-72 gap-0 p-3">
        <BetaNote />
      </PopoverContent>
    </Popover>
  );
}
