import {computePlannerTimes} from './time-engine.js';
import {
  DEFAULT_LIVE_SESSION,
  POINT_STATUS,
  SESSION_STATUS,
  getPointStatus,
  migrateLiveSessionState,
} from './session-runner.js';

export const PLANNER_STORE_KEY = 'bardo-planner-session-state-v1';
export const LIVE_SESSION_STORE_KEY = 'bardo-planner-live-session-v1';

export const DEFAULT_EMPTY_SESSION = {
  title: 'Nueva sesión de trabajo',
  host: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '10:00',
  targetDuration: 60,
  description: '',
  mentions: '',
  liveActiveBlockId: null,
  blocks: [
    {
      id: 'b-default-1',
      title: 'Apertura y objetivos',
      durationMinutes: 15,
      manualDuration: 15,
      leader: '',
      participants: '',
      phases: {context: 3, review: 10, closing: 2},
      subpoints: [],
      decisions: [],
    },
  ],
};

export const DEMO_PLANNER_FIXTURE = {
  title: 'Weekly Diseño & SD',
  host: 'Paula Molina',
  date: '2026-08-19',
  startTime: '17:45',
  targetDuration: 180,
  description: 'Revisión de los avances de proyectos, feedback y acuerdos del equipo para continuar la semana.',
  mentions: '@Nico G @Camila Carreño @Daniela @Javi Acuña @Max Avendaño @Carol T @Karola',
  liveActiveBlockId: null,
  blocks: [
    {
      id: 'b-1',
      title: 'Check-in, contexto y novedades',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todo el equipo',
      participants: 'Diseño & SD + Carol, Karola y Nico',
      introDesc: 'Puesta al día para alinearnos como equipo.',
      phases: {context: 2, review: 6, closing: 2},
      subpoints: [
        {id: 'p-1', title: 'Novedades del equipo y de proyectos', presenter: 'Todos', status: 'done', recordingDurationMs: 15000},
        {id: 'p-2', title: 'Coordinación sobre Minuta Weekly', presenter: 'Pau', status: 'done', recordingDurationMs: 42000},
        {id: 'p-3', title: 'Agenda de la sesión', presenter: 'Pau', status: 'done', recordingDurationMs: 11000},
      ],
      decisions: [{id: 'd-1', content: 'Se aprueba el nuevo flujo de minutas en Bardo Docs.', owner: 'Pau'}],
    },
    {
      id: 'b-2',
      title: 'Revisión de diseño | ORION',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Cami y Pau',
      participants: 'Diseño & SD + Carol, Karola y Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-4', title: 'Prototipo navegable - Mi Plan', presenter: 'Maxi', status: 'pending'},
        {id: 'p-5', title: 'Flujo Bloqueo de SIM - Ayuda', presenter: 'Cami', status: 'pending'},
        {id: 'p-6', title: 'Propuestas para mejorar el proceso de diseño', presenter: 'Todos', status: 'pending'},
      ],
      decisions: [
        {id: 'd-2', content: 'Maxi actualizará los breadcrumbs de navegación del prototipo antes del viernes.', owner: 'Maxi'},
        {id: 'd-3', content: 'Compartir enlace al prototipo navegable Figma en el canal #orion.'},
      ],
    },
    {
      id: 'b-3',
      title: 'Break',
      type: 'break',
      isBreak: true,
      durationMinutes: 10,
      manualDuration: 10,
      leader: '',
      participants: '',
      introDesc: '',
      phases: {context: 0, review: 10, closing: 0},
      subpoints: [],
      decisions: [],
    },
    {
      id: 'b-4',
      title: 'Revisión de diseño | Ecommerce',
      durationMinutes: 40,
      manualDuration: 40,
      leader: 'Dani y Javi',
      participants: 'Diseño & SD + Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-7', title: 'Catálogo de equipos: comentarios de la Demo', presenter: 'Dani', status: 'pending'},
        {id: 'p-8', title: 'Landing Apple con Integración Claro Up', presenter: 'Javi', status: 'pending'},
        {id: 'p-9', title: 'Avance landing factibilidad (opcional)', presenter: 'Dani / Javi', status: 'pending'},
      ],
      decisions: [{id: 'd-4', content: 'Enviar especificaciones finales de Claro Up al equipo de desarrollo.', owner: 'Dani'}],
    },
    {
      id: 'b-5',
      title: 'Otros proyectos + Sistema de Diseño',
      durationMinutes: 40,
      manualDuration: 40,
      leader: 'Responsable de cada proyecto',
      participants: 'Diseño & SD, Nico y stakeholders',
      phases: {context: 5, review: 30, closing: 5},
      subpoints: [
        {id: 'p-10', title: 'Landing OTT Mascotas (avances y soluciones)', presenter: 'Responsable', status: 'pending'},
        {id: 'p-11', title: 'Pantallas SSO para el flujo de Registro', presenter: 'Pau / Maxi', status: 'pending'},
      ],
      decisions: [{id: 'd-5', content: 'Detalle de pedida SSO Registro entregado a Maxi para estimación.', owner: 'Pau'}],
    },
    {
      id: 'b-6',
      title: 'Revisión de producto y analítica',
      durationMinutes: 35,
      manualDuration: 35,
      leader: 'Nico G',
      participants: 'Diseño & SD + @Devs',
      introDesc: 'Cruzar señales de producto con las decisiones de diseño.',
      phases: {context: 5, review: 25, closing: 5},
      subpoints: [
        {id: 'p-12', title: 'Hallazgos de uso y embudo de activación', presenter: 'Nico G', status: 'pending'},
        {id: 'p-13', title: 'Eventos faltantes para medir el nuevo flujo', presenter: 'Max Avendaño', status: 'pending'},
        {id: 'p-14', title: 'Riesgos de instrumentación antes del release', presenter: 'Equipo de Desarrollo', status: 'pending'},
      ],
      decisions: [
        {id: 'd-6', content: 'Definir un dueño por evento antes de cerrar la especificación.', owner: 'Nico'},
      ],
    },
    {
      id: 'b-7',
      title: 'Priorización y próximos pasos',
      durationMinutes: 25,
      manualDuration: 25,
      leader: 'Paula Molina',
      participants: 'Todo el equipo',
      introDesc: 'Convertir la revisión en compromisos claros para la semana.',
      phases: {context: 3, review: 17, closing: 5},
      subpoints: [
        {id: 'p-15', title: 'Dependencias y bloqueos activos', presenter: 'Pau', status: 'pending'},
        {id: 'p-16', title: 'Responsables y fechas de seguimiento', presenter: 'Todos', status: 'pending'},
      ],
      decisions: [],
    },
    {
      id: 'b-8',
      title: 'Cierre y síntesis',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todo el equipo',
      participants: 'Diseño & SD',
      introDesc: 'Recapitular acuerdos y confirmar la próxima sesión.',
      phases: {context: 2, review: 5, closing: 3},
      subpoints: [
        {id: 'p-17', title: 'Confirmar acuerdos que pasan a la minuta', presenter: 'Pau', status: 'pending'},
      ],
      decisions: [{id: 'd-7', content: 'La minuta se comparte en el canal antes del cierre del día.', owner: 'Pau'}],
    },
  ],
};

