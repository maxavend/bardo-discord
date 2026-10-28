// The live meeting, as the Activity draws it (planner/SessionDock.jsx and the
// agenda view): a dock with the clock and the next action over the current
// block. Sample data only; the clock runs while the demo is on screen.
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, Flag, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MaterialWavyProgress } from './MaterialWavyProgress.jsx';
import { MaterialMorphShape } from './MaterialMorphShape.jsx';
import { MEMBERS, MemberAvatar, useLiveMotion } from './bardo-bits';

const BLOCK_SECONDS = 25 * 60;
const START_REMAINING = 17 * 60 + 8;
const POINTS = [
  { title: 'Paso de verificación de identidad', who: MEMBERS.sofia },
  { title: 'Explicación antes de pedir la clave del SII', who: MEMBERS.josefina },
  { title: 'Retomar el registro donde quedó', who: MEMBERS.sofia },
];

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LiveMeetingDemo({ className }: { className?: string }) {
  const { ref, visible, reduced } = useLiveMotion<HTMLDivElement>();
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(START_REMAINING);
  const [paused, setPaused] = useState(false);
  const finished = current >= POINTS.length;
  const running = visible && !paused && !finished && remaining > 0;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const isLast = current === POINTS.length - 1;
  const restart = () => { setCurrent(0); setRemaining(START_REMAINING); setPaused(false); };
  const progress = finished ? 100 : ((BLOCK_SECONDS - remaining) / BLOCK_SECONDS) * 100;

  return (
    <div ref={ref} className={cn('grid gap-3', className)}>
      {/* Dock: the clock, the current point and the next action, floating over the agenda as in the Activity. */}
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border/70 bg-card py-1.5 pr-1.5 pl-2 shadow-paper max-sm:rounded-3xl max-sm:p-2">
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold tabular-nums text-accent-foreground">
          {finished ? 'Terminada' : `Quedan ${clock(remaining)}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">
          {finished ? 'Onboarding v3: revisión del prototipo' : POINTS[current].title}
        </span>
        {finished ? (
          <Button size="sm" variant="secondary" className="rounded-full" onClick={restart}>
            <RotateCcw /> Volver a empezar
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setPaused(value => !value)}>
              {paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}
              {paused ? 'Reanudar' : 'Pausar'}
            </Button>
            <Button size="sm" className="rounded-full font-semibold" onClick={() => setCurrent(value => value + 1)}>
              {isLast ? <><Flag /> Terminar reunión</> : <>Siguiente tema <ChevronRight /></>}
            </Button>
          </>
        )}
      </div>

      {/* The block: a timeline with the wave on the left, its points on the right. */}
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 pt-2">
        <div className="flex flex-col items-center gap-1 pt-1 text-[11px] tabular-nums">
          <span className="font-semibold text-primary">10:10</span>
          <span className="text-primary">10:35</span>
          <span className="text-muted-foreground">25 min</span>
          {/* The morphing shape marks the live block, as the agenda did before the identity change. */}
          <div className="mt-2 flex items-center justify-center">
            <MaterialMorphShape size={18} color="accent" isPaused={paused || !visible} isActive={!finished} isCompleted={finished} />
          </div>
          <div className="mt-2 flex w-5 flex-1 justify-center">
            <MaterialWavyProgress value={progress} isPaused={paused || finished || reduced || !visible} className="h-full" />
          </div>
        </div>

        <div className="rounded-2xl border border-primary/40 bg-card p-3 shadow-paper sm:p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight">Onboarding v3: revisión del prototipo</h3>
            <span className="shrink-0 text-xs text-muted-foreground">25 min</span>
          </div>

          <ol className="mt-3 grid gap-2">
            {POINTS.map((point, index) => {
              const done = index < current;
              const active = index === current;
              return (
                <li
                  key={point.title}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex gap-2.5 rounded-2xl px-3 py-2.5 transition-colors duration-200',
                    active ? 'bg-primary/10' : 'bg-muted/70',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 fill-success text-card" aria-label="Tratado" />
                  ) : active ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-border" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className={cn('block text-[13px] font-semibold leading-snug', active && 'text-primary')}>{point.title}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MemberAvatar member={point.who} /> {point.who.name}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
