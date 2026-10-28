/**
 * Qué muestra Inicio y en qué orden, sin React: lo urgente primero (la reunión
 * de ahora, las tareas que vencen) y lo reciente después. Las fechas de tareas
 * son días ISO en la zona del espacio; las de reuniones, hora local.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Una reunión cuenta como «próxima» en Inicio si empieza dentro de una semana.
const FOCUS_WINDOW_MS = 7 * DAY;
const DEFAULT_MEETING_MINUTES = 60;

function addDaysIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Tareas agrupadas por urgencia: vencidas, hoy, esta semana, más adelante y sin
 * fecha. `cards` son las abiertas a mostrar (las asignadas a la persona, o las
 * del canal si no hay sesión). Devuelve como mucho `limit` tareas, sin grupos vacíos.
 */
export function groupTasksByUrgency(cards, today, {limit = 6} = {}) {
  const weekEnd = addDaysIso(today, 7);
  const groups = [
    {id: 'overdue', label: 'Vencidas', cards: []},
    {id: 'today', label: 'Hoy', cards: []},
    {id: 'week', label: 'Próximos 7 días', cards: []},
    {id: 'later', label: 'Más adelante', cards: []},
    {id: 'undated', label: 'Sin fecha', cards: []},
  ];
  const byId = Object.fromEntries(groups.map(group => [group.id, group]));
  const sorted = [...cards].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.number - b.number);
  for (const card of sorted) {
    const due = card.dueDate;
    const group = !due ? 'undated' : due < today ? 'overdue' : due === today ? 'today' : due <= weekEnd ? 'week' : 'later';
    byId[group].cards.push(card);
  }
  let left = limit;
  const shown = [];
  for (const group of groups) {
    if (!left || !group.cards.length) continue;
    shown.push({...group, cards: group.cards.slice(0, left), total: group.cards.length});
    left -= Math.min(left, group.cards.length);
  }
  return {
    groups: shown,
    total: cards.length,
    overdue: byId.overdue.cards.length,
    dueToday: byId.today.cards.length,
  };
}

export function meetingStart(meeting) {
  if (!meeting?.date) return null;
  const time = Date.parse(`${meeting.date}T${meeting.startTime || '00:00'}`);
  return Number.isNaN(time) ? null : time;
}

function meetingEnd(meeting) {
  const start = meetingStart(meeting);
  const minutes = Number(meeting?.targetDuration) > 0 ? Number(meeting.targetDuration) : DEFAULT_MEETING_MINUTES;
  return start === null ? null : start + minutes * MINUTE;
}

const isLive = meeting => meeting?.eventStatus === 'in_progress' || meeting?.eventStatus === 'live';
const isClosed = meeting => ['finished', 'completed', 'archived'].includes(meeting?.eventStatus);

/**
 * La reunión que importa ahora: la que está en curso o, si no, la próxima que
 * empieza dentro de una semana (o que debía empezar y aún está en su horario).
 */
export function focusMeeting(meetings, now = Date.now()) {
  const live = meetings.find(isLive);
  if (live) return live;
  return meetings
    .filter(meeting => !isClosed(meeting))
    .filter(meeting => {
      const start = meetingStart(meeting);
      const end = meetingEnd(meeting);
      return start !== null && end > now && start - now <= FOCUS_WINDOW_MS;
    })
    .sort((a, b) => meetingStart(a) - meetingStart(b))[0] || null;
}

/** Próximas (por fecha) y, si no hay, las últimas que terminaron. */
export function meetingList(meetings, now = Date.now(), {exclude = null, limit = 3} = {}) {
  const others = meetings.filter(meeting => (meeting.id || meeting.eventId) !== exclude && meeting.eventStatus !== 'archived');
  const upcoming = others
    .filter(meeting => !isClosed(meeting) && (meetingEnd(meeting) ?? Infinity) > now)
    .sort((a, b) => (meetingStart(a) ?? Infinity) - (meetingStart(b) ?? Infinity));
  const past = others
    .filter(meeting => !upcoming.includes(meeting))
    .sort((a, b) => (meetingStart(b) ?? 0) - (meetingStart(a) ?? 0));
  return {upcoming: upcoming.slice(0, limit), past: past.slice(0, Math.max(0, limit - upcoming.length))};
}

const timeFormat = new Intl.DateTimeFormat('es-CL', {hour: '2-digit', minute: '2-digit', hour12: false});
const dayFormat = new Intl.DateTimeFormat('es-CL', {weekday: 'short', day: 'numeric', month: 'short'});

function localDayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** «En curso», «En 25 min», «Hoy, 15:00», «Mañana, 10:00» o «jue, 30 oct, 10:00». */
export function meetingWhen(meeting, now = Date.now()) {
  if (isLive(meeting)) return 'En curso';
  const start = meetingStart(meeting);
  if (start === null) return 'Sin fecha';
  const clock = meeting.startTime ? timeFormat.format(start) : '';
  const diff = start - now;
  if (!isClosed(meeting) && diff <= 0 && meetingEnd(meeting) > now) return `Ahora${clock ? `, ${clock}` : ''}`;
  if (!isClosed(meeting) && diff > 0 && diff < 60 * MINUTE) return `En ${Math.max(1, Math.round(diff / MINUTE))} min`;
  const withClock = label => (clock ? `${label}, ${clock}` : label);
  if (localDayKey(start) === localDayKey(now)) return withClock('Hoy');
  if (localDayKey(start) === localDayKey(now + DAY)) return withClock('Mañana');
  if (localDayKey(start) === localDayKey(now - DAY)) return withClock('Ayer');
  return withClock(dayFormat.format(start));
}

/** Los documentos editados más recientemente, de cualquier espacio. */
export function recentDocuments(docs, limit = 5) {
  return [...docs]
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, limit);
}

/** «Martes 28 de octubre», con mayúscula inicial. */
export function longDate(now = Date.now()) {
  const text = new Intl.DateTimeFormat('es-CL', {weekday: 'long', day: 'numeric', month: 'long'}).format(now).replace(',', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
