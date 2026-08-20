import { DiscordSDK } from '@discord/embedded-app-sdk';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const BOARD_PREFIX = 'bardo:board:';
const BOARD_TARGET_PREFIX = 'board:';
const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'doing', label: 'En curso' },
  { id: 'done', label: 'Hecho' },
];

let currentBoardId = null;
let currentInstanceId = null;
let draggedTaskId = null;

function resolveClientId() {
  const host = window.location.hostname || '';
  return host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i)?.[1] || FALLBACK_CLIENT_ID;
}

function parseBoardId(value) {
  const normalized = String(value || '').trim();
  if (normalized.startsWith(BOARD_PREFIX)) return normalized.slice(BOARD_PREFIX.length) || null;
  if (normalized.startsWith(BOARD_TARGET_PREFIX)) return normalized.slice(BOARD_TARGET_PREFIX.length) || null;
  return null;
}

async function initDiscordSdk() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.has('frame_id') || window.location.hostname.endsWith('.discordsays.com');
  if (!embedded) return null;

  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    return sdk;
  } catch (error) {
    console.warn('No se pudo iniciar DiscordSDK para el tablero:', error);
    return null;
  }
}

async function fetchContext(instanceId, maxAttempts = 5) {
  if (!instanceId) return null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }).catch(() => null);
    if (response?.ok) return response.json();
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(180 * (2 ** attempt), 1200)));
    }
  }
  return null;
}

