import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  CHIP_COLOR_PALETTE,
  DEFAULT_KANBAN_COLUMNS,
  KANBAN_PRIORITIES,
  KANBAN_STATUSES,
  MAX_BOARD_CHIPS,
  MAX_BOARD_COLUMNS,
  boardTarget,
  getDeterministicColor,
  normalizeKanbanPriority,
  normalizeKanbanStatus,
  parseBoardTarget,
  parseLabels,
  priorityColor,
  priorityLabel,
  statusLabel,
} from '../kanban.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';
const BOARD_PREFIX = 'bardo:board:';
const BOARD_TARGET_PREFIX = 'board:';

const COLUMN_THEMES = {
  backlog: { accent: '#8a8e9b', badgeBg: 'rgba(138, 142, 155, 0.16)' },
  todo: { accent: '#5865f2', badgeBg: 'rgba(88, 101, 242, 0.16)' },
  doing: { accent: '#f0b232', badgeBg: 'rgba(240, 178, 50, 0.16)' },
  done: { accent: '#23a55a', badgeBg: 'rgba(35, 165, 90, 0.16)' },
};

const PRIORITY_THEMES = {
  urgent: {
    label: 'Urgente',
    color: '#f23f43',
    bg: 'rgba(242, 63, 67, 0.15)',
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  },
  high: {
    label: 'Alta',
    color: '#f0b232',
    bg: 'rgba(240, 178, 50, 0.15)',
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
  },
  medium: {
    label: 'Media',
    color: '#5865f2',
    bg: 'rgba(88, 101, 242, 0.15)',
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>',
  },
  low: {
    label: 'Baja',
    color: '#8a8e9b',
    bg: 'rgba(138, 142, 155, 0.15)',
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
  },
};

let activeDiscordSdk = null;
let currentBoardId = null;
let currentInstanceId = null;
let currentBoardData = null;
let currentDiscordUser = null;
let connectedParticipants = [];
let serverGuildMembers = [];
let serverGuildRoles = [];
let draggedTaskId = null;
let isSyncing = false;
let syncTimer = null;
let toastTimer = null;

// Filtros
let filterState = {
  search: '',
  onlyMyTasks: false,
  priority: 'all',
  label: 'all',
};

// Modal activo: null | { mode: 'create', status: 'backlog' } | { mode: 'edit', task: {...} }
let activeModalState = null;
let modalSelectedChips = [];

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

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.documentElement.classList.toggle('theme-light', isLight);
  document.documentElement.classList.toggle('theme-dark', !isLight);
}

function initTheme(sdk) {
  const params = new URLSearchParams(window.location.search);
  const paramTheme = params.get('theme');
  if (paramTheme) {
    applyTheme(paramTheme);
  } else if (sdk?.theme) {
    applyTheme(sdk.theme);
  } else if (sdk?.config?.theme) {
    applyTheme(sdk.config.theme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('light');
  } else {
    applyTheme('dark');
  }

  if (sdk?.subscribe) {
    try {
      sdk.subscribe('THEME_CHANGE', ({ theme }) => {
        if (theme) applyTheme(theme);
      });
    } catch {}
  }
}

async function refreshDiscordParticipants(sdk) {
  if (!sdk) return;
  try {
    if (sdk.commands?.getInstanceConnectedParticipants) {
      const res = await sdk.commands.getInstanceConnectedParticipants();
      if (Array.isArray(res?.participants) && res.participants.length > 0) {
        connectedParticipants = res.participants;
        if (!currentDiscordUser && connectedParticipants.length > 0) {
          currentDiscordUser = connectedParticipants[0];
        }
      }
    }
  } catch (err) {
    console.warn('No se pudieron obtener los participantes de Discord:', err);
  }

  try {
    if (sdk.commands?.getChannel && sdk.channelId) {
      const ch = await sdk.commands.getChannel({ channel_id: sdk.channelId });
      if (Array.isArray(ch?.recipients)) {
        for (const r of ch.recipients) {
          if (r?.id && !connectedParticipants.some((p) => String(p.id) === String(r.id))) {
            connectedParticipants.push(r);
          }
        }
      }
    }
  } catch {}
}

async function initDiscordSdk() {
  if (activeDiscordSdk) return activeDiscordSdk;
  const params = new URLSearchParams(window.location.search);
  const embedded = params.has('frame_id') || window.location.hostname.endsWith('.discordsays.com');

  initTheme(null);

  if (!embedded) return null;

  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();
    activeDiscordSdk = sdk;

    initTheme(sdk);

    // Escuchar actualizaciones de participantes
    try {
      if (sdk.subscribe) {
        sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', ({ participants }) => {
          if (Array.isArray(participants)) {
            connectedParticipants = participants;
            if (!currentDiscordUser && connectedParticipants.length > 0) {
              currentDiscordUser = connectedParticipants[0];
            }
          }
        });
      }
    } catch {}

    await refreshDiscordParticipants(sdk);

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

