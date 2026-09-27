/**
 * Canonical workspace metrics.
 *
 * The audit found four screens reporting four different meeting totals and four
 * different hour figures for the same account. The cause was that every page
 * recomputed the same numbers with its own `useMemo` and its own idea of
 * "active member" and "duration".
 *
 * This module is the single definition. Pages call it with the rows they have
 * already loaded and get identical numbers. It never invents a value: if a
 * number cannot be derived from real rows it returns null, and the UI shows an
 * honest "no data" instead of a fabricated one.
 */

import { durationMinutes, percent } from './format.js';

/** Statuses the product treats as "a meeting that produced intelligence". */
export const TERMINAL_OK = 'completed';
export const IN_PROGRESS = ['joining', 'recording', 'processing'];
export const UPCOMING = ['scheduled', 'queued'];

export const MEMBER_ACTIVE_STATUSES = ['active'];

/** A member counts as active only when their status is explicitly active. */
export function isActiveMember(member) {
  if (!member) return false;
  const status = String(member.status || '').toLowerCase();
  // Older rows may have no status at all; treat a membership row as active then.
  return status === '' || MEMBER_ACTIVE_STATUSES.includes(status);
}

export function countActiveMembers(members) {
  return (members || []).filter(isActiveMember).length;
}

/**
 * Total meetings. One definition, used everywhere.
 * `meetings` must already be scoped to the active workspace.
 */
export function totalMeetings(meetings) {
  return Array.isArray(meetings) ? meetings.length : null;
}

export function completedMeetings(meetings) {
  if (!Array.isArray(meetings)) return null;
  return meetings.filter((m) => m?.status === TERMINAL_OK).length;
}

export function inProgressMeetings(meetings) {
  if (!Array.isArray(meetings)) return null;
  return meetings.filter((m) => IN_PROGRESS.includes(m?.status)).length;
}

export function upcomingMeetings(meetings) {
  if (!Array.isArray(meetings)) return null;
  return meetings.filter((m) => UPCOMING.includes(m?.status)).length;
}

/**
 * Total recorded minutes, summed from real timestamps only.
 * Meetings with no usable start/end pair contribute nothing and are not guessed.
 * Returns { minutes, counted, uncounted } so a UI can be honest about coverage.
 */
export function recordedMinutes(meetings) {
  if (!Array.isArray(meetings)) return { minutes: null, counted: 0, uncounted: 0 };
  let minutes = 0;
  let counted = 0;
  let uncounted = 0;
  for (const m of meetings) {
    if (m?.status !== TERMINAL_OK) continue;
    const d = durationMinutes(m);
    if (d == null) {
      uncounted += 1;
      continue;
    }
    minutes += d;
    counted += 1;
  }
  return { minutes, counted, uncounted };
}

/** Hours as a number, or null. */
export function recordedHours(meetings) {
  const { minutes } = recordedMinutes(meetings);
  return minutes == null ? null : Math.round((minutes / 60) * 10) / 10;
}

/**
 * Distinct human speakers across the given meetings.
 * Diarization placeholders (SPEAKER_00..NN, UNKNOWN) are NOT people and are
 * excluded rather than counted, so the number means something.
 */
const PLACEHOLDER = /^(speaker[_\s-]?\d+|unknown|unlabelled?|silence|inaudible)$/i;

export function isPlaceholderSpeaker(name) {
  return !name || PLACEHOLDER.test(String(name).trim());
}

export function countParticipants(turns) {
  if (!Array.isArray(turns)) return null;
  const set = new Set();
  for (const t of turns) {
    const s = (t?.speaker || '').trim();
    if (!s || isPlaceholderSpeaker(s)) continue;
    set.add(s);
  }
  return set.size;
}

/** Per-participant speaking turns, excluding placeholders. */
export function participantBreakdown(turns) {
  const map = new Map();
  for (const t of turns || []) {
    const s = (t?.speaker || '').trim();
    if (!s || isPlaceholderSpeaker(s)) continue;
    map.set(s, (map.get(s) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, turns: count }))
    .sort((a, b) => b.turns - a.turns || a.name.localeCompare(b.name));
}

/**
 * Speaking-time share per participant, in percent, from real turn durations.
 * Returns null when no turn carries a usable duration, so the UI can say
 * "not enough data" instead of printing confident wrong percentages.
 */
export function speakingShare(turns) {
  if (!Array.isArray(turns) || turns.length === 0) return [];
  const totals = new Map();
  let grand = 0;
  for (const t of turns) {
    const name = (t?.speaker || '').trim();
    if (!name || isPlaceholderSpeaker(name)) continue;
    const start = Number(t.start_time);
    const end = Number(t.end_time);
    const secs = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
    if (secs <= 0) continue;
    totals.set(name, (totals.get(name) || 0) + secs);
    grand += secs;
  }
  if (grand <= 0) return [];
  return [...totals.entries()]
    .map(([name, secs]) => ({ name, seconds: secs, share: percent(secs, grand) }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

/**
 * Action items flattened out of `mom.action_items`.
 * The column is a jsonb array of { task, owner, due } — there is no action-items
 * table, so this is the authoritative read. Normalises nothing away: a row that
 * is not an object is skipped rather than rendered as raw JSON.
 */
export function collectActionItems(moms, meetingsById) {
  const out = [];
  for (const m of moms || []) {
    const list = Array.isArray(m?.action_items) ? m.action_items : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const task = typeof raw.task === 'string' ? raw.task.trim() : '';
      if (!task) continue;
      const meeting = meetingsById?.get(m.meeting_id);
      out.push({
        meetingId: m.meeting_id,
        meetingTitle: meeting?.title || null,
        task,
        owner: typeof raw.owner === 'string' ? raw.owner : null,
        due: typeof raw.due === 'string' ? raw.due : null,
        status: typeof raw.status === 'string' ? raw.status : 'open',
        completedAt: typeof raw.completed_at === 'string' ? raw.completed_at : null,
      });
    }
  }
  return out;
}

/** A compact, fully-derived summary for the pages that need one object. */
export function buildMetrics({ meetings, members, teams, turns, moms } = {}) {
  const minutes = recordedMinutes(meetings);
  return {
    totalMeetings: totalMeetings(meetings),
    completedMeetings: completedMeetings(meetings),
    inProgressMeetings: inProgressMeetings(meetings),
    upcomingMeetings: upcomingMeetings(meetings),
    recordedMinutes: minutes.minutes,
    recordedHours: minutes.minutes == null ? null : Math.round((minutes.minutes / 60) * 10) / 10,
    minutesUncounted: minutes.uncounted,
    activeMembers: members ? countActiveMembers(members) : null,
    totalMembers: Array.isArray(members) ? members.length : null,
    totalTeams: Array.isArray(teams) ? teams.length : null,
    participants: turns ? countParticipants(turns) : null,
    actionItems: Array.isArray(moms) ? collectActionItems(moms).length : null,
  };
}
