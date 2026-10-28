import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Archive, ChevronDown, MoreHorizontal, Tags} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle} from '@/components/ui/empty';
import {toast} from '@/lib/toast';
import {openExternalUrl} from '../discord-links.js';
import {PlannerUndoToast} from '../planner/PlannerUndoToast.jsx';
import {
  cardsInColumn,
  defaultColumnId,
  doneColumnId,
  filterCards,
  todayIso,
} from './kanban-store.js';
import {
  currentUserId,
  getKanbanEngine,
  reloadKanban,
  useKanbanPolling,
  useKanbanSnapshot,
} from './kanban-runtime.js';
import {KanbanBoard} from './KanbanBoard.jsx';
import {KanbanCardDialog} from './KanbanCardDialog.jsx';
import {ArchivedCardsDialog, ColumnNameDialog, DeleteColumnDialog, TagsDialog} from './KanbanDialogs.jsx';
import {TagChip, discordChannelUrl} from './kanban-ui.jsx';

const FILTER_LABELS = {all: 'Todas', mine: 'Mías', overdue: 'Vencidas'};

/** Lleva una columna a la vista (carrusel en móvil, scroll horizontal en escritorio). */
function scrollColumnIntoView(columnId) {
  requestAnimationFrame(() => {
    const slot = document.querySelector(`[data-column-id="${CSS.escape(columnId)}"]`);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    slot?.scrollIntoView({inline: 'start', block: 'nearest', behavior: reduced ? 'auto' : 'smooth'});
  });
}

const STATUS_TEXT = {
  saving: 'Guardando…',
  offline: 'Sin conexión · tus cambios se guardarán al reconectar',
  error: 'No se pudieron guardar los cambios',
};

const THREAD_ERRORS = {
  threads_unsupported: 'Los hilos solo se pueden crear en canales de texto, no en canales de voz.',
  bot_missing_permissions: 'Bardo necesita permiso para crear hilos públicos en este canal. Pídeselo a quien administra el servidor.',
};