function showToast(message, type = 'info') {
  const existing = document.querySelector('#bardo-toast');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const toast = document.createElement('div');
  toast.id = 'bardo-toast';
  toast.className = `kanban-toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));

  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function injectStyles() {
  if (document.querySelector('#bardo-kanban-styles')) return;
  const style = document.createElement('style');
  style.id = 'bardo-kanban-styles';
  style.textContent = `
    html[data-bardo-mode="board"] body > .shell { display: none !important; }
    
    :root,
    [data-theme="dark"],
    .theme-dark {
      --kb-bg: #111214;
      --kb-surface: #1e1f22;
      --kb-surface-raised: #2b2d31;
      --kb-surface-hover: #35373c;
      --kb-border: transparent;
      --kb-border-subtle: transparent;
      --kb-text-primary: #f2f3f5;
      --kb-text-muted: #949ba4;
      --kb-text-dim: #72767d;
      --kb-blurple: #5865f2;
      --kb-blurple-hover: #4752c4;
      --kb-danger: #f23f43;
      --kb-danger-hover: #da373b;
      --kb-radius-card: 10px;
      --kb-radius-modal: 14px;
      --kb-radius-pill: 999px;
      --kb-shadow-card: none;
      --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.45);
      --kb-scrollbar-thumb: rgba(255, 255, 255, 0.16);
      --kb-scrollbar-thumb-hover: rgba(255, 255, 255, 0.28);
    }

    [data-theme="light"],
    .theme-light {
      --kb-bg: #f2f3f5;
      --kb-surface: #ffffff;
      --kb-surface-raised: #e9eaec;
      --kb-surface-hover: #dcdee1;
      --kb-border: transparent;
      --kb-border-subtle: transparent;
      --kb-text-primary: #060607;
      --kb-text-muted: #4e5058;
      --kb-text-dim: #80848e;
      --kb-blurple: #5865f2;
      --kb-blurple-hover: #4752c4;
      --kb-shadow-card: none;
      --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.18);
      --kb-scrollbar-thumb: rgba(0, 0, 0, 0.16);
      --kb-scrollbar-thumb-hover: rgba(0, 0, 0, 0.28);
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme="dark"]) {
        --kb-bg: #f2f3f5;
        --kb-surface: #ffffff;
        --kb-surface-raised: #e9eaec;
        --kb-surface-hover: #dcdee1;
        --kb-border: transparent;
        --kb-border-subtle: transparent;
        --kb-text-primary: #060607;
        --kb-text-muted: #4e5058;
        --kb-text-dim: #80848e;
        --kb-blurple: #5865f2;
        --kb-blurple-hover: #4752c4;
        --kb-shadow-card: none;
        --kb-shadow-modal: 0 16px 40px rgba(0, 0, 0, 0.18);
        --kb-scrollbar-thumb: rgba(0, 0, 0, 0.16);
        --kb-scrollbar-thumb-hover: rgba(0, 0, 0, 0.28);
      }
    }

    /* Scrollbar moderna, integrada y con fondo transparente */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-track-piece,
    ::-webkit-scrollbar-corner {
      background: transparent !important;
      background-color: transparent !important;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16));
      border-radius: 999px;
      border: none;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--kb-scrollbar-thumb-hover, rgba(255, 255, 255, 0.28));
    }
    * {
      scrollbar-width: thin;
      scrollbar-color: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16)) transparent !important;
    }

    .kanban-shell {
      min-height: 100vh;
      padding: 16px 0 32px;
      padding-top: max(env(safe-area-inset-top, 0px), 16px);
      padding-bottom: max(env(safe-area-inset-bottom, 0px), 32px);
      color: var(--kb-text-primary);
      background: var(--kb-bg);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    /* Topbar con Avatar Flat */
    .kanban-topbar {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 12px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      box-sizing: border-box;
    }
    .kanban-brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .kanban-avatar-box {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--kb-surface);
      display: grid;
      place-items: center;
      overflow: hidden;
      flex: 0 0 auto;
      transition: transform 0.15s ease;
    }
    .kanban-avatar-box:hover { transform: scale(1.05); }
    .kanban-avatar {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 2px;
      box-sizing: border-box;
      display: block;
    }

    .kanban-brand strong {
      display: block;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.15;
    }
    .kanban-brand span {
      display: block;
      margin-top: 1px;
      color: var(--kb-text-muted);
      font-size: 11px;
    }

    .kanban-top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Buttons con dimensiones idénticas */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: var(--kb-blurple);
      color: #ffffff;
      border: none;
      border-radius: 7px;
      height: 32px;
      padding: 0 13px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.15s ease, transform 0.08s ease;
    }
    .btn-primary:hover { background: var(--kb-blurple-hover); }
    .btn-primary:active { transform: scale(0.98); }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: var(--kb-surface-raised);
      color: var(--kb-text-primary);
      border: none;
      border-radius: 7px;
      height: 32px;
      padding: 0 12px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.15s ease;
    }
    .btn-secondary:hover { background: var(--kb-surface-hover); }

    .btn-icon {
      width: 32px;
      height: 32px;
      border-radius: 7px;
      display: grid;
      place-items: center;
      background: var(--kb-surface-raised);
      border: none;
      color: var(--kb-text-muted);
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .btn-icon:hover { color: var(--kb-text-primary); background: var(--kb-surface-hover); }
    .btn-icon.is-spinning svg { animation: spin 0.8s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Header */
    .kanban-header {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 12px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      box-sizing: border-box;
    }
    .kanban-header-info {
      flex: 1;
      min-width: 0;
    }
    .kanban-eyebrow {
      margin: 0 0 4px;
      color: var(--kb-text-dim);
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .kanban-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .kanban-title {
      margin: 0;
      font-size: clamp(22px, 2.6vw, 32px);
      font-weight: 800;
      letter-spacing: -.03em;
      line-height: 1.1;
    }
    .btn-edit-board-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      opacity: 0.35;
      cursor: pointer;
      padding: 0;
      transition: all 0.15s ease;
    }
    .btn-edit-board-icon:hover,
    .btn-edit-board-icon:focus-visible {
      opacity: 1;
      background: var(--kb-surface-raised);
      color: var(--kb-text-primary);
    }
    .kanban-description {
      max-width: 760px;
      margin: 5px 0 0;
      color: var(--kb-text-muted);
      font-size: 13px;
      line-height: 1.45;
    }

    /* Toolbar / Filters Flat */
    .kanban-toolbar {
      max-width: 1520px;
      width: 100%;
      margin: 0 auto 16px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding-top: 0;
      padding-bottom: 0;
      background: transparent;
      border: none;
      box-sizing: border-box;
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 190px;
    }
    .search-box input {
      width: 100%;
      height: 34px;
      padding: 0 28px 0 32px;
      background: var(--kb-surface);
      border: none;
      border-radius: 7px;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      outline: none;
      box-sizing: border-box;
      transition: background 0.15s ease;
    }
    .search-box input:focus {
      background: var(--kb-surface-raised);
    }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--kb-text-dim);
      pointer-events: none;
      display: flex;
    }
    .search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--kb-text-dim);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .search-clear:hover { color: var(--kb-text-primary); }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Select Wrapper Flat */
    .custom-select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .custom-select-wrap select {
      appearance: none;
      -webkit-appearance: none;
      height: 34px;
      padding: 0 32px 0 11px;
      background: var(--kb-surface);
      border: none;
      border-radius: 7px;
      color: var(--kb-text-primary);
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: background 0.15s ease;
    }
    .custom-select-wrap select:focus {
      background: var(--kb-surface-raised);
    }
    .custom-select-wrap .select-arrow {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--kb-text-dim);
      display: flex;
    }

    /* Botón "Mis tareas" Flat */
    .toggle-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      border-radius: 7px;
      background: var(--kb-surface);
      border: none;
      color: var(--kb-text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .toggle-chip:hover { color: var(--kb-text-primary); background: var(--kb-surface-hover); }
    .toggle-chip.is-active {
      background: var(--kb-blurple);
      color: #ffffff;
      font-weight: 600;
    }
    .toggle-chip.is-active span { color: #ffffff; }

    .clear-filters-btn {
      background: none;
      border: none;
      color: var(--kb-blurple);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 6px;
      text-decoration: underline;
    }

    /* Mobile Column Navigation Tabs */
    .mobile-column-tabs {
      display: none;
      gap: 6px;
      padding: 4px 0 10px;
      margin-bottom: 8px;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      box-sizing: border-box;
      flex-wrap: wrap;
    }
    .mobile-tab-btn {
      flex: 0 0 auto;
      width: auto;
      padding: 5px 11px;
      border-radius: var(--kb-radius-pill);
      background: var(--kb-surface);
      border: none;
      color: var(--kb-text-muted);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
      transition: all 0.12s ease;
    }
    .mobile-tab-btn.is-active {
      color: #ffffff;
      background: var(--tab-color, var(--kb-blurple));
    }

    /* Arquitectura de Scroll Horizontal (Contenedor externo + Track interno) */
    .kanban-scroll-container {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: visible;
      box-sizing: border-box;
      padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      scroll-padding-inline: max(env(safe-area-inset-left, 0px), clamp(16px, 3.5vw, 40px));
      padding-bottom: 24px;
      scrollbar-width: thin;
      scrollbar-color: var(--kb-scrollbar-thumb, rgba(255, 255, 255, 0.16)) transparent !important;
      flex: 1;
      -webkit-overflow-scrolling: touch;
    }

    .kanban-track {
      display: inline-flex;
      gap: 16px;
      align-items: flex-start;
      min-width: 100%;
      box-sizing: border-box;
      overflow: visible;
    }

    .kanban-column {
      flex: 1 1 280px;
      min-width: 280px;
      max-width: 380px;
      background: var(--kb-surface);
      border: none;
      border-radius: 12px;
      padding: 12px 10px;
      min-height: 260px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background 0.12s ease;
    }
    .kanban-column.is-over {
      background: color-mix(in srgb, var(--kb-surface) 88%, var(--column-accent, var(--kb-blurple)));
    }

    /* Cabecera de Columna con Divider Sutil (Dark & Light) */
    .kanban-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 4px 10px;
      margin-bottom: 10px;
      border-bottom: 1px solid color-mix(in srgb, var(--column-accent, var(--kb-blurple)) 22%, rgba(255, 255, 255, 0.05));
    }
    @media (prefers-color-scheme: light) {
      .kanban-column-header {
        border-bottom: 1px solid color-mix(in srgb, var(--column-accent, var(--kb-blurple)) 18%, rgba(0, 0, 0, 0.08));
      }
    }
    .column-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .column-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--column-accent, var(--kb-blurple));
      flex: 0 0 auto;
    }
    .kanban-column-title {
      margin: 0;
      font-size: 13px;
      font-weight: 750;
      letter-spacing: -0.01em;
    }
    .column-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kanban-count {
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      display: inline-grid;
      place-items: center;
      border-radius: var(--kb-radius-pill);
      background: var(--column-badge-bg, var(--kb-surface-raised));
      color: var(--column-accent, var(--kb-text-muted));
      font-size: 11px;
      font-weight: 750;
    }
    .btn-add-task-col {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-muted);
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      transition: all 0.12s ease;
    }
    .btn-add-task-col:hover {
      color: var(--kb-text-primary);
      background: var(--kb-surface-raised);
    }
    .btn-edit-col-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--kb-text-dim);
      opacity: 0.35;
      margin-left: 2px;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .column-title-wrap:hover .btn-edit-col-icon,
    .column-title-wrap:focus-visible .btn-edit-col-icon {
      opacity: 1;
      color: var(--kb-text-primary);
    }

    .kanban-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 120px;
    }

    /* Cards Flat */
    .task-card {
      border: none;
      border-radius: var(--kb-radius-card);
      background: var(--kb-surface-raised);
      padding: 12px;
      cursor: grab;
      transition: transform 0.12s ease, background 0.12s ease;
      position: relative;
      user-select: none;
      -webkit-user-select: none;
    }
    .task-card:hover {
      transform: translateY(-1px);
      background: var(--kb-surface-hover);
    }
    .task-card:active { cursor: grabbing; }
    .task-card.is-moving { opacity: 0.35; transform: scale(0.97); }
    .task-card.is-touch-dragging {
      opacity: 0.85;
      transform: scale(1.03);
      z-index: 100;
    }

    .task-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 7px;
    }
    .priority-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .01em;
    }

    .task-title {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.35;
      font-weight: 700;
      color: var(--kb-text-primary);
      word-break: break-word;
    }
    .task-description {
      margin: 6px 0 0;
      color: var(--kb-text-muted);
      font-size: 12px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .task-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 9px;
    }
    .task-chip {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 0 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.01em;
    }

    /* Footer limpio */
    .task-footer {
      margin-top: 10px;
      padding-top: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .task-assignee {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--kb-text-muted);
      font-size: 11px;
    }
    .task-assignee-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--kb-surface);
      color: var(--kb-text-primary);
      font-size: 9px;
      font-weight: 800;
      flex: 0 0 auto;
      border: none;
    }
    .task-assignee-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    /* Card sutil de "Sin tareas" Flat */
    .kanban-empty {
      padding: 24px 12px;
      color: var(--kb-text-dim);
      font-size: 12px;
      text-align: center;
      background: var(--kb-surface-raised);
      border: none;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .btn-col-empty-add {
      background: none;
      border: none;
      color: var(--kb-blurple);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
    }

    /* Modal Flat */
    .kanban-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 16px;
      box-sizing: border-box;
      animation: fadeIn 0.15s ease;
    }
    .kanban-modal {
      width: 100%;
      max-width: 540px;
      background: var(--kb-surface);
      border: none;
      border-radius: var(--kb-radius-modal);
      box-shadow: var(--kb-shadow-modal);
      padding: 20px;
      box-sizing: border-box;
      animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: 90vh;
      overflow-y: auto;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(12px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 6px;
    }
    .modal-title {
      margin: 0;
      font-size: 16px;
      font-weight: 750;
    }
    .modal-close-btn {
      background: none;
      border: none;
      color: var(--kb-text-muted);
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      border-radius: 4px;
    }
    .modal-close-btn:hover { color: var(--kb-text-primary); }

    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
    }
    .form-group label,
    .form-label {
      font-size: 11.5px;
      font-weight: 650;
      color: var(--kb-text-muted);
      letter-spacing: .01em;
      margin: 0;
    }
    .form-supporting-text {
      margin: -2px 0 4px;
      font-size: 12px;
      line-height: 1.4;
      color: var(--kb-text-muted);
    }
    .form-helper-text {
      font-size: 11px;
      line-height: 1.4;
      color: var(--kb-text-dim);
    }
    .form-input,
    .form-textarea {
      width: 100%;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      color: var(--kb-text-primary);
      font: inherit;
      font-size: 13px;
      padding: 8px 11px;
      box-sizing: border-box;
      outline: none;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .form-input {
      height: 36px;
    }
    .form-input:focus,
    .form-textarea:focus {
      background: var(--kb-surface-hover);
      border-color: var(--kb-border-active, rgba(255, 255, 255, 0.18));
    }
    .form-textarea {
      min-height: 72px;
      resize: vertical;
      line-height: 1.45;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-group .custom-select-wrap {
      display: flex;
      width: 100%;
      height: 36px;
      position: relative;
    }
    .form-group .custom-select-wrap select,
    .form-group .custom-select-wrap .form-select {
      width: 100%;
      height: 36px;
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--kb-surface-raised) !important;
      background: var(--kb-surface-raised) !important;
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      color: var(--kb-text-primary);
      padding: 0 32px 0 11px;
      font: inherit;
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .form-group .custom-select-wrap select:focus,
    .form-group .custom-select-wrap .form-select:focus {
      background-color: var(--kb-surface-hover) !important;
      background: var(--kb-surface-hover) !important;
      border-color: var(--kb-border-active, rgba(255, 255, 255, 0.18));
    }

    /* Segmented Controls for Priority */
    .segmented-control {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3px;
      height: 36px;
      background: var(--kb-surface-raised);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      box-sizing: border-box;
    }
    .seg-btn {
      height: 100%;
      box-sizing: border-box;
      background: transparent;
      border: none;
      border-radius: 6px;
      padding: 0 4px;
      font-size: 11.5px;
      font-weight: 650;
      color: var(--kb-text-muted);
      cursor: pointer;
      transition: all 0.12s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .seg-btn:hover { color: var(--kb-text-primary); }
    .seg-btn.is-selected {
      background: var(--kb-surface);
      color: var(--kb-text-primary);
    }
    .seg-btn[data-priority="urgent"].is-selected { color: #f23f43; }
    .seg-btn[data-priority="high"].is-selected { color: #f0b232; }
    .seg-btn[data-priority="medium"].is-selected { color: #5865f2; }
    .seg-btn[data-priority="low"].is-selected { color: #8a8e9b; }

    /* ==========================================================
       NOTION / LINEAR STYLE INTEGRATED CHIP INPUT (FLAT)
       ========================================================== */
    .notion-chips-container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      background: var(--kb-surface-raised);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: 7px;
      padding: 4px 8px;
      min-height: 36px;
      box-sizing: border-box;
      cursor: text;
      position: relative;
    }
    .notion-chips-selected {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .notion-chip-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: var(--kb-radius-pill);
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
      animation: fadeIn 0.1s ease;
    }
    .notion-chip-remove {
      background: none;
      border: none;
      color: inherit;
      opacity: 0.65;
      cursor: pointer;
      padding: 0;
      font-size: 11px;
      line-height: 1;
      display: flex;
    }
    .notion-chip-remove:hover { opacity: 1; }
    .notion-chips-input {
      flex: 1;
      min-width: 120px;
      background: transparent;
      border: none;
      outline: none;
      color: var(--kb-text-primary);
      font: inherit;
      font-size: 12.5px;
      padding: 2px 0;
    }
    .notion-chips-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--kb-surface-hover);
      border: none;
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      z-index: 1200;
      max-height: 180px;
      overflow-y: auto;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .notion-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--kb-text-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: background 0.1s ease;
    }
    .notion-menu-item:hover,
    .notion-menu-item.is-highlighted {
      background: var(--kb-surface-raised);
    }
    .notion-menu-create {
      color: var(--kb-blurple);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ==========================================================
       DISCORD MEMBER AUTOCOMPLETE SELECTOR (FLAT)
       ========================================================== */
    .discord-member-container {
      position: relative;
    }
    .discord-member-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .member-icon {
      position: absolute;
      left: 10px;
      color: var(--kb-text-dim);
      font-size: 13px;
      pointer-events: none;
    }
    .discord-member-input {
      padding-left: 32px;
      padding-right: 28px;
    }
    .member-clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--kb-text-dim);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .member-clear-btn:hover { color: var(--kb-text-primary); }
    .discord-member-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: var(--kb-surface-hover);
      border: none;
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      z-index: 1200;
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .member-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: background 0.1s ease;
    }
    .member-menu-item:hover {
      background: var(--kb-surface-raised);
    }
    .member-avatar-mini {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--kb-surface-raised);
      display: grid;
      place-items: center;
      font-size: 9.5px;
      font-weight: 800;
      border: none;
      flex: 0 0 auto;
    }
    .member-info-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .member-name-text {
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .member-handle-text {
      font-size: 10.5px;
      color: var(--kb-text-muted);
    }
    .board-member-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px 3px 5px;
      background: var(--kb-surface-raised);
      border-radius: var(--kb-radius-pill);
      font-size: 11.5px;
      color: var(--kb-text-primary);
      font-weight: 550;
      animation: fadeIn 0.1s ease;
    }
    .board-member-pill .member-avatar-mini {
      width: 18px;
      height: 18px;
      font-size: 8.5px;
    }
    .board-member-pill-remove {
      background: none;
      border: none;
      color: var(--kb-text-dim);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      display: flex;
      line-height: 1;
    }
    .board-member-pill-remove:hover {
      color: var(--kb-danger);
    }
    .board-member-suggestion-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 3px 5px;
      background: var(--kb-surface);
      border: 1px dashed var(--kb-text-dim);
      border-radius: var(--kb-radius-pill);
      font-size: 11px;
      color: var(--kb-text-muted);
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .board-member-suggestion-btn:hover {
      background: var(--kb-surface-hover);
      color: var(--kb-text-primary);
      border-style: solid;
    }

    /* Column Manager dentro de Configuración de Tablero */
    .modal-columns-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    .modal-column-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--kb-surface);
      border: 1px solid var(--kb-border-subtle, rgba(255, 255, 255, 0.06));
      border-radius: 8px;
      box-sizing: border-box;
      transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
      user-select: none;
    }
    .modal-column-row.is-dragging {
      opacity: 0.35;
      border: 1px dashed var(--kb-blurple);
    }
    .modal-column-row.is-drag-over {
      border-color: var(--kb-blurple);
      background: var(--kb-surface-hover);
      transform: scale(1.01);
    }
    .modal-column-drag-handle {
      width: 20px;
      height: 24px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      cursor: grab;
      padding: 0;
      flex: 0 0 auto;
      transition: color 0.12s ease;
      touch-action: none;
    }
    .modal-column-drag-handle:hover {
      color: var(--kb-text-primary);
    }
    .modal-column-drag-handle:active {
      cursor: grabbing;
    }
    .modal-column-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex: 0 0 auto;
    }
    .modal-column-input {
      flex: 1;
      height: 28px;
      padding: 0 8px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--kb-text-primary);
      font-size: 12.5px;
      font-weight: 600;
      outline: none;
      user-select: auto;
    }
    .modal-column-input:focus {
      background: var(--kb-surface-raised);
      border-color: var(--kb-blurple);
    }
    .modal-column-btn {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--kb-text-dim);
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      transition: all 0.1s ease;
      flex: 0 0 auto;
    }
    .modal-column-btn:hover {
      color: var(--kb-text-primary);
      background: var(--kb-surface-raised);
    }
    .modal-column-btn:disabled {
      opacity: 0.25;
      cursor: not-allowed;
    }
    .modal-column-btn.btn-remove-col:hover {
      color: var(--kb-danger);
    }
    .btn-add-modal-col {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--kb-surface);
      border: 1px dashed var(--kb-text-dim);
      border-radius: 7px;
      color: var(--kb-text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .btn-add-modal-col:hover {
      color: var(--kb-blurple);
      border-color: var(--kb-blurple);
      background: var(--kb-surface-raised);
    }

    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
      padding-top: 8px;
    }
    .modal-actions-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-danger {
      background: transparent;
      color: var(--kb-danger);
      border: none;
      border-radius: 7px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .btn-danger:hover { background: var(--kb-danger); color: #fff; }
    .btn-danger.is-confirming {
      background: var(--kb-danger);
      color: #fff;
      animation: pulse 0.8s infinite alternate;
    }

    @keyframes pulse { from { opacity: 0.9; } to { opacity: 1; } }

    /* Toast */
    .kanban-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--kb-surface-raised);
      border: none;
      border-radius: 9px;
      padding: 10px 16px;
      color: var(--kb-text-primary);
      font-size: 13px;
      font-weight: 550;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      z-index: 2000;
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }
    .kanban-toast.is-visible { opacity: 1; transform: translateY(0); }
    .toast-success .toast-icon { color: #23a55a; font-weight: 800; }
    .toast-error .toast-icon { color: #f23f43; font-weight: 800; }
    .toast-info .toast-icon { color: #5865f2; font-weight: 800; }

    /* States */
    .kanban-state {
      max-width: 600px;
      margin: 20vh auto 0;
      padding: 24px;
      text-align: center;
      color: var(--kb-text-muted);
    }
    .kanban-state strong {
      display: block;
      margin-bottom: 8px;
      color: var(--kb-text-primary);
      font-size: 17px;
    }

    @media (max-width: 860px) {
      .kanban-shell {
        padding-top: calc(env(safe-area-inset-top, 0px) + 56px);
        padding-bottom: max(env(safe-area-inset-bottom, 0px), 48px);
        padding-inline: 0;
      }
      .kanban-header {
        flex-direction: column;
        gap: 8px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .kanban-topbar {
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .kanban-toolbar {
        gap: 8px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .mobile-column-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
      }
      .mobile-tab-btn {
        flex: 0 0 auto;
        width: auto;
      }
      .kanban-scroll-container {
        padding-inline: max(env(safe-area-inset-left, 0px), 16px);
        scroll-padding-inline: max(env(safe-area-inset-left, 0px), 16px);
        scroll-snap-type: x mandatory;
      }
      .kanban-track {
        gap: 12px;
      }
      .kanban-column {
        flex: 0 0 calc(85vw - 20px);
        min-width: 260px;
        max-width: 340px;
        scroll-snap-align: start;
      }
      .form-row { grid-template-columns: 1fr; }
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
      <div class="kanban-brand-group">
        ${avatar ? `
          <div class="kanban-avatar-box">
            <img class="kanban-avatar" src="${escapeHtml(avatar)}" alt="Bardo" />
          </div>
        ` : ''}
        <div class="kanban-brand">
          <strong>Bardo Kanban</strong>
          <span id="sync-indicator">Sincronizado</span>
        </div>
      </div>
      <div class="kanban-top-actions">
        <button id="btn-sync" class="btn-icon" title="Refrescar tablero" type="button" aria-label="Refrescar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
        <button id="btn-new-task-global" class="btn-primary" type="button">
          <span>+</span> Tarea
        </button>
      </div>
    </header>
    <section id="kanban-content" class="kanban-state">
      <strong>Abriendo tablero</strong>
      <p>Cargando tareas del equipo…</p>
    </section>
  `;
  document.body.appendChild(shell);

  shell.querySelector('#btn-sync')?.addEventListener('click', async () => {
    await refreshBoard(true);
  });

  shell.querySelector('#btn-new-task-global')?.addEventListener('click', () => {
    const firstColId = (currentBoardData?.columns || DEFAULT_KANBAN_COLUMNS)[0]?.id || 'backlog';
    openModal({ mode: 'create', status: firstColId });
  });

  return shell.querySelector('#kanban-content');
}

function getAllBoardChips(allTasks = []) {
  const map = new Map();
  for (const task of allTasks) {
    const chips = parseLabels(task.labels || []);
    for (const c of chips) {
      if (!c.name) continue;
      const key = c.name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: c.name, color: c.color || getDeterministicColor(c.name) });
      }
    }
  }
  return Array.from(map.values());
}

function getKnownDiscordMembers(allTasks = []) {
  const map = new Map();

  // 1. Miembros del servidor de Discord (obtenidos vía Discord Bot API)
  for (const m of serverGuildMembers) {
    if (!m || !m.id) continue;
    map.set(String(m.id), {
      id: String(m.id),
      name: m.name || m.username || 'Usuario',
      username: m.username || '',
      avatarUrl: m.avatarUrl || null,
    });
  }

  // 2. Miembros configurados en el tablero
  if (Array.isArray(currentBoardData?.members)) {
    for (const m of currentBoardData.members) {
      if (!m) continue;
      const id = String(m.id || m.name || m.username);
      const name = m.name || m.username || 'Usuario';
      const existing = map.get(id);
      map.set(id, {
        id,
        name,
        username: m.username || existing?.username || '',
        avatarUrl: m.avatarUrl || existing?.avatarUrl || null,
      });
    }
  }

  // 3. Participantes conectados en la Activity de Discord
  for (const p of connectedParticipants) {
    if (!p.id) continue;
    const name = p.nickname || p.global_name || p.username || 'Usuario';
    const existing = map.get(String(p.id));
    map.set(String(p.id), {
      id: String(p.id),
      name,
      username: p.username || existing?.username || '',
      avatarUrl: existing?.avatarUrl || (p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64` : null),
    });
  }

  // 4. Usuario actual de Discord
  if (currentDiscordUser?.id) {
    const name = currentDiscordUser.global_name || currentDiscordUser.username || 'Yo';
    const existing = map.get(String(currentDiscordUser.id));
    map.set(String(currentDiscordUser.id), {
      id: String(currentDiscordUser.id),
      name,
      username: currentDiscordUser.username || existing?.username || '',
      avatarUrl: existing?.avatarUrl || (currentDiscordUser.avatar ? `https://cdn.discordapp.com/avatars/${currentDiscordUser.id}/${currentDiscordUser.avatar}.png?size=64` : null),
    });
  }

  // 5. Miembros asignados en tareas existentes
  for (const task of allTasks) {
    if (task.assigneeId && task.assigneeName) {
      const id = String(task.assigneeId);
      if (!map.has(id)) {
        map.set(id, { id, name: task.assigneeName, username: '', avatarUrl: null });
      }
    }
  }

  return Array.from(map.values());
}

function getFilteredTasks(tasks = []) {
  return tasks.filter((task) => {
    // Búsqueda
    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      const matchTitle = (task.title || '').toLowerCase().includes(q);
      const matchDesc = (task.description || '').toLowerCase().includes(q);
      const matchAssignee = (task.assigneeName || '').toLowerCase().includes(q);
      const taskChips = parseLabels(task.labels || []);
      const matchLabels = taskChips.some((l) => (l.name || '').toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchAssignee && !matchLabels) return false;
    }

    // Mis tareas
    if (filterState.onlyMyTasks && currentDiscordUser) {
      const myId = currentDiscordUser.id;
      const myName = (currentDiscordUser.username || '').toLowerCase();
      const taskAssigneeId = task.assigneeId;
      const taskAssigneeName = (task.assigneeName || '').toLowerCase();
      if (taskAssigneeId !== myId && !taskAssigneeName.includes(myName)) {
        return false;
      }
    }

    // Prioridad
    if (filterState.priority !== 'all' && task.priority !== filterState.priority) {
      return false;
    }

    // Chip / Label
    if (filterState.label !== 'all') {
      const taskChips = parseLabels(task.labels || []);
      const hasLabel = taskChips.some((l) => (l.name || '').toLowerCase() === filterState.label.toLowerCase());
      if (!hasLabel) return false;
    }

    return true;
  });
}

