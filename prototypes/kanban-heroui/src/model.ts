export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type Person = {
  id: string;
  name: string;
  initials: string;
};

export type Subtask = {
  id: string;
  text: string;
  done: boolean;
};

export type Comment = {
  id: string;
  author: string;
  text: string;
  created: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee: string;
  priority: Priority;
  tags: string[];
  subtasks: Subtask[];
  comments: Comment[];
  order: number;
  created: string;
  updated: string;
};

export type Column = {
  id: string;
  title: string;
};

export type Board = {
  id: string;
  title: string;
  columns: Column[];
  tags: string[];
  tasks: Task[];
};

export type AppState = {
  version: 6;
  activeBoardId: string;
  activeColumnId: string;
  boards: Board[];
};

export const STORAGE_KEY = 'bardo-kanban-heroui-v6';
export const MAX_COLUMNS = 5;
export const MAX_TAGS = 8;
export const MAX_SUBTASKS = 40;
export const MAX_COMMENTS = 100;
export const PAGE_SIZE = 100;
export const ME = 'ma';

export const people: Person[] = [
  { id: 'ma', name: 'Maxi', initials: 'MA' },
  { id: 'al', name: 'Alejandra', initials: 'AL' },
  { id: 'ca', name: 'Camila', initials: 'CA' },
  { id: 'da', name: 'Daniela', initials: 'DA' },
  { id: 'fe', name: 'Felipe', initials: 'FE' },
  { id: 'jo', name: 'José', initials: 'JO' },
  { id: 'lu', name: 'Lucas', initials: 'LU' },
  { id: 'so', name: 'Sofía', initials: 'SO' },
];

export const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];
export const priorityLabel: Record<Priority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};
export const priorityRank: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const titleStarts = ['Revisar', 'Diseñar', 'Validar', 'Implementar', 'Corregir', 'Documentar', 'Probar', 'Refinar', 'Preparar', 'Investigar', 'Optimizar', 'Alinear'];
const titleEnds = [
  'flujo de creación rápida',
  'estados vacíos',
  'navegación móvil',
  'drag & drop',
  'jerarquía visual',
  'accesibilidad del detalle',
  'persistencia local',
  'integración con Docs',
  'mensajes de error',
  'microcopy de acciones',
  'rendimiento con volumen',
  'responsive en iPhone',
  'selector de responsables',
  'atajos de teclado',
  'recuperación tras borrado',
  'columnas personalizadas',
  'búsqueda global',
  'subtareas y comentarios',
];
const descriptions = [
  'Validar el comportamiento completo con datos mock y registrar cualquier fricción antes de integrar el módulo definitivo.',
  'Caso de prueba pensado para revisar densidad, legibilidad, estados extremos y comportamiento en pantallas pequeñas.',
  'Revisar con foco en carga cognitiva: la acción principal debe ser evidente y los detalles permanecer progresivos.',
  'Confirmar comportamiento en Safari iOS y escritorio, incluyendo persistencia, teclado, scroll y controles nativos.',
  'Tarea generada para stress QA. Puede editarse, moverse, duplicarse, comentarse y eliminarse sin afectar datos reales.',
];

