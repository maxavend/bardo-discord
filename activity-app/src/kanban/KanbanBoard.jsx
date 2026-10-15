import {useCallback, useMemo, useRef, useState} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {arrayMove, sortableKeyboardCoordinates} from '@dnd-kit/sortable';
import {MoreHorizontal, Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {KANBAN_LIMITS} from './kanban-shared.js';
import {KanbanColumn} from './KanbanColumn.jsx';
import {KanbanCardBody} from './KanbanCard.jsx';

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function containerOf(id, items) {
  if (id == null) return null;
  const key = String(id);
  if (key.startsWith('column:')) return key.slice('column:'.length);
  return Object.keys(items).find(columnId => items[columnId].includes(key)) || null;
}

export function KanbanBoard({
  columns,
  cards,
  allCounts,
  tags,
  today,
  doneId,
  isMobile,
  mobileColumnId,
  onMobileColumnChange,
  quickAddColumnId,
  onQuickAddChange,
  onCreate,
  onOpenCard,
  onMoveCard,
  onArchiveCard,
  onOpenThread,
  onDropCard,
  onDragStateChange,
  columnActions,
  onAddColumn,
  filtered,
}) {
  const tagsById = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);
  const baseItems = useMemo(() => {
    const map = Object.fromEntries(columns.map(column => [column.id, []]));
    const sorted = Object.values(cards).sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : (a.id < b.id ? -1 : 1)));
    for (const card of sorted) map[card.columnId]?.push(card.id);
    return map;
  }, [cards, columns]);
  const [dragItems, setDragItemsState] = useState(null);
  // Soltar puede llegar antes de que React vuelva a renderizar tras el último
  // dragOver (teclado rápido): el ref siempre tiene el orden más reciente.
  const dragItemsRef = useRef(null);
  const setDragItems = next => {
    dragItemsRef.current = typeof next === 'function' ? next(dragItemsRef.current) : next;
    setDragItemsState(dragItemsRef.current);
  };
  const [activeId, setActiveId] = useState(null);
  const items = dragItems || baseItems;

  const sensors = useSensors(
    useSensor(MouseSensor, {activationConstraint: {distance: 6}}),
    useSensor(TouchSensor, {activationConstraint: {delay: 200, tolerance: 8}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  );

  const columnName = useCallback(id => columns.find(column => column.id === id)?.name || 'la columna', [columns]);
  const cardLabel = useCallback(id => {
    const card = cards[id];
    return card ? `#${card.number} «${card.title}»` : 'la tarea';
  }, [cards]);

  const finishDrag = () => {
    setDragItems(null);
    setActiveId(null);
    onDragStateChange?.(false);
  };

  const handleDragStart = ({active}) => {
    setActiveId(String(active.id));
    setDragItems(baseItems);
    onDragStateChange?.(true);
  };

  const handleDragOver = ({active, over}) => {
    if (!over) return;
    setDragItems(previous => {
      const current = previous || baseItems;
      const from = containerOf(active.id, current);
      const to = containerOf(over.id, current);
      if (!from || !to || from === to) return current;
      const target = current[to].filter(id => id !== active.id);
      const overIndex = target.indexOf(String(over.id));
      const isBelow = over.rect && active.rect.current.translated
        && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const index = overIndex === -1 ? target.length : overIndex + (isBelow ? 1 : 0);
      target.splice(index, 0, String(active.id));
      return {...current, [from]: current[from].filter(id => id !== active.id), [to]: target};
    });
  };

  const handleDragEnd = ({active, over}) => {
    const current = dragItemsRef.current || baseItems;
    const id = String(active.id);
    const to = over ? containerOf(over.id, current) : null;
    if (!to) {
      finishDrag();
      return;
    }
    let list = current[to];
    const oldIndex = list.indexOf(id);
    const overIndex = list.indexOf(String(over.id));
    if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) list = arrayMove(list, oldIndex, overIndex);
    const index = list.indexOf(id);
    const afterId = index > 0 ? list[index - 1] : null;
    const beforeId = index !== -1 && index < list.length - 1 ? list[index + 1] : null;
    const original = cards[id];
    const originalList = baseItems[original?.columnId] || [];
    const originalIndex = originalList.indexOf(id);
    const unchanged = original?.columnId === to
      && (originalIndex > 0 ? originalList[originalIndex - 1] : null) === afterId
      && (originalIndex < originalList.length - 1 ? originalList[originalIndex + 1] : null) === beforeId;
    if (!unchanged) onDropCard(id, to, {afterId, beforeId});
    finishDrag();
  };

  const announcements = {
    onDragStart: ({active}) => `Tomaste la tarea ${cardLabel(active.id)}. Usa las flechas para moverla y Espacio para soltarla.`,
    onDragOver: ({active, over}) => (over
      ? `La tarea ${cardLabel(active.id)} está sobre ${columnName(containerOf(over.id, items))}.`
      : `La tarea ${cardLabel(active.id)} no está sobre ninguna columna.`),
    onDragEnd: ({active, over}) => (over
      ? `Soltaste la tarea ${cardLabel(active.id)} en ${columnName(containerOf(over.id, items))}.`
      : `Soltaste la tarea ${cardLabel(active.id)} fuera del tablero; vuelve a su lugar.`),
    onDragCancel: ({active}) => `Movimiento cancelado. La tarea ${cardLabel(active.id)} volvió a su lugar.`,
  };

  const visibleColumns = isMobile
    ? columns.filter(column => column.id === mobileColumnId).slice(0, 1)
    : columns;
  const activeCard = activeId ? cards[activeId] : null;
  const mobileColumnIndex = columns.findIndex(column => column.id === mobileColumnId);
  const mobileColumn = columns[mobileColumnIndex];

  const renderColumn = (column, index) => (
    <KanbanColumn
      key={column.id}
      column={column}
      index={index}
      columnCount={columns.length}
      cardIds={items[column.id] || []}
      cardsById={cards}
      totalCount={allCounts[column.id] || 0}
      columns={columns}
      tagsById={tagsById}
      today={today}
      doneId={doneId}
      quickAddActive={quickAddColumnId === column.id}
      onQuickAddChange={onQuickAddChange}
      onCreate={onCreate}
      onOpenCard={onOpenCard}
      onMoveCard={onMoveCard}
      onArchiveCard={onArchiveCard}
      onOpenThread={onOpenThread}
      columnActions={columnActions}
      hideHeader={isMobile}
      filtered={filtered}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={finishDrag}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'Para mover una tarea, presiona Espacio o Enter en su asa. Usa las flechas para moverla entre tareas y columnas, y Espacio para soltarla. Escape cancela.',
        },
      }}
    >
      {isMobile ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <Tabs value={mobileColumnId} onValueChange={onMobileColumnChange} className="min-w-0 flex-1">
              <TabsList className="kanban-mobile-tabs max-w-full justify-start overflow-x-auto">
                {columns.map(column => (
                  <TabsTrigger key={column.id} value={column.id} className="flex-none text-xs px-3">
                    <span className="max-w-[9rem] truncate">{column.name}</span>
                    <span className="tabular-nums text-muted-foreground">{allCounts[column.id] || 0}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {mobileColumn && (
              <MobileColumnMenu
                column={mobileColumn}
                index={mobileColumnIndex}
                columnCount={columns.length}
                columnActions={columnActions}
                onAddColumn={onAddColumn}
              />
            )}
          </div>
          {visibleColumns.map(column => renderColumn(column, mobileColumnIndex))}
        </div>
      ) : (
        <div className="kanban-board" role="list" aria-label="Columnas del tablero">
          {visibleColumns.map((column, index) => (
            <div key={column.id} role="listitem" className="kanban-column-slot">
              {renderColumn(column, index)}
            </div>
          ))}
          <div role="listitem" className="kanban-add-column-slot">
            <AddColumnButton count={columns.length} onAddColumn={onAddColumn} />
          </div>
        </div>
      )}
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
        {activeCard ? (
          <div className="kanban-card-overlay flex w-[256px] max-w-[85vw] flex-col gap-2 rounded-xl border border-primary/60 bg-card px-3 py-2.5 shadow-lg cursor-grabbing">
            <KanbanCardBody card={activeCard} tagsById={tagsById} today={today} doneId={doneId} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function AddColumnButton({count, onAddColumn}) {
  const full = count >= KANBAN_LIMITS.columns;
  const button = (
    <Button
      variant="ghost"
      size="sm"
      onClick={full ? undefined : onAddColumn}
      aria-disabled={full || undefined}
      className="h-9 w-full justify-start gap-1.5 rounded-2xl border border-dashed border-border/70 px-3 text-xs font-medium text-muted-foreground hover:text-foreground aria-disabled:opacity-60"
    >
      <Plus className="size-3.5" aria-hidden="true" /> Agregar columna
    </Button>
  );
  if (!full) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom">Máximo {KANBAN_LIMITS.columns} columnas por tablero</TooltipContent>
    </Tooltip>
  );
}

function MobileColumnMenu({column, index, columnCount, columnActions, onAddColumn}) {
  const full = columnCount >= KANBAN_LIMITS.columns;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button variant="ghost" size="icon-sm" aria-label={`Opciones de la columna ${column.name}`} className="shrink-0 rounded-full text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => columnActions.onRename(column)} className="cursor-pointer">Renombrar «{column.name}»</DropdownMenuItem>
          {!column.isDone && (
            <DropdownMenuItem onClick={() => columnActions.onSetDone(column.id)} className="cursor-pointer">Usar como columna «Hecho»</DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={index === 0} onClick={() => columnActions.onMoveColumn(column.id, -1)} className="cursor-pointer">Mover a la izquierda</DropdownMenuItem>
          <DropdownMenuItem disabled={index === columnCount - 1} onClick={() => columnActions.onMoveColumn(column.id, 1)} className="cursor-pointer">Mover a la derecha</DropdownMenuItem>
          <DropdownMenuItem disabled={full} onClick={onAddColumn} className="cursor-pointer">
            {full ? `Máximo ${KANBAN_LIMITS.columns} columnas` : 'Agregar columna'}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={column.isDone || columnCount <= 1}
            onClick={() => columnActions.onDelete(column)}
            className="cursor-pointer"
          >
            {column.isDone ? 'La columna «Hecho» no se elimina' : 'Eliminar columna'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
