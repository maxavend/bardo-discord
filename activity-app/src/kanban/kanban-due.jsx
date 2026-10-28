// Compartido por Inicio y Tareas, sin cargar los selectores ni diálogos del tablero.
import {cn} from '@/lib/utils';
import {formatDueDate} from './kanban-shared.js';

export function dueState(card, today, doneId) {
  if (!card.dueDate || card.columnId === doneId) return 'neutral';
  if (card.dueDate < today) return 'overdue';
  if (card.dueDate === today) return 'today';
  return 'neutral';
}

export function DueChip({card, today, doneId, className}) {
  if (!card.dueDate) return null;
  const state = dueState(card, today, doneId);
  const label = formatDueDate(card.dueDate, today);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        state === 'overdue' ? 'text-destructive' : state === 'today' ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
      title={state === 'overdue' ? `Vencida: ${label}` : `Vence: ${label}`}
    >
      <span className="sr-only">{state === 'overdue' ? 'Vencida, ' : 'Vence '}</span>
      {label}
    </span>
  );
}
