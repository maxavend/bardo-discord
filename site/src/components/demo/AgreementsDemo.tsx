// «Crear tareas desde los acuerdos» (kanban/RecapToCardsDialog.jsx) and the
// cards it leaves in Por hacer (kanban/KanbanCard.jsx). Sample data only.
import { useState } from 'react';
import { CheckSquare, ListChecks, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MEMBERS, MemberAvatar, PriorityBadge, TagChip, type Member, type Tag } from './bardo-bits';

type Agreement = { id: string; text: string; from: string; who: Member; tag: Tag; subtasks?: string; priority?: 'high' };

const AGREEMENTS: Agreement[] = [
  { id: 'a1', text: 'Probar el paso de verificación con 6 personas antes de cerrar el diseño.', from: 'Onboarding v3: revisión del prototipo', who: MEMBERS.camila, tag: { name: 'Research', color: 'blue' }, priority: 'high' },
  { id: 'a2', text: 'Explicar por qué pedimos la clave del SII antes de mostrar el campo.', from: 'Onboarding v3: revisión del prototipo', who: MEMBERS.josefina, tag: { name: 'Copy', color: 'yellow' } },
  { id: 'a3', text: 'Medir el abandono por paso del registro antes del release.', from: 'Métricas de activación', who: MEMBERS.ignacia, tag: { name: 'Datos', color: 'orange' }, subtasks: '0/3' },
];

export function AgreementsDemo({ className }: { className?: string }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(AGREEMENTS.map(item => item.id)));
  const [created, setCreated] = useState<Agreement[] | null>(null);
  const count = checked.size;

  const toggle = (id: string, on: boolean) => setChecked(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  if (created) {
    return (
      <div className={cn('rounded-3xl bg-muted p-3 sm:p-4', className)}>
        <div className="flex items-center justify-between gap-3 pl-1">
          <h3 className="text-base font-semibold tracking-tight">
            Por hacer <span className="ml-1 font-normal text-muted-foreground tabular-nums">{created.length}</span>
          </h3>
          <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setCreated(null)}>
            <RotateCcw /> Volver a los acuerdos
          </Button>
        </div>
        <ul className="mt-3 grid gap-2" aria-live="polite">
          {created.map((item, index) => (
            <li
              key={item.id}
              className="card-in flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-kanban"
              style={{ '--i': index } as React.CSSProperties}
            >
              <div className="flex flex-wrap gap-1"><TagChip tag={item.tag} /></div>
              <p className="text-[13px] font-medium leading-snug break-words">{item.text}</p>
              <div className="flex min-h-6 items-center gap-2">
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
    );
  }

  return (
    <div className={cn('rounded-3xl border border-border/70 bg-card p-4 shadow-paper sm:p-5', className)}>
      <h3 className="text-base font-semibold tracking-tight">Crear tareas desde los acuerdos</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Cada responsable recibe un aviso.</p>

      <ul className="mt-4 grid gap-2">
        {AGREEMENTS.map(item => {
          const on = checked.has(item.id);
          return (
            <li key={item.id}>
              <label className={cn('flex cursor-pointer gap-3 rounded-2xl border px-3 py-2.5 transition-colors duration-150', on ? 'border-border' : 'border-border/50 opacity-70')}>
                <Checkbox checked={on} onCheckedChange={value => toggle(item.id, value === true)} className="mt-0.5" />
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
          className="rounded-full font-semibold"
          disabled={count === 0}
          onClick={() => setCreated(AGREEMENTS.filter(item => checked.has(item.id)))}
        >
          <ListChecks />
          {count === 0 ? 'Elige un acuerdo' : count === 1 ? 'Crear 1 tarea' : `Crear ${count} tareas`}
        </Button>
      </div>
    </div>
  );
}
