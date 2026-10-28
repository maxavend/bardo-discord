import {memo, useEffect, useRef, useState} from 'react';
import {useDroppable} from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {ArrowLeft, ArrowRight, CheckCircle2, MoreHorizontal, Pencil, Plus, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {KANBAN_LIMITS} from './kanban-shared.js';
import {KanbanCard} from './KanbanCard.jsx';

export function QuickAddCard({columnId, columnName, active, onActiveChange, onCreate}) {
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);
  const buttonRef = useRef(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (active) inputRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [active]);
  const close = () => {
    restoreFocus.current = true;
    setTitle('');
    onActiveChange(null);
  };

  if (!active) {
    return (
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => onActiveChange(columnId)}
        className="kanban-quick-add w-full justify-start gap-1.5 h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" aria-hidden="true" /> Agregar tarea
      </Button>
    );
  }

  const submit = () => {
    const value = title.trim();
    if (!value) return;
    onCreate(columnId, value.slice(0, KANBAN_LIMITS.title));
    setTitle('');
  };

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        ref={inputRef}
        value={title}
        maxLength={KANBAN_LIMITS.title}
        onChange={event => setTitle(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (!title.trim()) onActiveChange(null);
        }}
        placeholder="¿Qué hay que hacer?"
        aria-label={`Nueva tarea en ${columnName}`}
        className="h-9 text-[13px]"
      />
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" className="h-7 px-3 text-xs" disabled={!title.trim()}>Agregar</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onMouseDown={event => event.preventDefault()}
          onClick={close}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ColumnMenu({column, index, columnCount, onRename, onMoveColumn, onSetDone, onDelete}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button variant="ghost" size="icon-xs" aria-label={`Opciones de la columna ${column.name}`} className="rounded-full text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="size-3.5" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onRename(column)} className="cursor-pointer">
            <Pencil className="size-4 text-muted-foreground" /> <span>Renombrar</span>
          </DropdownMenuItem>
          {!column.isDone && (
            <DropdownMenuItem onClick={() => onSetDone(column.id)} className="cursor-pointer">
              <CheckCircle2 className="size-4 text-muted-foreground" /> <span>Usar como columna «Hecho»</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={index === 0} onClick={() => onMoveColumn(column.id, -1)} className="cursor-pointer">
            <ArrowLeft className="size-4 text-muted-foreground" /> <span>Mover a la izquierda</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === columnCount - 1} onClick={() => onMoveColumn(column.id, 1)} className="cursor-pointer">
            <ArrowRight className="size-4 text-muted-foreground" /> <span>Mover a la derecha</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={column.isDone || columnCount <= 1}
          onClick={() => onDelete(column)}
          className="cursor-pointer"
          variant="destructive"
        >
          <Trash2 className="size-4" />
          <span>{column.isDone ? 'La columna «Hecho» no se puede eliminar' : 'Eliminar columna'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function KanbanColumnImpl({
  column,
  index,
  columnCount,
  cardIds,
  cardsById,
  totalCount,
  columns,
  tagsById,
  today,
  doneId,
  quickAddActive,
  onQuickAddChange,
  onCreate,
  onOpenCard,
  onMoveCard,
  onArchiveCard,
  onOpenThread,
  columnActions,
  dragDisabled,
  hideHeader = false,
  filtered = false,
}) {
  const {setNodeRef, isOver} = useDroppable({id: `column:${column.id}`, data: {type: 'column', columnId: column.id}});
  const listRef = useRef(null);
  const setListRef = node => {
    listRef.current = node;
    setNodeRef(node);
  };
  const headingId = `kanban-col-${column.id}`;

  return (
    <section
      aria-labelledby={hideHeader ? undefined : headingId}
      aria-label={hideHeader ? column.name : undefined}
      className={cn(
        'kanban-column flex min-h-0 flex-col gap-2 rounded-2xl bg-muted/50 p-2',
        isOver && 'ring-2 ring-primary/30',
      )}
    >
      {!hideHeader && (
        <header className="flex items-center gap-1.5 px-1.5 pt-0.5 min-h-8">
          <h2 id={headingId} className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
            {column.isDone && <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-label="Columna «Hecho»" />}
            <span className="truncate">{column.name}</span>
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground" aria-label={totalCount === 1 ? '1 tarea' : `${totalCount} tareas`}>{totalCount}</span>
          <span className="ml-auto">
            <ColumnMenu column={column} index={index} columnCount={columnCount} {...columnActions} />
          </span>
        </header>
      )}
      <SortableContext id={column.id} items={cardIds} strategy={verticalListSortingStrategy}>
        <ul ref={setListRef} className="kanban-column-list scroll-fade flex min-h-12 flex-col gap-2" aria-label={`Tareas en ${column.name}`}>
          {cardIds.map(id => cardsById[id] && (
            <KanbanCard
              key={id}
              card={cardsById[id]}
              columns={columns}
              tagsById={tagsById}
              today={today}
              doneId={doneId}
              onOpen={onOpenCard}
              onMove={onMoveCard}
              onArchive={onArchiveCard}
              onOpenThread={onOpenThread}
              dragDisabled={dragDisabled}
            />
          ))}
          {cardIds.length === 0 && (
            <li className="kanban-column-empty rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
              {filtered && totalCount > 0 ? 'Ninguna tarea coincide con el filtro.' : column.isDone ? 'Arrastra aquí las tareas terminadas.' : 'Sin tareas por ahora.'}
            </li>
          )}
        </ul>
      </SortableContext>
      {!column.isDone && (
        <QuickAddCard
          columnId={column.id}
          columnName={column.name}
          active={quickAddActive}
          onActiveChange={onQuickAddChange}
          onCreate={(columnId, title) => {
            onCreate(columnId, title);
            // La tarea nueva queda al final: se muestra aunque la columna tenga scroll.
            requestAnimationFrame(() => {
              const list = listRef.current;
              if (list) list.scrollTop = list.scrollHeight;
            });
          }}
        />
      )}
    </section>
  );
}

export const KanbanColumn = memo(KanbanColumnImpl);
