/**
 * Calendar-date helpers for Bardo Planner.
 *
 * Planner dates are civil dates ("YYYY-MM-DD") in the user's local time zone
 * (America/Santiago for most users). Never derive them with `toISOString()`,
 * which is UTC: in Chile after 20:00/21:00 it already returns tomorrow.
 */

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Returns the civil date of `date` as "YYYY-MM-DD".
 * Without `timeZone` it uses the runtime's local zone; with one (e.g.
 * 'America/Santiago') it uses Intl so DST transitions are handled by tzdata.
 */
export function toLocalDateIso(date = new Date(), timeZone = undefined) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  if (!timeZone) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Today's civil date in the local (or given) time zone. */
export function todayLocalIso(now = new Date(), timeZone = undefined) {
  return toLocalDateIso(now, timeZone);
}

/** Parses "YYYY-MM-DD" as a local-midnight Date (never UTC). Returns null if invalid. */
export function parseLocalDateIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function isValidLocalDateIso(iso) {
  return parseLocalDateIso(iso) !== null;
}
