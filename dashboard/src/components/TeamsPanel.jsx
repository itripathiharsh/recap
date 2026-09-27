'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  FileText,
  Clock,
  Plus,
  Search as SearchIcon,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Database,
  BookOpen,
  Download,
  ShieldCheck,
  UserPlus,
  X,
  AlertCircle,
  Check,
  Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';
import { getTeam, TEAM_COLORS } from '../lib/teams.mjs';

const AVATAR_PALETTES = [
  { bg: '#E3EDFD', text: '#1D4ED8' },
  { bg: '#EBE4FD', text: '#6D28D9' },
  { bg: '#FCE7F3', text: '#BE185D' },
  { bg: '#FEF3C7', text: '#B45309' },
  { bg: '#D9F7E8', text: '#047857' },
  { bg: '#E0F2FE', text: '#075985' },
];

/** Tile colours cycle in this order so inferred teams stay visually distinct. */
const TILE_COLORS = ['#8B5CF6', '#3B82F6', '#22C55E', '#F59E0B', '#EC4899', '#0EA5E9', '#64748B'];

const TEAM_ACCESS = [
  {
    key: 'meeting_data_access',
    label: 'Meeting Data Access',
    hint: 'Control access to meeting recordings, transcripts and insights.',
    icon: Database,
  },
  {
    key: 'library_access',
    label: 'Library Access',
    hint: 'Manage access to shared knowledge library.',
    icon: BookOpen,
  },
  {
    key: 'export_downloads',
    label: 'Export & Downloads',
    hint: 'Control who can export data.',
    icon: Download,
  },
];

const PAGE_SIZES = [10, 25, 50];
const MEETING_WINDOW_DAYS = 30;