export function KanbanModule({cardId = null, docs = [], go, onOpenDoc, quickAddRequest = 0}) {
  useKanbanPolling(true);
  const engine = getKanbanEngine();
  const snapshot = useKanbanSnapshot();
  const {view, capabilities, status, loaded, loadError, remote} = snapshot;
  const board = view.board;
  const columns = useMemo(() => board?.columns || [], [board]);
  const tags = useMemo(() => board?.tags || [], [board]);
  const [filter, setFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState(null);
  const [quickAddColumnId, setQuickAddColumnId] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [deleteColumn, setDeleteColumn] = useState(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [undo, setUndo] = useState(null);
  const today = todayIso();
  const doneId = doneColumnId(board);
  const userId = currentUserId();
  const missingNotified = useRef(null);


  const visibleCards = useMemo(
    () => filterCards(view.cards, {filter, userId, tagId: tagFilter, today, doneId}),
    [view.cards, filter, userId, tagFilter, today, doneId],
  );
  const allCounts = useMemo(() => {
    const counts = {};
    for (const card of Object.values(view.cards)) counts[card.columnId] = (counts[card.columnId] || 0) + 1;
    return counts;
  }, [view.cards]);
  const isFiltered = filter !== 'all' || Boolean(tagFilter);
  const openCard = cardId ? view.cards[cardId] : null;

  // "Nueva tarea" del header: abre el alta rápida de la primera columna abierta.
  useEffect(() => {
    if (!quickAddRequest || !board) return;
    const target = defaultColumnId(board);
    setFilter('all');
    setTagFilter(null);
    setQuickAddColumnId(target);
    scrollColumnIntoView(target);
  }, [quickAddRequest]);

  // Enlace a una tarjeta que ya no está: se busca una vez y, si no existe, se explica.
  useEffect(() => {
    if (!cardId || !loaded || openCard || missingNotified.current === cardId) return;
    missingNotified.current = cardId;
    const close = () => go('#kanban', {replace: true, skipTransition: true});
    if (!remote) {
      toast('Esa tarea ya no existe o está archivada.');
      close();
      return;
    }
    engine.fetchCard(cardId).then(data => {
      if (data?.card?.archivedAt) {
        toast(`La tarea #${data.card.number} está archivada. Puedes restaurarla desde «Tareas archivadas», en el menú del tablero.`);
        close();
      }
    }).catch(() => {
      toast('Esa tarea ya no existe en este canal.');
      close();
    });
  }, [cardId, loaded, openCard, remote, engine, go]);

  const openCardById = useCallback(id => go(`#kanban-card:${id}`, {skipTransition: true}), [go]);
  const closeCard = useCallback(() => {
    engine.flushNow();
    go('#kanban', {skipTransition: true, replace: true});
  }, [engine, go]);

  const createCard = useCallback((columnId, title) => {
    engine.createCard({title, columnId});
  }, [engine]);

  const moveToColumn = useCallback((id, columnId) => {
    const last = cardsInColumn(engine.getSnapshot().view.cards, columnId).filter(card => card.id !== id).at(-1);
    engine.moveCard(id, columnId, {afterId: last?.id ?? null});
    const name = engine.getSnapshot().view.board?.columns.find(column => column.id === columnId)?.name;
    if (name) toast(`Movida a «${name}».`);
  }, [engine]);

  const archiveCard = useCallback(id => {
    const card = engine.archiveCard(id);
    if (cardId === id) go('#kanban', {skipTransition: true, replace: true});
    if (card) setUndo({id: `undo-${card.id}`, card, message: `Tarea #${card.number} archivada`});
  }, [engine, cardId, go]);

  const openThread = useCallback(async (card, url) => {
    const existing = url || discordChannelUrl(card, board);
    if (existing) {
      const opened = await openExternalUrl(existing);
      if (!opened) toast('No se pudo abrir el hilo. Búscalo en el canal de Discord.');
      return;
    }
    try {
      const data = await engine.openThread(card.id);
      const link = discordChannelUrl(data?.card, board);
      toast(data?.card?.threadId ? 'Hilo creado en el canal.' : 'Creando el hilo…');
      if (link) void openExternalUrl(link);
    } catch (error) {
      toast(THREAD_ERRORS[error?.code] || error?.message || 'No se pudo crear el hilo. Inténtalo de nuevo en unos segundos.');
    }
  }, [engine, board]);

  const retryNotice = useCallback(async id => {
    try {
      await engine.retryNotice(id);
      toast('Reenviando el aviso…');
    } catch (error) {
      toast(error?.message || 'No se pudo reenviar el aviso. Inténtalo de nuevo en unos segundos.');
    }
  }, [engine]);

  const columnActions = useMemo(() => ({
    onRename: column => setNameDialog({mode: 'rename', column}),
    onSetDone: id => {
      engine.setDoneColumn(id);
      toast('Las tareas que lleguen a esta columna cuentan como terminadas.');
    },
    onMoveColumn: (id, delta) => {
      const order = columns.map(column => column.id);
      const index = order.indexOf(id);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target], order[index]];
      engine.reorderColumns(order);
    },
    onDelete: column => setDeleteColumn(column),
  }), [engine, columns]);

  const addColumn = useCallback(() => setNameDialog({mode: 'add'}), []);
  const loadArchived = useCallback(() => engine.listArchived(), [engine]);

  if (!loaded) {
    return (
      <section className="kanban-page route-active" aria-busy="true">
        <div className="kanban-inner">
          {loadError ? (
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyTitle>No se pudieron cargar las tareas</EmptyTitle>
                <EmptyDescription>{loadError.status === 403 ? 'No tienes acceso a este canal en Discord.' : 'Revisa tu conexión e inténtalo de nuevo.'}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="secondary" size="sm" onClick={() => void reloadKanban()}>Reintentar</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <p className="mt-10 text-center text-sm text-muted-foreground" role="status">Cargando tareas…</p>
          )}
        </div>
      </section>
    );
  }

  const deleteCount = deleteColumn ? cardsInColumn(view.cards, deleteColumn.id).length : 0;

  return (
    <section className="kanban-page route-active" aria-labelledby="kanban-title">
      <div className="kanban-inner kanban-head flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            {/* En móvil el título ya está en el header. */}
            <h1 id="kanban-title" tabIndex={-1} className="font-heading text-lg font-semibold tracking-tight text-foreground max-md:sr-only">Tareas</h1>
            {!remote && <p className="hidden text-xs text-muted-foreground md:block">Solo en este dispositivo</p>}
          </div>
          {STATUS_TEXT[status] && (
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">{STATUS_TEXT[status]}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Móvil: un solo chip de filtro en vez de tres botones. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <Button variant="outline" size="sm" data-kanban-toolbar-control="" aria-label={`Filtrar tareas: ${FILTER_LABELS[filter]}`} className="h-8 gap-1 px-3 text-xs md:hidden">
                    {FILTER_LABELS[filter]} <ChevronDown className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup value={filter} onValueChange={value => setFilter(value || 'all')}>
                  <DropdownMenuRadioItem value="all" className="cursor-pointer">Todas</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="mine" disabled={!userId} className="cursor-pointer">Mías</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="overdue" className="cursor-pointer">Vencidas</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ToggleGroup
              indicator
              value={[filter]}
              onValueChange={value => setFilter((Array.isArray(value) ? value.at(-1) : value) || 'all')}
              variant="outline"
              size="sm"
              aria-label="Filtrar tareas"
              className="hidden md:flex"
            >
              <ToggleGroupItem value="all" className="h-8 px-3 text-xs">Todas</ToggleGroupItem>
              <ToggleGroupItem value="mine" className="h-8 px-3 text-xs" disabled={!userId}>Mías</ToggleGroupItem>
              <ToggleGroupItem value="overdue" className="h-8 px-3 text-xs">Vencidas</ToggleGroupItem>
            </ToggleGroup>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" data-kanban-toolbar-control="" aria-label="Más opciones del tablero" className="rounded-full text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="size-4" />
                  </Button>
                )}
              />
              <DropdownMenuContent align="end" className="w-56">
                {tags.length > 0 && (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs">Filtrar por etiqueta</DropdownMenuLabel>
                      {tags.map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag.id}
                          checked={tagFilter === tag.id}
                          onCheckedChange={checked => setTagFilter(checked ? tag.id : null)}
                          className="cursor-pointer"
                        >
                          <TagChip tag={tag} />
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setTagsOpen(true)} className="cursor-pointer">
                    <Tags className="size-4 text-muted-foreground" /> Etiquetas…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setArchivedOpen(true)} className="cursor-pointer">
                    <Archive className="size-4 text-muted-foreground" /> Tareas archivadas
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isFiltered && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
            <span>
              {filter === 'mine' ? 'Solo tus tareas' : filter === 'overdue' ? 'Solo tareas vencidas' : 'Filtrado por etiqueta'}
              {tagFilter && <> · <TagChip tag={tags.find(tag => tag.id === tagFilter)} /></>}
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setFilter('all'); setTagFilter(null); }}>
              Quitar filtros
            </Button>
          </div>
        )}
      </div>

      {/* En escritorio el tablero ocupa todo el ancho y alto disponibles: las
          columnas no se cortan en el borde del contenido y la barra horizontal
          queda al borde inferior de la pantalla. */}
      <div className="kanban-board-region">
        <KanbanBoard
          columns={columns}
          cards={visibleCards}
          allCounts={allCounts}
          tags={tags}
          today={today}
          doneId={doneId}
          quickAddColumnId={quickAddColumnId}
          onQuickAddChange={setQuickAddColumnId}
          onCreate={createCard}
          onOpenCard={openCardById}
          onMoveCard={moveToColumn}
          onArchiveCard={archiveCard}
          onOpenThread={remote ? openThread : null}
          onDropCard={(id, columnId, position) => engine.moveCard(id, columnId, position)}
          onDragStateChange={dragging => (dragging ? engine.pausePolling() : engine.resumePolling())}
          columnActions={columnActions}
          onAddColumn={addColumn}
          filtered={isFiltered}
        />
      </div>

      {openCard && (
        <KanbanCardDialog
          card={openCard}
          board={board}
          docs={docs}
          capabilities={capabilities}
          remote={remote}
          today={today}
          onClose={closeCard}
          onPatch={(id, fields) => engine.patchCard(id, fields)}
          onMove={moveToColumn}
          onArchive={archiveCard}
          onCreateTag={(name, color) => engine.addTag(name, color)}
          onOpenThread={openThread}
          onRetryNotice={retryNotice}
          onOpenDoc={docId => {
            engine.flushNow();
            onOpenDoc(docId, `#kanban-card:${openCard.id}`);
          }}
        />
      )}

      <ColumnNameDialog
        open={Boolean(nameDialog)}
        title={nameDialog?.mode === 'rename' ? 'Renombrar columna' : 'Nueva columna'}
        submitLabel={nameDialog?.mode === 'rename' ? 'Guardar' : 'Agregar columna'}
        initialName={nameDialog?.column?.name || ''}
        onClose={() => setNameDialog(null)}
        onSubmit={name => {
          if (nameDialog?.mode === 'rename') {
            engine.renameColumn(nameDialog.column.id, name);
          } else {
            const id = engine.addColumn(name);
            scrollColumnIntoView(id);
          }
          setNameDialog(null);
        }}
      />
      <DeleteColumnDialog
        column={deleteColumn}
        columns={columns}
        cardCount={deleteCount}
        onClose={() => setDeleteColumn(null)}
        onConfirm={(id, moveTo) => {
          engine.deleteColumn(id, moveTo);
          setDeleteColumn(null);
          if (moveTo) scrollColumnIntoView(moveTo);
        }}
      />
      <ArchivedCardsDialog
        open={archivedOpen}
        remote={remote}
        loadArchived={loadArchived}
        onRestore={card => engine.restoreCard(card)}
        onClose={() => setArchivedOpen(false)}
      />
      <TagsDialog
        open={tagsOpen}
        tags={tags}
        onAdd={(name, color) => engine.addTag(name, color)}
        onUpdate={(id, fields) => engine.updateTag(id, fields)}
        onDelete={id => {
          engine.deleteTag(id);
          if (tagFilter === id) setTagFilter(null);
        }}
        onClose={() => setTagsOpen(false)}
      />
      <PlannerUndoToast
        toast={undo}
        onUndo={() => {
          if (undo?.card) engine.restoreCard(undo.card);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
      />
    </section>
  );
}

export default KanbanModule;
