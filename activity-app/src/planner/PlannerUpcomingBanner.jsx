import {
  Button,
} from '@heroui/react';
import {
  Clock,
  Play,
  Xmark,
} from '@gravity-ui/icons';

export function PlannerUpcomingBanner({
  plannerState,
  onStartSession,
  onDismiss,
}) {
  const firstBlock = (plannerState?.blocks || [])[0];

  return (
    <div className="w-full max-w-4xl mx-auto mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between gap-3 p-3 sm:py-2.5 sm:px-4 rounded-xl bg-accent/10 border border-accent/30 text-foreground">
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock width={16} height={16} className="text-accent shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
            <span className="font-semibold">{plannerState.title || 'La sesión programada'}</span>
            <span className="text-muted">comienza ahora.</span>
            {firstBlock && (
              <span className="text-muted/80 hidden sm:inline">
                · Primer punto: <strong className="text-foreground">{firstBlock.title}</strong> ({firstBlock.durationMinutes} min)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onPress={onStartSession}
            className="text-xs h-7 px-2.5 font-medium"
          >
            <Play width={12} height={12} />
            <span>Iniciar sesión</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="Cerrar aviso"
            onPress={onDismiss}
            className="h-7 w-7 text-muted hover:text-foreground"
          >
            <Xmark width={14} height={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