function renderTask(task) {
  const priorityInfo = PRIORITY_THEMES[task.priority] || PRIORITY_THEMES.medium;
  const chips = parseLabels(task.labels || []);

  const labelsHtml = chips.map((chip) => {
    const color = chip.color || getDeterministicColor(chip.name);
    return `
      <span class="task-chip" style="background: ${color}20; border: 1px solid ${color}45; color: ${color};">
        ${escapeHtml(chip.name)}
      </span>
    `;
  }).join('');

  const assignee = task.assigneeName
    ? `<div class="task-assignee"><span class="task-assignee-avatar">${escapeHtml(initials(task.assigneeName))}</span><span class="task-assignee-name">${escapeHtml(task.assigneeName)}</span></div>`
    : `<div class="task-assignee"><span class="task-assignee-avatar">—</span><span class="task-assignee-name">Sin asignar</span></div>`;

  return `
    <article class="task-card" draggable="true" data-task-id="${escapeHtml(task.id)}" tabindex="0" role="button" aria-label="Ver o editar ${escapeHtml(task.title)}">
      <div class="task-header">
        <span class="priority-badge" style="color: ${priorityInfo.color}; background: ${priorityInfo.bg};">
          ${priorityInfo.icon} ${priorityInfo.label}
        </span>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
      ${labelsHtml ? `<div class="task-labels">${labelsHtml}</div>` : ''}
      <footer class="task-footer">
        ${assignee}
      </footer>
    </article>
  `;
}

