export function pluralize(count, singular, plural) {
  const num = Math.abs(Number(count) || 0);
  return `${num} ${num === 1 ? singular : plural}`;
}

export function formatMinutesLabel(minutes) {
  return pluralize(minutes, 'minuto', 'minutos');
}

export function formatBlocksCountLabel(count) {
  return pluralize(count, 'bloque', 'bloques');
}

export function formatTopicsCountLabel(count) {
  return pluralize(count, 'tema', 'temas');
}

export function formatParticipantsCountLabel(count) {
  return pluralize(count, 'participante', 'participantes');
}

export function formatRecordingsCountLabel(count) {
  return pluralize(count, 'grabación', 'grabaciones');
}

export function formatAgreementsCountLabel(count) {
  return pluralize(count, 'acuerdo', 'acuerdos');
}

/**
 * Vocabulary of Reuniones (user-visible copy only; identifiers keep their
 * historical names: session = reunión, block = bloque, point/subpoint = tema,
 * decision = acuerdo, host/leader = facilitador, break = descanso).
 */
export const MEETING_COPY = {
  meeting: 'reunión',
  block: 'bloque',
  topic: 'tema',
  agreement: 'acuerdo',
  facilitatorLabel: 'Facilita',
  breakTitle: 'Descanso',
  startMeeting: 'Iniciar reunión',
  needsBlock: 'Agrega al menos un bloque',
};

/** Status of a meeting from its live state (Home card). */
export function liveStatusLabel(status) {
  switch (status) {
    case 'running': return 'En curso';
    case 'paused': return 'En pausa';
    case 'interrupted': return 'Interrumpida';
    case 'completed': return 'Terminada';
    default: return 'Programada';
  }
}

/** Status of a meeting from its list row (server status). */
export function eventStatusLabel(eventStatus) {
  if (eventStatus === 'completed' || eventStatus === 'finished') return 'Terminada';
  if (eventStatus === 'in_progress' || eventStatus === 'live') return 'En curso';
  return 'Programada';
}

/** 45 → "45 min", 60 → "1 h", 90 → "1 h 30 min". */
export function formatMeetingDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Upcoming-meeting banner wording from the minutes until the start
 * (negative once it should have started): "empieza en 20 min",
 * "empieza ahora", "debía empezar hace 5 min".
 */
export function upcomingStartLabel(minutesUntilStart) {
  const minutes = Math.round(Number(minutesUntilStart) || 0);
  if (minutes > 1) return `empieza en ${minutes} min`;
  if (minutes >= -1) return 'empieza ahora';
  return `debía empezar hace ${Math.abs(minutes)} min`;
}