function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function getAvatarColors(key) {
  if (!key) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function formatDate(dateStr) {
  if (!dateStr) return 'â€”';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function teamStamp(m) {
  return new Date(m.started_at || m.scheduled_start || m.created_at || 0).getTime() || 0;
}

/**
 * The Teams workspace, rendered inside Settings -> Teams.
 *
 * `teams` and `team_members` exist in the live schema. If the rows cannot be
 * read the panel falls back to inferring groups from meeting-title keywords so
 * the page shows real, derived numbers rather than an empty shell — and says so.
 */
export default function TeamsPanel() {
  const router = useRouter();
  const { activeOrgId, activeOrgRole } = useWorkspace();

  const [realTeams, setRealTeams] = useState(null); // null = table missing
  const [teamMembers, setTeamMembers] = useState([]);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rowMenuOpen, setRowMenuOpen] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [status, setStatus] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  /* ------------------------------------------------------------------ load */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) {
        setRealTeams(null);
        setMembers([]);
        setMeetings([]);
        return;
      }
      try {
        const [teamsRes, tmRes, memberRes, meetingRes, turnRes] = await Promise.all([
          supabase
            .from('teams')
            .select('id, name, description, color, meeting_data_access, library_access, export_downloads, created_at')
            .eq('organisation_id', activeOrgId)
            .order('created_at', { ascending: true }),
          supabase.from('team_members').select('team_id, user_id').eq('organisation_id', activeOrgId),
          supabase
            .from('organisation_members')
            .select('id, user_id, role, status, email, display_name')
            .eq('organisation_id', activeOrgId),
          applyWorkspaceScope(
            supabase.from('meetings').select('id, title, team_id, started_at, scheduled_start, created_at'),
            activeOrgId
          ),
          supabase.from('speaker_turns').select('meeting_id, speaker'),
        ]);

        if (cancelled) return;

        // A missing `teams` table is the expected pre-migration state.
        setRealTeams(teamsRes.error ? null : teamsRes.data || []);
        setTeamMembers(tmRes.error ? [] : tmRes.data || []);
        setMembers(memberRes.data || []);

        const scoped = meetingRes.data || [];
        const ids = new Set(scoped.map((m) => m.id));
        const byMeeting = {};
        (turnRes.data || []).forEach((t) => {
          if (!ids.has(t.meeting_id)) return;
          if (!byMeeting[t.meeting_id]) byMeeting[t.meeting_id] = new Set();
          if (t.speaker && t.speaker.trim()) byMeeting[t.meeting_id].add(t.speaker.trim());
        });

        setMeetings(scoped);
        setSpeakerTurns(byMeeting);
      } catch (err) {
        console.error('Teams load error:', err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  /* ------------------------------------------------------------ team rows */

  const inferred = useMemo(() => {
    if (realTeams !== null) return null; // real rows are authoritative
    const byName = new Map();
    meetings.forEach((m) => {
      const name = getTeam(m.title);
      if (!byName.has(name)) {
        byName.set(name, { name, meetings: [], speakers: new Set(), createdAt: 0 });
      }
      const row = byName.get(name);
      row.meetings.push(m);
      (speakerTurns[m.id] || new Set()).forEach((s) => row.speakers.add(s));
      const t = teamStamp(m);
      if (t && (!row.createdAt || t < row.createdAt)) row.createdAt = t;
    });
    return [...byName.values()].sort((a, b) => b.meetings.length - a.meetings.length);
  }, [realTeams, meetings, speakerTurns]);

  const windowStart = useMemo(
    () => Date.now() - MEETING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    []
  );

  const rows = useMemo(() => {
    let base;
    if (realTeams !== null) {
      const membersByTeam = new Map();
      teamMembers.forEach((tm) => {
        if (!membersByTeam.has(tm.team_id)) membersByTeam.set(tm.team_id, []);
        membersByTeam.get(tm.team_id).push(tm.user_id);
      });

      base = realTeams.map((t, i) => {
        const own = meetings.filter((m) => m.team_id === t.id);
        const speakers = new Set();
        own.forEach((m) => (speakerTurns[m.id] || new Set()).forEach((s) => speakers.add(s)));
        const userIds = membersByTeam.get(t.id) || [];
        const people = userIds
          .map((uid) => members.find((m) => m.user_id === uid))
          .filter(Boolean)
          .map((m) => ({ name: m.display_name || m.email, email: m.email }));
        return {
          key: t.id,
          name: t.name,
          description: t.description,
          color: t.color || TILE_COLORS[i % TILE_COLORS.length],
          people: people.length ? people : [...speakers].map((s) => ({ name: s, email: '' })),
          meetings30d: own.filter((m) => teamStamp(m) >= windowStart).length,
          createdAt: t.created_at,
          inferred: false,
        };
      });
    } else {
      base = (inferred || []).map((t, i) => ({
        key: `inf-${t.name}`,
        name: t.name,
        description: null,
        color: TEAM_COLORS[t.name] || TILE_COLORS[i % TILE_COLORS.length],
        people: [...t.speakers].map((s) => ({ name: s, email: '' })),
        meetings30d: t.meetings.filter((m) => teamStamp(m) >= windowStart).length,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
        inferred: true,
      }));
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      base = base.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      );
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'description':
          return (a.description || '').localeCompare(b.description || '') * dir;
        case 'members':
          return (a.people.length - b.people.length) * dir;
        case 'meetings':
          return (a.meetings30d - b.meetings30d) * dir;
        default:
          return (
            (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) * dir
          );
      }
    });
  }, [realTeams, inferred, meetings, speakerTurns, teamMembers, members, query, sortKey, sortDir, windowStart]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ----------------------------------------------------------------- stats */

  const stats = useMemo(() => {
    const totalTeams = rows.length;
    const totalMembers = rows.reduce((s, t) => s + t.people.length, 0);
    const meetingsInWindow = rows.reduce((s, t) => s + t.meetings30d, 0);
    const avg = totalTeams ? meetingsInWindow / totalTeams : 0;
    const top = rows.reduce(
      (best, t) => (t.meetings30d > (best?.meetings30d ?? -1) ? t : best),
      null
    );
    return {
      totalTeams,
      totalMembers,
      avg: avg.toFixed(1),
      top,
      meetingsInWindow,
    };
  }, [rows]);

  const distribution = useMemo(
    () =>
      rows.map((t, i) => ({
        key: t.key,
        name: t.name,
        count: t.meetings30d,
        color: t.color || TILE_COLORS[i % TILE_COLORS.length],
      })),
    [rows]
  );

  /* ---------------------------------------------------------------- create */

  const createTeam = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.from('teams').insert({
        organisation_id: activeOrgId,
        name: newName.trim(),
        description: newDescription.trim() || null,
        color: TILE_COLORS[rows.length % TILE_COLORS.length],
      });
      if (error) throw error;
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setStatus({ kind: 'ok', text: 'Team created.' });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: "We couldn't create the team. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteTeam = async (row) => {
    setRowMenuOpen(null);
    if (!window.confirm(`Delete the ${row.name} team? Meetings are not deleted.`)) return;
    setStatus(null);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', row.key);
      if (error) throw error;
      setStatus({ kind: 'ok', text: `Deleted ${row.name}.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || 'Could not delete the team.' });
    }
  };

  const allPageChecked = pageRows.length > 0 && pageRows.every((t) => checked.has(t.key));

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allPageChecked) pageRows.forEach((t) => next.delete(t.key));
      else pageRows.forEach((t) => next.add(t.key));
      return next;
    });
  };

  /* ---------------------------------------------------------------- render */

  const isInferred = realTeams === null;

  return (
    <div className="org-tm-root">
      {/* ------------------------------------------------------------- hero */}
      <section className="org-tm-hero">
        <span className="org-tm-hero-badge">Teams</span>
        <h1 className="org-tm-hero-title">
          Organise your teams, <em>streamline collaboration.</em>
        </h1>
        <p className="org-tm-hero-sub">
          Create teams, assign members, and manage access to meetings and data.
        </p>

        <div className="org-tm-hero-doodle" aria-hidden="true">
          <span className="org-tm-doodle-text">
            {'Keep teams aligned.\nMake knowledge accessible.'}
          </span>
          <svg width="40" height="44" viewBox="0 0 50 52" fill="none">
            <path
              d="M10 6 C 20 18, 30 28, 34 44 M 24 44 L 34 45 L 37 34"
              stroke="#0066FF"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="org-tm-hero-art" aria-hidden="true">
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="tm-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M50 168 C50 112, 92 84, 156 84 C220 84, 258 114, 258 168 Z" fill="url(#tm-blob)" opacity="0.8" />
            <circle cx="66" cy="42" r="20" fill="#DCEBFD" opacity="0.5" />

            <circle cx="100" cy="66" r="30" fill="#FFFFFF" />
            <circle cx="100" cy="58" r="10" fill="#5B8FE0" />
            <path d="M85 84 C86 73, 114 73, 115 84 Z" fill="#5B8FE0" />

            <circle cx="152" cy="88" r="24" fill="#CFE0F7" />
            <circle cx="152" cy="82" r="8" fill="#7FA8E0" />
            <path d="M139 101 C140 92, 164 92, 165 101 Z" fill="#7FA8E0" />

            <circle cx="200" cy="60" r="34" fill="#FFFFFF" />
            <circle cx="200" cy="51" r="11" fill="#2F6FE4" />
            <path d="M184 79 C185 66, 215 66, 216 79 Z" fill="#2F6FE4" />

            {/* folder badge */}
            <circle cx="246" cy="104" r="33" fill="#FFFFFF" />
            <circle cx="246" cy="104" r="28" fill="#0066FF" />
            <path
              d="M232 96 L240 96 L243 100 L260 100 A3 3 0 0 1 263 103 L263 116 A3 3 0 0 1 260 119 L232 119 A3 3 0 0 1 229 116 L229 99 A3 3 0 0 1 232 96 Z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      </section>

      {/* ---------------------------------------------------------- metrics */}
      <section className="org-tm-metrics">
        <MetricCard
          icon={<Users size={20} strokeWidth={2} />}
          label="Total Teams"
          value={stats.totalTeams}
          sub="Across your organisation"
        />
        <MetricCard
          icon={<Users size={20} strokeWidth={2} />}
          label="Total Members"
          value={stats.totalMembers}
          sub="Across all teams"
        />
        <MetricCard
          icon={<FileText size={20} strokeWidth={2} />}
          label="Avg. Meetings per Team"
          value={stats.avg}
          sub="in last 4 weeks"
        />
        <MetricCard
          icon={<Clock size={20} strokeWidth={2} />}
          label="Most Active"
          value={stats.top ? stats.top.meetings30d : 0}
          sub={stats.top ? `meetings Â· ${stats.top.name}` : 'No meetings yet'}
        />
      </section>

      {/* ---------------------------------------------------------- toolbar */}
      <div className="org-tm-toolbar">
        <div className="org-tm-search">
          <SearchIcon size={15} className="org-tm-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="org-tm-search-input"
            placeholder="Search teams..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search teams"
          />
        </div>

        <button
          type="button"
          className="org-tm-btn-primary"
          onClick={() => setCreateOpen(true)}
          disabled={!canManage}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          Create Team
        </button>
      </div>

      {status && (
        <div className={`org-tm-notice ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.kind === 'ok' ? (
            <Check size={15} aria-hidden="true" />
          ) : status.kind === 'error' ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <Info size={15} aria-hidden="true" />
          )}
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {isInferred && !status && (
        <div className="org-tm-notice info">
          <Info size={15} aria-hidden="true" />
          <span>
            We couldn't load your saved teams, so these are grouped from your meeting titles
            instead. Creating and editing real teams may not stick until this is resolved.
          </span>
        </div>
      )}

      {/* ---------------------------------------------------------- content */}
      <div className="org-tm-split">
        <div className="org-tm-card">
          <div className="org-tm-table-wrap">
            <table className="org-tm-table">
              <thead>
                <tr>
                  <th style={{ width: 34, paddingLeft: 16 }}>
                    <input
                      type="checkbox"
                      className="org-tm-check"
                      checked={allPageChecked}
                      onChange={toggleAll}
                      aria-label="Select all teams on this page"
                    />
                  </th>
                  <SortableTh label="Name" k="name" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortableTh label="Description" k="description" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortableTh label="Members" k="members" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortableTh label="Meetings (30d)" k="meetings" current={sortKey} dir={sortDir} onSort={onSort} />
                  <SortableTh label="Created On" k="created" current={sortKey} dir={sortDir} onSort={onSort} />
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="org-tm-empty">
                        <div className="org-tm-empty-title">
                          {query.trim() ? 'No teams match your search.' : 'No teams yet.'}
                        </div>
                        <p className="org-tm-empty-sub">
                          {query.trim()
                            ? 'Try a different team name.'
                            : 'Create a team, or record a meeting so one can be inferred.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageRows.map((t) => {
                    const shown = t.people.slice(0, 3);
                    const extra = t.people.length - shown.length;
                    return (
                      <tr key={t.key}>
                        <td style={{ paddingLeft: 16 }}>
                          <input
                            type="checkbox"
                            className="org-tm-check"
                            checked={checked.has(t.key)}
                            onChange={() =>
                              setChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.key)) next.delete(t.key);
                                else next.add(t.key);
                                return next;
                              })
                            }
                            aria-label={`Select ${t.name}`}
                          />
                        </td>

                        <td>
                          <div className="org-tm-name">
                            <span
                              className="org-tm-tile"
                              style={{ backgroundColor: `${t.color}1A`, color: t.color }}
                            >
                              <Users size={16} strokeWidth={2.1} />
                            </span>
                            <span className="org-tm-name-label" title={t.name}>
                              {t.name}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="org-tm-desc" title={t.description || undefined}>
                            {t.description || 'â€”'}
                          </span>
                        </td>

                        <td>
                          {shown.length === 0 ? (
                            <span style={{ color: '#CBD5E1' }}>â€”</span>
                          ) : (
                            <div className="org-tm-stack">
                              {shown.map((p) => {
                                const c = getAvatarColors(p.name || p.email);
                                return (
                                  <span
                                    key={p.name}
                                    className="org-tm-av"
                                    style={{ backgroundColor: c.bg, color: c.text }}
                                    title={p.name}
                                  >
                                    {getInitials(p.name, p.email)}
                                  </span>
                                );
                              })}
                              {extra > 0 && <span className="org-tm-av more">+{extra}</span>}
                            </div>
                          )}
                        </td>

                        <td>
                          <span className="org-tm-num tabular-nums">{t.meetings30d}</span>
                        </td>

                        <td>
                          <span className="org-tm-date tabular-nums">{formatDate(t.createdAt)}</span>
                        </td>

                        <td style={{ position: 'relative' }}>
                          {canManage && !t.inferred && (
                            <>
                              <button
                                type="button"
                                className="org-tm-kebab"
                                aria-label={`Actions for ${t.name}`}
                                aria-expanded={rowMenuOpen === t.key}
                                onClick={() => setRowMenuOpen(rowMenuOpen === t.key ? null : t.key)}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                              {rowMenuOpen === t.key && (
                                <div className="org-tm-menu" role="menu">
                                  <button
                                    type="button"
                                    className="org-tm-menu-item danger"
                                    onClick={() => deleteTeam(t)}
                                  >
                                    <Trash2 size={13} aria-hidden="true" />
                                    Delete team
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="org-tm-foot">
            <span className="org-tm-foot-info">
              {rows.length === 0
                ? 'No teams'
                : `Showing ${(safePage - 1) * pageSize + 1}â€“${Math.min(safePage * pageSize, rows.length)} of ${rows.length} ${rows.length === 1 ? 'team' : 'teams'}`}
            </span>

            <div className="org-tm-foot-controls">
              <div className="org-tm-pages">
                <button
                  type="button"
                  className="org-tm-page"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  &lsaquo;
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`org-tm-page ${n === safePage ? 'active' : ''}`}
                    onClick={() => setPage(n)}
                    aria-current={n === safePage ? 'page' : undefined}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="org-tm-page"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label="Next page"
                >
                  &rsaquo;
                </button>
              </div>

              <label className="org-tm-perpage">
                {pageSize} per page
                <ChevronDown size={13} style={{ marginLeft: 6, color: '#64748B' }} aria-hidden="true" />
                <select
                  className="org-tm-perpage-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Teams per page"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} per page
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- rail */}
        <div className="org-tm-rail">
          <div className="org-tm-card org-tm-card-pad">
            <div className="org-tm-card-head">
              <span className="org-tm-card-title">Team Distribution</span>
            </div>

            {distribution.length === 0 ? (
              <p className="org-tm-empty-sub" style={{ marginTop: 14 }}>
                No meetings recorded yet.
              </p>
            ) : (
              <div className="org-tm-donut-wrap">
                <Donut segments={distribution}>
                  <span className="org-tm-donut-value">{rows.length}</span>
                  <span className="org-tm-donut-label">Teams</span>
                </Donut>
                <div className="org-tm-legend">
                  {distribution.map((d) => (
                    <div key={d.key} className="org-tm-legend-row">
                      <span className="org-tm-legend-dot" style={{ backgroundColor: d.color }} />
                      <span className="org-tm-legend-name" title={d.name}>
                        {d.name}
                      </span>
                      <span className="org-tm-legend-value tabular-nums">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="org-tm-card org-tm-card-pad">
            <div className="org-tm-card-title">Team Access</div>
            <div className="org-tm-card-sub" style={{ marginBottom: 6 }}>
              Manage what each team can access.
            </div>

            <div className="org-tm-access-list">
              {TEAM_ACCESS.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    type="button"
                    className="org-tm-access-row"
                    onClick={() =>
                      setStatus({
                        kind: 'info',
                        text: `Per-team ${a.label.toLowerCase()} isn't available yet.`,
                      })
                    }
                  >
                    <span className="org-tm-access-icon">
                      <Icon size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="org-tm-access-text">
                      <span className="org-tm-access-label">{a.label}</span>
                      <span className="org-tm-access-hint">{a.hint}</span>
                    </span>
                    <ChevronRight size={15} className="org-tm-access-chevron" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="org-tm-card org-tm-card-pad">
            <div className="org-tm-card-title">Quick Actions</div>
            <div className="org-tm-quick">
              <button
                type="button"
                className="org-tm-quick-btn"
                onClick={() => setCreateOpen(true)}
                disabled={!canManage}
              >
                <UserPlus size={16} strokeWidth={2.1} aria-hidden="true" />
                Create Team
              </button>
              <button
                type="button"
                className="org-tm-quick-btn"
                onClick={() =>
                  setStatus({
                    kind: 'info',
          text: "Per-team permissions aren't available yet.",
                  })
                }
              >
                <ShieldCheck size={16} strokeWidth={2.1} aria-hidden="true" />
                Manage Permissions
                <ChevronRight size={14} className="org-tm-quick-chevron" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* create team modal */}
      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Create Team</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={{ color: 'var(--text-secondary)', padding: 2, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status?.kind === 'error' && (
              <div className="org-tm-notice error" style={{ marginBottom: 14 }}>
                <AlertCircle size={14} aria-hidden="true" />
                <span>{status.text}</span>
              </div>
            )}

            <form onSubmit={createTeam}>
              <div className="form-group">
                <label className="form-label" htmlFor="tm-name">
                  Team Name
                </label>
                <input
                  id="tm-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Product"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="tm-desc">
                  Description
                </label>
                <textarea
                  id="tm-desc"
                  className="form-input"
                  rows={3}
                  placeholder="What this team works on"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Creatingâ€¦' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function MetricCard({ icon, label, value, sub }) {
  return (
    <div className="org-tm-metric">
      <div className="org-tm-metric-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="org-tm-metric-label">{label}</div>
        <div className="org-tm-metric-value tabular-nums">{value}</div>
        <div className="org-tm-metric-sub">{sub}</div>
      </div>
    </div>
  );
}

function SortableTh({ label, k, current, dir, onSort }) {
  const active = current === k;
  return (
    <th
      className="sortable"
      onClick={() => onSort(k)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="org-tm-th-inner">
        {label}
        <span className={`org-tm-sort ${active ? 'on' : ''}`} aria-hidden="true">
          <svg width="8" height="11" viewBox="0 0 8 11" fill="none">
            <path d="M4 0.5 L7 4 H1 Z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.45} />
            <path d="M4 10.5 L1 7 H7 Z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.45} />
          </svg>
        </span>
      </span>
    </th>
  );
}

function Donut({ segments, children }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="org-tm-donut">
      <svg viewBox="0 0 124 124" width="124" height="124" role="presentation">
        <circle cx="62" cy="62" r={radius} fill="none" stroke="#EDF2F9" strokeWidth="20" />
        {total > 0 &&
          segments.map((s) => {
            if (s.count <= 0) return null;
            const length = (s.count / total) * circumference;
            const el = (
              <circle
                key={s.key}
                cx="62"
                cy="62"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="20"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 62 62)"
              />
            );
            offset += length;
            return el;
          })}
      </svg>
      <div className="org-tm-donut-center">{children}</div>
    </div>
  );
}