function renderBoard(container, board) {
  currentBoardData = board;
  document.title = `${board.name} · Bardo Kanban`;

  const boardColumns = Array.isArray(board.columns) && board.columns.length > 0 ? board.columns : DEFAULT_KANBAN_COLUMNS;
  const allTasks = board.tasks || [];
  const filteredTasks = getFilteredTasks(allTasks);
  const allBoardChips = getAllBoardChips(allTasks);

  const fallbackStatus = boardColumns[0]?.id || 'backlog';
  const grouped = Object.fromEntries(boardColumns.map((status) => [status.id, []]));
  const totals = Object.fromEntries(boardColumns.map((status) => [status.id, 0]));

  for (const task of allTasks) {
    const status = grouped[task.status] ? task.status : fallbackStatus;
    totals[status] = (totals[status] || 0) + 1;
  }
  for (const task of filteredTasks) {
    const status = grouped[task.status] ? task.status : fallbackStatus;
    grouped[status].push(task);
  }

  const hasActiveFilters = Boolean(
    filterState.search ||
    filterState.onlyMyTasks ||
    filterState.priority !== 'all' ||
    filterState.label !== 'all'
  );

  container.className = '';
  container.innerHTML = `
    <header class="kanban-header">
      <div class="kanban-header-info">
        <p class="kanban-eyebrow">Tablero de equipo</p>
        <div class="kanban-title-wrap">
          <h1 class="kanban-title">${escapeHtml(board.name)}</h1>
          <button id="btn-edit-board" class="btn-edit-board-icon" title="Editar configuración y miembros del tablero" type="button" aria-label="Editar tablero">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              <path d="m15 5 4 4"/>
            </svg>
          </button>
        </div>
        ${board.description ? `<p class="kanban-description">${escapeHtml(board.description)}</p>` : ''}
      </div>
    </header>

    <!-- Barra de Herramientas (Limpia, sin card) -->
    <section class="kanban-toolbar" aria-label="Filtros y búsqueda">
      <div class="search-box">
        <span class="search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input id="filter-search" type="search" placeholder="Buscar por título, responsable o chip…" value="${escapeHtml(filterState.search)}" />
        ${filterState.search ? '<button id="btn-clear-search" class="search-clear" type="button">✕</button>' : ''}
      </div>

      <div class="filter-group">
        <button id="toggle-my-tasks" class="toggle-chip ${filterState.onlyMyTasks ? 'is-active' : ''}" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Mis tareas</span>
        </button>

        <div class="custom-select-wrap">
          <select id="filter-priority" aria-label="Filtrar por prioridad">
            <option value="all" ${filterState.priority === 'all' ? 'selected' : ''}>Todas las prioridades</option>
            <option value="urgent" ${filterState.priority === 'urgent' ? 'selected' : ''}>Urgente</option>
            <option value="high" ${filterState.priority === 'high' ? 'selected' : ''}>Alta</option>
            <option value="medium" ${filterState.priority === 'medium' ? 'selected' : ''}>Media</option>
            <option value="low" ${filterState.priority === 'low' ? 'selected' : ''}>Baja</option>
          </select>
          <span class="select-arrow" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        </div>

        ${allBoardChips.length ? `
          <div class="custom-select-wrap">
            <select id="filter-label" aria-label="Filtrar por chip">
              <option value="all" ${filterState.label === 'all' ? 'selected' : ''}>Todos los chips (${allBoardChips.length}/${MAX_BOARD_CHIPS})</option>
              ${allBoardChips.map((c) => `<option value="${escapeHtml(c.name)}" ${filterState.label === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
            <span class="select-arrow" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </span>
          </div>
        ` : ''}

        ${hasActiveFilters ? `<button id="btn-clear-all-filters" class="clear-filters-btn" type="button">Limpiar filtros</button>` : ''}
      </div>
    </section>

    <!-- Navegador de pestañas móviles de columnas -->
    <nav class="mobile-column-tabs" aria-label="Pestañas de columnas">
      ${boardColumns.map((status) => {
        const accent = status.color || '#5865f2';
        const count = totals[status.id] || 0;
        return `
          <button class="mobile-tab-btn" data-jump-to-status="${status.id}" style="--tab-color: ${accent};" type="button">
            ${escapeHtml(status.label)} (${count})
          </button>
        `;
      }).join('')}
    </nav>

    <!-- Columnas Kanban (Scroll Container + Track) -->
    <section class="kanban-scroll-container" aria-label="Columnas Kanban">
      <div class="kanban-track">
        ${boardColumns.map((status) => {
          const accent = status.color || '#5865f2';
          const count = grouped[status.id]?.length || 0;
          const total = totals[status.id] || 0;
          const countDisplay = hasActiveFilters && count !== total ? `${count}/${total}` : count;

          return `
            <section class="kanban-column" id="col-${status.id}" data-status="${status.id}" style="--column-accent: ${accent}; --column-badge-bg: ${accent}22;">
              <header class="kanban-column-header">
                <div class="column-title-wrap" data-edit-column="${status.id}" role="button" tabindex="0" title="Editar columna ${escapeHtml(status.label)}" style="cursor: pointer;">
                  <span class="column-indicator"></span>
                  <h2 class="kanban-column-title">${escapeHtml(status.label)}</h2>
                  <span class="btn-edit-col-icon" title="Editar columna">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                      <path d="m15 5 4 4"/>
                    </svg>
                  </span>
                </div>
                <div class="column-actions">
                  <span class="kanban-count">${countDisplay}</span>
                  <button class="btn-add-task-col" data-add-to-status="${status.id}" title="Agregar tarea en ${escapeHtml(status.label)}" type="button" aria-label="Agregar tarea">+</button>
                </div>
              </header>
              <div class="kanban-list" data-status-list="${status.id}">
                ${grouped[status.id]?.length
                  ? grouped[status.id].map(renderTask).join('')
                  : `<div class="kanban-empty">
                      <span>Sin tareas</span>
                      <button class="btn-col-empty-add" data-add-to-status="${status.id}" type="button">+ Agregar tarea</button>
                     </div>`
                }
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </section>
  `;

  bindBoardEvents(container);
}

function bindBoardEvents(container) {
  const boardColumns = Array.isArray(currentBoardData?.columns) && currentBoardData.columns.length > 0
    ? currentBoardData.columns
    : DEFAULT_KANBAN_COLUMNS;

  // Editar configuración del tablero
  container.querySelector('#btn-edit-board')?.addEventListener('click', () => {
    openBoardSettingsModal(currentBoardData);
  });

  // Filtros
  const searchInput = container.querySelector('#filter-search');
  searchInput?.addEventListener('input', (e) => {
    filterState.search = e.target.value;
    renderBoard(container, currentBoardData);
    const nextInput = container.querySelector('#filter-search');
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }
  });

  container.querySelector('#btn-clear-search')?.addEventListener('click', () => {
    filterState.search = '';
    renderBoard(container, currentBoardData);
  });

  container.querySelector('#toggle-my-tasks')?.addEventListener('click', () => {
    filterState.onlyMyTasks = !filterState.onlyMyTasks;
    renderBoard(container, currentBoardData);
  });

  container.querySelector('#filter-priority')?.addEventListener('change', (e) => {
    filterState.priority = e.target.value;
    renderBoard(container, currentBoardData);
  });

  container.querySelector('#filter-label')?.addEventListener('change', (e) => {
    filterState.label = e.target.value;
    renderBoard(container, currentBoardData);
  });

  container.querySelector('#btn-clear-all-filters')?.addEventListener('click', () => {
    filterState = { search: '', onlyMyTasks: false, priority: 'all', label: 'all' };
    renderBoard(container, currentBoardData);
  });

  // Botones móviles para saltar a columnas
  container.querySelectorAll('[data-jump-to-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const statusId = btn.dataset.jumpToStatus;
      const targetCol = container.querySelector(`#col-${statusId}`);
      targetCol?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      container.querySelectorAll('.mobile-tab-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  // Botones de agregar en columnas
  container.querySelectorAll('[data-add-to-status]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal({ mode: 'create', status: btn.dataset.addToStatus });
    });
  });

  // Edición de columnas (click en título de columna)
  container.querySelectorAll('[data-edit-column]').forEach((trigger) => {
    const colId = trigger.dataset.editColumn;
    const col = boardColumns.find((c) => c.id === colId);
    if (col) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        openColumnModal(col);
      });
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openColumnModal(col);
        }
      });
    }
  });

  // Click / Touch en tarjeta
  container.querySelectorAll('.task-card').forEach((card) => {
    let touchTimer = null;
    let touchMoved = false;

    card.addEventListener('click', () => {
      if (touchMoved) return;
      const taskId = card.dataset.taskId;
      const task = (currentBoardData?.tasks || []).find((t) => t.id === taskId);
      if (task) openModal({ mode: 'edit', task });
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const taskId = card.dataset.taskId;
        const task = (currentBoardData?.tasks || []).find((t) => t.id === taskId);
        if (task) openModal({ mode: 'edit', task });
      }
    });

    // Drag & Drop Desktop
    card.addEventListener('dragstart', () => {
      draggedTaskId = card.dataset.taskId;
      card.classList.add('is-moving');
    });
    card.addEventListener('dragend', () => {
      draggedTaskId = null;
      card.classList.remove('is-moving');
      container.querySelectorAll('.kanban-column').forEach((col) => col.classList.remove('is-over'));
    });

    // Touch Long-Press Drag para móviles
    card.addEventListener('touchstart', () => {
      touchMoved = false;
      touchTimer = setTimeout(() => {
        draggedTaskId = card.dataset.taskId;
        card.classList.add('is-touch-dragging');
        if (navigator.vibrate) navigator.vibrate(30);
      }, 220);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!draggedTaskId) {
        clearTimeout(touchTimer);
        return;
      }
      touchMoved = true;
      const touch = e.touches[0];
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const col = elem?.closest('.kanban-column');
      container.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-over'));
      if (col) col.classList.add('is-over');
    }, { passive: true });

    card.addEventListener('touchend', async (e) => {
      clearTimeout(touchTimer);
      if (draggedTaskId) {
        const changedTouch = e.changedTouches[0];
        const elem = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
        const col = elem?.closest('.kanban-column');
        card.classList.remove('is-touch-dragging');
        container.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-over'));
        if (col && col.dataset.status) {
          const targetStatus = col.dataset.status;
          await moveTaskOptimistic(draggedTaskId, targetStatus);
        }
        draggedTaskId = null;
      }
    });
  });

  // Columnas Drag Over & Drop
  container.querySelectorAll('.kanban-column').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('is-over');
    });
    column.addEventListener('dragleave', () => {
      column.classList.remove('is-over');
    });
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      column.classList.remove('is-over');
      if (!draggedTaskId) return;
      const targetStatus = column.dataset.status;
      await moveTaskOptimistic(draggedTaskId, targetStatus);
    });
  });
}

