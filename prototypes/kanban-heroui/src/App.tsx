import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  EllipsisVertical,
  Magnifier,
  Plus,
  Xmark,
} from '@gravity-ui/icons';
import {
  Avatar,
  Button,
  Chip,
  Input,
  Label,
  Modal,
  SearchField,
  Separator,
  Tag,
  TagGroup,
  TextField,
  Toast,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  toast,
} from '@heroui/react';
import { cardVariants } from '@heroui/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from '@heroui/react';
import { MobileKanban } from './MobileKanban';
import { NativeActionSelect, NativeOverlaySelect, NativeSelect } from './NativeControls';
import { TaskDetailModal } from './TaskDetailModal';
import {
  cloneState,
  createBoard,
  createTask,
  loadState,
  makeId,
  makeSeed,
  MAX_COLUMNS,
  MAX_TAGS,
  ME,
  normalizeOrders,
  PAGE_SIZE,
  personById,
  priorityLabel,
  priorityRank,
  saveState,
  selfTest,
  stressTasks,
  type AppState,
  type Task,
} from './model';

type Filter = 'all' | 'mine' | 'urgent' | 'unassigned' | 'comments';
type Sort = 'manual' | 'priority' | 'title';

const ICON_CLASS = 'size-4 shrink-0';

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [undoState, setUndoState] = useState<AppState | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('manual');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickStatus, setQuickStatus] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [selfTestText, setSelfTestText] = useState('');
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [renderLimits, setRenderLimits] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement | null>(null);

  const board = state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
  const task = activeTaskId ? board.tasks.find((item) => item.id === activeTaskId) ?? null : null;
  const allowProgrammaticInputFocus = typeof window === 'undefined'
    ? true
    : window.matchMedia('(pointer: fine)').matches;

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!board.columns.some((column) => column.id === state.activeColumnId)) {
      setState((previous) => ({ ...previous, activeColumnId: board.columns[0].id }));
    }
  }, [board.columns, state.activeColumnId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        openQuick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const showToast = (text: string, canUndo = false) => {
    toast.clear();
    toast(text, {
      timeout: 4200,
      actionProps: canUndo ? { children: 'Deshacer', onPress: () => undo() } : undefined,
    });
  };

  const changeState = (mutator: (draft: AppState) => void, options?: { undo?: boolean; toast?: string }) => {
    setState((previous) => {
      if (options?.undo) setUndoState(cloneState(previous));
      const draft = cloneState(previous);
      mutator(draft);
      for (const item of draft.boards) normalizeOrders(item);
      return draft;
    });
    if (options?.toast) showToast(options.toast, Boolean(options.undo));
  };

  const undo = () => {
    if (!undoState) return;
    setState(undoState);
    setUndoState(null);
    showToast('Cambio deshecho');
  };

  const switchBoard = (boardId: string) => {
    const nextBoard = state.boards.find((item) => item.id === boardId);
    if (!nextBoard) return;
    setState((previous) => ({ ...previous, activeBoardId: boardId, activeColumnId: nextBoard.columns[0].id }));
    setQuery('');
    setFilter('all');
    setRenderLimits({});
  };

  const openQuick = (status = state.activeColumnId) => {
    setQuickTitle('');
    setQuickStatus(status || board.columns[0].id);
    setQuickOpen(true);
  };

  const submitQuick = () => {
    const title = quickTitle.trim();
    if (!title) return;
    const status = board.columns.some((column) => column.id === quickStatus) ? quickStatus : board.columns[0].id;
    changeState(
      (draft) => {
        const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        target.tasks.push(createTask(target, status, title));
      },
      { undo: true, toast: 'Tarea creada' },
    );
    setQuickOpen(false);
    setQuickTitle('');
  };

  const openTask = (taskId: string) => {
    if (dragTaskId) return;
    setActiveTaskId(taskId);
    setTaskOpen(true);
  };

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    changeState((draft) => {
      const targetBoard = draft.boards.find((item) => item.id === draft.activeBoardId)!;
      const targetTask = targetBoard.tasks.find((item) => item.id === taskId);
      if (!targetTask) return;
      Object.assign(targetTask, patch, { updated: new Date().toISOString() });
    });
  };

  const duplicateTask = () => {
    if (!task) return;
    changeState(
      (draft) => {
        const targetBoard = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        const source = targetBoard.tasks.find((item) => item.id === task.id)!;
        const copy = cloneState(source);
        copy.id = makeId('task');
        copy.title = `${copy.title} copia`;
        copy.order = targetBoard.tasks.filter((item) => item.status === copy.status).length;
        copy.created = new Date().toISOString();
        copy.updated = copy.created;
        copy.subtasks = copy.subtasks.map((item) => ({ ...item, id: makeId('subtask') }));
        copy.comments = copy.comments.map((item) => ({ ...item, id: makeId('comment') }));
        targetBoard.tasks.push(copy);
      },
      { undo: true, toast: 'Tarea duplicada' },
    );
  };

  const deleteTask = () => {
    if (!task) return;
    changeState(
      (draft) => {
        const targetBoard = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        targetBoard.tasks = targetBoard.tasks.filter((item) => item.id !== task.id);
      },
      { undo: true, toast: 'Tarea eliminada' },
    );
    setTaskOpen(false);
    setActiveTaskId(null);
  };

  const moveTask = (taskId: string, status: string) => {
    const current = board.tasks.find((item) => item.id === taskId);
    if (!current || current.status === status) return;
    changeState(
      (draft) => {
        const targetBoard = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        const targetTask = targetBoard.tasks.find((item) => item.id === taskId)!;
        targetTask.status = status;
        targetTask.order = targetBoard.tasks.filter((item) => item.status === status).length;
        targetTask.updated = new Date().toISOString();
      },
      { undo: true, toast: 'Tarea movida' },
    );
  };

  const addColumn = () => {
    if (board.columns.length >= MAX_COLUMNS) return showToast(`Máximo ${MAX_COLUMNS} columnas`);
    changeState(
      (draft) => {
        const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        target.columns.push({ id: makeId('column'), title: 'Nueva columna' });
      },
      { undo: true, toast: 'Columna creada' },
    );
  };

  const renameColumn = (columnId: string, title: string) => {
    changeState((draft) => {
      const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
      const column = target.columns.find((item) => item.id === columnId);
      if (column) column.title = title.slice(0, 32);
    });
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    changeState((draft) => {
      const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
      const index = target.columns.findIndex((item) => item.id === columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= target.columns.length) return;
      const [column] = target.columns.splice(index, 1);
      target.columns.splice(nextIndex, 0, column);
    });
  };

  const deleteColumn = (columnId: string) => {
    if (board.columns.length <= 2) return showToast('El tablero necesita al menos 2 columnas');
    if (board.tasks.some((item) => item.status === columnId)) return showToast('Mueve las tareas antes de eliminar la columna');
    changeState(
      (draft) => {
        const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        target.columns = target.columns.filter((item) => item.id !== columnId);
        if (draft.activeColumnId === columnId) draft.activeColumnId = target.columns[0].id;
      },
      { undo: true, toast: 'Columna eliminada' },
    );
  };

  const addTag = () => {
    const tag = tagDraft.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!tag) return;
    if (board.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return showToast('Ese tag ya existe');
    if (board.tags.length >= MAX_TAGS) return showToast(`Máximo ${MAX_TAGS} tags por tablero`);
    changeState((draft) => {
      const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
      target.tags.push(tag);
    });
    setTagDraft('');
  };

  const deleteTag = (tag: string) => {
    changeState(
      (draft) => {
        const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        target.tags = target.tags.filter((item) => item !== tag);
        target.tasks.forEach((item) => {
          item.tags = item.tags.filter((taskTag) => taskTag !== tag);
        });
      },
      { undo: true, toast: 'Tag eliminado' },
    );
  };

  const createNewBoard = () => {
    const next = createBoard();
    changeState(
      (draft) => {
        draft.boards.push(next);
        draft.activeBoardId = next.id;
        draft.activeColumnId = next.columns[0].id;
      },
      { undo: true, toast: 'Tablero creado' },
    );
  };

  const duplicateBoard = () => {
    changeState(
      (draft) => {
        const source = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        const copy = cloneState(source);
        const nextId = makeId('board');
        const columnMap = new Map<string, string>();
        copy.id = nextId;
        copy.title = `${copy.title} copia`.slice(0, 48);
        copy.columns = copy.columns.map((column) => {
          const id = makeId('column');
          columnMap.set(column.id, id);
          return { ...column, id };
        });
        copy.tasks = copy.tasks.map((item) => ({
          ...item,
          id: makeId('task'),
          status: columnMap.get(item.status)!,
          subtasks: item.subtasks.map((subtask) => ({ ...subtask, id: makeId('subtask') })),
          comments: item.comments.map((comment) => ({ ...comment, id: makeId('comment') })),
        }));
        draft.boards.push(copy);
        draft.activeBoardId = copy.id;
        draft.activeColumnId = copy.columns[0].id;
      },
      { undo: true, toast: 'Tablero duplicado' },
    );
    setSettingsOpen(false);
  };

  const deleteBoard = () => {
    if (state.boards.length <= 1) return showToast('Debe quedar al menos un tablero');
    changeState(
      (draft) => {
        const currentIndex = draft.boards.findIndex((item) => item.id === draft.activeBoardId);
        draft.boards.splice(currentIndex, 1);
        const next = draft.boards[Math.max(0, currentIndex - 1)] ?? draft.boards[0];
        draft.activeBoardId = next.id;
        draft.activeColumnId = next.columns[0].id;
      },
      { undo: true, toast: 'Tablero eliminado' },
    );
    setSettingsOpen(false);
  };

  const clearBoard = () => {
    changeState(
      (draft) => {
        const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
        target.tasks = [];
      },
      { undo: true, toast: 'Tablero vaciado' },
    );
  };

  const resetMocks = () => {
    setUndoState(cloneState(state));
    setState(makeSeed());
    setQuery('');
    setFilter('all');
    setRenderLimits({});
    setSettingsOpen(false);
    showToast('Mocks restablecidos', true);
  };

  const addStress = (count: number) => {
    const started = performance.now();
    changeState((draft) => {
      const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
      stressTasks(target, count);
    });
    showToast(`+${count.toLocaleString(undefined)} tareas · ${Math.round(performance.now() - started)} ms`);
  };

  const runSelfTest = () => {
    const failures = selfTest(state);
    setSelfTestText(
      failures.length
        ? `FAIL · ${failures.join('\n')}`
        : `PASS · ${state.boards.length} tableros · ${state.boards.reduce((total, item) => total + item.tasks.length, 0)} tareas`,
    );
  };

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const map = new Map<string, Task[]>();
    for (const column of board.columns) {
      const list = board.tasks.filter((item) => {
        if (item.status !== column.id) return false;
        if (normalizedQuery) {
          const haystack = [
            item.title,
            item.description,
            personById(item.assignee)?.name ?? '',
            ...item.tags,
            ...item.subtasks.map((subtask) => subtask.text),
            ...item.comments.map((comment) => comment.text),
          ].join(' ').toLocaleLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        if (filter === 'mine' && item.assignee !== ME) return false;
        if (filter === 'urgent' && item.priority !== 'urgent') return false;
        if (filter === 'unassigned' && item.assignee) return false;
        if (filter === 'comments' && item.comments.length === 0) return false;
        return true;
      });
      if (sort === 'priority') list.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.order - b.order);
      else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
      else list.sort((a, b) => a.order - b.order);
      map.set(column.id, list);
    }
    return map;
  }, [board, filter, query, sort]);

  const statusItems = board.columns.map((column) => ({ id: column.id, label: column.title }));

  const renderColumn = (column: (typeof board.columns)[number]) => {
    const all = filteredTasks.get(column.id) ?? [];
    const limitKey = `${board.id}:${column.id}`;
    const limit = renderLimits[limitKey] ?? PAGE_SIZE;
    const visible = all.slice(0, limit);

    return (
      <section key={column.id} className="bardo-column" aria-labelledby={`column-${column.id}`}>
        <header className="bardo-column-head">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={`column-${column.id}`} className="bardo-column-title">{column.title}</h2>
            <span className="text-xs text-muted tabular-nums">{all.length}</span>
          </div>
          <Button variant="ghost" size="sm" isIconOnly aria-label={`Crear tarea en ${column.title}`} onPress={() => openQuick(column.id)}>
            <Plus className={ICON_CLASS} aria-hidden="true" />
          </Button>
        </header>
        <div
          className="bardo-task-list"
          data-over={String(dragOverColumn === column.id)}
          data-column-id={column.id}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverColumn(column.id);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverColumn(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain') || dragTaskId;
            if (id) moveTask(id, column.id);
            setDragTaskId(null);
            setDragOverColumn(null);
          }}
        >
          {visible.length === 0 ? (
            <div className="bardo-empty">No hay tareas aquí.</div>
          ) : visible.map((item) => {
            const person = personById(item.assignee);
            const doneSubtasks = item.subtasks.filter((subtask) => subtask.done).length;
            return (
              <button
                key={item.id}
                type="button"
                className={`${cardVariants().base()} bardo-task-card`}
                draggable
                data-task-id={item.id}
                data-dragging={String(dragTaskId === item.id)}
                onDragStart={(event) => {
                  setDragTaskId(item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.id);
                }}
                onDragEnd={() => {
                  setDragTaskId(null);
                  setDragOverColumn(null);
                }}
                onClick={() => openTask(item.id)}
              >
                <div className="flex gap-3">
                  <span className="bardo-priority" data-priority={item.priority} aria-label={`Prioridad ${priorityLabel[item.priority]}`} />
                  <div className="min-w-0 flex-1">
                    <div data-task-title className="text-sm font-medium leading-5">{item.title}</div>
                    {item.description && <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.description}</div>}
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {item.tags.slice(0, 2).map((tag) => <Chip key={tag} size="sm" variant="tertiary">{tag}</Chip>)}
                        {item.tags.length > 2 && <span className="text-xs text-muted">+{item.tags.length - 2}</span>}
                        {item.subtasks.length > 0 && <span className="text-xs text-muted">{doneSubtasks}/{item.subtasks.length} subt.</span>}
                        {item.comments.length > 0 && <span className="text-xs text-muted">{item.comments.length} com.</span>}
                      </div>
                      <Avatar size="sm" variant="soft" aria-label={person?.name ?? 'Sin responsable'}>
                        <Avatar.Fallback>{person?.initials ?? '—'}</Avatar.Fallback>
                      </Avatar>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {all.length > limit && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onPress={() => setRenderLimits((previous) => ({ ...previous, [limitKey]: limit + PAGE_SIZE }))}
            >
              Mostrar {Math.min(PAGE_SIZE, all.length - limit)} más
            </Button>
          )}
        </div>
      </section>
    );
  };

  const handleBoardSelection = (value: string) => {
    if (value === '__new__') createNewBoard();
    else switchBoard(value);
  };

  const handleOptionsMenu = (value: string) => {
    switch (value) {
      case 'settings': setSettingsOpen(true); break;
      case 'stress-250': addStress(250); break;
      case 'stress-1000': addStress(1000); break;
      case 'self-test': runSelfTest(); break;
    }
  };

  const boardOptions = [
    ...state.boards.map((item) => ({ id: item.id, label: `${item.title} · ${item.tasks.length.toLocaleString(undefined)}` })),
    { id: '__new__', label: '＋ Nuevo tablero' },
  ];

  const actionOptions = [
    { id: 'settings', label: 'Configurar tablero' },
    { id: 'stress-250', label: 'Añadir 250 tareas mock' },
    { id: 'stress-1000', label: 'Añadir 1000 tareas mock' },
    { id: 'self-test', label: 'Autoprueba' },
  ];

  return (
    <div className="bardo-app">
      <Toast.Provider placement="bottom" maxVisibleToasts={1} />

      <div className="bardo-shell">
        <header className="bardo-topbar">
          <NativeOverlaySelect
            label="Cambiar tablero"
            value={board.id}
            options={boardOptions}
            onChange={handleBoardSelection}
            className="bardo-board-picker"
          >
            <span className="bardo-board-title">{board.title}</span>
            <ChevronDown className={`${ICON_CLASS} text-muted`} aria-hidden="true" />
          </NativeOverlaySelect>

          <Toolbar aria-label="Acciones del tablero">
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label="Buscar"
              onPress={() => {
                setSearchOpen((open) => !open);
                requestAnimationFrame(() => searchRef.current?.focus());
              }}
            >
              <Magnifier className={ICON_CLASS} aria-hidden="true" />
            </Button>

            <NativeActionSelect
              label="Más opciones"
              options={actionOptions}
              onAction={handleOptionsMenu}
              className="bardo-native-icon-picker"
            >
              <EllipsisVertical className={ICON_CLASS} aria-hidden="true" />
            </NativeActionSelect>

            <Button variant="primary" size="sm" isIconOnly aria-label="Nueva tarea" onPress={() => openQuick()}>
              <Plus className={ICON_CLASS} aria-hidden="true" />
            </Button>
          </Toolbar>
        </header>

        {searchOpen && (
          <div className="bardo-search-panel" data-testid="search-panel">
            <div className="bardo-search-row">
              <SearchField
                fullWidth
                variant="primary"
                value={query}
                onChange={setQuery}
                onClear={() => setQuery('')}
                aria-label="Buscar tareas"
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input ref={searchRef} placeholder="Buscar tareas…" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <NativeSelect
                label="Orden"
                hideLabel
                className="bardo-sort-control"
                value={sort}
                onChange={(value) => setSort(value as Sort)}
                options={[
                  { id: 'manual', label: 'Orden manual' },
                  { id: 'priority', label: 'Prioridad' },
                  { id: 'title', label: 'Título' },
                ]}
              />
            </div>
            <div className="bardo-filter-scroll">
              <ToggleButtonGroup
                aria-label="Filtrar tareas"
                className="bardo-filter-group"
                selectionMode="single"
                selectedKeys={new Set<Key>([filter])}
                onSelectionChange={(keys) => {
                  const next = keys.values().next().value;
                  if (next) setFilter(String(next) as Filter);
                }}
                disallowEmptySelection
                isDetached
                size="sm"
              >
                {([
                  ['all', 'Todas'],
                  ['mine', 'Mías'],
                  ['urgent', 'Urgentes'],
                  ['unassigned', 'Sin responsable'],
                  ['comments', 'Con comentarios'],
                ] as Array<[Filter, string]>).map(([id, label]) => (
                  <ToggleButton id={id} key={id} variant="ghost">{label}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>
          </div>
        )}

        <MobileKanban
          key={board.id}
          columns={board.columns}
          activeColumnId={state.activeColumnId}
          tasksByColumn={filteredTasks}
          renderColumn={renderColumn}
          onActiveColumnChange={(columnId) => setState((previous) => ({ ...previous, activeColumnId: columnId }))}
          onMoveTask={moveTask}
        />

        <main className="bardo-desktop-board" aria-label="Tablero Kanban">
          <div className="bardo-columns">{board.columns.map(renderColumn)}</div>
        </main>
      </div>

      <Modal>
        <Modal.Backdrop variant="blur" isOpen={quickOpen} onOpenChange={setQuickOpen}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header className="bardo-modal-header">
                <Modal.Heading>Nueva tarea</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="bardo-modal-stack" data-testid="quick-body">
                <TextField variant="secondary">
                  <Label>Título</Label>
                  <Input
                    autoFocus={allowProgrammaticInputFocus}
                    fullWidth
                    value={quickTitle}
                    onChange={(event) => setQuickTitle(event.target.value)}
                    placeholder="¿Qué hay que hacer?"
                    maxLength={180}
                    aria-label="Título"
                  />
                </TextField>
                <NativeSelect
                  label="Columna"
                  value={quickStatus || board.columns[0].id}
                  onChange={setQuickStatus}
                  options={statusItems}
                />
              </Modal.Body>
              <Modal.Footer className="bardo-modal-footer">
                <Button variant="secondary" onPress={() => setQuickOpen(false)}>Cancelar</Button>
                <Button variant="primary" isDisabled={!quickTitle.trim()} onPress={submitQuick}>Crear</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <TaskDetailModal
        isOpen={taskOpen}
        task={task}
        board={board}
        onOpenChange={(open) => {
          setTaskOpen(open);
          if (!open) setActiveTaskId(null);
        }}
        onUpdateTask={updateTask}
        onMoveTask={moveTask}
        onDeleteTask={deleteTask}
        onDuplicateTask={duplicateTask}
      />

      <Modal>
        <Modal.Backdrop variant="blur" isOpen={settingsOpen} onOpenChange={setSettingsOpen}>
          <Modal.Container placement="center" size="lg" scroll="inside">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header className="bardo-modal-header"><Modal.Heading>Tablero</Modal.Heading></Modal.Header>
              <Modal.Body className="bardo-settings-body" data-testid="settings-body">
                <TextField variant="secondary">
                  <Label>Nombre</Label>
                  <Input
                    fullWidth
                    value={board.title}
                    onChange={(event) => changeState((draft) => {
                      const target = draft.boards.find((item) => item.id === draft.activeBoardId)!;
                      target.title = event.target.value.slice(0, 48);
                    })}
                    maxLength={48}
                  />
                </TextField>

                <Separator />
                <section className="bardo-section" aria-labelledby="columns-heading">
                  <div className="bardo-section-heading">
                    <div>
                      <h3 id="columns-heading" className="text-sm font-semibold">Columnas</h3>
                      <p className="mt-0.5 text-xs text-muted">{board.columns.length}/{MAX_COLUMNS} · 4 por defecto</p>
                    </div>
                    <Button variant="secondary" size="sm" isDisabled={board.columns.length >= MAX_COLUMNS} onPress={addColumn}>
                      <Plus className={ICON_CLASS} aria-hidden="true" />
                      Columna
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {board.columns.map((column, index) => (
                      <div key={column.id} className="bardo-column-setting">
                        <Input
                          variant="secondary"
                          fullWidth
                          value={column.title}
                          onChange={(event) => renameColumn(column.id, event.target.value)}
                          maxLength={32}
                          aria-label={`Nombre columna ${index + 1}`}
                        />
                        <Button variant="ghost" size="sm" isIconOnly aria-label="Mover columna a la izquierda" isDisabled={index === 0} onPress={() => moveColumn(column.id, -1)}>
                          <ArrowLeft className={ICON_CLASS} aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="sm" isIconOnly aria-label="Mover columna a la derecha" isDisabled={index === board.columns.length - 1} onPress={() => moveColumn(column.id, 1)}>
                          <ArrowRight className={ICON_CLASS} aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="sm" isIconOnly aria-label="Eliminar columna" onPress={() => deleteColumn(column.id)}>
                          <Xmark className={ICON_CLASS} aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />
                <section className="bardo-section" aria-labelledby="board-tags-heading">
                  <div className="bardo-section-heading">
                    <div>
                      <h3 id="board-tags-heading" className="text-sm font-semibold">Tags</h3>
                      <p className="mt-0.5 text-xs text-muted">{board.tags.length}/{MAX_TAGS} máximo por tablero</p>
                    </div>
                  </div>
                  <TagGroup
                    aria-label="Tags del tablero"
                    size="sm"
                    variant="default"
                    onRemove={(keys) => keys.forEach((key) => deleteTag(String(key)))}
                  >
                    <TagGroup.List renderEmptyState={() => <span className="text-sm text-muted">Sin tags todavía.</span>}>
                      {board.tags.map((tag) => <Tag id={tag} key={tag}>{tag}</Tag>)}
                    </TagGroup.List>
                  </TagGroup>
                  <div className="bardo-inline-form">
                    <Input
                      variant="secondary"
                      fullWidth
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      maxLength={24}
                      placeholder="Nuevo tag"
                      aria-label="Nuevo tag"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    <Button variant="secondary" isDisabled={!tagDraft.trim() || board.tags.length >= MAX_TAGS} onPress={addTag}>Añadir</Button>
                  </div>
                </section>

                <Separator />
                <section className="bardo-section" aria-labelledby="qa-heading">
                  <div className="bardo-section-heading">
                    <div>
                      <h3 id="qa-heading" className="text-sm font-semibold">QA mock</h3>
                      <p className="mt-0.5 text-xs text-muted">{board.tasks.length.toLocaleString(undefined)} tareas en este tablero.</p>
                    </div>
                  </div>
                  <Toolbar aria-label="Herramientas QA" className="flex-wrap">
                    <Button variant="secondary" size="sm" onPress={() => addStress(250)}>+250 tareas</Button>
                    <Button variant="secondary" size="sm" onPress={() => addStress(1000)}>+1000 tareas</Button>
                    <Button variant="secondary" size="sm" onPress={runSelfTest}>Autoprueba</Button>
                    <Button variant="secondary" size="sm" onPress={clearBoard}>Vaciar</Button>
                    <Button variant="danger" size="sm" onPress={resetMocks}>Restablecer mocks</Button>
                  </Toolbar>
                  {selfTestText && <pre className="bardo-qa-result">{selfTestText}</pre>}
                </section>
              </Modal.Body>
              <Modal.Footer className="bardo-modal-footer bardo-settings-footer">
                <Button variant="danger" onPress={deleteBoard}>Eliminar tablero</Button>
                <Toolbar aria-label="Acciones del tablero">
                  <Button variant="secondary" onPress={duplicateBoard}>Duplicar</Button>
                  <Button variant="primary" onPress={() => setSettingsOpen(false)}>Listo</Button>
                </Toolbar>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

export default App;
