import { Button } from '@/components/ui/button';
import { ClockIcon, PlayIcon, XIcon } from '@/components/ui/animated-icons';
import { clockToMinutes } from './time-engine.js';
import { MEETING_COPY, upcomingStartLabel } from './copy-tokens.js';

export function PlannerUpcomingBanner({
  plannerState,
  onStartSession,
  onDismiss,
}) {
  const firstBlock = (plannerState?.blocks || [])[0];
  const hasBlocks = Boolean(firstBlock);
  const now = new Date();
  const minutesUntilStart = clockToMinutes(plannerState?.startTime || '10:00') - (now.getHours() * 60 + now.getMinutes());

  return (
    <div className="w-full max-w-4xl mx-auto mb-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between gap-3 p-3 sm:py-2.5 sm:px-4 rounded-xl bg-primary/10 border border-primary/20 text-foreground">
        <div className="flex items-center gap-2.5 min-w-0">
          <ClockIcon className="size-4 text-primary shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
            <span className="font-semibold">{plannerState.title || 'La reunión programada'}</span>
            <span className="text-muted-foreground">{upcomingStartLabel(minutesUntilStart)}.</span>
            {firstBlock && (
              <span className="text-muted-foreground/80 hidden sm:inline">
                · Primer bloque: <strong className="text-foreground">{firstBlock.title}</strong> ({firstBlock.durationMinutes} min)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={onStartSession}
            disabled={!hasBlocks}
            title={hasBlocks ? undefined : MEETING_COPY.needsBlock}
            className="text-xs h-7 px-2.5 font-medium"
          >
            <PlayIcon className="size-3" />
            <span>{MEETING_COPY.startMeeting}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Cerrar aviso"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