function openModal(modalConfig) {
  activeModalState = modalConfig;
  document.querySelector('#bardo-modal-backdrop')?.remove();

  const isEdit = modalConfig.mode === 'edit';
  const task = modalConfig.task || {};
  const boardColumns = Array.isArray(currentBoardData?.columns) && currentBoardData.columns.length > 0
    ? currentBoardData.columns
    : DEFAULT_KANBAN_COLUMNS;
  const currentStatus = modalConfig.status || task.status || boardColumns[0]?.id || 'backlog';
  const currentPriority = task.priority || 'medium';

  modalSelectedChips = parseLabels(task.labels || []);
  const allBoardChips = getAllBoardChips(currentBoardData?.tasks || []);
  const knownMembers = getKnownDiscordMembers(currentBoardData?.tasks || []);

  const backdrop = document.createElement('div');
  backdrop.id = 'bardo-modal-backdrop';
  backdrop.className = 'kanban-modal-backdrop';

  backdrop.innerHTML = `
    <div class="kanban-modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
      <header class="modal-header">
        <h2 id="modal-heading" class="modal-title">${isEdit ? 'Editar tarea' : 'Nueva tarea'}</h2>
        <button id="btn-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">✕</button>
      </header>

      <form id="modal-task-form" class="modal-form">
        <div class="form-group">
          <label for="task-title-input">Título *</label>
          <input id="task-title-input" class="form-input" type="text" placeholder="Ej: Diseñar flujo de onboarding" value="${escapeHtml(task.title || '')}" required maxlength="120" autofocus />
        </div>

        <div class="form-group">
          <label for="task-desc-input">Descripción</label>
          <textarea id="task-desc-input" class="form-textarea" placeholder="Agrega detalles, contexto o enlaces…">${escapeHtml(task.description || '')}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Columna / estado</label>
            <div class="custom-select-wrap">
              <select id="task-status-input" class="form-select">
                ${boardColumns.map((s) => `<option value="${s.id}" ${s.id === currentStatus ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
              </select>
              <span class="select-arrow" aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </span>
            </div>
          </div>

          <div class="form-group">
            <label>Prioridad</label>
            <div class="segmented-control" id="priority-selector">
              ${KANBAN_PRIORITIES.map((p) => `
                <button type="button" class="seg-btn ${p.id === currentPriority ? 'is-selected' : ''}" data-priority="${p.id}">
                  ${p.label}
                </button>
              `).join('')}
            </div>
            <input type="hidden" id="task-priority-input" value="${currentPriority}" />
          </div>
        </div>

        <!-- Responsable con Autocomplete Inteligente de Discord -->
        <div class="form-group">
          <label>Responsable</label>
          <p class="form-supporting-text">Asigna a un miembro del servidor de Discord.</p>
          <div class="discord-member-container" id="discord-member-box">
            <div class="discord-member-input-wrap">
              <span class="member-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="task-assignee-name-input"
                class="form-input discord-member-input"
                type="text"
                placeholder="Buscar miembro de Discord o escribir nombre…"
                value="${escapeHtml(task.assigneeName || '')}"
                autocomplete="off"
              />
              <input type="hidden" id="task-assignee-id-input" value="${escapeHtml(task.assigneeId || '')}" />
              ${task.assigneeName ? '<button type="button" id="btn-clear-assignee" class="member-clear-btn" title="Quitar asignación">✕</button>' : ''}
            </div>
            <div id="discord-member-dropdown" class="discord-member-dropdown" style="display: none;"></div>
          </div>
        </div>

        <!-- Chips / etiquetas estilo Notion -->
        <div class="form-group">
          <label>Chips / etiquetas</label>
          <p class="form-supporting-text">Etiquetas visuales para categorizar y filtrar la tarea.</p>
          <div class="notion-chips-container" id="task-chips-box">
            <div class="notion-chips-selected" id="task-chips-selected"></div>
            <input
              id="task-chip-input"
              class="notion-chip-inline-input"
              type="text"
              placeholder="Escribe o crea un chip…"
              autocomplete="off"
            />
            <div id="task-chip-dropdown" class="notion-chip-dropdown" style="display: none;"></div>
          </div>
        </div>

        <footer class="modal-actions">
          <div>
            ${isEdit ? `<button id="btn-delete-task" class="btn-danger" type="button">Eliminar tarea</button>` : ''}
          </div>
          <div class="modal-actions-right">
            <button id="btn-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-modal-submit" class="btn-primary" type="submit">
              ${isEdit ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  // ==========================================================
  // LÓGICA DE CHIPS ESTILO NOTION (MÁX 8 CHIPS)
  // ==========================================================
  const chipsBox = backdrop.querySelector('#notion-chips-box');
  const chipsSelected = backdrop.querySelector('#notion-chips-selected');
  const chipInput = backdrop.querySelector('#notion-chips-input');
  const chipDropdown = backdrop.querySelector('#notion-chips-dropdown');

  function renderSelectedChipsPills() {
    if (!chipsSelected) return;
    chipsSelected.innerHTML = modalSelectedChips.map((chip, idx) => {
      const color = chip.color || getDeterministicColor(chip.name);
      return `
        <span class="notion-chip-pill" style="background: ${color}22; border: 1px solid ${color}55; color: ${color};">
          <span>${escapeHtml(chip.name)}</span>
          <button type="button" class="notion-chip-remove" data-remove-chip-idx="${idx}" aria-label="Quitar">✕</button>
        </span>
      `;
    }).join('');

    chipsSelected.querySelectorAll('[data-remove-chip-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.removeChipIdx);
        modalSelectedChips.splice(idx, 1);
        renderSelectedChipsPills();
        if (chipInput) chipInput.placeholder = modalSelectedChips.length ? 'Otro chip…' : 'Escribe o crea un chip…';
      });
    });
  }

  function updateChipDropdown(query = '') {
    if (!chipDropdown) return;
    const cleanQuery = query.trim();
    const selectedNames = new Set(modalSelectedChips.map((c) => c.name.toLowerCase()));

    // Filtrar chips existentes
    const matches = allBoardChips.filter(
      (c) => !selectedNames.has(c.name.toLowerCase()) && (!cleanQuery || c.name.toLowerCase().includes(cleanQuery.toLowerCase()))
    );

    let html = '';

    // Si hay texto y no coincide exactamente con un chip existente, ofrecer crear
    const exactMatch = allBoardChips.some((c) => c.name.toLowerCase() === cleanQuery.toLowerCase()) ||
                       modalSelectedChips.some((c) => c.name.toLowerCase() === cleanQuery.toLowerCase());

    if (cleanQuery && !exactMatch) {
      if (allBoardChips.length >= MAX_BOARD_CHIPS) {
        html += `
          <div style="padding: 6px 10px; color: var(--kb-text-muted); font-size: 11.5px;">
            Límite de ${MAX_BOARD_CHIPS} chips por tablero alcanzado.
          </div>
        `;
      } else {
        const autoColor = getDeterministicColor(cleanQuery);
        html += `
          <button type="button" class="notion-menu-item notion-menu-create" data-create-chip="${escapeHtml(cleanQuery)}" data-chip-color="${autoColor}">
            <span>+ Crear chip <strong>"${escapeHtml(cleanQuery)}"</strong></span>
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${autoColor};"></span>
          </button>
        `;
      }
    }

    // Lista de sugerencias existentes
    for (const chip of matches) {
      const color = chip.color || getDeterministicColor(chip.name);
      html += `
        <button type="button" class="notion-menu-item" data-pick-chip="${escapeHtml(chip.name)}" data-chip-color="${escapeHtml(color)}">
          <span class="notion-menu-item-tag">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
            <span>${escapeHtml(chip.name)}</span>
          </span>
        </button>
      `;
    }

    if (!html) {
      chipDropdown.style.display = 'none';
      return;
    }

    chipDropdown.innerHTML = html;
    chipDropdown.style.display = 'flex';

    // Bindings de selección
    chipDropdown.querySelectorAll('[data-create-chip]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.createChip;
        const color = btn.dataset.chipColor;
        modalSelectedChips.push({ name, color });
        renderSelectedChipsPills();
        if (chipInput) {
          chipInput.value = '';
          chipInput.placeholder = 'Otro chip…';
          chipInput.focus();
        }
        chipDropdown.style.display = 'none';
      });
    });

    chipDropdown.querySelectorAll('[data-pick-chip]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.pickChip;
        const color = btn.dataset.chipColor;
        modalSelectedChips.push({ name, color });
        renderSelectedChipsPills();
        if (chipInput) {
          chipInput.value = '';
          chipInput.placeholder = 'Otro chip…';
          chipInput.focus();
        }
        chipDropdown.style.display = 'none';
      });
    });
  }

  chipsBox?.addEventListener('click', () => {
    chipInput?.focus();
  });

  chipInput?.addEventListener('focus', () => {
    updateChipDropdown(chipInput.value);
  });

  chipInput?.addEventListener('input', (e) => {
    updateChipDropdown(e.target.value);
  });

  chipInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = chipInput.value.trim().replace(/^,|,$/g, '').slice(0, 24);
      if (!val) return;

      const exists = modalSelectedChips.some((c) => c.name.toLowerCase() === val.toLowerCase());
      if (!exists) {
        const existingBoardChip = allBoardChips.find((c) => c.name.toLowerCase() === val.toLowerCase());
        if (!existingBoardChip && allBoardChips.length >= MAX_BOARD_CHIPS) {
          showToast(`Máximo ${MAX_BOARD_CHIPS} chips por tablero`, 'info');
          return;
        }
        const color = existingBoardChip?.color || getDeterministicColor(val);
        modalSelectedChips.push({ name: val, color });
        renderSelectedChipsPills();
      }
      chipInput.value = '';
      chipInput.placeholder = 'Otro chip…';
      if (chipDropdown) chipDropdown.style.display = 'none';
    } else if (e.key === 'Backspace' && !chipInput.value && modalSelectedChips.length) {
      modalSelectedChips.pop();
      renderSelectedChipsPills();
      chipInput.placeholder = modalSelectedChips.length ? 'Otro chip…' : 'Escribe o crea un chip…';
    }
  });

  renderSelectedChipsPills();

  // ==========================================================
  // LÓGICA DE AUTOCOMPLETADO DE MIEMBROS DE DISCORD
  // ==========================================================
  const memberNameInput = backdrop.querySelector('#task-assignee-name-input');
  const memberIdInput = backdrop.querySelector('#task-assignee-id-input');
  const memberDropdown = backdrop.querySelector('#discord-member-dropdown');
  const clearAssigneeBtn = backdrop.querySelector('#btn-clear-assignee');

  function updateMemberDropdown(query = '') {
    if (!memberDropdown) return;
    const cleanQuery = query.trim().replace(/^@/, '').toLowerCase();
    const currentMembers = getKnownDiscordMembers(currentBoardData?.tasks || []);

    let matches = currentMembers;
    if (cleanQuery) {
      matches = currentMembers.filter(
        (m) => m.name.toLowerCase().includes(cleanQuery) ||
               (m.username && m.username.toLowerCase().includes(cleanQuery)) ||
               (m.id && m.id.includes(cleanQuery))
      );
    }

    let html = '';

    if (matches.length > 0) {
      for (const m of matches) {
        html += `
          <button type="button" class="member-menu-item" data-member-id="${escapeHtml(m.id)}" data-member-name="${escapeHtml(m.name)}">
            ${m.avatarUrl
              ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.name)}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`
              : `<span class="member-avatar-mini">${escapeHtml(initials(m.name))}</span>`}
            <div class="member-info-col">
              <span class="member-name-text">${escapeHtml(m.name)}</span>
              ${m.username ? `<span class="member-handle-text">@${escapeHtml(m.username)}</span>` : ''}
            </div>
          </button>
        `;
      }
    } else if (cleanQuery) {
      html = `<div style="padding: 10px 12px; font-size: 12px; color: var(--kb-text-dim); text-align: center;">No se encontraron miembros del servidor</div>`;
    }

    if (!html) {
      memberDropdown.style.display = 'none';
      return;
    }

    memberDropdown.innerHTML = html;
    memberDropdown.style.display = 'flex';

    memberDropdown.querySelectorAll('.member-menu-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.memberId;
        const name = btn.dataset.memberName;
        if (memberNameInput) memberNameInput.value = name;
        if (memberIdInput) memberIdInput.value = id;
        memberDropdown.style.display = 'none';
      });
    });
  }

  memberNameInput?.addEventListener('focus', () => {
    updateMemberDropdown(memberNameInput.value);
  });

  memberNameInput?.addEventListener('input', (e) => {
    if (memberIdInput && !/^\d{17,20}$/.test(e.target.value.trim())) {
      memberIdInput.value = '';
    }
    updateMemberDropdown(e.target.value);
  });

  clearAssigneeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (memberNameInput) memberNameInput.value = '';
    if (memberIdInput) memberIdInput.value = '';
    clearAssigneeBtn.remove();
  });

  // Cerrar dropdowns al hacer clic fuera
  backdrop.addEventListener('click', (e) => {
    if (!chipsBox?.contains(e.target) && chipDropdown) {
      chipDropdown.style.display = 'none';
    }
    if (!memberNameInput?.parentElement?.contains(e.target) && memberDropdown) {
      memberDropdown.style.display = 'none';
    }
    if (e.target === backdrop) closeModal();
  });

  // Selector segmentado de prioridad
  const priorityInput = backdrop.querySelector('#task-priority-input');
  backdrop.querySelectorAll('#priority-selector .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('#priority-selector .seg-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      priorityInput.value = btn.dataset.priority;
    });
  });

  // Cerrar modal
  function closeModal() {
    activeModalState = null;
    backdrop.remove();
  }

  backdrop.querySelector('#btn-modal-close')?.addEventListener('click', closeModal);
  backdrop.querySelector('#btn-modal-cancel')?.addEventListener('click', closeModal);

  window.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && activeModalState) {
      closeModal();
      window.removeEventListener('keydown', escHandler);
    }
  });

  // Eliminar tarea con confirmación
  if (isEdit) {
    const deleteBtn = backdrop.querySelector('#btn-delete-task');
    let confirmDelete = false;

    deleteBtn?.addEventListener('click', async () => {
      if (!confirmDelete) {
        confirmDelete = true;
        deleteBtn.textContent = '¿Confirmar eliminación?';
        deleteBtn.classList.add('is-confirming');
        setTimeout(() => {
          confirmDelete = false;
          deleteBtn.textContent = 'Eliminar tarea';
          deleteBtn.classList.remove('is-confirming');
        }, 3500);
        return;
      }

      try {
        await deleteTaskRequest(task.id);
        closeModal();
        showToast('Tarea eliminada', 'success');
        await refreshBoard(false);
      } catch (error) {
        console.error('Error eliminando tarea:', error);
        showToast('No se pudo eliminar la tarea', 'error');
      }
    });
  }

  // Guardar / Crear tarea
  const form = backdrop.querySelector('#modal-task-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = backdrop.querySelector('#task-title-input')?.value.trim();
    if (!title) return;

    const description = backdrop.querySelector('#task-desc-input')?.value.trim() || '';
    const status = backdrop.querySelector('#task-status-input')?.value || boardColumns[0]?.id || 'backlog';
    const priority = backdrop.querySelector('#task-priority-input')?.value || 'medium';
    
    const rawAssigneeName = memberNameInput?.value.trim() || null;
    const rawAssigneeId = memberIdInput?.value.trim() || null;

    let assigneeId = rawAssigneeId;
    let assigneeName = rawAssigneeName;

    if (rawAssigneeName && /^\d{17,20}$/.test(rawAssigneeName)) {
      assigneeId = rawAssigneeName;
    }

    const labels = modalSelectedChips;

    const submitBtn = backdrop.querySelector('#btn-modal-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (isEdit) {
        await updateTaskRequest(task.id, {
          title,
          description,
          status,
          priority,
          assigneeId,
          assigneeName,
          labels,
        });
        showToast('Cambios guardados', 'success');
      } else {
        await createTaskRequest({
          title,
          description,
          status,
          priority,
          assigneeId,
          assigneeName,
          labels,
        });
        showToast('Tarea creada', 'success');
      }

      if (assigneeName) {
        const boardMembers = Array.isArray(currentBoardData?.members) ? [...currentBoardData.members] : [];
        const exists = boardMembers.some((m) => m.name.toLowerCase() === assigneeName.toLowerCase() || (assigneeId && m.id === assigneeId));
        if (!exists) {
          boardMembers.push({
            id: assigneeId || `m-${Date.now()}`,
            name: assigneeName,
            username: assigneeName,
          });
          currentBoardData.members = boardMembers;
          saveBoardSettingsRequest({ members: boardMembers }).catch(() => {});
        }
      }

      closeModal();
      await refreshBoard(false);
    } catch (error) {
      console.error('Error guardando tarea:', error);
      showToast(error.message || 'No se pudo guardar la tarea', 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openColumnModal(columnToEdit = null) {
  const isEdit = Boolean(columnToEdit);
  const currentColumns = currentBoardData?.columns || DEFAULT_KANBAN_COLUMNS;
  const initialLabel = columnToEdit?.label || '';
  const initialColor = columnToEdit?.color || CHIP_COLOR_PALETTE[currentColumns.length % CHIP_COLOR_PALETTE.length].color;

  const backdrop = document.createElement('div');
  backdrop.id = 'bardo-column-modal-backdrop';
  backdrop.className = 'kanban-modal-backdrop';
  backdrop.innerHTML = `
    <div class="kanban-modal" role="dialog" aria-modal="true">
      <header class="modal-header">
        <h2 class="modal-title">${isEdit ? 'Editar columna' : `Nueva columna (máx. ${MAX_BOARD_COLUMNS})`}</h2>
        <button id="btn-col-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">✕</button>
      </header>
      <form id="col-modal-form" class="modal-form">
        <div class="form-group">
          <label for="col-name-input">Nombre de columna *</label>
          <input id="col-name-input" class="form-input" type="text" placeholder="Ej: En revisión" value="${escapeHtml(initialLabel)}" required maxlength="30" autofocus />
        </div>
        <div class="form-group">
          <label>Color distintivo</label>
          <p class="form-supporting-text">Selecciona un color distintivo para esta columna.</p>
          <div class="color-palette-picker" style="display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0;">
            ${CHIP_COLOR_PALETTE.map((c) => `
              <button type="button" class="color-dot-btn ${c.color === initialColor ? 'is-selected' : ''}" data-color="${c.color}" style="width: 28px; height: 28px; border-radius: 50%; background: ${c.color}; border: none; cursor: pointer; transition: transform 0.1s ease; outline: ${c.color === initialColor ? '2px solid #fff' : 'none'}; outline-offset: 2px;"></button>
            `).join('')}
          </div>
          <input type="hidden" id="col-color-input" value="${initialColor}" />
        </div>
        <footer class="modal-actions">
          <div>
            ${isEdit && currentColumns.length > 1 ? `<button id="btn-delete-col" class="btn-danger" type="button">Eliminar columna</button>` : ''}
          </div>
          <div class="modal-actions-right">
            <button id="btn-col-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-col-modal-submit" class="btn-primary" type="submit">${isEdit ? 'Guardar' : 'Crear columna'}</button>
          </div>
        </footer>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const colorInput = backdrop.querySelector('#col-color-input');
  backdrop.querySelectorAll('.color-dot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('.color-dot-btn').forEach((b) => {
        b.classList.remove('is-selected');
        b.style.outline = 'none';
      });
      btn.classList.add('is-selected');
      btn.style.outline = '2px solid #fff';
      btn.style.outlineOffset = '2px';
      colorInput.value = btn.dataset.color;
    });
  });

  function closeColModal() {
    backdrop.remove();
  }

  backdrop.querySelector('#btn-col-modal-close')?.addEventListener('click', closeColModal);
  backdrop.querySelector('#btn-col-modal-cancel')?.addEventListener('click', closeColModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeColModal();
  });

  // Eliminar columna
  if (isEdit && currentColumns.length > 1) {
    const delBtn = backdrop.querySelector('#btn-delete-col');
    let confirmDel = false;
    delBtn?.addEventListener('click', async () => {
      if (!confirmDel) {
        confirmDel = true;
        delBtn.textContent = '¿Confirmar eliminación?';
        delBtn.classList.add('is-confirming');
        setTimeout(() => {
          confirmDel = false;
          delBtn.textContent = 'Eliminar columna';
          delBtn.classList.remove('is-confirming');
        }, 3500);
        return;
      }

      const updatedColumns = currentColumns.filter((c) => c.id !== columnToEdit.id);
      try {
        await saveBoardColumnsRequest(updatedColumns);
        currentBoardData.columns = updatedColumns;
        closeColModal();
        showToast('Columna eliminada', 'success');
        await refreshBoard(false);
      } catch (err) {
        console.error('Error eliminando columna:', err);
        showToast(err.message || 'No se pudo eliminar la columna', 'error');
      }
    });
  }

  // Guardar / Crear
  const form = backdrop.querySelector('#col-modal-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#col-name-input')?.value.trim();
    if (!name) return;
    const color = colorInput?.value || '#5865f2';

    let updatedColumns;
    if (isEdit) {
      updatedColumns = currentColumns.map((c) => (c.id === columnToEdit.id ? { ...c, label: name, color } : c));
    } else {
      if (currentColumns.length >= MAX_BOARD_COLUMNS) {
        showToast(`Máximo ${MAX_BOARD_COLUMNS} columnas por tablero`, 'error');
        return;
      }
      const newId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `col-${Date.now()}`;
      let id = newId;
      let counter = 1;
      while (currentColumns.some((c) => c.id === id)) {
        id = `${newId}-${counter}`;
        counter += 1;
      }
      updatedColumns = [...currentColumns, { id, label: name, color }];
    }

    const submitBtn = backdrop.querySelector('#btn-col-modal-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await saveBoardColumnsRequest(updatedColumns);
      currentBoardData.columns = updatedColumns;
      closeColModal();
      showToast(isEdit ? 'Columna guardada' : 'Columna creada', 'success');
      await refreshBoard(false);
    } catch (err) {
      console.error('Error guardando columna:', err);
      showToast(err.message || 'No se pudo guardar la columna', 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

async function openBoardSettingsModal(board) {
  if (!board) return;

  const currentMembers = Array.isArray(board.members) ? [...board.members] : [];
  let modalMembers = [...currentMembers];

  const currentColumns = Array.isArray(board.columns) && board.columns.length > 0
    ? JSON.parse(JSON.stringify(board.columns))
    : JSON.parse(JSON.stringify(DEFAULT_KANBAN_COLUMNS));
  let modalColumns = [...currentColumns];

  if (activeDiscordSdk) {
    await refreshDiscordParticipants(activeDiscordSdk);
  }

  // Obtener todos los miembros conocidos del servidor de Discord
  const knownFromDiscord = getKnownDiscordMembers(board.tasks || []);

  const backdrop = document.createElement('div');
  backdrop.id = 'bardo-board-settings-modal-backdrop';
  backdrop.className = 'kanban-modal-backdrop';
  backdrop.innerHTML = `
    <div class="kanban-modal" role="dialog" aria-modal="true" style="max-width: 560px;">
      <header class="modal-header">
        <h2 class="modal-title">Configuración del tablero</h2>
        <button id="btn-board-modal-close" class="modal-close-btn" type="button" aria-label="Cerrar">✕</button>
      </header>
      <form id="board-settings-form" class="modal-form">
        <div class="form-group">
          <label for="board-name-input">Nombre del tablero *</label>
          <input id="board-name-input" class="form-input" type="text" placeholder="Ej: Proyecto Alfa" value="${escapeHtml(board.name)}" required maxlength="80" autofocus />
        </div>

        <div class="form-group">
          <label for="board-desc-input">Descripción</label>
          <textarea id="board-desc-input" class="form-textarea" placeholder="Propósito, equipo o alcance de este tablero…" maxlength="500">${escapeHtml(board.description || '')}</textarea>
        </div>

        <!-- Gestión de Columnas (máx 5) -->
        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="margin: 0;">Columnas del tablero</label>
            <span id="board-col-count-text" class="form-helper-text"></span>
          </div>
          <p class="form-supporting-text">Gestiona los nombres, colores y orden de las columnas de trabajo.</p>
          <div id="board-modal-columns-list" class="modal-columns-list"></div>
          
          <div id="board-add-col-wrap" style="margin-top: 8px;">
            <button type="button" id="btn-show-add-col-box" class="btn-add-modal-col">
              <span>+</span> Añadir columna
            </button>
            <div id="board-add-col-box" style="display: none; margin-top: 8px; padding: 10px; background: var(--kb-surface); border-radius: 8px; border: 1px solid var(--kb-border-subtle, rgba(255,255,255,0.08));">
              <div style="display: flex; gap: 8px; align-items: center;">
                <input id="new-col-name-input" class="form-input" type="text" placeholder="Nombre de columna…" maxlength="30" style="height: 32px; font-size: 12.5px;" />
                <button type="button" id="btn-confirm-add-col" class="btn-primary" style="height: 32px; font-size: 12px; padding: 0 12px;">Añadir</button>
                <button type="button" id="btn-cancel-add-col" class="btn-secondary" style="height: 32px; font-size: 12px; padding: 0 10px;">Cancelar</button>
              </div>
              <div id="new-col-palette" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;"></div>
            </div>
          </div>
        </div>

        <!-- Miembros del equipo habilitados para asignación -->
        <div class="form-group">
          <label>Miembros del equipo</label>
          <p class="form-supporting-text">Gestiona los miembros que podrán asignarse a las tareas de este tablero.</p>

          <!-- Input para agregar miembro manual o buscar -->
          <div class="discord-member-container" id="board-member-add-box">
            <div class="discord-member-input-wrap">
              <span class="member-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="board-member-add-input"
                class="form-input discord-member-input"
                type="text"
                placeholder="Nombre, @usuario o ID de Discord…"
                autocomplete="off"
                style="padding-right: 80px;"
              />
              <button type="button" id="btn-add-member-manual" class="btn-secondary" style="position: absolute; right: 4px; height: 26px; padding: 0 10px; font-size: 11.5px;">+ Añadir</button>
            </div>
            <div id="board-member-dropdown" class="discord-member-dropdown" style="display: none;"></div>
          </div>

          <!-- Sugerencias rápidas de Discord -->
          <div id="board-member-suggestions" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;"></div>

          <!-- Añadir por Roles de Discord -->
          <div id="board-role-picker-wrap" style="margin-top: 8px; display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; color: var(--kb-text-muted); font-weight: 600;">Añadir por rol de Discord:</span>
            </div>
            <div id="board-role-chips" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
          </div>

          <!-- Lista de miembros agregados -->
          <div id="board-members-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px;"></div>
        </div>

        <footer class="modal-actions">
          <div></div>
          <div class="modal-actions-right">
            <button id="btn-board-modal-cancel" class="btn-secondary" type="button">Cancelar</button>
            <button id="btn-board-modal-submit" class="btn-primary" type="submit">Guardar cambios</button>
          </div>
        </footer>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  // ==========================================
  // GESTIÓN DE COLUMNAS
  // ==========================================
  const columnsListEl = backdrop.querySelector('#board-modal-columns-list');
  const colCountText = backdrop.querySelector('#board-col-count-text');
  const showAddColBtn = backdrop.querySelector('#btn-show-add-col-box');
  const addColBox = backdrop.querySelector('#board-add-col-box');
  const newColNameInput = backdrop.querySelector('#new-col-name-input');
  const confirmAddColBtn = backdrop.querySelector('#btn-confirm-add-col');
  const cancelAddColBtn = backdrop.querySelector('#btn-cancel-add-col');
  const paletteEl = backdrop.querySelector('#new-col-palette');

  let selectedNewColColor = CHIP_COLOR_PALETTE[0].color;

  function renderPalette() {
    if (!paletteEl) return;
    paletteEl.innerHTML = CHIP_COLOR_PALETTE.map((c) => `
      <button type="button" class="color-dot-btn ${c.color === selectedNewColColor ? 'is-selected' : ''}" data-pick-new-col-color="${c.color}" style="width: 22px; height: 22px; border-radius: 50%; background: ${c.color}; border: none; cursor: pointer; outline: ${c.color === selectedNewColColor ? '2px solid #fff' : 'none'}; outline-offset: 2px;"></button>
    `).join('');

    paletteEl.querySelectorAll('[data-pick-new-col-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedNewColColor = btn.dataset.pickNewColColor;
        renderPalette();
      });
    });
  }

  let draggedColIdx = null;

  function renderColumnsList() {
    if (!columnsListEl) return;
    if (colCountText) colCountText.textContent = `${modalColumns.length}/${MAX_BOARD_COLUMNS}`;

    if (showAddColBtn) {
      showAddColBtn.style.display = modalColumns.length < MAX_BOARD_COLUMNS ? 'inline-flex' : 'none';
    }

    columnsListEl.innerHTML = modalColumns.map((col, idx) => `
      <div class="modal-column-row" data-col-idx="${idx}" draggable="true">
        <div class="modal-column-drag-handle" title="Arrastrar para reordenar" aria-label="Reordenar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="5" r="2"/>
            <circle cx="16" cy="5" r="2"/>
            <circle cx="8" cy="12" r="2"/>
            <circle cx="16" cy="12" r="2"/>
            <circle cx="8" cy="19" r="2"/>
            <circle cx="16" cy="19" r="2"/>
          </svg>
        </div>
        <span class="modal-column-dot" style="background: ${col.color || '#5865f2'};"></span>
        <input type="text" class="modal-column-input" value="${escapeHtml(col.label)}" maxlength="30" data-col-input-idx="${idx}" placeholder="Nombre de columna" />
        <button type="button" class="modal-column-btn btn-remove-col" data-remove-col-idx="${idx}" ${modalColumns.length <= 1 ? 'disabled' : ''} title="Eliminar columna">✕</button>
      </div>
    `).join('');

    columnsListEl.querySelectorAll('[data-col-input-idx]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.colInputIdx);
        if (modalColumns[idx]) {
          modalColumns[idx].label = e.target.value;
        }
      });
    });

    columnsListEl.querySelectorAll('.modal-column-row').forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        draggedColIdx = Number(row.dataset.colIdx);
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedColIdx));
      });

      row.addEventListener('dragend', () => {
        draggedColIdx = null;
        row.classList.remove('is-dragging');
        columnsListEl.querySelectorAll('.modal-column-row').forEach((r) => r.classList.remove('is-drag-over'));
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetIdx = Number(row.dataset.colIdx);
        if (draggedColIdx !== null && draggedColIdx !== targetIdx) {
          row.classList.add('is-drag-over');
        }
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('is-drag-over');
        const targetIdx = Number(row.dataset.colIdx);
        if (draggedColIdx !== null && draggedColIdx !== targetIdx) {
          const [moved] = modalColumns.splice(draggedColIdx, 1);
          modalColumns.splice(targetIdx, 0, moved);
          renderColumnsList();
        }
      });

      // Soporte táctil / mobile para arrastre de columnas
      const handle = row.querySelector('.modal-column-drag-handle');
      if (handle) {
        handle.addEventListener('touchstart', () => {
          draggedColIdx = Number(row.dataset.colIdx);
          row.classList.add('is-dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          if (draggedColIdx === null) return;
          const touch = e.touches[0];
          const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetRow = elUnder?.closest('.modal-column-row');
          columnsListEl.querySelectorAll('.modal-column-row').forEach((r) => {
            if (r === targetRow && Number(r.dataset.colIdx) !== draggedColIdx) {
              r.classList.add('is-drag-over');
            } else {
              r.classList.remove('is-drag-over');
            }
          });
        }, { passive: true });

        handle.addEventListener('touchend', (e) => {
          if (draggedColIdx !== null) {
            const touch = e.changedTouches[0];
            const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = elUnder?.closest('.modal-column-row');
            if (targetRow) {
              const targetIdx = Number(targetRow.dataset.colIdx);
              if (!isNaN(targetIdx) && targetIdx !== draggedColIdx) {
                const [moved] = modalColumns.splice(draggedColIdx, 1);
                modalColumns.splice(targetIdx, 0, moved);
              }
            }
            draggedColIdx = null;
            renderColumnsList();
          }
        });
      }
    });

    columnsListEl.querySelectorAll('[data-remove-col-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeColIdx);
        if (modalColumns.length > 1) {
          modalColumns.splice(idx, 1);
          renderColumnsList();
        }
      });
    });
  }

  showAddColBtn?.addEventListener('click', () => {
    if (addColBox) addColBox.style.display = 'block';
    if (showAddColBtn) showAddColBtn.style.display = 'none';
    if (newColNameInput) {
      newColNameInput.value = '';
      newColNameInput.focus();
    }
    selectedNewColColor = CHIP_COLOR_PALETTE[modalColumns.length % CHIP_COLOR_PALETTE.length].color;
    renderPalette();
  });

  cancelAddColBtn?.addEventListener('click', () => {
    if (addColBox) addColBox.style.display = 'none';
    if (showAddColBtn) showAddColBtn.style.display = modalColumns.length < MAX_BOARD_COLUMNS ? 'inline-flex' : 'none';
  });

  function handleAddNewColumn() {
    const name = newColNameInput?.value.trim();
    if (!name) return;
    if (modalColumns.length >= MAX_BOARD_COLUMNS) {
      showToast(`Máximo ${MAX_BOARD_COLUMNS} columnas por tablero`, 'error');
      return;
    }
    const newId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `col-${Date.now()}`;
    let id = newId;
    let counter = 1;
    while (modalColumns.some((c) => c.id === id)) {
      id = `${newId}-${counter}`;
      counter += 1;
    }
    modalColumns.push({ id, label: name, color: selectedNewColColor });
    if (addColBox) addColBox.style.display = 'none';
    renderColumnsList();
  }

  confirmAddColBtn?.addEventListener('click', handleAddNewColumn);
  newColNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNewColumn();
    }
  });

  // ==========================================
  // GESTIÓN DE MIEMBROS
  // ==========================================
  const membersListEl = backdrop.querySelector('#board-members-list');
  const suggestionsEl = backdrop.querySelector('#board-member-suggestions');
  const addInput = backdrop.querySelector('#board-member-add-input');
  const addBtn = backdrop.querySelector('#btn-add-member-manual');
  const dropdownEl = backdrop.querySelector('#board-member-dropdown');

  function getMemberRoleBadge(member) {
    if (!member || !Array.isArray(member.roles) || !Array.isArray(serverGuildRoles)) return null;
    for (const role of serverGuildRoles) {
      if (member.roles.includes(role.id)) {
        return role;
      }
    }
    return null;
  }

  function renderMembersList() {
    if (!membersListEl) return;
    if (modalMembers.length === 0) {
      membersListEl.innerHTML = `<span class="form-helper-text">No hay miembros configurados. Se sugerirán los miembros del servidor.</span>`;
      return;
    }

    membersListEl.innerHTML = modalMembers.map((m, idx) => {
      const fullMember = serverGuildMembers.find((gm) => String(gm.id) === String(m.id)) || m;
      const role = getMemberRoleBadge(fullMember);
      return `
      <div class="board-member-pill">
        ${m.avatarUrl
          ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.name)}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`
          : `<span class="member-avatar-mini">${escapeHtml(initials(m.name))}</span>`}
        <span>${escapeHtml(m.name)}</span>
        ${role ? `<span style="font-size: 9.5px; font-weight: 600; color: ${role.color || 'var(--kb-text-muted)'}; background: ${role.color ? role.color + '22' : 'rgba(255,255,255,0.06)'}; padding: 1px 4px; border-radius: 3px;">@${escapeHtml(role.name)}</span>` : ''}
        <button type="button" class="board-member-pill-remove" data-remove-member-idx="${idx}" title="Quitar miembro" aria-label="Quitar">✕</button>
      </div>
    `;
    }).join('');

    membersListEl.querySelectorAll('[data-remove-member-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.removeMemberIdx);
        modalMembers.splice(idx, 1);
        renderMembersList();
        renderSuggestions();
        renderRolePicker();
      });
    });
  }

  function renderSuggestions() {
    if (!suggestionsEl) return;
    const addedIds = new Set(modalMembers.map((m) => String(m.id || m.name).toLowerCase()));
    const unadded = serverGuildMembers.filter((m) => !addedIds.has(String(m.id).toLowerCase()) && !addedIds.has(m.name.toLowerCase()));

    if (unadded.length === 0) {
      suggestionsEl.innerHTML = '';
      return;
    }

    suggestionsEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 4px;">
        <span style="font-size: 11px; color: var(--kb-text-muted);">Miembros del servidor (${unadded.length} disponibles):</span>
        ${unadded.length > 1 ? `<button type="button" id="btn-add-all-server-members" class="btn-secondary" style="height: 22px; padding: 0 8px; font-size: 11px; border-radius: 6px; cursor: pointer;">+ Añadir todos</button>` : ''}
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; width: 100%; max-height: 120px; overflow-y: auto; padding: 2px 0;">
        ${unadded.map((m) => {
          const role = getMemberRoleBadge(m);
          return `
          <button type="button" class="board-member-suggestion-btn" data-suggest-id="${escapeHtml(m.id)}" data-suggest-name="${escapeHtml(m.name)}" data-suggest-username="${escapeHtml(m.username || '')}" data-suggest-avatar="${escapeHtml(m.avatarUrl || '')}">
            ${m.avatarUrl
              ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.name)}" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;" />`
              : `<span>+</span>`}
            <span>${escapeHtml(m.name)}</span>
            ${role ? `<span style="font-size: 9.5px; font-weight: 600; color: ${role.color || 'var(--kb-text-muted)'}; background: ${role.color ? role.color + '22' : 'rgba(255,255,255,0.06)'}; padding: 1px 4px; border-radius: 3px;">@${escapeHtml(role.name)}</span>` : ''}
          </button>
        `;
        }).join('')}
      </div>
    `;

    suggestionsEl.querySelector('#btn-add-all-server-members')?.addEventListener('click', () => {
      for (const m of unadded) {
        modalMembers.push({ id: m.id, name: m.name, username: m.username || '', avatarUrl: m.avatarUrl || null });
      }
      renderMembersList();
      renderSuggestions();
      renderRolePicker();
    });

    suggestionsEl.querySelectorAll('[data-suggest-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.suggestId;
        const name = btn.dataset.suggestName;
        const username = btn.dataset.suggestUsername;
        const avatarUrl = btn.dataset.suggestAvatar || null;
        modalMembers.push({ id, name, username, avatarUrl });
        renderMembersList();
        renderSuggestions();
        renderRolePicker();
      });
    });
  }

  function renderRolePicker() {
    const roleWrap = backdrop.querySelector('#board-role-picker-wrap');
    const roleChipsEl = backdrop.querySelector('#board-role-chips');
    if (!roleWrap || !roleChipsEl) return;

    if (!Array.isArray(serverGuildRoles) || serverGuildRoles.length === 0) {
      roleWrap.style.display = 'none';
      return;
    }

    const addedIds = new Set(modalMembers.map((m) => String(m.id || m.name).toLowerCase()));
    const rolesWithCounts = serverGuildRoles.map((role) => {
      const roleMembers = serverGuildMembers.filter((m) => Array.isArray(m.roles) && m.roles.includes(role.id));
      const unaddedCount = roleMembers.filter((m) => !addedIds.has(String(m.id).toLowerCase())).length;
      return {
        role,
        total: roleMembers.length,
        unaddedCount,
        members: roleMembers,
      };
    }).filter((item) => item.total > 0);

    if (rolesWithCounts.length === 0) {
      roleWrap.style.display = 'none';
      return;
    }

    roleWrap.style.display = 'block';
    roleChipsEl.innerHTML = rolesWithCounts.map(({ role, total, unaddedCount }) => `
      <button type="button" class="board-role-btn" data-role-id="${escapeHtml(role.id)}" ${unaddedCount === 0 ? 'disabled' : ''} style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--kb-radius-pill); font-size: 11.5px; font-weight: 600; background: var(--kb-surface); border: 1px solid ${role.color || 'var(--kb-border-subtle)'}; color: ${role.color || 'var(--kb-text-primary)'}; cursor: ${unaddedCount === 0 ? 'default' : 'pointer'}; opacity: ${unaddedCount === 0 ? '0.45' : '1'}; transition: all 0.12s ease;">
        <span>@${escapeHtml(role.name)}</span>
        <span style="font-size: 10px; opacity: 0.85; padding: 1px 5px; border-radius: 8px; background: rgba(255,255,255,0.08);">${unaddedCount > 0 ? `+${unaddedCount}` : '✓'}</span>
      </button>
    `).join('');

    roleChipsEl.querySelectorAll('[data-role-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleId = btn.dataset.roleId;
        const item = rolesWithCounts.find((r) => r.role.id === roleId);
        if (!item || item.unaddedCount === 0) return;

        let addedThisTime = 0;
        for (const m of item.members) {
          if (!addedIds.has(String(m.id).toLowerCase())) {
            modalMembers.push({ id: m.id, name: m.name, username: m.username || '', avatarUrl: m.avatarUrl || null });
            addedIds.add(String(m.id).toLowerCase());
            addedThisTime += 1;
          }
        }
        renderMembersList();
        renderSuggestions();
        renderRolePicker();
        showToast(`Añadidos ${addedThisTime} miembros con el rol @${item.role.name}`, 'success');
      });
    });
  }

  function addManualMember(nameOrHandle) {
    const raw = String(nameOrHandle || '').trim();
    if (!raw) return;
    const cleanName = raw.replace(/^@/, '');
    const isId = /^\d{17,20}$/.test(cleanName);
    const existing = modalMembers.find((m) => m.name.toLowerCase() === cleanName.toLowerCase() || (m.id && m.id === cleanName));
    if (!existing) {
      modalMembers.push({
        id: isId ? cleanName : `m-${Date.now()}`,
        name: cleanName,
        username: isId ? '' : cleanName,
      });
      renderMembersList();
      renderSuggestions();
      renderRolePicker();
    }
    if (addInput) addInput.value = '';
    if (dropdownEl) dropdownEl.style.display = 'none';
  }

  addBtn?.addEventListener('click', () => {
    addManualMember(addInput?.value);
  });

  addInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualMember(addInput.value);
    }
  });

  addInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (!q || !dropdownEl) {
      if (dropdownEl) dropdownEl.style.display = 'none';
      return;
    }

    const qLower = q.toLowerCase().replace(/^@/, '');
    const addedIds = new Set(modalMembers.map((m) => String(m.id || m.name).toLowerCase()));
    const matches = serverGuildMembers.filter(
      (m) => !addedIds.has(String(m.id).toLowerCase()) &&
             !addedIds.has(m.name.toLowerCase()) &&
             (m.name.toLowerCase().includes(qLower) || (m.username && m.username.toLowerCase().includes(qLower)))
    );

    let html = '';
    if (matches.length > 0) {
      html += matches.map((m) => `
        <button type="button" class="member-menu-item" data-pick-id="${escapeHtml(m.id)}" data-pick-name="${escapeHtml(m.name)}" data-pick-username="${escapeHtml(m.username || '')}" data-pick-avatar="${escapeHtml(m.avatarUrl || '')}">
          ${m.avatarUrl
            ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.name)}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`
            : `<span class="member-avatar-mini">${escapeHtml(initials(m.name))}</span>`}
          <div class="member-info-col">
            <span class="member-name-text">${escapeHtml(m.name)}</span>
            ${m.username ? `<span class="member-handle-text">@${escapeHtml(m.username)}</span>` : ''}
          </div>
        </button>
      `).join('');
    } else if (q) {
      html = `<div style="padding: 10px 12px; font-size: 12px; color: var(--kb-text-dim); text-align: center;">No se encontraron miembros del servidor que coincidan</div>`;
    }

    dropdownEl.innerHTML = html;
    dropdownEl.style.display = 'flex';

    dropdownEl.querySelectorAll('[data-pick-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pickId;
        const name = btn.dataset.pickName;
        const username = btn.dataset.pickUsername;
        const avatarUrl = btn.dataset.pickAvatar || null;
        modalMembers.push({ id, name, username, avatarUrl });
        renderMembersList();
        renderSuggestions();
        renderRolePicker();
        if (addInput) addInput.value = '';
        dropdownEl.style.display = 'none';
      });
    });
  });

  function closeBoardModal() {
    backdrop.remove();
  }

  backdrop.querySelector('#btn-board-modal-close')?.addEventListener('click', closeBoardModal);
  backdrop.querySelector('#btn-board-modal-cancel')?.addEventListener('click', closeBoardModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeBoardModal();
  });

  renderColumnsList();
  renderMembersList();
  renderSuggestions();
  renderRolePicker();

  // Si aún no tenemos miembros o roles del servidor, consultamos la API con el guildId de la sesión
  if ((serverGuildMembers.length === 0 || serverGuildRoles.length === 0) && currentBoardId) {
    const guildQs = activeDiscordSdk?.guildId ? `?guild_id=${encodeURIComponent(activeDiscordSdk.guildId)}` : '';
    Promise.all([
      fetch(`/api/boards/${encodeURIComponent(currentBoardId)}/guild-members${guildQs}`, {
        headers: { Accept: 'application/json' },
      }).then((r) => r.json()).catch(() => null),
      fetch(`/api/boards/${encodeURIComponent(currentBoardId)}/guild-roles${guildQs}`, {
        headers: { Accept: 'application/json' },
      }).then((r) => r.json()).catch(() => null),
    ]).then(([membersData, rolesData]) => {
      if (Array.isArray(membersData?.members) && membersData.members.length > 0) {
        serverGuildMembers = membersData.members;
      }
      if (Array.isArray(rolesData?.roles) && rolesData.roles.length > 0) {
        serverGuildRoles = rolesData.roles;
      }
      renderMembersList();
      renderSuggestions();
      renderRolePicker();
    }).catch(() => {});
  }

  // Guardar configuración del tablero
  const form = backdrop.querySelector('#board-settings-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#board-name-input')?.value.trim();
    if (!name) return;
    const description = backdrop.querySelector('#board-desc-input')?.value.trim() || '';

    const submitBtn = backdrop.querySelector('#btn-board-modal-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await saveBoardSettingsRequest({
        name,
        description,
        columns: modalColumns,
        members: modalMembers,
      });

      if (currentBoardData) {
        currentBoardData = {
          ...currentBoardData,
          name,
          description,
          members: modalMembers,
          columns: modalColumns,
        };
      }

      closeBoardModal();
      showToast('Tablero actualizado', 'success');
      renderBoard(document.querySelector('#kanban-content'), currentBoardData);
    } catch (err) {
      console.error('Error guardando configuración del tablero:', err);
      showToast(err.message || 'No se pudo guardar la configuración', 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// API Requests
async function fetchBoard() {
  const params = new URLSearchParams();
  if (activeDiscordSdk?.guildId) {
    params.set('guild_id', activeDiscordSdk.guildId);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/boards/${encodeURIComponent(currentBoardId)}${qs}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data?.guildMembers) && data.guildMembers.length > 0) {
    serverGuildMembers = data.guildMembers;
  }
  if (Array.isArray(data?.guildRoles) && data.guildRoles.length > 0) {
    serverGuildRoles = data.guildRoles;
  }
  return data;
}

async function saveBoardSettingsRequest(payload) {
  if (!currentInstanceId) throw new Error('Se requiere contexto de Activity');
  const response = await fetch(`/api/boards/${encodeURIComponent(currentBoardId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': currentInstanceId,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `Error al actualizar tablero (HTTP ${response.status})`);
  }
  return response.json();
}

async function saveBoardColumnsRequest(columns) {
  if (!currentInstanceId) throw new Error('Se requiere contexto de Activity');
  const response = await fetch(`/api/boards/${encodeURIComponent(currentBoardId)}/columns`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': currentInstanceId,
    },
    body: JSON.stringify({ columns }),
  });
  if (!response.ok) throw new Error(`Error al guardar columnas (HTTP ${response.status})`);
  return response.json();
}

