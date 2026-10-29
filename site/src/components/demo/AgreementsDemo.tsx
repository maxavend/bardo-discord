// «Crear tareas desde los acuerdos» (kanban/RecapToCardsDialog.jsx) and the
// cards it leaves in Por hacer (kanban/KanbanCard.jsx). Sample data only.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckSquare, ListChecks, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MEMBERS, MemberAvatar, PriorityBadge, TagChip, type Member, type Tag } from './bardo-bits';
import {motionMs, useHydrated, useMotionHeight, useReducedMotion} from '@/lib/motion';
import {MotionText} from '@/components/MotionText';
import demo from '@/lib/demo-data.json';

type Agreement = { id: string; text: string; from: string; who: Member; tag: Tag; subtasks?: string; priority?: 'high' };

type FixtureAgreement = Omit<Agreement, 'who'> & {member: keyof typeof MEMBERS};
const AGREEMENTS: Agreement[] = (demo.agreements.slice(0, 3) as FixtureAgreement[]).map(({member, ...agreement}) => ({...agreement, who: MEMBERS[member]}));

export function AgreementsDemo({ className }: { className?: string }) {
  const ready = useHydrated();
  const [checked, setChecked] = useState<Set<string>>(() => new Set(AGREEMENTS.map(item => item.id)));
  const [created, setCreated] = useState<Agreement[] | null>(null);
  const [leaving, setLeaving] = useState(false);
  const reduced = useReducedMotion();
  const {frame, content} = useMotionHeight();
  const scene = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const moveFocus = useRef(false);
  const first = useRef(true);
  const count = checked.size;

  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const element = scene.current;
    if (!element) return;
    const list = element.querySelector('.t-stagger');
    element.dataset.open = 'false';
    list?.classList.remove('is-shown');
    void element.offsetHeight;
    element.dataset.open = 'true';
    list?.classList.add('is-shown');
    if (moveFocus.current) element.querySelector<HTMLButtonElement>('[data-agreement-action]')?.focus({preventScroll: true});
  }, [created]);

  const switchView = (next: Agreement[] | null) => {
    if (timer.current) return;
    moveFocus.current = Boolean(scene.current?.contains(document.activeElement));
    const finish = () => { setCreated(next); setLeaving(false); timer.current = 0; };
    if (reduced) { finish(); return; }
    setLeaving(true);
    timer.current = window.setTimeout(finish, scene.current ? motionMs(scene.current, '--panel-close-dur') : 0);
  };

  const toggle = (id: string, on: boolean) => setChecked(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const view = created ? (
      <div className="rounded-3xl bg-muted p-3 sm:p-4">
        <div className="agreement-result-header flex items-center justify-between gap-3 pl-1">
          <h3 className="text-base font-semibold tracking-tight">
            Por hacer <span className="ml-1 font-normal text-muted-foreground tabular-nums">{created.length}</span>
          </h3>
          <Button data-agreement-action size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={!ready || leaving} onClick={() => switchView(null)}>
            <RotateCcw /> Volver a los acuerdos
          </Button>
        </div>
        <ul className="t-stagger is-shown mt-3 grid gap-2" aria-label="Tareas creadas">
          {created.map((item, index) => (
            <li
              key={item.id}
              className={cn('t-stagger-line flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-kanban', index === 1 && 't-stagger-line--2', index === 2 && 't-stagger-line--3')}
              style={{display: 'flex'}}
            >
              <div className="flex flex-wrap gap-1"><TagChip tag={item.tag} /></div>
              <p className="text-[13px] font-medium leading-snug break-words">{item.text}</p>
              <div className="agreement-card-meta flex min-h-6 items-center gap-2">
                <span className="text-[11px] text-muted-foreground tabular-nums">#{25 + index}</span>
                <PriorityBadge priority={item.priority} />
                {item.subtasks && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                    <CheckSquare className="size-3" aria-hidden="true" />
                    <span className="sr-only">Subtareas:</span>{item.subtasks}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {item.who.name.split(' ')[0]} <MemberAvatar member={item.who} size="md" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-paper sm:p-5">
      <h3 className="text-base font-semibold tracking-tight">Crear tareas desde los acuerdos</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Cada responsable recibe un aviso.</p>

      <ul className="mt-4 grid gap-2">
        {AGREEMENTS.map(item => {
          const on = checked.has(item.id);
          return (
            <li key={item.id}>
              <label className={cn('agreement-row flex cursor-pointer gap-3 rounded-2xl border px-3 py-2.5', on ? 'border-border' : 'border-border/50 opacity-70')}>
                <Checkbox checked={on} disabled={!ready || leaving} onCheckedChange={value => toggle(item.id, value === true)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-snug">{item.text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.from}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 pr-2.5 text-xs">
                    <MemberAvatar member={item.who} /> {item.who.name}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <Button
          data-agreement-action
          className="rounded-full font-semibold"
          disabled={!ready || count === 0 || leaving}
          onClick={() => switchView(AGREEMENTS.filter(item => checked.has(item.id)))}
        >
          <ListChecks />
          <MotionText text={count === 0 ? 'Elige un acuerdo' : count === 1 ? 'Crear 1 tarea' : `Crear ${count} tareas`} />
        </Button>
      </div>
    </div>
  );
  return (
    <div ref={frame} className={cn('t-resize agreement-stage', className)}>
      <div ref={content}>
        <div ref={scene} className="t-panel-slide" data-open={leaving ? 'false' : 'true'} aria-busy={leaving}>
          {view}
        </div>
      </div>
      <span className="sr-only" role="status">{created ? `${created.length} tareas creadas desde los acuerdos.` : ''}</span>
    </div>
  );
}
