const DEFAULT_MAX_DURATION_MINUTES = 7 * 24 * 60;

function fail(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function durationNormalized(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function parseDuration(input, { maxMinutes = DEFAULT_MAX_DURATION_MINUTES } = {}) {
  if (input === null || input === undefined || String(input).trim() === '') {
    fail('Escribe una duración como 90m, 3h o 3h 30m.', 'INVALID_DURATION');
  }

  const raw = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^-/.test(raw)) fail('La duración no puede ser negativa.', 'INVALID_DURATION');

  let minutes = null;
  let source = 'minutes';
  let match;

  if (/^\d+$/.test(raw)) {
    minutes = Number(raw);
  } else if ((match = raw.match(/^(\d+)\s*m$/))) {
    minutes = Number(match[1]);
  } else if ((match = raw.match(/^(\d+)\s*h$/))) {
    minutes = Number(match[1]) * 60;
    source = 'hours';
  } else if ((match = raw.match(/^(\d+):(\d{1,2})\s*h$/))) {
    const extra = Number(match[2]);
    if (extra > 59) fail('Los minutos de la duración deben estar entre 0 y 59.', 'INVALID_DURATION');
    minutes = Number(match[1]) * 60 + extra;
    source = 'clock-duration';
  } else if ((match = raw.replace(/\s+/g, '').match(/^(\d+)h(?:(\d+)m)?$/))) {
    minutes = Number(match[1]) * 60 + Number(match[2] || 0);
    source = 'hours-minutes';
  }

  if (!Number.isFinite(minutes) || minutes < 0 || minutes > maxMinutes) {
    fail(`La duración debe estar entre 0 y ${maxMinutes} minutos.`, 'INVALID_DURATION');
  }

  return { minutes, normalized: durationNormalized(minutes), source };
}

export function parseClock(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) fail('Escribe una hora como 15:30 o 3:30 pm.', 'INVALID_CLOCK');

  let hour;
  let minute = 0;
  let source = '24h';
  let match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match) {
    const twelveHour = Number(match[1]);
    minute = Number(match[2] || 0);
    if (twelveHour < 1 || twelveHour > 12 || minute > 59) {
      fail('Escribe una hora como 15:30 o 3:30 pm.', 'INVALID_CLOCK');
    }
    hour = twelveHour % 12 + (match[3] === 'pm' ? 12 : 0);
    source = '12h';
  } else {
    match = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) fail('Escribe una hora como 15:30 o 3:30 pm.', 'INVALID_CLOCK');
    hour = Number(match[1]);
    minute = Number(match[2] || 0);
    if (hour > 23 || minute > 59) fail('Escribe una hora como 15:30 o 3:30 pm.', 'INVALID_CLOCK');
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    source,
  };
}

export function validateTimeZone(timeZone) {
  const value = String(timeZone || '').trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone({ eventTimezone, userTimezone, guildTimezone, fallback = 'UTC' } = {}) {
  for (const candidate of [eventTimezone, userTimezone, guildTimezone, fallback]) {
    if (validateTimeZone(candidate)) return String(candidate);
  }
  return 'UTC';
}

function calendarParts(input) {
  const match = String(input ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) fail('Escribe la fecha como YYYY-MM-DD.', 'INVALID_DATE');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    fail('Esa fecha no existe en el calendario.', 'INVALID_DATE');
  }
  return { year, month, day, localDate: `${match[1]}-${match[2]}-${match[3]}` };
}

function partsAt(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

function offsetAt(date, timeZone) {
  const p = partsAt(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

export function localDateTimeToInstant(dateInput, clockInput, timeZoneInput = 'UTC') {
  const date = calendarParts(dateInput);
  const clock = typeof clockInput === 'object' && Number.isInteger(clockInput?.hour)
    ? clockInput
    : parseClock(clockInput);
  const timeZone = resolveTimezone({ eventTimezone: timeZoneInput, fallback: 'UTC' });
  const wallMs = Date.UTC(date.year, date.month - 1, date.day, clock.hour, clock.minute, 0);
  let guess = new Date(wallMs);
  let result = new Date(wallMs - offsetAt(guess, timeZone));
  const secondOffset = offsetAt(result, timeZone);
  if (secondOffset !== offsetAt(guess, timeZone)) result = new Date(wallMs - secondOffset);

  const check = partsAt(result, timeZone);
  if (check.year !== date.year || check.month !== date.month || check.day !== date.day || check.hour !== clock.hour || check.minute !== clock.minute) {
    fail('Esa hora local no existe por un cambio de horario de verano.', 'NONEXISTENT_LOCAL_TIME');
  }
  return result.toISOString();
}

export function parseLocalDate(input, timezone = 'UTC') {
  const date = calendarParts(input);
  const timeZone = resolveTimezone({ eventTimezone: timezone, fallback: 'UTC' });
  return {
    localDate: date.localDate,
    timezone: timeZone,
    instant: localDateTimeToInstant(date.localDate, '00:00', timeZone),
  };
}

export function formatRelativeTime(instant, now = new Date(), locale = 'es') {
  const targetMs = instant instanceof Date ? instant.getTime() : Date.parse(String(instant));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return '';
  const seconds = Math.round((targetMs - nowMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