function clonePlannerState(state) {
  return JSON.parse(JSON.stringify(state));
}

function createDemoEvent(eventId, overrides = {}) {
  const event = clonePlannerState(DEMO_PLANNER_FIXTURE);
  return {
    ...event,
    eventId,
    eventStatus: 'scheduled',
    ...overrides,
    blocks: overrides.blocks || event.blocks,
  };
}

// Home fixture: intentionally varied so the event index exercises dates,
// durations, participants, completed work and dense agendas together.
export const DEMO_PLANNER_EVENTS = [
  createDemoEvent('event-weekly-design', {
    eventStatus: 'scheduled',
    title: 'Weekly de diseño & SD',
    date: '2026-08-19',
    startTime: '17:45',
    description: 'Revisión semanal de avances, feedback y acuerdos del equipo.',
  }),
  createDemoEvent('event-orion-review', {
    eventStatus: 'in_progress',
    title: 'Revisión de producto · ORION',
    date: '2026-08-20',
    startTime: '10:00',
    host: 'Camila Carreño',
    description: 'Validación del flujo de Mi Plan y próximos ajustes del prototipo.',
    blocks: DEMO_PLANNER_FIXTURE.blocks.slice(1, 3).map((block) => clonePlannerState(block)),
  }),
  createDemoEvent('event-ecommerce-critique', {
    eventStatus: 'scheduled',
    title: 'Crítica de diseño · Ecommerce',
    date: '2026-08-21',
    startTime: '15:30',
    host: 'Daniela',
    description: 'Sesión de crítica para catálogo, landing y factibilidad comercial.',
    blocks: DEMO_PLANNER_FIXTURE.blocks.slice(3, 5).map((block) => clonePlannerState(block)),
  }),
  createDemoEvent('event-retro-release', {
    eventStatus: 'completed',
    title: 'Retro de release 2.0',
    date: '2026-08-22',
    startTime: '11:00',
    host: 'Paula Molina',
    description: 'Qué funcionó, qué debemos ajustar y qué llevamos al siguiente ciclo.',
    blocks: DEMO_PLANNER_FIXTURE.blocks.map((block) => ({
      ...clonePlannerState(block),
      subpoints: (block.subpoints || []).slice(0, 2).map((point) => ({...point, status: 'done'})),
    })),
  }),
];