async function resolveBoardTarget() {
  const params = new URLSearchParams(window.location.search);
  const sdk = await initDiscordSdk();
  currentInstanceId = sdk?.instanceId || params.get('instance_id') || null;

  const direct = parseBoardId(sdk?.customId) || parseBoardId(params.get('custom_id')) || params.get('board');
  if (direct) return direct;

  const context = await fetchContext(currentInstanceId);
  return parseBoardId(context?.documentId);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function injectStyles() {
  if (document.querySelector('#bardo-kanban-styles')) return;
  const style = document.createElement('style');
  style.id = 'bardo-kanban-styles';
  style.textContent = `
    html[data-bardo-mode="board"] body > .shell { display: none !important; }
    .kanban-shell { min-height: 100vh; padding: 18px 18px 28px; color: var(--text-primary, #f2f3f5); background: var(--app-bg, #111214); box-sizing: border-box; }
    .kanban-topbar { max-width: 1440px; margin: 0 auto 20px; display: flex; align-items: center; gap: 10px; }
    .kanban-avatar { width: 32px; height: 32px; border-radius: 9px; object-fit: cover; flex: 0 0 auto; }
    .kanban-brand strong { display: block; font-size: 14px; line-height: 1.15; }
    .kanban-brand span { display: block; margin-top: 2px; color: var(--text-muted, #a9abb3); font-size: 12px; }
    .kanban-header { max-width: 1440px; margin: 0 auto 18px; display: flex; align-items: end; justify-content: space-between; gap: 16px; }
    .kanban-eyebrow { margin: 0 0 7px; color: var(--text-muted, #a9abb3); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .kanban-title { margin: 0; font-size: clamp(24px, 3vw, 36px); letter-spacing: -.035em; line-height: 1.05; }
    .kanban-description { max-width: 720px; margin: 8px 0 0; color: var(--text-muted, #a9abb3); font-size: 14px; line-height: 1.5; }
    .kanban-helper { color: var(--text-muted, #a9abb3); font-size: 12px; text-align: right; }
    .kanban-board { max-width: 1440px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(245px, 1fr)); gap: 12px; align-items: start; overflow-x: auto; padding-bottom: 8px; }
    .kanban-column { min-width: 245px; background: color-mix(in srgb, var(--surface, #1e1f22) 94%, transparent); border: 1px solid var(--border, #2c2e33); border-radius: 14px; padding: 10px; min-height: 190px; }
    .kanban-column.is-over { outline: 2px solid var(--accent, #5865f2); outline-offset: 2px; }
    .kanban-column-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 10px; }
    .kanban-column-title { margin: 0; font-size: 13px; font-weight: 700; }
    .kanban-count { min-width: 23px; height: 23px; display: inline-grid; place-items: center; border-radius: 999px; background: var(--surface-raised, #2b2d31); color: var(--text-muted, #a9abb3); font-size: 11px; font-weight: 700; }
    .kanban-list { display: grid; gap: 8px; }
    .task-card { border: 1px solid var(--border, #303238); border-radius: 11px; background: var(--surface-raised, #232428); padding: 11px; cursor: grab; box-shadow: 0 1px 0 rgba(0,0,0,.08); }
    .task-card:active { cursor: grabbing; }
    .task-card.is-moving { opacity: .55; }
    .task-title { margin: 0; font-size: 14px; line-height: 1.35; font-weight: 700; }
    .task-description { margin: 6px 0 0; color: var(--text-muted, #b5bac1); font-size: 12px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .task-labels { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
    .task-chip { display: inline-flex; align-items: center; min-height: 21px; padding: 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #5865f2) 18%, transparent); color: var(--text-primary, #f2f3f5); font-size: 10px; font-weight: 650; }
    .task-footer { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .task-assignee { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--text-muted, #b5bac1); font-size: 11px; }
    .task-assignee-avatar { width: 23px; height: 23px; border-radius: 50%; display: grid; place-items: center; background: var(--surface, #34363c); color: var(--text-primary, #f2f3f5); font-size: 9px; font-weight: 800; flex: 0 0 auto; }
    .task-assignee span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-status-select { max-width: 105px; height: 28px; border: 1px solid var(--border, #3a3c42); border-radius: 7px; background: var(--surface, #1e1f22); color: var(--text-primary, #f2f3f5); font: inherit; font-size: 10px; padding: 0 5px; }
    .kanban-empty { padding: 22px 10px; color: var(--text-muted, #8f939c); font-size: 12px; text-align: center; border: 1px dashed var(--border, #34363c); border-radius: 9px; }
    .kanban-state { max-width: 620px; margin: 22vh auto 0; padding: 24px; text-align: center; color: var(--text-muted, #b5bac1); }
    .kanban-state strong { display: block; margin-bottom: 7px; color: var(--text-primary, #f2f3f5); font-size: 16px; }
    @media (prefers-color-scheme: light) {
      .kanban-shell { color: #202124; background: #f7f7f8; }
      .kanban-column { background: #f0f1f3; border-color: #dedfe3; }
      .task-card { background: #fff; border-color: #e1e2e6; }
      .task-status-select { background: #fff; color: #202124; border-color: #d9dade; }
      .task-assignee-avatar { background: #eceef2; color: #30323a; }
    }
    @media (max-width: 760px) {
      .kanban-shell { padding: 14px 12px 24px; }
      .kanban-header { align-items: start; flex-direction: column; }
      .kanban-helper { text-align: left; }
      .kanban-board { grid-template-columns: repeat(4, 82vw); gap: 10px; scroll-snap-type: x proximity; }
      .kanban-column { scroll-snap-align: start; }
    }
  `;
  document.head.appendChild(style);
}

function createShell() {
  injectStyles();
  document.documentElement.dataset.bardoMode = 'board';
  document.querySelector('#bardo-kanban')?.remove();

  const shell = document.createElement('main');
  shell.id = 'bardo-kanban';
  shell.className = 'kanban-shell';
  const avatar = document.querySelector('.brand-avatar')?.src || '';
  shell.innerHTML = `
    <header class="kanban-topbar">
      ${avatar ? `<img class="kanban-avatar" src="${escapeHtml(avatar)}" alt="Bardo" />` : ''}
      <div class="kanban-brand"><strong>Bardo</strong><span>Tableros y tareas</span></div>
    </header>
    <section id="kanban-content" class="kanban-state"><strong>Abriendo tablero</strong>Preparando tus tareas…</section>
  `;
  document.body.appendChild(shell);
  return shell.querySelector('#kanban-content');
}

function renderTask(task) {
  const statusOptions = STATUSES.map((status) => `<option value="${status.id}" ${status.id === task.status ? 'selected' : ''}>${status.label}</option>`).join('');
  const labels = (task.labels || []).map((label) => `<span class="task-chip">${escapeHtml(label)}</span>`).join('');
  const assignee = task.assigneeName
    ? `<div class="task-assignee"><span class="task-assignee-avatar">${escapeHtml(initials(task.assigneeName))}</span><span>${escapeHtml(task.assigneeName)}</span></div>`
    : `<div class="task-assignee"><span class="task-assignee-avatar">—</span><span>Sin asignar</span></div>`;

  return `
    <article class="task-card" draggable="true" data-task-id="${escapeHtml(task.id)}">
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
      ${labels ? `<div class="task-labels">${labels}</div>` : ''}
      <footer class="task-footer">
        ${assignee}
        <select class="task-status-select" data-task-status="${escapeHtml(task.id)}" aria-label="Mover ${escapeHtml(task.title)}">${statusOptions}</select>
      </footer>
    </article>
  `;
}

function renderBoard(container, board) {
  document.title = `${board.name} · Bardo`;
  const grouped = Object.fromEntries(STATUSES.map((status) => [status.id, []]));
  for (const task of board.tasks || []) (grouped[task.status] || grouped.backlog).push(task);

  container.className = '';
  container.innerHTML = `
    <header class="kanban-header">
      <div>
        <p class="kanban-eyebrow">Tablero</p>
        <h1 class="kanban-title">${escapeHtml(board.name)}</h1>
        ${board.description ? `<p class="kanban-description">${escapeHtml(board.description)}</p>` : ''}
      </div>
      <div class="kanban-helper">Agrega nuevas tarjetas con <strong>/tarea</strong><br />Arrastra o cambia el estado para moverlas.</div>
    </header>
    <section class="kanban-board" aria-label="Kanban ${escapeHtml(board.name)}">
      ${STATUSES.map((status) => `
        <section class="kanban-column" data-status="${status.id}">
          <header class="kanban-column-header">
            <h2 class="kanban-column-title">${status.label}</h2>
            <span class="kanban-count">${grouped[status.id].length}</span>
          </header>
          <div class="kanban-list">
            ${grouped[status.id].length ? grouped[status.id].map(renderTask).join('') : '<div class="kanban-empty">Sin tareas</div>'}
          </div>
        </section>
      `).join('')}
    </section>
  `;

  bindInteractions(container);
}

async function fetchBoard() {
  const response = await fetch(`/api/boards/${encodeURIComponent(currentBoardId)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function moveTask(taskId, status, selectEl = null) {
  if (!currentInstanceId) {
    if (selectEl) selectEl.value = selectEl.dataset.previousStatus || selectEl.value;
    return;
  }

  document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`)?.classList.add('is-moving');
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': currentInstanceId,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`)?.classList.remove('is-moving');
    throw new Error(`HTTP ${response.status}`);
  }

  const board = await fetchBoard();
  renderBoard(document.querySelector('#kanban-content'), board);
}