async function createTaskRequest(payload) {
  if (!currentInstanceId) throw new Error('Se requiere contexto de Activity');
  const response = await fetch(`/api/boards/${encodeURIComponent(currentBoardId)}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': currentInstanceId,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Error al crear tarea (HTTP ${response.status})`);
  return response.json();
}

async function updateTaskRequest(taskId, payload) {
  if (!currentInstanceId) throw new Error('Se requiere contexto de Activity');
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-bardo-instance-id': currentInstanceId,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Error al actualizar tarea (HTTP ${response.status})`);
  return response.json();
}

async function deleteTaskRequest(taskId) {
  if (!currentInstanceId) throw new Error('Se requiere contexto de Activity');
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: {
      'x-bardo-instance-id': currentInstanceId,
    },
  });
  if (!response.ok) throw new Error(`Error al borrar tarea (HTTP ${response.status})`);
  return response.json();
}

async function moveTaskOptimistic(taskId, status) {
  if (!currentInstanceId) {
    showToast('Sesión de Activity no identificada', 'error');
    return;
  }

  // Actualización optimista local
  if (currentBoardData?.tasks) {
    const task = currentBoardData.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      renderBoard(document.querySelector('#kanban-content'), currentBoardData);
    }
  }

  try {
    await updateTaskRequest(taskId, { status });
    await refreshBoard(false);
  } catch (error) {
    console.error('Error al mover tarea:', error);
    showToast('No se pudo mover la tarea', 'error');
    await refreshBoard(false);
  }
}