export function isProductionActivity() {
  if (typeof window === 'undefined') return false;
  if (window.__BARDO_PRODUCTION__) return true;
  const params = new URLSearchParams(window.location.search);
  return params.has('instance_id') || params.has('frame_id') || /\.discordsays\.com$/i.test(window.location.hostname || '');
}

export function shouldLoadDemoFixture() {
  if (typeof window === 'undefined') return false;
  if (isProductionActivity()) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === '1';
}

export function isDemoPlannerState(state) {
  if (!state || typeof state !== 'object') return false;
  return state.id === 'demo-session-weekly-design'
    || state.sessionId === 'demo-session-weekly-design'
    || state.title === 'Weekly de Diseño & SD'
    || state.title === 'Weekly Diseño & SD'
    || (state.host === 'Camila' && (state.mentions || '').includes('@diseño'));
}

export function loadPlannerEvents() {
  if (typeof window !== 'undefined') {
    const channelSessions = window.__bardoChannelSessions || [];
    if (channelSessions.length > 0) {
      return channelSessions.map((s) => ({
        eventId: s.id,
        id: s.id,
        eventStatus: s.status === 'live' ? 'in_progress' : s.status,
        title: s.title,
        date: s.date,
        startTime: s.startTime,
        host: s.hostName || s.host || '',
        description: s.description || '',
        blocks: (s.blocks || []).map(clonePlannerState),
      }));
    }
    if (!shouldLoadDemoFixture()) {
      return [];
    }
  }
  if (!shouldLoadDemoFixture()) {
    return [];
  }
  return DEMO_PLANNER_EVENTS.map(clonePlannerState);
}

export function loadPlannerState() {
  try {
    const raw = localStorage.getItem(PLANNER_STORE_KEY);
    if (!raw) {
      if (shouldLoadDemoFixture()) {
        return computePlannerTimes(DEMO_PLANNER_FIXTURE);
      }
      const u = typeof window !== 'undefined' ? window.__BARDO_USER__ : null;
      const host = u?.global_name || u?.username || '';
      return computePlannerTimes({
        ...DEFAULT_EMPTY_SESSION,
        id: `sess-${Date.now().toString(36)}`,
        host,
        date: new Date().toISOString().split('T')[0],
      });
    }
    const parsed = JSON.parse(raw);
    if (!shouldLoadDemoFixture() && isDemoPlannerState(parsed)) {
      try {
        localStorage.removeItem(PLANNER_STORE_KEY);
      } catch {}
      const u = typeof window !== 'undefined' ? window.__BARDO_USER__ : null;
      const host = u?.global_name || u?.username || '';
      const clean = computePlannerTimes({
        ...DEFAULT_EMPTY_SESSION,
        id: `sess-${Date.now().toString(36)}`,
        host,
        date: new Date().toISOString().split('T')[0],
      });
      savePlannerState(clean);
      return clean;
    }
    return computePlannerTimes(parsed);
  } catch {
    if (shouldLoadDemoFixture()) {
      return computePlannerTimes(DEMO_PLANNER_FIXTURE);
    }
    const u = typeof window !== 'undefined' ? window.__BARDO_USER__ : null;
    const host = u?.global_name || u?.username || '';
    return computePlannerTimes({
      ...DEFAULT_EMPTY_SESSION,
      id: `sess-${Date.now().toString(36)}`,
      host,
      date: new Date().toISOString().split('T')[0],
    });
  }
}

