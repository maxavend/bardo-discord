import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/ui/animated-icons';

export const UNDO_TOAST_MS = 6000;

/**
 * "Bloque eliminado · Deshacer" bar. Deletions of bloques, temas and acuerdos
 * don't ask for confirmation; they can be undone for a few seconds instead.
 * Sits above the mobile action button so neither hides the other.
 */
export function PlannerUndoToast({ toast, onUndo, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => onDismiss?.(toast.id), toast.durationMs || UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-150 bottom-[calc(var(--bardo-visual-viewport-bottom,0px)+var(--bardo-safe-bottom,0px)+76px)] sm:bottom-[calc(var(--bardo-visual-viewport-bottom,0px)+var(--bardo-safe-bottom,0px)+16px)]"
    >
      <div className="flex items-center gap-2 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg pl-4 pr-1.5 py-1.5 text-sm">
        <span className="flex-1 min-w-0 truncate">{toast.message}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUndo?.(toast.id)}
          className="h-8 px-3 font-semibold text-primary hover:text-primary"
        >
          Deshacer
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Cerrar aviso"
          onClick={() => onDismiss?.(toast.id)}
          className="text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
