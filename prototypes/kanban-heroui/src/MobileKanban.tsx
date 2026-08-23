import { Button } from '@heroui/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Task } from './model';

type Column = {
  id: string;
  title: string;
};

type MobileDrag = {
  taskId: string;
  title: string;
  originColumnId: string;
  targetColumnId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
};

type PendingPress = {
  timer: number;
  pointerId: number;
  taskId: string;
  title: string;
  columnId: string;
  startX: number;
  startY: number;
  captureTarget: HTMLDivElement;
};

type Props = {
  columns: Column[];
  activeColumnId: string;
  tasksByColumn: Map<string, Task[]>;
  renderColumn: (column: Column) => ReactNode;
  onActiveColumnChange: (columnId: string) => void;
  onMoveTask: (taskId: string, columnId: string) => void;
};

const LONG_PRESS_MS = 420;
const CANCEL_DISTANCE = 10;
const COLUMN_SWIPE_STEP = 92;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function MobileKanban({
  columns,
  activeColumnId,
  tasksByColumn,
  renderColumn,
  onActiveColumnChange,
  onMoveTask,
}: Props) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const pillRailRef = useRef<HTMLDivElement | null>(null);
  const pendingPressRef = useRef<PendingPress | null>(null);
  const dragRef = useRef<MobileDrag | null>(null);
  const suppressClickRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<MobileDrag | null>(null);
  const columnSignature = columns.map((column) => column.id).join('|');

  const setDragState = (next: MobileDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const scrollPillIntoView = (columnId: string) => {
    const rail = pillRailRef.current;
    if (!rail) return;
    const pill = rail.querySelector<HTMLElement>(`[data-drop-column-id="${CSS.escape(columnId)}"]`);
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const scrollToColumn = (columnId: string, behavior: ScrollBehavior = 'smooth') => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const slide = carousel.querySelector<HTMLElement>(`[data-mobile-column-id="${CSS.escape(columnId)}"]`);
    if (!slide) return;
    carousel.scrollTo({ left: slide.offsetLeft, behavior });
    scrollPillIntoView(columnId);
  };

  const selectColumn = (columnId: string) => {
    if (columnId !== activeColumnId) onActiveColumnChange(columnId);
    scrollToColumn(columnId);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => scrollToColumn(activeColumnId, 'auto'));
    return () => cancelAnimationFrame(id);
    // Reset only when the board's column structure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnSignature]);

  useEffect(() => () => {
    const pending = pendingPressRef.current;
    if (pending) window.clearTimeout(pending.timer);
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    document.body.removeAttribute('data-kanban-moving');
  }, []);

  const resolveColumnFromPoint = (x: number, y: number) => {
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    const direct = target?.closest<HTMLElement>('[data-drop-column-id]')?.dataset.dropColumnId;
    return direct && columns.some((column) => column.id === direct) ? direct : null;
  };

  const activateLongPress = (pending: PendingPress) => {
    if (pendingPressRef.current !== pending) return;
    suppressClickRef.current = true;
    try {
      pending.captureTarget.setPointerCapture(pending.pointerId);
    } catch {
      // Pointer capture is a progressive enhancement; the drag still works without it.
    }
    if ('vibrate' in navigator) navigator.vibrate?.(18);
    document.body.setAttribute('data-kanban-moving', 'true');
    const next: MobileDrag = {
      taskId: pending.taskId,
      title: pending.title,
      originColumnId: pending.columnId,
      targetColumnId: pending.columnId,
      startX: pending.startX,
      startY: pending.startY,
      x: pending.startX,
      y: pending.startY,
    };
    setDragState(next);
  };

  const cancelPendingPress = () => {
    const pending = pendingPressRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingPressRef.current = null;
  };

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 768 || event.button !== 0 || !event.isPrimary) return;
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>('.bardo-task-card[data-task-id]');
    const slide = target.closest<HTMLElement>('[data-mobile-column-id]');
    const taskId = card?.dataset.taskId;
    const columnId = slide?.dataset.mobileColumnId;
    if (!card || !taskId || !columnId) return;

    cancelPendingPress();
    const title = card.querySelector<HTMLElement>('[data-task-title]')?.textContent?.trim() || 'Tarea';
    const captureTarget = event.currentTarget;
    const pending = {
      timer: 0,
      pointerId: event.pointerId,
      taskId,
      title,
      columnId,
      startX: event.clientX,
      startY: event.clientY,
      captureTarget,
    } satisfies PendingPress;
    pending.timer = window.setTimeout(() => activateLongPress(pending), LONG_PRESS_MS);
    pendingPressRef.current = pending;
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentDrag = dragRef.current;
    if (!currentDrag) {
      const pending = pendingPressRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (distance > CANCEL_DISTANCE) cancelPendingPress();
      return;
    }

    event.preventDefault();
    const originIndex = columns.findIndex((column) => column.id === currentDrag.originColumnId);
    const dx = event.clientX - currentDrag.startX;
    const inferredIndex = clamp(originIndex + Math.round(dx / COLUMN_SWIPE_STEP), 0, columns.length - 1);
    const inferredColumnId = columns[inferredIndex]?.id ?? currentDrag.originColumnId;
    const pointColumnId = resolveColumnFromPoint(event.clientX, event.clientY);
    const nextTarget = pointColumnId && pointColumnId !== currentDrag.originColumnId
      ? pointColumnId
      : inferredColumnId;
    const next: MobileDrag = {
      ...currentDrag,
      x: event.clientX,
      y: event.clientY,
      targetColumnId: nextTarget,
    };
    setDragState(next);

    if (nextTarget !== currentDrag.targetColumnId) {
      onActiveColumnChange(nextTarget);
      scrollToColumn(nextTarget);
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    cancelPendingPress();
    const currentDrag = dragRef.current;
    if (!currentDrag) return;

    if (commit && currentDrag.targetColumnId !== currentDrag.originColumnId) {
      onMoveTask(currentDrag.taskId, currentDrag.targetColumnId);
      onActiveColumnChange(currentDrag.targetColumnId);
      scrollToColumn(currentDrag.targetColumnId);
    } else {
      onActiveColumnChange(currentDrag.originColumnId);
      scrollToColumn(currentDrag.originColumnId);
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if the browser never granted pointer capture.
    }
    setDragState(null);
    document.body.removeAttribute('data-kanban-moving');
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
  };

  const onScroll = () => {
    if (dragRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const carousel = carouselRef.current;
      if (!carousel) return;
      const viewportLeft = carousel.getBoundingClientRect().left;
      const slides = Array.from(carousel.querySelectorAll<HTMLElement>('[data-mobile-column-id]'));
      let nearest: { id: string; distance: number } | null = null;
      for (const slide of slides) {
        const id = slide.dataset.mobileColumnId;
        if (!id) continue;
        const distance = Math.abs(slide.getBoundingClientRect().left - viewportLeft);
        if (!nearest || distance < nearest.distance) nearest = { id, distance };
      }
      if (nearest && nearest.id !== activeColumnId) {
        onActiveColumnChange(nearest.id);
        scrollPillIntoView(nearest.id);
      }
    });
  };

  return (
    <section className="bardo-mobile-kanban" aria-label="Columnas del tablero">
      <nav className="bardo-column-pill-viewport" aria-label="Navegar columnas">
        <div ref={pillRailRef} className="bardo-column-pill-rail" aria-label="Columnas">
          {columns.map((column) => {
            const active = column.id === activeColumnId;
            const count = tasksByColumn.get(column.id)?.length ?? 0;
            return (
              <Button
                key={column.id}
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                className="bardo-column-pill rounded-full"
                aria-label={`${column.title}, ${count} tareas${active ? ', columna actual' : ''}`}
                data-active={String(active)}
                data-drop-column-id={column.id}
                onPress={() => selectColumn(column.id)}
              >
                <span className="bardo-column-pill-label">{column.title}</span>
                <span className="bardo-column-pill-count tabular-nums">{count}</span>
              </Button>
            );
          })}
        </div>
      </nav>

      <div className="bardo-mobile-carousel-bleed">
        <div
          ref={carouselRef}
          className="bardo-mobile-carousel"
          data-testid="mobile-column-carousel"
          onScroll={onScroll}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMoveCapture={onPointerMoveCapture}
          onPointerUpCapture={(event) => finishPointer(event, true)}
          onPointerCancelCapture={(event) => finishPointer(event, false)}
          onClickCapture={(event) => {
            if (!suppressClickRef.current) return;
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {columns.map((column) => (
            <article
              key={column.id}
              className="bardo-mobile-column-slide"
              data-mobile-column-id={column.id}
              data-drop-column-id={column.id}
              aria-label={column.title}
            >
              {renderColumn(column)}
            </article>
          ))}
        </div>
      </div>

      {drag && (
        <div
          className="bardo-mobile-drag-ghost"
          data-testid="mobile-drag-ghost"
          style={{ left: drag.x, top: drag.y }}
          role="status"
          aria-live="polite"
        >
          <span className="bardo-mobile-drag-title">{drag.title}</span>
          <span className="bardo-mobile-drag-target">
            Mover a {columns.find((column) => column.id === drag.targetColumnId)?.title ?? 'columna'}
          </span>
        </div>
      )}
    </section>
  );
}
