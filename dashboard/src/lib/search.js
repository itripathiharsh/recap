/**
 * Real workspace search.
 *
 * The product advertises "search everything — find information, decisions and
 * exact quotes across all your past meetings", but the header box was a
 * per-page string filter over whatever list happened to be loaded. It never
 * touched transcript text or summary content, and four pages rendered an
 * uncontrolled input that did nothing at all.
 *
 * This queries the database for real, scoped to the active workspace:
 *   meetings.title       -> ILIKE
 *   speaker_turns.text   -> ILIKE  (this is where the actual spoken words live)
 *   mom.summary          -> ILIKE
 *   mom.decisions        -> ILIKE  (jsonb cast to text)
 *   mom.action_items     -> ILIKE  (jsonb cast to text)
 *
 * It never returns a meeting from another workspace: every lookup is either
 * workspace-scoped or resolved back through a scoped meeting id.
 */

import { supabase } from './supabase';
import { applyWorkspaceScope } from './workspace';

/** Escape user input for a PostgREST `or=(...)` filter / ilike pattern. */
function likePattern(q) {
  return `%${String(q).replace(/([%_\\,()])/g, '\\$1')}%`;
}

/**
 * Search a workspace. Returns { meetings, matchedFields } where meetings are
 * ordered by scheduled_start desc. Throws SupabaseFailure on a real error so
 * a failed search is never rendered as "no results".
 */
export async function searchWorkspace({ activeOrgId, query, limit = 12 }) {
  const q = String(query || '').trim();
  if (q.length < 2) return { meetings: [], query: q };

  const pattern = likePattern(q);

  // 1. Direct title matches, workspace-scoped by the caller.
  const titleQuery = applyWorkspaceScope(
    supabase.from('meetings').select('*').ilike('title', pattern),
    activeOrgId
  );
  const { data: byTitle, error: titleErr } = await titleQuery
    .order('scheduled_start', { ascending: false })
    .limit(limit);

  if (titleErr) throw titleErr;

  const found = new Map();
  (byTitle || []).forEach((m) => found.set(m.id, { meeting: m, fields: new Set(['title']) }));

  // 2. Content matches. These tables have no organisation_id, so they are
  //    resolved by intersecting the matching meeting ids with a scoped set.
  const scopeQuery = applyWorkspaceScope(
    supabase.from('meetings').select('id'),
    activeOrgId
  );
  const { data: scopedRows, error: scopeErr } = await scopeQuery;
  if (scopeErr) throw scopeErr;

  const scopedIds = (scopedRows || []).map((m) => m.id);
  if (scopedIds.length === 0) return { meetings: [], query: q };
  const scopedSet = new Set(scopedIds);

  // The content tables carry no organisation_id, so the tenant boundary is
  // pushed into the query itself: only meeting ids already resolved as
  // belonging to this workspace are ever requested.
  const contentHits = [
    {
      field: 'transcript',
      run: () =>
        supabase
          .from('speaker_turns')
          .select('meeting_id, text')
          .in('meeting_id', scopedIds)
          .ilike('text', pattern)
          .limit(500),
    },
    {
      field: 'summary',
      run: () =>
        supabase
          .from('mom')
          .select('meeting_id, summary, decisions, open_questions')
          .in('meeting_id', scopedIds)
          .ilike('summary', pattern)
          .limit(200),
    },
    {
      field: 'decisions',
      run: () =>
        supabase
          .from('mom')
          .select('meeting_id, decisions')
          .in('meeting_id', scopedIds)
          .ilike('decisions::text', pattern)
          .limit(200),
    },
    {
      field: 'action items',
      run: () =>
        supabase
          .from('mom')
          .select('meeting_id, action_items')
          .in('meeting_id', scopedIds)
          .ilike('action_items::text', pattern)
          .limit(200),
    },
  ];

  const missing = new Set();

  await Promise.all(
    contentHits.map(async ({ field, run }) => {
      const { data, error } = await run();
      // A missing optional column must not break search for the others.
      if (error) {
        if (field === 'transcript') throw error;
        // jsonb ilike (decisions / action_items) is not guaranteed to be
        // supported by PostgREST. Degrade to the fields that do work, but
        // make it diagnosable instead of silently searching nothing.
        console.warn(`[search] "${field}" search unavailable:`, error.message);
        return;
      }
      for (const row of data || []) {
        if (!scopedSet.has(row.meeting_id)) continue; // hard tenant boundary
        missing.add(row.meeting_id);
        const hit = found.get(row.meeting_id);
        if (hit) hit.fields.add(field);
        else found.set(row.meeting_id, { meeting: { id: row.meeting_id }, fields: new Set([field]) });
      }
    })
  );

  // 3. Load the full meeting rows for ids we only know from content tables.
  const needRows = [...found.values()].filter((h) => !h.meeting.title).map((h) => h.meeting.id);
  if (needRows.length > 0) {
    const { data, error } = await applyWorkspaceScope(
      supabase.from('meetings').select('*').in('id', needRows),
      activeOrgId
    );
    if (error) throw error;
    (data || []).forEach((m) => {
      const hit = found.get(m.id);
      if (hit) hit.meeting = m;
    });
  }

  const meetings = [...found.values()]
    .filter((h) => h.meeting && h.meeting.title !== undefined)
    .map((h) => ({ ...h.meeting, matchedFields: [...h.fields] }))
    .sort((a, b) => new Date(b.scheduled_start || 0) - new Date(a.scheduled_start || 0))
    .slice(0, limit);

  return { meetings, query: q };
}

export const FIELD_LABELS = {
  title: 'Title',
  transcript: 'Transcript',
  summary: 'Summary',
  decisions: 'Decisions',
  'action items': 'Action items',
};
