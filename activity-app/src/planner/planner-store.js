import {computePlannerTimes} from './time-engine.js';

export const PLANNER_STORE_KEY = 'bardo.planner.state.v2';

/**
 * Plantilla inicial para sesiones nuevas en producción.
 * Comienza limpia, sin reuniones ficticias ni estados "Live" artificiales.
 */
export const DEFAULT_EMPTY_SESSION = {
  title: 'Nueva Sesión de Trabajo',
  host: '',
  date: new Date().toISOString().slice(0, 10),
  startTime: '10:00',
  targetDuration: 60,
  description: '',
  mentions: '',
  liveActiveBlockId: null,
  blocks: [],
};

/**
 * Fixture de demostración conservado para previews, tests y onboarding guiado.
 */
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
      emoji: '🟢',
      title: 'Check-in, contexto y novedades',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todo el equipo',
      participants: 'Diseño & SD + Carol, Karola y Nico',
      introDesc: 'Puesta al día para alinearnos como equipo.',
      phases: {context: 2, review: 6, closing: 2},
      subpoints: [
        {id: 'p-1', title: 'Novedades del equipo y de proyectos', presenter: 'Todos', rawTime: '3m', durationMinutes: 3, status: 'done'},
        {id: 'p-2', title: 'Coordinación sobre Minuta Weekly', presenter: 'Pau', rawTime: '2m', durationMinutes: 2, status: 'done'},
        {id: 'p-3', title: 'Agenda de la sesión', presenter: 'Pau', rawTime: '1m', durationMinutes: 1, status: 'done'},
      ],
      decisions: [
        {id: 'd-1', content: 'Se aprueba el nuevo flujo de minutas en Bardo Docs.'},
      ],
      tasks: [],
    },
    {
      id: 'b-2',
      emoji: '🎨',
      title: 'Revisión de diseño | ORION',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Cami y Pau',
      participants: 'Diseño & SD + Carol, Karola y Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-4', title: 'Prototipo navegable - Mi Plan', presenter: 'Maxi', rawTime: '20 min', durationMinutes: 20, status: 'pending'},
        {id: 'p-5', title: 'Flujo Bloqueo de SIM - Ayuda', presenter: 'Cami', rawTime: '20 min', durationMinutes: 20, status: 'pending'},
        {id: 'p-6', title: 'Propuestas para mejorar el proceso de diseño', presenter: 'Todos', rawTime: '10m', durationMinutes: 10, status: 'pending'},
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
      emoji: '☕',
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
      emoji: '🛒',
      title: 'Revisión de diseño | Ecommerce',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Dani y Javi',
      participants: 'Diseño & SD + Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-7', title: 'Catálogo de equipos: comentarios de la Demo', presenter: 'Dani', rawTime: '20m', durationMinutes: 20, status: 'pending'},
        {id: 'p-8', title: 'Landing Apple con Integración Claro Up', presenter: 'Javi', rawTime: '20m', durationMinutes: 20, status: 'pending'},
        {id: 'p-9', title: 'Avance landing factibilidad (opcional)', presenter: 'Dani / Javi', rawTime: '10m', durationMinutes: 10, status: 'pending'},
      ],
      decisions: [],
      tasks: [
        {id: 't-2', title: 'Enviar especificaciones de Claro Up al equipo de desarrollo', assignee: '@Javi Acuña'},
      ],
    },
    {
      id: 'b-5',
      emoji: '🚀',
      title: 'Otros proyectos + Sistema de Diseño',
      durationMinutes: 40,
      manualDuration: 40,
      leader: 'Responsable de cada proyecto',
      participants: 'Diseño & SD, Nico y stakeholders',
      phases: {context: 5, review: 30, closing: 5},
      subpoints: [
        {id: 'p-10', title: 'Landing OTT Mascotas (avances y soluciones)', presenter: 'Responsable', rawTime: '15m', durationMinutes: 15, status: 'pending'},
        {id: 'p-11', title: 'Pantallas SSO para el flujo de Registro', presenter: 'Pau / Maxi', rawTime: '15m', durationMinutes: 15, status: 'pending'},
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
    if (!raw) return computePlannerTimes(DEMO_PLANNER_FIXTURE);
    const parsed = JSON.parse(raw);
    return computePlannerTimes(parsed);
  } catch {
    return computePlannerTimes(DEMO_PLANNER_FIXTURE);
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
  if (computed.host) {
    msg += `👤 **Conduce:** ${computed.host}\n\n`;
  }
  if (computed.description) {
    msg += `${computed.description}\n\n`;
  }

  computed.blocks.forEach(b => {
    msg += `${b.emoji || '📌'} **${b.title}** (${b.durationMinutes} min)\n\n`;
    if (b.leader) msg += `👤 *Lidera:* ${b.leader}\n\n`;
    if (b.phases?.context > 0) msg += `⏱️ ${b.phases.context} min | Contexto\n\n`;
    if ((b.subpoints || []).length > 0) {
      msg += `🎯 ${b.phases?.review || b.durationMinutes} min | Puntos a tratar:\n`;
      b.subpoints.forEach(p => {
        const timeStr = p.durationMinutes ? ` (${p.durationMinutes} min)` : '';
        const pres = p.presenter ? ` (Presenta ${p.presenter})` : '';
        msg += `- ${p.title}${timeStr}${pres}\n`;
      });
      msg += '\n';
    }
    if (b.phases?.closing > 0) msg += `✅ ${b.phases.closing} min | Cierre\n\n`;
    if (b.participants) msg += `👥 *Participan:* ${b.participants}\n\n`;
    msg += `--------------------------------------------------\n\n`;
  });

  if (computed.mentions) {
    msg += `${computed.mentions} Aquí pueden revisar la agenda de la sesión 🙌`;
  }
  return msg;
}

export function generateMinutesMarkdown(state) {
  const computed = computePlannerTimes(state);
  let md = `# Acta: ${computed.title}\n\n`;
  md += `**Fecha:** ${computed.date || 'Sin fecha'} | **Moderador:** ${computed.host || 'Sin asignar'} | **Duración Total:** ${computed.totalCalculatedDuration} min\n\n`;

  md += `## 🟢 Decisiones y Acuerdos Tomados\n`;
  let hasDecisions = false;
  computed.blocks.forEach(b => {
    (b.decisions || []).forEach(d => {
      hasDecisions = true;
      md += `- **${d.content}** *(Bloque: ${b.title})*\n`;
    });
  });
  if (!hasDecisions) md += `*No se registraron decisiones formales.*\n`;

  md += `\n## 🟣 Compromisos y Tareas Asignadas\n`;
  let hasTasks = false;
  computed.blocks.forEach(b => {
    (b.tasks || []).forEach(t => {
      hasTasks = true;
      md += `- [ ] **${t.title}** — Responsable: ${t.assignee || 'Sin asignar'} *(Ref: ${b.title})*\n`;
    });
  });
  if (!hasTasks) md += `*No se asignaron tareas.*\n`;

  md += `\n## 📋 Resumen de Puntos Tratados\n`;
  if (computed.blocks.length === 0) {
    md += `*Sin bloques registrados en la sesión.*\n`;
  } else {
    computed.blocks.forEach(b => {
      md += `### ${b.title} (${b.durationMinutes} min)\n`;
      if (b.leader) md += `*Lidera:* ${b.leader}\n`;
      if ((b.subpoints || []).length > 0) {
        b.subpoints.forEach(p => {
          const check = p.status === 'done' ? '[x]' : '[ ]';
          const time = p.durationMinutes ? `(${p.durationMinutes}m)` : '';
          const pres = p.presenter ? `— *${p.presenter}*` : '';
          md += `- ${check} ${p.title} ${time} ${pres}\n`;
        });
      }
      md += `\n`;
    });
  }

  return md;
}
