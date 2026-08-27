import {
  computePlannerTimes,
} from './time-engine.js';

export const PLANNER_STORE_KEY = 'bardo-planner-session-state-v1';

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
      tasks: [],
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
        {id: 'p-1', title: 'Novedades del equipo y de proyectos', presenter: 'Todos', status: 'done'},
        {id: 'p-2', title: 'Coordinación sobre Minuta Weekly', presenter: 'Pau', status: 'done'},
        {id: 'p-3', title: 'Agenda de la sesión', presenter: 'Pau', status: 'done'},
      ],
      decisions: [
        {id: 'd-1', content: 'Se aprueba el nuevo flujo de minutas en Bardo Docs.'},
      ],
      tasks: [],
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
        {id: 'd-2', content: 'Maxi actualizará los breadcrumbs de navegación del prototipo antes del viernes.'},
      ],
      tasks: [
        {id: 't-1', title: 'Compartir enlace a prototipo navegable Figma en el canal #orion', assignee: '@Max Avendaño'},
      ],
    },
    {
      id: 'b-3',
      title: 'Break',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todos',
      participants: 'Todo el equipo',
      introDesc: 'Pausa para descansar y prepararnos para la siguiente revisión.',
      phases: {context: 0, review: 10, closing: 0},
      subpoints: [],
      decisions: [],
      tasks: [],
    },
    {
      id: 'b-4',
      title: 'Revisión de diseño | Ecommerce',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Dani y Javi',
      participants: 'Diseño & SD + Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-7', title: 'Catálogo de equipos: comentarios de la Demo', presenter: 'Dani', status: 'pending'},
        {id: 'p-8', title: 'Landing Apple con Integración Claro Up', presenter: 'Javi', status: 'pending'},
        {id: 'p-9', title: 'Avance landing factibilidad (opcional)', presenter: 'Dani / Javi', status: 'pending'},
      ],
      decisions: [],
      tasks: [
        {id: 't-2', title: 'Enviar especificaciones de Claro Up al equipo de desarrollo', assignee: '@Javi Acuña'},
      ],
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
      decisions: [],
      tasks: [
        {id: 't-3', title: 'Detalle de pedida SSO Registro entregado a Maxi para estimación', assignee: '@Max Avendaño'},
      ],
    },
  ],
};

export function loadPlannerState() {
  try {
    const raw = localStorage.getItem(PLANNER_STORE_KEY);
    if (!raw) return computePlannerTimes(DEFAULT_EMPTY_SESSION);
    const parsed = JSON.parse(raw);
    return computePlannerTimes(parsed);
  } catch {
    return computePlannerTimes(DEFAULT_EMPTY_SESSION);
  }
}

export function savePlannerState(state) {
  try {
    localStorage.setItem(PLANNER_STORE_KEY, JSON.stringify(state));
  } catch {}
}

export function resetToDemoFixture() {
  const demo = computePlannerTimes(DEMO_PLANNER_FIXTURE);
  savePlannerState(demo);
  return demo;
}

export function resetToCleanSession() {
  const clean = computePlannerTimes(DEFAULT_EMPTY_SESSION);
  savePlannerState(clean);
  return clean;
}

export function generateDiscordAnnouncement(state) {
  const computed = computePlannerTimes(state);
  let msg = '';
  if (computed.title) {
    msg += `**${computed.title}**\n\n`;
  }
  if (computed.host) {
    msg += `**Conduce:** ${computed.host}\n\n`;
  }
  if (computed.date || computed.startTime) {
    msg += `**Horario:** ${computed.date || ''} a las ${computed.startTime || '10:00'} (${computed.totalCalculatedDuration || 0} min totales)\n\n`;
  }
  if (computed.description) {
    msg += `${computed.description}\n\n`;
  }

  (computed.blocks || []).forEach(b => {
    msg += `**${b.title}** (${b.durationMinutes} min)\n\n`;
    if (b.leader) msg += `*Lidera:* ${b.leader}\n\n`;
    if ((b.subpoints || []).length > 0) {
      msg += `Puntos a tratar:\n`;
      b.subpoints.forEach(p => {
        const pres = p.presenter ? ` (Presenta ${p.presenter})` : '';
        msg += `- ${p.title}${pres}\n`;
      });
      msg += '\n';
    }
    if (b.participants) msg += `*Participan:* ${b.participants}\n\n`;
    msg += `--------------------------------------------------\n\n`;
  });

  if (computed.mentions) {
    msg += `${computed.mentions} Aquí pueden revisar la agenda de la sesión.`;
  }
  return msg;
}

export function generateMinutesMarkdown(state) {
  const computed = computePlannerTimes(state);
  let md = `# Acta: ${computed.title}\n\n`;
  md += `**Fecha:** ${computed.date || 'Sin fecha'} | **Moderador:** ${computed.host || 'Sin asignar'} | **Duración Total:** ${computed.totalCalculatedDuration || 0} min\n\n`;

  md += `## 1. Decisiones y acuerdos tomados\n`;
  let hasDecisions = false;
  (computed.blocks || []).forEach(b => {
    (b.decisions || []).forEach(d => {
      hasDecisions = true;
      md += `- **${d.content}** *(Bloque: ${b.title})*\n`;
    });
  });
  if (!hasDecisions) md += `*No se registraron decisiones formales en esta sesión.*\n`;

  md += `\n## 2. Compromisos y tareas asignadas\n`;
  let hasTasks = false;
  (computed.blocks || []).forEach(b => {
    (b.tasks || []).forEach(t => {
      hasTasks = true;
      md += `- [ ] **${t.title}** — Responsable: ${t.assignee || 'Sin asignar'} *(Ref: ${b.title})*\n`;
    });
  });
  if (!hasTasks) md += `*No se asignaron tareas en esta sesión.*\n`;

  md += `\n## 3. Resumen de temas tratados\n`;
  if ((computed.blocks || []).length === 0) {
    md += `*Sin bloques registrados en la sesión.*\n`;
  } else {
    computed.blocks.forEach(b => {
      md += `### ${b.title} (${b.durationMinutes} min)\n`;
      if (b.leader) md += `*Lidera:* ${b.leader}\n`;
      if ((b.subpoints || []).length > 0) {
        b.subpoints.forEach(p => {
          const check = p.status === 'done' ? '[x]' : '[ ]';
          const pres = p.presenter ? ` · ${p.presenter}` : '';
          md += `- ${check} ${p.title}${pres}\n`;
        });
      }
      md += '\n';
    });
  }

  return md;
}
