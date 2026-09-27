'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Users,
  Clock,
  FileText,
  Video,
  ChevronDown,
  MoreHorizontal,
  Heart,
  ListChecks,
  User,
  ArrowUpDown,
  Filter,
  ClipboardList,
  Check,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import { getTeam, getPlatform, teamColor, PLATFORM_LABEL } from '../../../lib/teams.mjs';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';

const FAVOURITES_KEY = 'recap.orgMeetingFavourites';

const AVATAR_PALETTES = [
  { bg: '#DBEAFE', text: '#1E40AF' },
  { bg: '#EDE9FE', text: '#6D28D9' },
  { bg: '#E0F2FE', text: '#0369A1' },
  { bg: '#FEF3C7', text: '#B45309' },
  { bg: '#D1FAE5', text: '#047857' },
  { bg: '#FCE7F3', text: '#BE185D' },
];

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

const STATUS_LABEL = {
  completed: 'Processed',
  processed: 'Processed',
  processing: 'Processing',
  scheduled: 'Scheduled',
  recording: 'Recording',
  joining: 'Joining',
  failed: 'Failed',
  error: 'Failed',
};

function statusMeta(meeting) {
  const raw = (meeting.status || 'scheduled').toLowerCase();
  return { key: STATUS_LABEL[raw] ? raw : 'scheduled', label: STATUS_LABEL[raw] || 'Scheduled' };
}

function formatDuration(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins === 0) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function meetingMinutes(meeting) {
  if (meeting.started_at && meeting.ended_at) {
    const diff = Math.round((new Date(meeting.ended_at) - new Date(meeting.started_at)) / 60000);
    if (diff > 0) return diff;
  }
  return Number(meeting.expected_duration_minutes) || 0;
}

function formatDayLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const same = (a, b) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  if (same(d, now)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function meetingStamp(m) {
  return new Date(m.started_at || m.scheduled_start || m.created_at || 0).getTime() || 0;
}

export default function OrganisationMeetingsPage() {
  const { activeOrgId, session } = useWorkspace();

  const [meetings, setMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [timeRange, setTimeRange] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [favourites, setFavourites] = useState(() => new Set());

  const currentUserId = session?.user?.id || null;

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!activeOrgId) {
        setMeetings([]);
        setMembers([]);
        setMoms([]);
        setSpeakerTurns({});
        return;
      }
      try {
        const [
          { data: meetingData },
          { data: memberData },
          { data: momData },
          { data: turnData },
        ] = await Promise.all([
          applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId).order(
            'scheduled_start',
            { ascending: false }
          ),
          supabase
            .from('organisation_members')
            .select('id, user_id, role, status, email, display_name, created_at')
            .eq('organisation_id', activeOrgId),
          supabase.from('mom').select('meeting_id, action_items'),
          supabase.from('speaker_turns').select('meeting_id, speaker'),
        ]);

        if (cancelled) return;

        const scoped = meetingData || [];
        setMeetings(scoped);
        setMembers(memberData || []);

        const ids = new Set(scoped.map((m) => m.id));
        setMoms(filterToMeetings(momData || [], ids));

        const byMeeting = {};
        filterToMeetings(turnData || [], ids).forEach((t) => {
          if (!byMeeting[t.meeting_id]) byMeeting[t.meeting_id] = new Set();
          if (t.speaker && t.speaker.trim()) byMeeting[t.meeting_id].add(t.speaker.trim());
        });
        setSpeakerTurns(byMeeting);
      } catch (err) {
        console.error('Organisation meetings load error:', err);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  // Favourites persist per-browser until a DB column exists.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVOURITES_KEY);
      if (raw) setFavourites(new Set(JSON.parse(raw)));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleFavourite = (id) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  /* ------------------------------------------------------------- filtering */

  const teamNames = useMemo(() => {
    const set = new Set(meetings.map((m) => getTeam(m.title)));
    return [...set].sort();
  }, [meetings]);

  const visible = useMemo(() => {
    let result = [...meetings];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(q) ||
          (m.meet_link || '').toLowerCase().includes(q) ||
          getTeam(m.title).toLowerCase().includes(q)
      );
    }

    if (activeTab === 'mine') {
      result = result.filter((m) => m.owner_id === currentUserId);
    } else if (activeTab === 'team') {
      result = result.filter((m) => m.owner_id && m.owner_id !== currentUserId);
    } else if (activeTab === 'favourites') {
      result = result.filter((m) => favourites.has(m.id));
    }

    if (timeRange !== 'all') {
      const cutoff = Date.now() - Number(timeRange) * 24 * 60 * 60 * 1000;
      result = result.filter((m) => meetingStamp(m) >= cutoff);
    }

    if (teamFilter !== 'all') {
      result = result.filter((m) => getTeam(m.title) === teamFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter((m) => {
        const { key, label } = statusMeta(m);
        return statusFilter === 'processed' ? label === 'Processed' : key === statusFilter;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '') * dir;
        case 'team':
          return getTeam(a.title).localeCompare(getTeam(b.title)) * dir;
        case 'duration':
          return (meetingMinutes(a) - meetingMinutes(b)) * dir;
        case 'participants': {
          const av = (speakerTurns[a.id] || new Set()).size;
          const bv = (speakerTurns[b.id] || new Set()).size;
          return (av - bv) * dir;
        }
        case 'status':
          return statusMeta(a).label.localeCompare(statusMeta(b).label) * dir;
        default:
          return (meetingStamp(a) - meetingStamp(b)) * dir;
      }
    });

    return result;
  }, [
    meetings,
    searchQuery,
    activeTab,
    timeRange,
    teamFilter,
    statusFilter,
    sortKey,
    sortDir,
    currentUserId,
    favourites,
    speakerTurns,
  ]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ----------------------------------------------------------------- stats */

  const stats = useMemo(() => {
    const minutes = meetings.reduce((sum, m) => sum + meetingMinutes(m), 0);
    const actionItems = moms.reduce(
      (sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0),
      0
    );
    const participants = new Set();
    Object.values(speakerTurns).forEach((set) => set && set.forEach((s) => participants.add(s)));

    return {
      meetings: meetings.length,
      hours: (minutes / 60).toFixed(1),
      participants: participants.size,
      actionItems,
    };
  }, [meetings, moms, speakerTurns]);

  const deltas = useMemo(() => {
    const now = Date.now();
    const win = 28 * 24 * 60 * 60 * 1000;
    const inRange = (m, from, to) => {
      const t = meetingStamp(m);
      return t >= from && t < to;
    };

    const cur = meetings.filter((m) => inRange(m, now - win, now + 1));
    const prev = meetings.filter((m) => inRange(m, now - win * 2, now - win));

    const pct = (a, b) => (b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / b) * 100));
    const mins = (list) => list.reduce((s, m) => s + meetingMinutes(m), 0);
    const speakerCount = (list) => {
      const s = new Set();
      list.forEach((m) => (speakerTurns[m.id] || new Set()).forEach((x) => s.add(x)));
      return s.size;
    };
    const actionCount = (list) => {
      const ids = new Set(list.map((m) => m.id));
      return moms
        .filter((m) => ids.has(m.meeting_id))
        .reduce((s, m) => s + (Array.isArray(m.action_items) ? m.action_items.length : 0), 0);
    };

    return {
      meetings: pct(cur.length, prev.length),
      hours: pct(mins(cur), mins(prev)),
      participants: pct(speakerCount(cur), speakerCount(prev)),
      actionItems: pct(actionCount(cur), actionCount(prev)),
    };
  }, [meetings, moms, speakerTurns]);

  const topTeams = useMemo(() => {
    const counts = new Map();
    meetings.forEach((m) => {
      const t = getTeam(m.title);
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    const rows = [...counts.entries()]
      .map(([name, count]) => ({ name, count, color: teamColor(name) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [meetings]);

  /* ---------------------------------------------------------------- render */

  const allVisibleChecked = visible.length > 0 && visible.every((m) => checked.has(m.id));

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visible.forEach((m) => next.delete(m.id));
      else visible.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <TopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search meetings, people, teams, or topics..."
      />

      <OrganisationPage chrome={false}>
        {/* ------------------------------------------------------------- hero */}
        <section className="org-mt-hero">
          <span className="org-mt-hero-badge">Organisation Meetings</span>
          <h1 className="org-mt-hero-title">
            All organisation meetings, <em>in one place.</em>
          </h1>
          <p className="org-mt-hero-sub">
            Recordings, transcripts, summaries and action items — across your entire organisation.
          </p>

          <div className="org-mt-hero-doodle" aria-hidden="true">
            <span className="org-mt-doodle-text">{`Find and manage all\nyour team meetings.`}</span>
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

          {/* Roster card with a processed-check badge */}
          <div className="org-mt-hero-art" aria-hidden="true">
            <svg viewBox="0 0 300 172" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="mt-blob" x1="150" y1="20" x2="150" y2="172" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#D6E7FC" />
                  <stop offset="1" stopColor="#EDF4FE" />
                </linearGradient>
              </defs>

              <path d="M40 172 C40 120, 78 92, 132 92 C186 92, 224 122, 224 172 Z" fill="url(#mt-blob)" opacity="0.75" />
              <circle cx="248" cy="34" r="26" fill="#DCEBFD" opacity="0.6" />

              {/* document card */}
              <rect x="58" y="16" width="168" height="140" rx="14" fill="#FFFFFF" />
              <rect x="58.75" y="16.75" width="166.5" height="138.5" rx="13.25" stroke="#DCE7F5" strokeWidth="1.5" />
              <rect x="74" y="30" width="52" height="7" rx="3.5" fill="#0066FF" opacity="0.85" />

              {/* roster rows */}
              <g>
                <circle cx="88" cy="60" r="12" fill="#E3EDFC" />
                <circle cx="88" cy="57" r="4" fill="#7FA8E0" />
                <path d="M80.5 67 C81.5 61.5, 94.5 61.5, 95.5 67" fill="#7FA8E0" />
                <rect x="110" y="54" width="66" height="7" rx="3.5" fill="#0066FF" />
                <rect x="110" y="66" width="98" height="6" rx="3" fill="#DCE4EE" />
              </g>
              <g>
                <circle cx="88" cy="98" r="12" fill="#E3EDFC" />
                <circle cx="88" cy="95" r="4" fill="#7FA8E0" />
                <path d="M80.5 105 C81.5 99.5, 94.5 99.5, 95.5 105" fill="#7FA8E0" />
                <rect x="110" y="92" width="52" height="7" rx="3.5" fill="#0066FF" />
                <rect x="110" y="104" width="86" height="6" rx="3" fill="#DCE4EE" />
              </g>
              <g>
                <circle cx="88" cy="136" r="12" fill="#E3EDFC" />
                <circle cx="88" cy="133" r="4" fill="#7FA8E0" />
                <path d="M80.5 143 C81.5 137.5, 94.5 137.5, 95.5 143" fill="#7FA8E0" />
                <rect x="110" y="130" width="60" height="7" rx="3.5" fill="#0066FF" />
                <rect x="110" y="142" width="92" height="6" rx="3" fill="#DCE4EE" />
              </g>

              {/* processed badge */}
              <circle cx="224" cy="128" r="27" fill="#FFFFFF" />
              <circle cx="224" cy="128" r="23" fill="#0066FF" />
              <path
                d="M214 128 L221 135 L235 121"
                stroke="#FFFFFF"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </section>

        {/* ------------------------------------------------- tabs + controls */}
        <div className="org-mt-toolbar">
          <div className="org-mt-tabs" role="tablist" aria-label="Meeting scope">
            {[
              { id: 'all', label: 'All Meetings', icon: <Calendar size={15} strokeWidth={2.2} /> },
              { id: 'mine', label: 'My Meetings', icon: <User size={15} strokeWidth={2.2} /> },
              { id: 'team', label: 'Team Meetings', icon: <Users size={15} strokeWidth={2.2} /> },
              { id: 'favourites', label: 'Favourites', icon: <Heart size={15} strokeWidth={2.2} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`org-mt-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="org-mt-controls">
            <label className="org-mt-ctl">
              <Calendar size={15} strokeWidth={2} aria-hidden="true" />
              {timeRange === 'all' ? 'All Time' : `Last ${timeRange} days`}
              <ChevronDown size={14} className="org-mt-ctl-chevron" aria-hidden="true" />
              <select
                className="org-mt-ctl-select"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                aria-label="Filter by time range"
              >
                <option value="all">All Time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>

            <label className="org-mt-ctl">
              <Users size={15} strokeWidth={2} aria-hidden="true" />
              {teamFilter === 'all' ? 'All Teams' : teamFilter}
              <ChevronDown size={14} className="org-mt-ctl-chevron" aria-hidden="true" />
              <select
                className="org-mt-ctl-select"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                aria-label="Filter by team"
              >
                <option value="all">All Teams</option>
                {teamNames.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="org-mt-ctl">
              <Filter size={15} strokeWidth={2} aria-hidden="true" />
              {statusFilter === 'all' ? 'Filter' : statusFilter === 'processed' ? 'Processed' : statusFilter}
              <ChevronDown size={14} className="org-mt-ctl-chevron" aria-hidden="true" />
              <select
                className="org-mt-ctl-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">Filter</option>
                <option value="processed">Processed</option>
                <option value="scheduled">Scheduled</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </label>

            <label className="org-mt-ctl">
              <ArrowUpDown size={15} strokeWidth={2} aria-hidden="true" />
              Sort
              <ChevronDown size={14} className="org-mt-ctl-chevron" aria-hidden="true" />
              <select
                className="org-mt-ctl-select"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':');
                  setSortKey(k);
                  setSortDir(d);
                }}
                aria-label="Sort meetings"
              >
                <option value="date:desc">Newest first</option>
                <option value="date:asc">Oldest first</option>
                <option value="title:asc">Title A–Z</option>
                <option value="duration:desc">Longest first</option>
                <option value="duration:asc">Shortest first</option>
                <option value="participants:desc">Most participants</option>
                <option value="status:asc">Status A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {/* --------------------------------------------------------- content */}
        <div className="org-mt-split">
          {/* table */}
          <div className="org-mt-card">
            <div className="org-mt-table-wrap">
              <table className="org-mt-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, paddingLeft: 16 }}>
                      <input
                        type="checkbox"
                        className="org-mt-check"
                        checked={allVisibleChecked}
                        onChange={toggleAll}
                        aria-label="Select all meetings"
                      />
                    </th>
                    <Th label="Meeting" sortKey="title" current={sortKey} dir={sortDir} onSort={onSort} />
                    <Th label="Date & Time" sortKey="date" current={sortKey} dir={sortDir} onSort={onSort} />
                    <Th label="Team" sortKey="team" current={sortKey} dir={sortDir} onSort={onSort} />
                    <Th
                      label="Participants"
                      sortKey="participants"
                      current={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <Th label="Duration" sortKey="duration" current={sortKey} dir={sortDir} onSort={onSort} />
                    <Th label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSort} />
                    <th style={{ width: 38 }} />
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
                          {activeTab === 'favourites'
                            ? 'No favourite meetings yet.'
                            : 'No meetings found.'}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#94A3B8' }}>
                          {activeTab === 'favourites'
                            ? 'Tap the menu on any meeting to add it here.'
                            : 'Try widening your filters, or schedule a new meeting.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visible.map((m) => {
                      const team = getTeam(m.title);
                      const platform = getPlatform(m);
                      const { key: statusKey, label: statusLabel } = statusMeta(m);
                      const speakers = [...(speakerTurns[m.id] || new Set())];
                      const stamp = m.started_at || m.scheduled_start || m.created_at;
                      const isFav = favourites.has(m.id);

                      return (
                        <tr
                          key={m.id}
                          className={selectedId === m.id ? 'selected' : ''}
                          onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}
                        >
                          <td style={{ paddingLeft: 16 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="org-mt-check"
                              checked={checked.has(m.id)}
                              onChange={() => toggleOne(m.id)}
                              aria-label={`Select ${m.title || 'meeting'}`}
                            />
                          </td>

                          <td>
                            <div className="org-mt-meeting">
                              <span className={`org-mt-platform ${platform}`}>
                                {platform === 'zoom' ? (
                                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    zoom
                                  </span>
                                ) : (
                                  <Video size={15} strokeWidth={2.2} />
                                )}
                              </span>
                              <span className="org-mt-meeting-text">
                                <span className="org-mt-meeting-title" title={m.title}>
                                  {m.title || 'Untitled Meeting'}
                                </span>
                                <span className="org-mt-meeting-sub">
                  {platform === 'other' ? 'Online Meeting' : PLATFORM_LABEL[platform]}
                </span>
                              </span>
                            </div>
                          </td>

                          <td>
                            <span className="org-mt-dt">
                              {stamp
                                ? new Date(stamp).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                  })
                                : '—'}
                              <span className="org-mt-dt-sub">{formatDayLabel(stamp)}</span>
                            </span>
                          </td>

                          <td>
                            <span
                              className="org-mt-team"
                              style={{
                                backgroundColor: `${teamColor(team)}1A`,
                                color: teamColor(team),
                              }}
                            >
                              {team}
                            </span>
                          </td>

                          <td>
                            {speakers.length === 0 ? (
                              <span style={{ color: '#CBD5E1' }}>—</span>
                            ) : (
                              <div className="org-mt-stack">
                                {speakers.slice(0, 2).map((s) => {
                                  const c = getAvatarColors(s);
                                  return (
                                    <span
                                      key={s}
                                      className="org-mt-av"
                                      style={{ backgroundColor: c.bg, color: c.text }}
                                      title={s}
                                    >
                                      {getInitials(s)}
                                    </span>
                                  );
                                })}
                                {speakers.length > 2 && (
                                  <span className="org-mt-av org-mt-av-more">+{speakers.length - 2}</span>
                                )}
                              </div>
                            )}
                          </td>

                          <td>
                            <span className="org-mt-dur">{formatDuration(meetingMinutes(m))}</span>
                          </td>

                          <td>
                            <span className={`org-mt-status ${statusKey}`}>
                              <span className="org-mt-status-dot" />
                              {statusLabel}
                            </span>
                          </td>

                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="org-mt-kebab"
                              aria-label={`More actions for ${m.title || 'meeting'}`}
                              title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                              onClick={() => toggleFavourite(m.id)}
                            >
                              {isFav ? (
                                <Heart size={15} fill="#EF4444" strokeWidth={0} />
                              ) : (
                                <MoreHorizontal size={16} />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* right rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* select-a-meeting / selection summary */}
            <div className="org-mt-card org-mt-card-pad">
              {selectedId ? (
                <SelectedSummary
                  meeting={visible.find((m) => m.id === selectedId) || meetings.find((m) => m.id === selectedId)}
                  speakers={[...(speakerTurns[selectedId] || new Set())]}
                  actionItems={
                    (moms.find((m) => m.meeting_id === selectedId)?.action_items || []).length
                  }
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div className="org-mt-empty" style={{ padding: '30px 12px 32px' }}>
                  <span className="org-mt-empty-icon">
                    <ClipboardList size={22} strokeWidth={1.9} />
                  </span>
                  <div className="org-mt-empty-title">Select a meeting</div>
                  <p className="org-mt-empty-sub">
                    Choose a meeting from the list to view details, transcript, summary and action
                    items.
                  </p>
                </div>
              )}
            </div>

            {/* meeting stats */}
            <div className="org-mt-card org-mt-card-pad">
              <div className="org-mt-card-head">
                <span className="org-mt-card-title">Meeting Stats</span>
                <span className="org-mt-ctl" style={{ height: 30, fontSize: 12, padding: '0 10px' }}>
                  Last 4 weeks
                  <ChevronDown size={13} className="org-mt-ctl-chevron" />
                </span>
              </div>

              <div className="org-mt-stats-grid">
                <MiniStat
                  icon={<Calendar size={15} strokeWidth={2} />}
                  value={stats.meetings}
                  delta={deltas.meetings}
                  label="Total Meetings"
                />
                <MiniStat
                  icon={<Clock size={15} strokeWidth={2} />}
                  value={stats.hours}
                  delta={deltas.hours}
                  label="Hours Recorded"
                />
                <MiniStat
                  icon={<Users size={15} strokeWidth={2} />}
                  value={stats.participants}
                  delta={deltas.participants}
                  label="Total Participants"
                />
                <MiniStat
                  icon={<FileText size={15} strokeWidth={2} />}
                  value={stats.actionItems}
                  delta={deltas.actionItems}
                  label="Action Items"
                />
              </div>
            </div>

            {/* top teams */}
            <div className="org-mt-card org-mt-card-pad">
              <div className="org-mt-card-head">
                <span className="org-mt-card-title">Top Teams</span>
                <Link href="/organisation/members" className="org-mt-link">
                  View All <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </div>

              {topTeams.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 14 }}>
                  No team activity yet.
                </p>
              ) : (
                <div className="org-mt-team-list">
                  {topTeams.map((t) => (
                    <div key={t.name} className="org-mt-team-row">
                      <span className="org-mt-team-dot" style={{ backgroundColor: t.color }} />
                      <span className="org-mt-team-name" title={t.name}>
                        {t.name}
                      </span>
                      <span className="org-mt-bar">
                        <span
                          className="org-mt-bar-fill"
                          style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                        />
                      </span>
                      <span className="org-mt-team-count">
                        {t.count} {t.count === 1 ? 'meeting' : 'meetings'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </OrganisationPage>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function Th({ label, sortKey, current, dir, onSort }) {
  const active = current === sortKey;
  return (
    <th className="sortable" onClick={() => onSort(sortKey)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <span className="org-mt-th-inner">
        {label}
        <span className={`org-mt-sort ${active ? 'on' : ''}`} aria-hidden="true">
          <svg width="8" height="11" viewBox="0 0 8 11" fill="none">
            <path d="M4 0.5 L7 4 H1 Z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.45} />
            <path d="M4 10.5 L1 7 H7 Z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.45} />
          </svg>
        </span>
      </span>
    </th>
  );
}

function MiniStat({ icon, value, delta, label }) {
  const sign = delta >= 0 ? '+' : '';
  return (
    <div className="org-mt-stat">
      <div className="org-mt-stat-top">
        <span className="org-mt-stat-icon">{icon}</span>
        <span className="org-mt-stat-value tabular-nums">{value}</span>
        <span className="org-mt-stat-delta">
          <TrendingUp size={9} strokeWidth={2.8} aria-hidden="true" />
          {sign}
          {delta}%
        </span>
      </div>
      <span className="org-mt-stat-label">{label}</span>
    </div>
  );
}

function SelectedSummary({ meeting, speakers, actionItems, onClose }) {
  if (!meeting) return null;
  const stamp = meeting.started_at || meeting.scheduled_start || meeting.created_at;
  const { label } = statusMeta(meeting);
  const team = getTeam(meeting.title);

  return (
    <div>
      <div className="org-mt-card-head" style={{ marginBottom: 14 }}>
        <span className="org-mt-card-title" style={{ fontSize: 15 }}>
          {meeting.title || 'Untitled Meeting'}
        </span>
        <Link href={`/meetings/${meeting.id}`} className="org-mt-link">
          Open <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SummaryRow icon={<Calendar size={14} />} label="Date & Time" value={stamp ? new Date(stamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
        <SummaryRow icon={<Clock size={14} />} label="Duration" value={formatDuration(meetingMinutes(meeting))} />
        <SummaryRow
          icon={<ListChecks size={14} />}
          label="Team"
          value={team}
          valueColor={teamColor(team)}
        />
        <SummaryRow icon={<Users size={14} />} label="Participants" value={speakers.length || '—'} />
        <SummaryRow icon={<FileText size={14} />} label="Action Items" value={actionItems} />
        <SummaryRow icon={<Check size={14} />} label="Status" value={label} />
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: '#94A3B8', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#64748B' }}>{label}</span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: valueColor || '#0F172A',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}
