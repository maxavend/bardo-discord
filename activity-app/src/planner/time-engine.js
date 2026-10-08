/**
 * Smart duration parsing & formatting engine for Bardo Planner.
 * Converts natural strings like "3h", "1h 30m", "45m", "1.5h", "90" into minutes,
 * and calculates precise schedule timeline timestamps.
 */

export function parseSmartDuration(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  const str = String(input).trim().toLowerCase();
  if (!str) return null;

  // Match hours and minutes combined: "1h 30m", "1h30", "1 hora 20 min"
  const hmMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hora|horas)\s*(?:y\s*)?(\d+)?\s*(?:m|min|mins|minuto|minutos)?$/);
  if (hmMatch) {
    const hours = parseFloat(hmMatch[1]) || 0;
    const mins = parseInt(hmMatch[2], 10) || 0;
    return Math.round(hours * 60 + mins);
  }

  // Match simple hours: "2h", "1.5h", "2 horas"
  const hMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hora|horas)$/);
  if (hMatch) {
    return Math.round(parseFloat(hMatch[1]) * 60);
  }

  // Match simple minutes: "45m", "45 min", "45 minutos", "45"
  const mMatch = str.match(/^(\d+)\s*(?:m|min|mins|minuto|minutos)?$/);
  if (mMatch) {
    return parseInt(mMatch[1], 10);
  }

  // Fallback number parse
  const num = parseFloat(str);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

export function formatSmartDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 min';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${hours} ${hours === 1 ? 'hora' : 'horas'} (${m} min)`;
  return `${hours}h ${rem}m (${m} min)`;
}

export function formatShortDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function clockToMinutes(value) {
  const raw = String(value || '').trim() || '17:45';
  const [h, m] = raw.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToClock(total) {
  const normalized = ((Math.round(Number(total) || 0) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const LEGACY_BREAK_TITLES = new Set(['break', 'descanso', 'pausa']);

/**
 * A block is a Descanso only when it says so explicitly (`type: 'break'`).
 * The title never turns a typed block into a break: typing "Pausa activa"
 * must not wipe its temas. The title heuristic survives only for legacy blocks
 * saved before blocks carried a `type`.
 */
export function isBreakBlock(block) {
  if (!block) return false;
  if (typeof block.type === 'string' && block.type) return block.type === 'break';
  if (block.isBreak === true) return true;
  return LEGACY_BREAK_TITLES.has(String(block.title || '').trim().toLowerCase());
}

/** Custom block duration ("Otra…"): whole minutes between 1 and 480, else null. */
export const CUSTOM_DURATION_MAX_MINUTES = 480;
export function parseCustomDurationMinutes(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= 1 && minutes <= CUSTOM_DURATION_MAX_MINUTES ? minutes : null;
}

export function computePlannerTimes(plannerState) {
  let grandTotalMinutes = 0;

  const computedBlocks = (plannerState.blocks || []).map(block => {
    const isBreak = isBreakBlock(block);
    const duration = parseSmartDuration(block.durationMinutes ?? block.manualDuration) || (isBreak ? 10 : 30);
    grandTotalMinutes += duration;

    const computedSubpoints = isBreak ? [] : (block.subpoints || []).map(p => ({
      ...p,
      title: p.title || '',
      presenter: p.presenter || '',
      status: p.status || 'pending',
    }));

    return {
      ...block,
      type: isBreak ? 'break' : (block.type || 'block'),
      isBreak,
      durationMinutes: duration,
      subpoints: computedSubpoints,
      decisions: isBreak ? [] : (block.decisions || []),
      leader: isBreak ? '' : (block.leader || ''),
      participants: isBreak ? '' : (block.participants || ''),
      introDesc: isBreak ? '' : (block.introDesc || ''),
    };
  });

  return {
    ...plannerState,
    totalCalculatedDuration: grandTotalMinutes,
    blocks: computedBlocks,
  };
}

/**
 * Planned schedule of a meeting. `targetDuration` is the time the meeting was
 * booked for (set by "Término" or /reu-new duracion); topics can fill less of
 * it ("quedan X min libres") but never end before their own total, so the
 * planned end is start + max(target, topics). While live, block extensions
 * push the estimated end past the plan.
 */
export function getPlannedSchedule({startTime = '10:00', targetDuration = 0, blocks = []} = {}, sessionState = null) {
  const blocksMinutes = (blocks || []).reduce((total, block) => total + (Number(block?.durationMinutes) || 0), 0);
  const target = Number(targetDuration) > 0 ? Math.round(Number(targetDuration)) : 0;
  const plannedMinutes = Math.max(target, blocksMinutes);
  const extensionsMinutes = Object.values(sessionState?.blockExtensions || {})
    .reduce((total, extension) => total + (Number(extension?.extensionMinutes) || 0), 0);
  const estimatedMinutes = Math.max(target, blocksMinutes + extensionsMinutes);
  const start = clockToMinutes(startTime || '10:00');
  return {
    blocksMinutes,
    targetMinutes: target,
    plannedMinutes,
    freeMinutes: Math.max(0, target - blocksMinutes),
    overMinutes: target > 0 ? Math.max(0, blocksMinutes - target) : 0,
    plannedEnd: minutesToClock(start + plannedMinutes),
    estimatedEnd: minutesToClock(start + estimatedMinutes),
  };
}

/**
 * Minutes between start and a chosen end time, or null when the end is not
 * after the start (likely an AM/PM slip; meetings don't cross midnight).
 */
export function durationUntil(startTime, endTime) {
  const diff = clockToMinutes(endTime) - clockToMinutes(startTime || '10:00');
  return diff > 0 ? diff : null;
}
