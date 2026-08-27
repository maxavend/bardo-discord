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

export function computePlannerTimes(plannerState) {
  let grandTotalMinutes = 0;

  const computedBlocks = (plannerState.blocks || []).map(block => {
    const duration = parseSmartDuration(block.durationMinutes ?? block.manualDuration) || 30;
    grandTotalMinutes += duration;

    const computedSubpoints = (block.subpoints || []).map(p => ({
      ...p,
      title: p.title || '',
      presenter: p.presenter || '',
      status: p.status || 'pending',
    }));

    return {
      ...block,
      durationMinutes: duration,
      subpoints: computedSubpoints,
    };
  });

  return {
    ...plannerState,
    totalCalculatedDuration: grandTotalMinutes,
    blocks: computedBlocks,
  };
}
