/**
 * Pure workspace-scope helpers (no React, no Supabase imports).
 * Kept as .mjs so both the Next.js bundle and `node --test` can import it.
 */

/**
 * Apply the active workspace scope to a meetings query builder.
 * Personal workspace => organisation_id IS NULL; organisation => organisation_id = org.
 */
export function applyWorkspaceScope(query, activeOrgId) {
  if (activeOrgId) {
    return query.eq('organisation_id', activeOrgId);
  }
  return query.is('organisation_id', null);
}

/** Filter child-table rows (mom, speaker_turns, ...) down to scoped meeting ids. */
export function filterToMeetings(rows, meetingIds) {
  if (!rows) return [];
  return rows.filter((row) => meetingIds.has(row.meeting_id));
}

/**
 * Decide which workspace should be active after a page load/refresh.
 * A stored id is honoured only if it is 'personal' or a currently
 * valid organisation id; otherwise fall back to 'personal'.
 */
export function resolveInitialWorkspace(stored, orgs) {
  const orgIds = (orgs || []).map((o) => o.id);
  const isValid = stored && (stored === 'personal' || orgIds.includes(stored));
  return isValid ? stored : 'personal';
}
