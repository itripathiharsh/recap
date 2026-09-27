/**
 * Team derivation helpers — no React, no Supabase imports.
 *
 * There is no `teams` table and no `topic`/`team` column on `meetings` yet, so a
 * meeting's team is inferred from keywords in its title. The dashboard page
 * already used this approach for topic distribution; this module is the single
 * source of truth shared by the meetings and members pages.
 *
 * When a real teams table lands, replace `getTeam` and delete TEAM_RULES.
 */

export const TEAM_RULES = [
  ['Engineering', ['engineer', 'sprint', 'backend', 'frontend', 'infra', 'devops', 'api', 'standup', 'architecture']],
  ['Product', ['product', 'roadmap', 'feature', 'discovery']],
  ['Design', ['design', 'ux', 'ui', 'prototype', 'figma']],
  ['Leadership', ['leadership', 'all-hands', 'townhall', 'board', 'planning']],
  ['Marketing', ['marketing', 'campaign', 'brand', 'seo']],
  ['Sales', ['sales', 'pipeline', 'deal', 'demo', 'client']],
  ['Business', ['business', 'finance', 'budget', 'strategy', 'partnership']],
  ['People', ['hiring', 'interview', 'onboarding', 'hr', 'people']],
];

export const TEAM_COLORS = {
  Engineering: '#22C55E',
  Product: '#0066FF',
  Design: '#EC4899',
  Marketing: '#A855F7',
  Sales: '#EF4444',
  Leadership: '#F59E0B',
  Business: '#0EA5E9',
  People: '#64748B',
  General: '#94A3B8',
  Unassigned: '#CBD5E1',
};

export const UNASSIGNED_TEAM = 'Unassigned';

export function getTeam(title) {
  const t = (title || '').toLowerCase();
  for (const [team, keys] of TEAM_RULES) {
    if (keys.some((k) => t.includes(k))) return team;
  }
  return 'General';
}

export function teamColor(team) {
  return TEAM_COLORS[team] || TEAM_COLORS.General;
}

/* ------------------------------------------------------------------ platform */

export const PLATFORM_LABEL = {
  gmeet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  other: 'Others',
};

export const PLATFORM_COLORS = {
  gmeet: '#0066FF',
  zoom: '#8B5CF6',
  teams: '#22C55E',
  other: '#94A3B8',
};

/** Identify the conferencing platform from the meeting link. */
export function getPlatform(meeting) {
  const link = (meeting?.meet_link || meeting?.link || '').toLowerCase();
  if (link.includes('meet.google.com')) return 'gmeet';
  if (link.includes('zoom.us') || link.includes('zoom.com')) return 'zoom';
  if (link.includes('teams.microsoft.com') || link.includes('teams.live.com')) return 'teams';
  return 'other';
}

/* --------------------------------------------------------------------- topic */

export const TOPIC_RULES = [
  ['Product Roadmap', ['roadmap', 'product', 'feature', 'launch', 'release']],
  ['Client Discussion', ['client', 'demo', 'customer', 'account', 'renewal', 'pitch']],
  ['Team Standup', ['standup', 'sync', 'weekly', 'team', 'all-hands', 'retrospective']],
  ['Hiring', ['hiring', 'interview', 'recruit', 'candidate', 'onboarding']],
  ['Design Review', ['design', 'ux', 'ui', 'prototype', 'figma', 'creative']],
  ['Marketing', ['marketing', 'campaign', 'brand', 'seo', 'content']],
  ['Budget & Finance', ['budget', 'finance', 'forecast', 'invoice', 'spend']],
  ['API & Integration', ['api', 'integration', 'webhook', 'backend', 'infra']],
];

export const TOPIC_COLORS = [
  '#0066FF',
  '#8B5CF6',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#0EA5E9',
  '#64748B',
  '#A855F7',
];

/** Infer a discussion topic from a meeting title. */
export function getTopic(title) {
  const t = (title || '').toLowerCase();
  for (const [topic, keys] of TOPIC_RULES) {
    if (keys.some((k) => t.includes(k))) return topic;
  }
  return 'General';
}

/**
 * Best-effort team for a person: the team of the meetings they spoke in most.
 * Returns UNASSIGNED_TEAM when they have no recorded speaking turns.
 *
 * @param {{name?: string, email?: string}} person
 * @param {Array<{title?: string, speakers?: Set<string>|string[]}>} meetingsWithSpeakers
 */
export function getPersonTeam(person, meetingsWithSpeakers) {
  const names = identityKeys(person);
  if (names.size === 0) return UNASSIGNED_TEAM;

  const tally = new Map();
  meetingsWithSpeakers.forEach((m) => {
    const speakers = m.speakers instanceof Set ? m.speakers : new Set(m.speakers || []);
    const spoke = [...speakers].some((s) => names.has(normalise(s)));
    if (!spoke) return;
    const team = getTeam(m.title);
    if (team === 'General') return;
    tally.set(team, (tally.get(team) || 0) + 1);
  });

  if (tally.size === 0) return UNASSIGNED_TEAM;

  let best = UNASSIGNED_TEAM;
  let bestCount = 0;
  for (const [team, count] of tally) {
    if (count > bestCount) {
      best = team;
      bestCount = count;
    }
  }
  return best;
}

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

/** All the ways a speaker label could refer to this person. */
function identityKeys(person) {
  const keys = new Set();
  const name = normalise(person?.name);
  if (name) {
    keys.add(name);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 1) keys.add(parts[0]);
  }
  const email = normalise(person?.email);
  if (email) {
    keys.add(email);
    keys.add(email.split('@')[0]);
  }
  return keys;
}