export function savePlannerState(state) {
  try {
    localStorage.setItem(PLANNER_STORE_KEY, JSON.stringify(state));
  } catch {
    // Local storage persistence fallback.
  }
}

function normalizeReloadedRecording(recording) {
  if (!recording || typeof recording !== 'object') return recording;
  const {blobUrl: _blobUrl, blob: _blob, ...metadata} = recording;
  if (metadata.binaryStorage === 'indexeddb') {
    return {...metadata, blobUrl: '', status: 'pending', persistenceError: null};
  }
  return {
    ...metadata,
    blobUrl: '',
    status: 'error',
    persistenceError: metadata.persistenceError || 'El audio de esta grabación no fue persistido y no puede recuperarse tras recargar.',
  };
}

export function createDemoLiveSession(_plannerState = DEMO_PLANNER_FIXTURE, now = Date.now()) {
  const activeBlockStartedAt = now - 85000;
  return {
    ...DEFAULT_LIVE_SESSION,
    sessionId: 'demo-session-weekly-design',
    status: SESSION_STATUS.RUNNING,
    scheduledStartAt: activeBlockStartedAt - 10 * 60 * 1000,
    sessionStartedAt: activeBlockStartedAt - 10 * 60 * 1000,
    liveActiveBlockId: 'b-2',
    liveActivePointId: 'p-4',
    activeBlockStartedAt,
    activePointStartedAt: activeBlockStartedAt,
    completedBlockIds: ['b-1'],
    skippedBlockIds: [],
    pointStatuses: {
      'p-1': POINT_STATUS.DONE,
      'p-2': POINT_STATUS.DONE,
      'p-3': POINT_STATUS.DONE,
      'p-4': POINT_STATUS.ACTIVE,
      'p-5': POINT_STATUS.PENDING,
      'p-6': POINT_STATUS.PENDING,
    },
    recordings: [
      {
        id: 'rec-demo-p-1',
        name: 'Punto: Novedades del equipo y de proyectos',
        blockId: 'b-1',
        blockTitle: 'Check-in, contexto y novedades',
        pointId: 'p-1',
        pointTitle: 'Novedades del equipo y de proyectos',
        durationMs: 15000,
        createdAt: activeBlockStartedAt - 8 * 60 * 1000,
        status: 'saved',
      },
      {
        id: 'rec-demo-p-2',
        name: 'Punto: Coordinación sobre Minuta Weekly',
        blockId: 'b-1',
        blockTitle: 'Check-in, contexto y novedades',
        pointId: 'p-2',
        pointTitle: 'Coordinación sobre Minuta Weekly',
        durationMs: 42000,
        createdAt: activeBlockStartedAt - 5 * 60 * 1000,
        status: 'saved',
      },
      {
        id: 'rec-demo-p-3',
        name: 'Punto: Agenda de la sesión',
        blockId: 'b-1',
        blockTitle: 'Check-in, contexto y novedades',
        pointId: 'p-3',
        pointTitle: 'Agenda de la sesión',
        durationMs: 11000,
        createdAt: activeBlockStartedAt - 2 * 60 * 1000,
        status: 'saved',
      },
    ],
    decisions: [
      {id: 'd-1', content: 'Se aprueba el nuevo flujo de minutas en Bardo Docs.', owner: 'Pau', pointId: 'p-2'},
      {id: 'd-2', content: 'Maxi actualizará los breadcrumbs de navegación del prototipo antes del viernes.', owner: 'Maxi', pointId: 'p-4'},
      {id: 'd-3', content: 'Compartir enlace al prototipo navegable Figma en el canal #orion.', pointId: 'p-4'},
    ],
  };
}

