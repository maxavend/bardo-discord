export const BARDO_EVENT_PREFIX = 'bardo:event:';
export const EVENT_TARGET_PREFIX = 'event:';

export const EVENT_STATUSES = ['draft', 'scheduled', 'live', 'finished', 'cancelled'];
export const EVENT_BLOCK_TYPES = ['discussion', 'presentation', 'review', 'break', 'decision', 'other'];
export const EVENT_ITEM_STATUSES = ['pending', 'active', 'done', 'skipped'];

export function eventTarget(eventId) {
  const id = String(eventId || '').trim();
  return id ? `${EVENT_TARGET_PREFIX}${id}` : null;
}

export function parseEventTarget(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith(BARDO_EVENT_PREFIX)) return raw.slice(BARDO_EVENT_PREFIX.length) || null;
  if (raw.startsWith(EVENT_TARGET_PREFIX)) return raw.slice(EVENT_TARGET_PREFIX.length) || null;
  return null;
}

export function normalizeEventStatus(value, fallback = 'scheduled') {
  const normalized = String(value || '').trim().toLowerCase();
  return EVENT_STATUSES.includes(normalized) ? normalized : fallback;
}

export function normalizeEventBlockType(value, fallback = 'discussion') {
  const normalized = String(value || '').trim().toLowerCase();
  return EVENT_BLOCK_TYPES.includes(normalized) ? normalized : fallback;
}

export function normalizeEventItemStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase();
  return EVENT_ITEM_STATUSES.includes(normalized) ? normalized : fallback;
}

export function cleanDuration(value, fallback = 0, max = 24 * 60) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

export function normalizeDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function normalizeTime(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [hour, minute] = raw.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return raw;
}

function partsFor(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return map;
}

function offsetFor(date, timeZone) {
  const p = partsFor(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtcIso(date, time, timeZone = 'America/Santiago') {
  const cleanDate = normalizeDate(date);
  const cleanTime = normalizeTime(time);
  if (!cleanDate || !cleanTime) return null;

  const [year, month, day] = cleanDate.split('-').map(Number);
  const [hour, minute] = cleanTime.split(':').map(Number);
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(guessMs);

  try {
    const firstOffset = offsetFor(guess, timeZone);
    let result = new Date(guessMs - firstOffset);
    const secondOffset = offsetFor(result, timeZone);
    if (secondOffset !== firstOffset) result = new Date(guessMs - secondOffset);
    return result.toISOString();
  } catch {
    return new Date(guessMs).toISOString();
  }
}

export function clockToMinutes(value) {
  const time = normalizeTime(value) || '00:00';
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToClock(total) {
  const normalized = ((Math.round(Number(total) || 0) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function calculateEventTimeline(event) {
  const blocks = Array.isArray(event?.blocks) ? [...event.blocks] : [];
  blocks.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  let cursor = clockToMinutes(event?.startTime || '00:00');

  return blocks.map((block) => {
    const duration = cleanDuration(block.durationMinutes, 0);
    const startTime = minutesToClock(cursor);
    const endTime = minutesToClock(cursor + duration);
    cursor += duration;
    return { ...block, startTime, endTime };
  });
}

export function totalEventAgendaMinutes(event) {
  return (event?.blocks || []).reduce((sum, block) => sum + cleanDuration(block.durationMinutes, 0), 0);
}

export function formatDuration(minutes) {
  const value = cleanDuration(minutes, 0, 7 * 24 * 60);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export function eventStatusLabel(status) {
  return ({
    draft: 'Borrador',
    scheduled: 'Programado',
    live: 'En vivo',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
  })[normalizeEventStatus(status)] || 'Programado';
}

export function eventBlockTypeLabel(type) {
  return ({
    discussion: 'Conversación',
    presentation: 'Presentación',
    review: 'Revisión',
    break: 'Break',
    decision: 'Decisión',
    other: 'Otro',
  })[normalizeEventBlockType(type)] || 'Conversación';
}

export function sanitizeLink(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function linkLabel(url, fallback = '') {
  const explicit = String(fallback || '').trim();
  if (explicit) return explicit.slice(0, 80);
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('figma.com')) return 'Figma';
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('atlassian.net')) return 'Jira';
    if (host.includes('notion.')) return 'Notion';
    if (host.includes('docs.google.')) return 'Google Docs';
    return host.slice(0, 80);
  } catch {
    return 'Link';
  }
}

function personNames(list = []) {
  return list.map((person) => person?.displayName || person?.name || person?.userId).filter(Boolean);
}

export function buildCompactAgenda(event) {
  const timeline = calculateEventTimeline(event);
  const lines = timeline.slice(0, 10).map((block) => {
    const leads = personNames(block.leads);
    const suffix = leads.length ? ` — ${leads.join(', ')}` : '';
    return `${block.startTime} · ${block.title}${suffix}`;
  });
  return lines.join('\n');
}

export function generateEventMinutesMarkdown(event) {
  const lines = [];
  const dateLabel = event.eventDate || '';
  lines.push(`# ${event.title}${dateLabel ? ` — ${dateLabel}` : ''}`);
  if (event.description) lines.push('', event.description.trim());

  const participants = personNames(event.participants);
  if (participants.length) lines.push('', '## Participantes', '', participants.map((name) => `- ${name}`).join('\n'));

  const timeline = calculateEventTimeline(event);
  for (const block of timeline) {
    lines.push('', `## ${block.title}`);
    const leads = personNames(block.leads);
    const metadata = [];
    if (leads.length) metadata.push(`**Lidera:** ${leads.join(', ')}`);
    if (block.durationMinutes) metadata.push(`**Duración:** ${formatDuration(block.durationMinutes)}`);
    if (metadata.length) lines.push('', metadata.join(' · '));
    if (block.description) lines.push('', block.description.trim());

    for (const item of block.items || []) {
      lines.push('', `### ${item.title}`);
      const speakers = personNames(item.speakers);
      if (speakers.length) lines.push('', `**Presenta:** ${speakers.join(', ')}`);
      if (item.description) lines.push('', item.description.trim());
      if (item.links?.length) lines.push('', ...item.links.map((link) => `- [${link.label || linkLabel(link.url)}](${link.url})`));
      if (item.notes?.length) lines.push('', '**Notas**', '', ...item.notes.map((note) => `- ${note.content}`));
      if (item.decisions?.length) lines.push('', '**Decisiones**', '', ...item.decisions.map((decision) => `- ${decision.content}`));
      if (item.tasks?.length) lines.push('', '**Tareas**', '', ...item.tasks.map((task) => `- [ ] ${task.title}${task.assigneeName ? ` — ${task.assigneeName}` : ''}`));
    }

    if (block.notes?.length) lines.push('', '**Notas del bloque**', '', ...block.notes.map((note) => `- ${note.content}`));
    if (block.decisions?.length) lines.push('', '**Decisiones del bloque**', '', ...block.decisions.map((decision) => `- ${decision.content}`));
  }

  if (event.decisions?.length) lines.push('', '## Decisiones', '', ...event.decisions.map((decision) => `- ${decision.content}`));
  if (event.tasks?.length) lines.push('', '## Tareas', '', ...event.tasks.map((task) => `- [ ] ${task.title}${task.assigneeName ? ` — ${task.assigneeName}` : ''}`));

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
