import {computePlannerTimes} from './time-engine.js';

export const PLANNER_STORE_KEY = 'bardo.planner.state.v2';

export const INITIAL_PLANNER_DATA = {
  title: 'Weekly Diseño & SD',
  host: 'Paula Molina',
  date: '2026-08-19',
  startTime: '17:45',
  targetDuration: 180,
  description: '¡Hola equipo! 👋\n\nLes comparto la agenda de nuestra weekly de esta semana. La idea es revisar los avances de los proyectos, recibir feedback y cerrar acuerdos para seguir avanzando.\n\n⏰ Duración total: 3 horas\n\n🙌 La idea es aprovechar este espacio para revisar los avances, resolver dudas y tomar decisiones juntos. ¡Nos vemos en la weekly!',
  mentions: '@Nico G @Camila Carreño @Daniela @Javi Acuña @Max Avendaño @Carol T @Karola',
  liveActiveBlockId: 'b-2',
  blocks: [
    {
      id: 'b-1',
      emoji: '🟢',
      title: '1. Check-in, contexto y novedades',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todo el equipo',
      participants: 'Todo el equipo de Diseño & SD + Carol, Karola y Nico',
      introDesc: 'Partiremos con una puesta al día para alinearnos como equipo.',
      phases: {context: 2, review: 6, closing: 2},
      subpoints: [
        {id: 'p-1', title: 'Novedades del equipo y de los proyectos', presenter: 'Todos', rawTime: '3m', durationMinutes: 3, status: 'done'},
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
      title: '2. Revisión de diseño | ORION',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Cami y Pau',
      participants: 'Todo el equipo de Diseño & SD + Carol, Karola y Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-4', title: 'Prototipo navegable - Mi Plan', presenter: 'Maxi', rawTime: '20 min', durationMinutes: 20, status: 'active'},
        {id: 'p-5', title: 'Flujo Bloqueo de SIM - Ayuda', presenter: 'Cami', rawTime: '20 min', durationMinutes: 20, status: 'pending'},
        {id: 'p-6', title: 'Conversación sobre propuestas para mejorar nuestro proceso de diseño', presenter: 'Todos', rawTime: '10m', durationMinutes: 10, status: 'pending'},
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
      title: '3. Break',
      durationMinutes: 10,
      manualDuration: 10,
      leader: 'Todos',
      participants: 'Todo el equipo',
      introDesc: 'Tiempo para descansar, tomar un café y prepararnos para la siguiente revisión.',
      phases: {context: 0, review: 10, closing: 0},
      subpoints: [],
      decisions: [],
      tasks: [],
    },
    {
      id: 'b-4',
      emoji: '🛒',
      title: '4. Revisión de diseño | Ecommerce',
      durationMinutes: 60,
      manualDuration: 60,
      leader: 'Dani y Javi',
      participants: 'Todo el equipo de Diseño & SD + Nico',
      phases: {context: 5, review: 50, closing: 5},
      subpoints: [
        {id: 'p-7', title: 'Catálogo de equipos para revisar últimos comentarios de la Demo', presenter: 'Dani', rawTime: '20m', durationMinutes: 20, status: 'pending'},
        {id: 'p-8', title: 'Landing Apple con Integración de "Claro Up"', presenter: 'Javi', rawTime: '20m', durationMinutes: 20, status: 'pending'},
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
      title: '5. Otros proyectos + Sistema de Diseño',
      durationMinutes: 40,
      manualDuration: 40,
      leader: 'Responsable de cada proyecto',
      participants: 'Equipo de Diseño & SD, Nico y los PO o stakeholders',
      phases: {context: 5, review: 30, closing: 5},
      subpoints: [
        {id: 'p-10', title: 'Landing OTT Mascotas (ver avances/iterar solución)', presenter: 'Responsable', rawTime: '15m', durationMinutes: 15, status: 'pending'},
        {id: 'p-11', title: 'Pantallas SSO para el flujo de "Registro" (detalle de pedida para Maxi)', presenter: 'Pau / Maxi', rawTime: '15m', durationMinutes: 15, status: 'pending'},
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
    if (!raw) return computePlannerTimes(INITIAL_PLANNER_DATA);
    const parsed = JSON.parse(raw);
    return computePlannerTimes(parsed);
  } catch {
    return computePlannerTimes(INITIAL_PLANNER_DATA);
  }
}

export function savePlannerState(state) {
  try {
    localStorage.setItem(PLANNER_STORE_KEY, JSON.stringify(state));
  } catch {}
}

export function generateDiscordAnnouncement(state) {
  const computed = computePlannerTimes(state);
  let msg = `${computed.host || 'Paula Molina'}\n\n`;
  msg += `${computed.description}\n\n`;

  computed.blocks.forEach(b => {
    msg += `${b.emoji || '📌'} ${b.title} (${b.durationMinutes} min)\n\n`;
    if (b.leader) msg += `👤 Lidera: ${b.leader}\n\n`;
    if (b.phases?.context > 0) msg += `⏱️ ${b.phases.context} minutos | Contexto\n\n`;
    if ((b.subpoints || []).length > 0) {
      msg += `🎯 ${b.phases?.review || b.durationMinutes} minutos | Revisión del diseño\nVeremos:\n`;
      b.subpoints.forEach(p => {
        const timeStr = p.durationMinutes ? ` (${p.durationMinutes} min)` : '';
        msg += `${p.title}${timeStr} ${p.presenter ? `(Presenta ${p.presenter})` : ''}\n`;
      });
      msg += '\n';
    }
    if (b.phases?.closing > 0) msg += `✅ ${b.phases.closing} minutos | Cierre\n\n`;
    if (b.participants) msg += `👥 Participan: ${b.participants}\n\n`;
    msg += `--------------------------------------------------\n\n`;
  });

  if (computed.mentions) {
    msg += `${computed.mentions} Aquí pueden revisar la agenda de la weekly 🙌`;
  }
  return msg;
}

export function generateMinutesMarkdown(state) {
  const computed = computePlannerTimes(state);
  let md = `# Acta: ${computed.title}\n\n`;
  md += `**Fecha:** ${computed.date} | **Moderador:** ${computed.host} | **Duración Total:** ${computed.totalCalculatedDuration} min\n\n`;

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

  return md;
}
