// Convierte data.mjs en lo que la app lee en modo local (sin Discord):
// claves de localStorage + variables globales que en producción llegan del
// contexto del canal. Usa el mismo conversor Markdown → HTML de la app.
import {markdownToHtml} from '../../activity-app/src/editor/bardo-markdown.js';
import {
  CHANNEL, CURRENT_USER, DOCS, KANBAN_CARDS, KANBAN_COLUMNS, KANBAN_TAGS, MEETINGS,
  MEMBERS, ROLES, TIME_ZONE, WEEKLY_ID, WORKSPACE_NAME,
} from './data.mjs';

const RANKS = 'BDFHJLNPRTVXZ';

function docsStore() {
  return {
    version: 1,
    deletedIds: [],
    docs: DOCS.map(({markdown, ...doc}) => ({
      builtin: false,
      stress: false,
      importStatus: 'ready',
      hasSource: Boolean(doc.sourceName),
      ...doc,
      body: markdownToHtml(markdown, doc.title),
    })),
  };
}

function kanbanState() {
  const perColumn = new Map();
  const cards = {};
  for (const card of KANBAN_CARDS) {
    const index = perColumn.get(card.columnId) || 0;
    perColumn.set(card.columnId, index + 1);
    const id = `card-${card.number}`;
    cards[id] = {
      id,
      description: '',
      assignee: null,
      priority: 'normal',
      dueDate: null,
      tagIds: [],
      subtasks: [],
      docIds: [],
      sourceRef: null,
      threadId: null,
      threadPending: false,
      notifications: {channel: null, dm: null},
      version: 1,
      rev: 0,
      completedAt: null,
      archivedAt: null,
      createdAt: '2026-10-05T13:00:00.000Z',
      updatedAt: '2026-10-18T13:00:00.000Z',
      ...card,
      rank: RANKS[index],
    };
  }
  return {
    board: {id: 'local-board', guildId: null, channelId: null, columns: KANBAN_COLUMNS, tags: KANBAN_TAGS},
    cards,
    cursor: 0,
    structureRev: 0,
  };
}

/** Agenda abierta al entrar a Reuniones (la Weekly de hoy). */
function openMeeting() {
  const weekly = MEETINGS.find(meeting => meeting.id === WEEKLY_ID);
  const {status: _status, hostName, ...rest} = weekly;
  return {...rest, eventId: weekly.id, host: hostName, liveActiveBlockId: null};
}

export function buildSeed({theme = 'dark'} = {}) {
  return {
    storage: {
      'bardo.docs.heroui.v1': docsStore(),
      'bardo.kanban.board.v1': kanbanState(),
      'bardo-planner-session-state-v1': openMeeting(),
      'bardo.workspace.name.v1': WORKSPACE_NAME,
      'bardo-theme-preference': theme,
      'bardo.beta-notice.dismissed.v1': '1',
    },
    globals: {
      __BARDO_USER__: CURRENT_USER,
      __bardoChannelContext: {
        ...CHANNEL,
        timeZone: TIME_ZONE,
        roles: ROLES,
        members: MEMBERS.map(({role: _role, ...member}) => member),
      },
      __bardoChannelSessions: MEETINGS,
    },
  };
}