export function loadLiveSessionState(plannerState = null) {
  try {
    const raw = localStorage.getItem(LIVE_SESSION_STORE_KEY);
    if (!raw) {
      if (shouldLoadDemoFixture() && (plannerState?.title === 'Weekly Diseño & SD' || plannerState?.title?.includes('Weekly Diseño'))) {
        return createDemoLiveSession(plannerState);
      }
      return {...DEFAULT_LIVE_SESSION};
    }
    const parsed = JSON.parse(raw);
    if (!shouldLoadDemoFixture() && (parsed?.sessionId === 'demo-session-weekly-design' || parsed?.sessionId?.startsWith('demo-session-'))) {
      try {
        localStorage.removeItem(LIVE_SESSION_STORE_KEY);
      } catch {}
      return {...DEFAULT_LIVE_SESSION};
    }
    const migrated = migrateLiveSessionState(plannerState, parsed);
    return {
      ...migrated,
      recordings: (migrated.recordings || []).map(normalizeReloadedRecording),
    };
  } catch {
    return {...DEFAULT_LIVE_SESSION};
  }
}

export function serializeLiveSessionState(sessionState) {
  return {
    ...sessionState,
    recordings: (sessionState?.recordings || []).map((recording) => {
      const {blob: _blob, blobUrl: _blobUrl, ...metadata} = recording;
      return metadata;
    }),
  };
}

export function saveLiveSessionState(sessionState) {
  try {
    localStorage.setItem(LIVE_SESSION_STORE_KEY, JSON.stringify(serializeLiveSessionState(sessionState)));
  } catch {
    // Local storage persistence fallback.
  }
}

export function clearLiveSessionState() {
  try {
    localStorage.removeItem(LIVE_SESSION_STORE_KEY);
  } catch {
    // Local storage persistence fallback.
  }
}

export function resetToDemoFixture() {
  const computed = computePlannerTimes(DEMO_PLANNER_FIXTURE);
  savePlannerState(computed);
  const demoLive = createDemoLiveSession(computed);
  saveLiveSessionState(demoLive);
  return computed;
}

export function resetToCleanSession() {
  const u = typeof window !== 'undefined' ? window.__BARDO_USER__ : null;
  const host = u?.global_name || u?.username || '';
  const cleanSession = {
    ...DEFAULT_EMPTY_SESSION,
    id: `sess-${Date.now().toString(36)}`,
    host: host || DEFAULT_EMPTY_SESSION.host,
    date: new Date().toISOString().split('T')[0],
  };
  const computed = computePlannerTimes(cleanSession);
  savePlannerState(computed);
  clearLiveSessionState();
  return computed;
}

