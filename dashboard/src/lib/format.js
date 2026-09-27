/**
 * Canonical formatting helpers.
 *
 * Every user-visible date, duration and count in the product must come through
 * here so that two screens can never disagree about the same value, and so an
 * absent/invalid timestamp renders as nothing instead of "Invalid Date".
 *
 * One locale, one timezone strategy: the viewer's own locale and timezone.
 */

// Single source of truth for how dates are shown.
export const DATE_LOCALE = 'en-GB';

export function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Returns null (not "Invalid Date") when the input is missing or unparseable. */
export function formatDateTime(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return null;
  return d.toLocaleString(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

export function formatDate(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return null;
  return d.toLocaleDateString(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

export function formatTime(value) {
  const d = parseDate(value);
  if (!d) return null;
  return d.toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Duration in whole minutes, derived only from real timestamps.
 * Prefers the actual recording window, then the scheduled window.
 * Returns null when neither pair is present — never a hardcoded fallback.
 */
export function durationMinutes(meeting) {
  if (!meeting) return null;
  const pairs = [
    [meeting.started_at, meeting.ended_at],
    [meeting.scheduled_start, meeting.scheduled_end],
  ];
  for (const [from, to] of pairs) {
    const a = parseDate(from);
    const b = parseDate(to);
    if (a && b) {
      const mins = Math.round((b.getTime() - a.getTime()) / 60000);
      if (mins > 0) return mins;
    }
  }
  return null;
}

export function formatDuration(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Percentage clamped to 0..100. Returns null when the total is unknown. */
export function percent(part, total) {
  if (typeof part !== 'number' || typeof total !== 'number') return null;
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/** Byte count -> human string, or null. */
export function formatBytes(bytes, decimals = 1) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(decimals)} ${units[i]}`;
}

/**
 * A number, or an em dash when there is genuinely no data.
 * Never substitutes an invented value.
 */
export function numberOrDash(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString(DATE_LOCALE);
}

export function initialsOf(name) {
  return String(name || '')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
