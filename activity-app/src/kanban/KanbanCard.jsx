import {memo} from 'react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Archive, ArrowRightLeft, CheckSquare, GripVertical, Link, MessagesSquare, MoreHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {shareBardoLinkWithFeedback} from '../share-link.js';
import {AssigneeAvatar, DueChip, PriorityBadge, TagChip, subtaskProgress} from './kanban-ui.jsx';

/** Contenido visual de la tarjeta (también lo usa el "fantasma" al arrastrar). */
export function KanbanCardBody({card, tagsById, today, doneId}) {
  const {total, done} = subtaskProgress(card);
  const tags = (card.tagIds || []).map(id => tagsById.get(id)).filter(Boolean);
  return (
    <>
      {/* Las filas de arriba dejan sitio al asa y al menú (esquina superior derecha). */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pr-11">
          {tags.slice(0, 3).map(tag => <TagChip key={tag.id} tag={tag} />)}
          {tags.length > 3 && <span className="text-[10.5px] text-muted-foreground">+{tags.length - 3}</span>}
        </div>
      )}
      <p className={cn('text-[13px] font-medium leading-snug text-foreground break-words line-clamp-3', tags.length === 0 && 'pr-11', card.columnId === doneId && 'text-muted-foreground')}>
        {card.title}
      </p>
      <div className="flex items-center gap-2 min-h-6">
          <span className="text-[11px] text-muted-foreground tabular-nums">#{card.number}</span>
          <PriorityBadge priority={card.priority} />
          <DueChip card={card} today={today} doneId={doneId} />
          {total > 0 && (
            <span className={cn('inline-flex items-center gap-1 text-[11px] tabular-nums', done === total ? 'text-primary' : 'text-muted-foreground')}>
              <CheckSquare className="size-3" aria-hidden="true" />
              <span className="sr-only">Subtareas:</span>{done}/{total}
            </span>
          )}
          {card.threadId && (
            <span className="inline-flex text-muted-foreground" title="Tiene hilo en Discord">
              <MessagesSquare className="size-3" aria-hidden="true" /><span className="sr-only">Tiene hilo en Discord</span>
            </span>
          )}
          <span className="ml-auto">
            <AssigneeAvatar assignee={card.assignee} />
          </span>
      </div>
    </>
  );
}

function KanbanCardMenu({card, columns, onMove, onArchive, onOpenThread}) {
  const others = columns.filter(column => column.id !== card.columnId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Más acciones de la tarea #${card.number}`}
            className="kanban-card-menu relative z-10 rounded-full text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-52">
        {others.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Mover a</DropdownMenuLabel>
            {others.map(column => (
              <DropdownMenuItem key={column.id} onClick={() => onMove(card.id, column.id)} className="cursor-pointer">
                <ArrowRightLeft className="size-4 text-muted-foreground" />
                <span className="truncate">{column.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {onOpenThread && (
            <DropdownMenuItem onClick={() => onOpenThread(card)} className="cursor-pointer">
              <MessagesSquare className="size-4 text-muted-foreground" />
              <span>{card.threadId ? 'Ver hilo en Discord' : 'Crear hilo en Discord'}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void shareBardoLinkWithFeedback('task', {id: card.id, title: card.title})} className="cursor-pointer">
            <Link className="size-4 text-muted-foreground" />
            <span>Compartir enlace</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive(card.id)} className="cursor-pointer">
            <Archive className="size-4 text-muted-foreground" />
            <span>Archivar tarea</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function KanbanCardImpl({card, columns, tagsById, today, doneId, onOpen, onMove, onArchive, onOpenThread, dragDisabled}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: card.id, data: {type: 'card', columnId: card.columnId}, disabled: dragDisabled});

  const style = {transform: CSS.Translate.toString(transform), transition};

  return (
    <li
      ref={setNodeRef}
      style={style}
      // El mouse arrastra desde cualquier parte; teclado y touch, solo desde el asa.
      onMouseDown={listeners?.onMouseDown}
      data-card-id={card.id}
      className={cn(
        'kanban-card group/card relative flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-[0_1px_2px_0_oklch(0_0_0/0.04)]',
        'border-border/60 transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/60',
        'has-[.kanban-card-open:focus-visible]:outline-2 has-[.kanban-card-open:focus-visible]:outline-ring',
        card.pending && 'kanban-card-pending',
        isDragging && 'opacity-40',
      )}
    >
      {/* Toda la tarjeta abre el detalle; es un botón real (no anida otros botones). */}
      <button
        type="button"
        className="kanban-card-open absolute inset-0 rounded-xl cursor-pointer focus-visible:outline-none"
        onClick={() => onOpen(card.id)}
        aria-label={`Abrir tarea #${card.number}: ${card.title}`}
      />
      <div className="pointer-events-none flex flex-col gap-2">
        <KanbanCardBody card={card} tagsById={tagsById} today={today} doneId={doneId} />
      </div>
      <div className="absolute right-1.5 top-1.5 flex items-center">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Mover tarea #${card.number}`}
          aria-roledescription="tarea arrastrable"
          className="kanban-card-handle relative z-10 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring touch-none cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        <KanbanCardMenu card={card} columns={columns} onMove={onMove} onArchive={onArchive} onOpenThread={onOpenThread} />
      </div>
    </li>
  );
}

export const KanbanCard = memo(KanbanCardImpl);