function bindInteractions(container) {
  container.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      draggedTaskId = card.dataset.taskId;
      card.classList.add('is-moving');
    });
    card.addEventListener('dragend', () => {
      draggedTaskId = null;
      card.classList.remove('is-moving');
      container.querySelectorAll('.kanban-column').forEach((column) => column.classList.remove('is-over'));
    });
  });

  container.querySelectorAll('.kanban-column').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('is-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('is-over'));
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      column.classList.remove('is-over');
      if (!draggedTaskId) return;
      try { await moveTask(draggedTaskId, column.dataset.status); } catch (error) { console.error('No se pudo mover la tarea:', error); }
    });
  });

  container.querySelectorAll('[data-task-status]').forEach((select) => {
    select.dataset.previousStatus = select.value;
    select.addEventListener('change', async () => {
      try {
        await moveTask(select.dataset.taskStatus, select.value, select);
      } catch (error) {
        console.error('No se pudo cambiar el estado:', error);
        select.value = select.dataset.previousStatus;
      }
    });
  });
}

async function startBoard() {
  const boardId = await resolveBoardTarget();
  if (!boardId) return;

  currentBoardId = boardId;
  const container = createShell();

  try {
    const board = await fetchBoard();
    renderBoard(container, board);
  } catch (error) {
    console.error('No se pudo abrir el tablero:', error);
    container.className = 'kanban-state';
    container.innerHTML = '<strong>No pudimos abrir este tablero</strong>Cierra esta vista y vuelve a abrirlo desde Bardo.';
  }
}

startBoard();