export async function deletePlannerSessionById(sessionId) {
  if (!sessionId) return;
  if (typeof window !== 'undefined' && Array.isArray(window.__bardoChannelSessions)) {
    window.__bardoChannelSessions = window.__bardoChannelSessions.filter((s) => s.id !== sessionId);
  }

  // Notificar al backend si estamos en producción con token de sesión
  if (typeof window !== 'undefined' && (window.__BARDO_PRODUCTION__ || window.__BARDO_SESSION_TOKEN__)) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(window.__BARDO_SESSION_TOKEN__ ? { Authorization: `Bearer ${window.__BARDO_SESSION_TOKEN__}` } : {}),
        ...(window.__BARDO_CUSTOM_ID__ ? { 'x-bardo-custom-id': window.__BARDO_CUSTOM_ID__ } : {}),
        ...(window.__BARDO_INSTANCE_ID__ ? { 'x-bardo-instance-id': window.__BARDO_INSTANCE_ID__ } : {}),
      };
      await fetch(`/api/planner/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers,
      });
    } catch (err) {
      console.error('Bardo Planner: error eliminando sesión en servidor', err);
    }
  }
}

export function generateDiscordAnnouncement(plannerState) {
  const computed = computePlannerTimes(plannerState);
  const mentions = (computed.mentions || '').trim();
  const dateStr = computed.date || 'Fecha por confirmar';
  const startStr = computed.startTime || '10:00';
  const totalMin = computed.totalCalculatedDuration || 0;

  let text = `📢 **Convocatoria: ${computed.title}**\n`;
  if (mentions) text += `👥 ${mentions}\n`;
  text += `📅 **Fecha:** ${dateStr} · ⏰ **Hora:** ${startStr} (${totalMin} min)\n`;
  if (computed.host) text += `👤 **Modera:** ${computed.host}\n`;
  if (computed.description) text += `\n> ${computed.description}\n`;

  text += `\n**📋 Agenda de la sesión:**\n`;
  (computed.blocks || []).forEach((block, index) => {
    if (block.isBreak) {
      text += `☕ *${block.title || 'Break'} (${block.durationMinutes}m)*\n`;
      return;
    }
    text += `${index + 1}. **${block.title}** (${block.durationMinutes}m)`;
    if (block.leader) text += ` — *Lidera: ${block.leader}*`;
    text += '\n';
    for (const point of block.subpoints || []) {
      const presenter = point.presenter ? ` · ${point.presenter}` : '';
      text += `   • ${point.title}${presenter}\n`;
    }
  });
  return text;
}

export function generateMinutesMarkdown(plannerState, sessionState = null) {
  const computed = computePlannerTimes(plannerState);
  
  // Recopilar todas las decisiones
  const allDecisions = [];
  for (const block of computed.blocks || []) {
    for (const decision of block.decisions || []) {
      allDecisions.push({
        id: decision.id,
        content: decision.content,
        owner: decision.owner || null,
        blockId: block.id,
        blockTitle: block.title,
        origin: block.title,
      });
    }
  }
  for (const decision of sessionState?.decisions || []) {
    const block = (computed.blocks || []).find((candidate) => candidate.id === decision.blockId);
    const point = (block?.subpoints || []).find((candidate) => candidate.id === decision.pointId);
    if (!allDecisions.some((existing) => existing.content === decision.content)) {
      allDecisions.push({
        id: decision.id,
        content: decision.content,
        owner: decision.owner || null,
        blockId: block?.id || null,
        blockTitle: block?.title || 'Reunión',
        origin: point ? `${block?.title} → ${point.title}` : (block?.title || 'Reunión'),
      });
    }
  }

  let markdown = `# Acta: ${computed.title}\n\n`;
  markdown += `> **Fecha:** ${computed.date || 'Sin fecha'} | **Organiza:** ${computed.host || 'Sin asignar'} | **Duración Total:** ${computed.totalCalculatedDuration || 0} min | **Acuerdos:** ${allDecisions.length}\n\n`;
  markdown += `---\n\n`;

  markdown += '## 📋 Resumen de Acuerdos Principales\n\n';
  if (allDecisions.length > 0) {
    for (const decision of allDecisions) {
      const ownerStr = decision.owner ? ` | 👤 **Responsable:** @${decision.owner.replace(/^@/, '')}` : '';
      markdown += `- ✅ **${decision.content}**\n  *📌 Origen: ${decision.origin}${ownerStr}*\n\n`;
    }
  } else {
    markdown += '*No se registraron decisiones en esta reunión.*\n\n';
  }

  markdown += `---\n\n`;
  markdown += '## ⏱️ Desglose de Agenda por Bloques\n\n';

  if ((computed.blocks || []).length === 0) {
    markdown += '*Sin bloques registrados en la reunión.*\n';
  } else {
    for (const [idx, block] of computed.blocks.entries()) {
      markdown += `### ${idx + 1}. ${block.title} (${block.durationMinutes} min)\n`;
      if (block.leader) markdown += `* **Conduce:** ${block.leader}\n`;
      if (block.introDesc) markdown += `* **Objetivo:** ${block.introDesc}\n`;
      markdown += '\n';

      const blockDecisions = allDecisions.filter((d) => d.blockId === block.id || d.origin.startsWith(block.title));
      if (blockDecisions.length > 0) {
        markdown += `**Acuerdos de este bloque:**\n`;
        for (const decision of blockDecisions) {
          const ownerStr = decision.owner ? ` (@${decision.owner.replace(/^@/, '')})` : '';
          markdown += `- ✅ ${decision.content}${ownerStr}\n`;
        }
        markdown += '\n';
      }

      if ((block.subpoints || []).length > 0) {
        markdown += `**Temas de la agenda:**\n`;
        for (const point of block.subpoints) {
          const status = sessionState ? getPointStatus(sessionState, point.id) : point.status;
          const marker = status === POINT_STATUS.DONE ? '[x]' : status === POINT_STATUS.SKIPPED ? '[-]' : '[ ]';
          const presenter = point.presenter ? ` · *${point.presenter}*` : '';
          const statusText = status === POINT_STATUS.DONE ? ' *(Tratado)*' : status === POINT_STATUS.SKIPPED ? ' *(Saltado)*' : '';
          markdown += `- ${marker} ${point.title}${presenter}${statusText}\n`;
        }
        markdown += '\n';
      }

      markdown += `---\n\n`;
    }
  }

  return markdown;
}