const boardSpecs = [
  { id: 'product', title: 'Producto', count: 180, columns: ['Backlog', 'Por hacer', 'En curso', 'Hecho'], tags: ['UX', 'UI', 'Bug', 'QA', 'Mobile', 'Docs', 'A11y', 'Cloudflare'] },
  { id: 'design', title: 'Design System', count: 120, columns: ['Ideas', 'Listo', 'Diseñando', 'Validado'], tags: ['UI', 'Tokens', 'A11y', 'Docs', 'QA', 'Mobile'] },
  { id: 'launch', title: 'Lanzamiento', count: 90, columns: ['Pendiente', 'Preparando', 'QA', 'Publicado'], tags: ['QA', 'Bug', 'Release', 'Content', 'Mobile'] },
  { id: 'personal', title: 'Personal', count: 80, columns: ['Algún día', 'Esta semana', 'Hoy', 'Listo'], tags: ['Personal', 'Casa', 'Compras', 'Trámites'] },
] as const;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed(): AppState {
  const r = rng(260823);
  const boards: Board[] = boardSpecs.map((spec, boardIndex) => {
    const columns = spec.columns.map((title, index) => ({ id: `${spec.id}-c${index + 1}`, title }));
    const counts = new Map(columns.map((column) => [column.id, 0]));
    const tasks: Task[] = [];

    for (let index = 0; index < spec.count; index += 1) {
      const column = columns[Math.floor(r() * columns.length)];
      const order = counts.get(column.id) ?? 0;
      counts.set(column.id, order + 1);
      const assignee = r() < 0.15 ? '' : people[Math.floor(r() * people.length)].id;
      const priority = priorities[Math.floor(r() * priorities.length)];
      const tagCount = 1 + Math.floor(r() * Math.min(3, spec.tags.length));
      const tags: string[] = [];
      while (tags.length < tagCount) {
        const tag = spec.tags[Math.floor(r() * spec.tags.length)];
        if (!tags.includes(tag)) tags.push(tag);
      }

      const subtasks: Subtask[] = [];
      if (r() < 0.32) {
        const count = 2 + Math.floor(r() * 4);
        for (let s = 0; s < count; s += 1) {
          subtasks.push({
            id: `seed-st-${boardIndex}-${index}-${s}`,
            text: ['Revisar caso', 'Validar mobile', 'Registrar evidencia', 'Confirmar copy', 'Probar error'][s % 5],
            done: r() < 0.45,
          });
        }
      }

      const comments: Comment[] = [];
      if (r() < 0.25) {
        const count = 1 + Math.floor(r() * 3);
        for (let c = 0; c < count; c += 1) {
          comments.push({
            id: `seed-cm-${boardIndex}-${index}-${c}`,
            author: people[Math.floor(r() * people.length)].id,
            text: ['Se ve bien en desktop; falta revisar iPhone.', 'Encontré un edge case al cambiar de estado.', 'Validado con datos mock.', 'Pendiente confirmar el comportamiento del undo.'][c % 4],
            created: new Date(Date.now() - (c + 1) * 86400000).toISOString(),
          });
        }
      }

      tasks.push({
        id: `${spec.id}-t${index + 1}`,
        title: `${titleStarts[Math.floor(r() * titleStarts.length)]} ${titleEnds[Math.floor(r() * titleEnds.length)]}`,
        description: descriptions[Math.floor(r() * descriptions.length)],
        status: column.id,
        assignee,
        priority,
        tags,
        subtasks,
        comments,
        order,
        created: new Date(Date.now() - (5 + Math.floor(r() * 45)) * 86400000).toISOString(),
        updated: new Date(Date.now() - Math.floor(r() * 10) * 86400000).toISOString(),
      });
    }

    return { id: spec.id, title: spec.title, columns, tags: [...spec.tags], tasks };
  });

  return {
    version: 6,
    activeBoardId: 'product',
    activeColumnId: 'product-c1',
    boards,
  };
}