async function refreshBoard(isManual = false) {
  if (isSyncing || !currentBoardId) return;
  isSyncing = true;

  const syncBtn = document.querySelector('#btn-sync');
  const syncIndicator = document.querySelector('#sync-indicator');
  if (isManual && syncBtn) syncBtn.classList.add('is-spinning');
  if (syncIndicator) syncIndicator.textContent = 'Sincronizando…';

  try {
    const board = await fetchBoard();
    currentBoardData = board;

    // Solo re-renderizamos si no hay un modal abierto para no interrumpir al usuario
    if (!activeModalState && !draggedTaskId) {
      renderBoard(document.querySelector('#kanban-content'), board);
    }

    if (syncIndicator) syncIndicator.textContent = 'Actualizado';
  } catch (error) {
    console.error('Error sincronizando tablero:', error);
    if (isManual) showToast('Error al conectar con Bardo', 'error');
    if (syncIndicator) syncIndicator.textContent = 'Sin conexión';
  } finally {
    isSyncing = false;
    if (syncBtn) syncBtn.classList.remove('is-spinning');
  }
}

function startPolling() {
  if (syncTimer) clearInterval(syncTimer);

  syncTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !activeModalState && !draggedTaskId) {
      refreshBoard(false);
    }
  }, 7500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshBoard(false);
    }
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
    startPolling();
  } catch (error) {
    console.error('No se pudo abrir el tablero:', error);
    container.className = 'kanban-state';
    container.innerHTML = `
      <strong>No pudimos abrir este tablero</strong>
      <p>Cierra esta vista y vuelve a abrirlo desde el mensaje de Bardo en Discord.</p>
    `;
  }
}

startBoard();
