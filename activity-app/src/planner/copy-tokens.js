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