export function sanitizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return makeSeed();
  const candidate = raw as Partial<AppState>;
  if (candidate.version !== 6 || !Array.isArray(candidate.boards) || candidate.boards.length === 0) return makeSeed();

  const boards: Board[] = candidate.boards.map((boardLike) => {
    const board = boardLike as Board;
    const columns = Array.isArray(board.columns) ? board.columns.slice(0, MAX_COLUMNS) : [];
    const fallbackColumns = columns.length >= 2 ? columns : [
      { id: uid('column'), title: 'Por hacer' },
      { id: uid('column'), title: 'Hecho' },
    ];
    const validColumnIds = new Set(fallbackColumns.map((column) => column.id));
    const tags = Array.isArray(board.tags) ? [...new Set(board.tags.map(String))].slice(0, MAX_TAGS) : [];
    const validTags = new Set(tags);
    const tasks = Array.isArray(board.tasks)
      ? board.tasks
          .filter((task) => task && validColumnIds.has(task.status))
          .map((task, index) => ({
            ...task,
            title: String(task.title ?? '').slice(0, 180),
            description: String(task.description ?? '').slice(0, 3000),
            assignee: String(task.assignee ?? ''),
            priority: priorities.includes(task.priority) ? task.priority : 'normal',
            tags: Array.isArray(task.tags) ? task.tags.filter((tag) => validTags.has(tag)).slice(0, MAX_TAGS) : [],
            subtasks: Array.isArray(task.subtasks) ? task.subtasks.slice(0, MAX_SUBTASKS) : [],
            comments: Array.isArray(task.comments) ? task.comments.slice(0, MAX_COMMENTS) : [],
            order: Number.isFinite(task.order) ? task.order : index,
            created: task.created || new Date().toISOString(),
            updated: task.updated || new Date().toISOString(),
          }))
      : [];
    return {
      id: String(board.id || uid('board')),
      title: String(board.title || 'Tablero').slice(0, 48),
      columns: fallbackColumns,
      tags,
      tasks,
    };
  });

  const activeBoard = boards.find((board) => board.id === candidate.activeBoardId) ?? boards[0];
  const activeColumnId = activeBoard.columns.some((column) => column.id === candidate.activeColumnId)
    ? String(candidate.activeColumnId)
    : activeBoard.columns[0].id;

  return { version: 6, boards, activeBoardId: activeBoard.id, activeColumnId };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : makeSeed();
  } catch {
    return makeSeed();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeOrders(board: Board) {
  for (const column of board.columns) {
    board.tasks
      .filter((task) => task.status === column.id)
      .sort((a, b) => a.order - b.order)
      .forEach((task, index) => {
        task.order = index;
      });
  }
}

export function createTask(board: Board, status: string, title = 'Nueva tarea'): Task {
  return {
    id: uid('task'),
    title: title.trim().slice(0, 180),
    description: '',
    status,
    assignee: '',
    priority: 'normal',
    tags: [],
    subtasks: [],
    comments: [],
    order: board.tasks.filter((task) => task.status === status).length,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

export function createBoard(title = 'Nuevo tablero'): Board {
  const id = uid('board');
  const names = ['Backlog', 'Por hacer', 'En curso', 'Hecho'];
  return {
    id,
    title: title.slice(0, 48),
    columns: names.map((name, index) => ({ id: `${id}-c${index + 1}`, title: name })),
    tags: ['UX', 'UI', 'Bug', 'QA'],
    tasks: [],
  };
}

export function stressTasks(board: Board, count: number) {
  const r = rng(Date.now() % 1000000000);
  for (let index = 0; index < count; index += 1) {
    const column = board.columns[Math.floor(r() * board.columns.length)];
    const task = createTask(
      board,
      column.id,
      `${titleStarts[Math.floor(r() * titleStarts.length)]} ${titleEnds[Math.floor(r() * titleEnds.length)]}`,
    );
    task.description = descriptions[Math.floor(r() * descriptions.length)];
    task.assignee = r() < 0.2 ? '' : people[Math.floor(r() * people.length)].id;
    task.priority = priorities[Math.floor(r() * priorities.length)];
    if (board.tags.length) task.tags = [board.tags[Math.floor(r() * board.tags.length)]];
    board.tasks.push(task);
  }
  normalizeOrders(board);
}

export function selfTest(state: AppState) {
  const failures: string[] = [];
  for (const board of state.boards) {
    if (board.columns.length < 2 || board.columns.length > MAX_COLUMNS) failures.push(`${board.title}: columnas fuera de límite`);
    if (board.tags.length > MAX_TAGS) failures.push(`${board.title}: más de ${MAX_TAGS} tags`);
    const columnIds = new Set(board.columns.map((column) => column.id));
    const boardTags = new Set(board.tags);
    for (const task of board.tasks) {
      if (!task.title.trim()) failures.push(`${board.title}: tarea sin título`);
      if (!columnIds.has(task.status)) failures.push(`${board.title}: tarea con estado inválido`);
      if (task.tags.some((tag) => !boardTags.has(tag))) failures.push(`${board.title}: tarea con tag fuera del catálogo`);
      if (task.subtasks.length > MAX_SUBTASKS) failures.push(`${board.title}: demasiadas subtareas`);
      if (task.comments.length > MAX_COMMENTS) failures.push(`${board.title}: demasiados comentarios`);
    }
  }
  return failures;
}

export function personById(id: string) {
  return people.find((person) => person.id === id);
}

export function makeId(prefix: string) {
  return uid(prefix);
}
