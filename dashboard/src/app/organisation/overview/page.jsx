'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Video,
  Users,
  Clock,
  FileText,
  ChevronDown,
  Calendar,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import { isPlaceholderSpeaker } from '../../../lib/metrics';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';

const AVATAR_PALETTES = [
  { bg: '#E4EDFB', text: '#1E40AF' },
  { bg: '#EDE9FE', text: '#5B21B6' },
  { bg: '#E0F2FE', text: '#075985' },
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

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMeetingDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(d, now)) {
    return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (sameDay(d, yesterday)) {
    return `Yesterday, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

const CHART = {
  width: 620,
  height: 200,
  left: 44,
  right: 12,
  top: 10,
  bottom: 34,
};

export default function OrganisationOverviewPage() {
  const { activeOrgId, activeWorkspace, session } = useWorkspace();

  const [organisation, setOrganisation] = useState(null);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activityRange, setActivityRange] = useState(4);

  const currentUserEmail = (session?.user?.email || '').toLowerCase();

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!activeOrgId) {
        setOrganisation(null);
        setMembers([]);
        setMeetings([]);
        setMoms([]);
        setSpeakerTurns({});
        return;
      }

      try {
        const [
          { data: orgData },
          { data: memberData },
          { data: meetingData },
          { data: momData },
          { data: turnsData },
        ] = await Promise.all([
          supabase
            .from('organisations')
            .select('id, name, description, created_at, owner_id')
            .eq('id', activeOrgId)
            .maybeSingle(),
          supabase
            .from('organisation_members')
            .select('id, user_id, role, status, email, display_name, created_at')
            .eq('organisation_id', activeOrgId)
            .order('created_at', { ascending: true }),
          applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId).order(
            'scheduled_start',
            { ascending: false }
          ),
          supabase.from('mom').select('meeting_id, action_items'),
          supabase.from('speaker_turns').select('meeting_id, speaker'),
        ]);

        if (cancelled) return;

        setOrganisation(orgData || null);
        setMembers(memberData || []);

        const scopedMeetings = meetingData || [];
        setMeetings(scopedMeetings);

        const scopedIds = new Set(scopedMeetings.map((m) => m.id));
        setMoms(filterToMeetings(momData || [], scopedIds));

        const turnsMap = {};
        filterToMeetings(turnsData || [], scopedIds).forEach((t) => {
          if (!turnsMap[t.meeting_id]) turnsMap[t.meeting_id] = new Set();
          if (t.speaker && t.speaker.trim()) turnsMap[t.meeting_id].add(t.speaker.trim());
        });
        setSpeakerTurns(turnsMap);
      } catch (err) {
        console.error('Organisation overview load error:', err);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  /* ---------------------------------------------------------------- metrics */

  const metrics = useMemo(() => {
    const activeMembers = members.filter((m) => m.status === 'active').length;

    // Measured only. expected_duration_minutes is a plan, not a recording, and
    // including it here is what made this card disagree with /meetings.
    let totalMinutes = 0;
    let untimedCompleted = 0;
    meetings.forEach((m) => {
      if (m.started_at && m.ended_at) {
        const diff = Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000);
        if (diff > 0) {
          totalMinutes += diff;
          return;
        }
      }
      if (m.status === 'completed') untimedCompleted += 1;
    });

    const actionItems = moms.reduce(
      (sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0),
      0
    );

    return {
      totalMeetings: meetings.length,
      activeMembers,
      hoursRecorded: (totalMinutes / 60).toFixed(1),
      actionItems,
    };
  }, [meetings, members, moms]);

  /* ------------------------------------------------------- period-over-period */

  const deltas = useMemo(() => {
    const now = new Date();
    const windowMs = activityRange * 7 * 24 * 60 * 60 * 1000;
    const currentStart = new Date(now.getTime() - windowMs);
    const previousStart = new Date(now.getTime() - windowMs * 2);

    const meetingStamp = (m) =>
      new Date(m.started_at || m.scheduled_start || m.created_at || 0);

    const current = meetings.filter((m) => {
      const d = meetingStamp(m);
      return d >= currentStart && d <= now;
    });
    const previous = meetings.filter((m) => {
      const d = meetingStamp(m);
      return d >= previousStart && d < currentStart;
    });

    // A percentage change from a zero baseline is not a growth rate.
    const pct = (cur, prev) => {
      if (prev === 0) return cur === 0 ? 0 : null;
      return Math.round(((cur - prev) / prev) * 100);
    };

    // Hours come only from a real start/end pair. Falling back to
    // expected_duration_minutes reported planned time as recorded time, which is
    // why this page said 0.0h while /meetings said 4.5h for the same meetings.
    const measure = (list) =>
      list.reduce((sum, m) => {
        const a = m.started_at ? new Date(m.started_at) : null;
        const b = m.ended_at ? new Date(m.ended_at) : null;
        if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return sum;
        const diff = Math.round((b - a) / 60000);
        return sum + (diff > 0 ? diff : 0);
      }, 0);

    const currentMinutes = measure(current);
    const previousMinutes = measure(previous);

    const currentMembers = members.filter((m) => new Date(m.created_at) >= currentStart).length;
    const previousMembers = members.filter((m) => {
      const d = new Date(m.created_at);
      return d >= previousStart && d < currentStart;
    }).length;

    return {
      meetings: pct(current.length, previous.length),
      members: pct(currentMembers, previousMembers),
      hours: pct(currentMinutes, previousMinutes),
      items: pct(actionItemsTotal(moms, currentStart, now), actionItemsTotal(moms, previousStart, currentStart)),
    };

    function actionItemsTotal(list, from, to) {
      const ids = new Set(
        meetings
          .filter((m) => {
            const d = meetingStamp(m);
            return d >= from && d < to;
          })
          .map((m) => m.id)
      );
      return list
        .filter((m) => ids.has(m.meeting_id))
        .reduce((sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0), 0);
    }
  }, [meetings, members, moms, activityRange]);

  /* ------------------------------------------------------------- line chart */

  const chart = useMemo(() => {
    const weeks = [];
    const now = startOfDay(new Date());
    for (let i = activityRange - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({
        start,
        end,
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        meetings: 0,
        hours: 0,
      });
    }

    meetings.forEach((m) => {
      const d = new Date(m.started_at || m.scheduled_start || m.created_at || 0);
      if (Number.isNaN(d.getTime())) return;
      const bucket = weeks.find((w) => d >= w.start && d < w.end);
      if (!bucket) return;
      bucket.meetings += 1;
      if (m.started_at && m.ended_at) {
        const diff = (new Date(m.ended_at) - new Date(m.started_at)) / 3600000;
        if (diff > 0) bucket.hours += diff;
      }
    });

    const peak = Math.max(0, ...weeks.map((w) => Math.max(w.meetings, w.hours)));
    const maxScale = Math.max(8, Math.ceil(peak / 2) * 2);

    const plotLeft = CHART.left;
    const plotRight = CHART.width - CHART.right;
    const plotTop = CHART.top;
    const plotBottom = CHART.height - CHART.bottom;
    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;
    const step = weeks.length > 1 ? plotW / weeks.length : plotW;

    const point = (value, index) => [
      plotLeft + step * (index + 0.5),
      plotBottom - (value / maxScale) * plotH,
    ];

    const toPath = (key) =>
      weeks
        .map((w, i) => {
          const [x, y] = point(w[key], i);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    return {
      weeks,
      maxScale,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxScale * f)),
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      point,
      meetingsPath: toPath('meetings'),
      hoursPath: toPath('hours'),
    };
  }, [meetings, activityRange]);

  /* ------------------------------------------------------------ donut + lists */

  const teamActivity = useMemo(() => {
    let active = 0;
    let inactive = 0;
    members.forEach((m) => {
      if (m.status === 'active') active += 1;
      else inactive += 1;
    });
    const noMeetings = Math.max(0, active - countMembersWhoSpoke(members, speakerTurns));

    return { active, inactive, noMeetings, total: members.length };
  }, [members, speakerTurns]);

  const recentMeetings = useMemo(() => meetings.slice(0, 4), [meetings]);

  const upcomingMeetings = useMemo(() => {
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return meetings
      .filter((m) => {
        const d = new Date(m.scheduled_start || 0);
        return d >= now && d <= weekOut;
      })
      .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
      .slice(0, 4);
  }, [meetings]);

  /**
   * Top participants, counted from the speaker turns themselves.
   *
   * The previous version matched diarization labels against
   * `organisation_members.display_name`, so any label that did not match a
   * member row produced 0 and the card read "0 Meetings" directly beneath a
   * populated Recent Meetings list. Counting the turns is both simpler and
   * actually true. Placeholder labels are excluded because they are not people.
   */
  const topParticipants = useMemo(() => {
    const turns = new Map();
    const meetingsSeen = new Map();
    Object.entries(speakerTurns).forEach(([meetingId, set]) => {
      if (!set) return;
      set.forEach((speaker) => {
        if (isPlaceholderSpeaker(speaker)) return;
        turns.set(speaker, (turns.get(speaker) || 0) + 1);
        if (!meetingsSeen.has(speaker)) meetingsSeen.set(speaker, new Set());
        meetingsSeen.get(speaker).add(meetingId);
      });
    });

    const memberByName = new Map(
      members.map((m) => [
        (m.display_name || m.email?.split('@')[0] || '').trim().toLowerCase(),
        m,
      ])
    );

    return [...turns.entries()]
      .map(([name, count]) => {
        const member = memberByName.get(name.toLowerCase());
        return {
          key: member?.id || member?.email || name,
          name,
          email: member?.email || '',
          count,
          meetings: meetingsSeen.get(name)?.size || 0,
        };
      })
      .sort((a, b) => b.meetings - a.meetings || b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 4);
  }, [members, speakerTurns]);

  const orgName = organisation?.name || activeWorkspace?.name || 'Organisation';

  return (
    <>
      <TopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search meetings, people, teams, or insights..."
      />

      <OrganisationPage chrome={false}>
        <div className="org-ov">
          {/* ------------------------------------------------------------ hero */}
          <section className="org-ov-hero">
            <span className="org-ov-hero-badge">Organisation Overview</span>
            <h1 className="org-ov-hero-title">
              {orgName} <em>Workspace</em>
            </h1>
            <p className="org-ov-hero-sub">
              Manage your organisation&apos;s meetings, people, knowledge and insights — all in
              one place.
            </p>

            {/* Hand-drawn marker annotation with curved arrow */}
            <div className="org-ov-hero-doodle" aria-hidden="true">
              <span className="org-ov-doodle-text">More collaboration. More clarity.</span>
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

            {/* Pastel isometric office-building cluster */}
            <div className="org-ov-hero-art" aria-hidden="true">
              <svg viewBox="78 -6 328 184" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="ovb-sky" x1="200" y1="0" x2="200" y2="170" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#DCEBFC" />
                    <stop offset="1" stopColor="#F2F8FF" />
                  </linearGradient>
                  <linearGradient id="ovb-tall" x1="252" y1="40" x2="252" y2="160" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#5B9BF8" />
                    <stop offset="1" stopColor="#2F6FE4" />
                  </linearGradient>
                  <linearGradient id="ovb-mid" x1="176" y1="70" x2="176" y2="160" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#9CC4FA" />
                    <stop offset="1" stopColor="#6BA3F5" />
                  </linearGradient>
                  <linearGradient id="ovb-short" x1="330" y1="88" x2="330" y2="160" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#BEDCFC" />
                    <stop offset="1" stopColor="#8CBBF7" />
                  </linearGradient>
                </defs>

                <path d="M120 170 L120 96 L176 70 L232 96 L232 170 Z" fill="url(#ovb-mid)" />
                <path d="M232 96 L176 122 L120 96 L176 70 Z" fill="#CDE3FD" />
                <path d="M176 122 L176 170 L232 170 L232 96 Z" fill="#5E9BF3" />

                <path d="M212 170 L212 40 L268 24 L324 48 L324 170 Z" fill="url(#ovb-tall)" />
                <path d="M324 48 L268 72 L212 48 L268 24 Z" fill="#B9D8FB" />
                <path d="M268 72 L268 170 L324 170 L324 48 Z" fill="#3D7BE8" />

                <path d="M300 170 L300 100 L344 84 L388 102 L388 170 Z" fill="url(#ovb-short)" />
                <path d="M388 102 L344 118 L300 100 L344 84 Z" fill="#DCEBFD" />
                <path d="M344 118 L344 170 L388 170 L388 102 Z" fill="#7FACE7" />

                {/* windows */}
                <g fill="#FFFFFF" opacity="0.9">
                  <rect x="140" y="104" width="14" height="12" rx="2" />
                  <rect x="162" y="112" width="14" height="12" rx="2" />
                  <rect x="140" y="128" width="14" height="12" rx="2" />
                  <rect x="162" y="136" width="14" height="12" rx="2" />

                  <rect x="232" y="66" width="14" height="12" rx="2" />
                  <rect x="278" y="82" width="14" height="12" rx="2" />
                  <rect x="300" y="72" width="14" height="12" rx="2" />
                  <rect x="232" y="92" width="14" height="12" rx="2" />
                  <rect x="278" y="108" width="14" height="12" rx="2" />
                  <rect x="300" y="98" width="14" height="12" rx="2" />
                  <rect x="232" y="118" width="14" height="12" rx="2" />
                  <rect x="278" y="134" width="14" height="12" rx="2" />
                  <rect x="300" y="124" width="14" height="12" rx="2" />

                  <rect x="316" y="112" width="12" height="11" rx="2" />
                  <rect x="352" y="126" width="12" height="11" rx="2" />
                  <rect x="316" y="136" width="12" height="11" rx="2" />
                  <rect x="352" y="150" width="12" height="11" rx="2" />
                </g>

                {/* clouds */}
                <path d="M296 34 C300 24, 312 22, 318 27 C324 17, 340 18, 344 28 C352 26, 358 32, 356 40 L296 40 Z" fill="#FFFFFF" opacity="0.95" />
                <path d="M148 58 C152 48, 164 46, 170 51 C176 41, 192 42, 196 52 C204 50, 210 56, 208 64 L148 64 Z" fill="#FFFFFF" opacity="0.7" />

                {/* trees */}
                <g fill="#6FA8E8">
                  <path d="M104 170 C104 152, 96 146, 96 138 C96 128, 104 122, 112 122 C120 122, 128 128, 128 138 C128 146, 120 152, 120 170 Z" />
                  <rect x="110" y="152" width="4" height="18" fill="#8C7A63" />
                </g>
                <g fill="#8CBBF0">
                  <path d="M348 170 C348 156, 342 151, 342 144 C342 136, 348 131, 355 131 C362 131, 368 136, 368 144 C368 151, 362 156, 362 170 Z" />
                  <rect x="353" y="155" width="4" height="15" fill="#8C7A63" />
                </g>
              </svg>
            </div>
          </section>

          {/* --------------------------------------------------------- metrics */}
          <section className="org-ov-metrics">
            <MetricCard
              icon={<Video size={20} strokeWidth={2} />}
              label="Total Meetings"
              value={metrics.totalMeetings}
              delta={deltas.meetings}
              tone="up"
              sub="Across your organisation"
            />
            <MetricCard
              icon={<Users size={20} strokeWidth={2} />}
              label="Active Members"
              value={metrics.activeMembers}
              delta={deltas.members}
              tone="info"
              sub="Team members with access"
            />
            <MetricCard
              icon={<Clock size={20} strokeWidth={2} />}
              label="Hours Recorded"
              value={metrics.hoursRecorded}
              delta={deltas.hours}
              tone="violet"
              sub="Total recorded audio"
            />
            <MetricCard
              icon={<FileText size={20} strokeWidth={2} />}
              label="Action Items"
              value={metrics.actionItems}
              delta={deltas.items}
              tone="up"
              sub="Extracted from meetings"
            />
          </section>

          {/* ---------------------------------------------------- middle split */}
          <div className="org-ov-split">
            {/* Meeting Activity */}
            <div className="org-ov-card">
              <div className="org-ov-card-head">
                <div>
                  <div className="org-ov-card-title">Meeting Activity</div>
                  <div className="org-ov-card-sub">
                    Total meetings and recording hours across your organisation.
                  </div>
                </div>
                <RangeSelect value={activityRange} onChange={setActivityRange} />
              </div>

              <div className="org-ov-chart">
                <div className="org-ov-legend">
                  <span className="org-ov-legend-item">
                    <span className="org-ov-legend-swatch" style={{ backgroundColor: '#3B82F6' }} />
                    Meetings
                  </span>
                  <span className="org-ov-legend-item">
                    <span className="org-ov-legend-swatch" style={{ backgroundColor: '#8B5CF6' }} />
                    Hours
                  </span>
                </div>

                <svg
                  className="org-ov-chart-svg"
                  viewBox={`0 0 ${CHART.width} ${CHART.height}`}
                  role="img"
                  aria-label={`Meeting activity over the last ${activityRange} weeks`}
                >
                  {/* gridlines + y labels */}
                  {chart.ticks.map((tick, i) => {
                    const y =
                      chart.plotBottom -
                      (tick / chart.maxScale) * (chart.plotBottom - chart.plotTop);
                    return (
                      <g key={tick}>
                        <line
                          x1={chart.plotLeft}
                          y1={y}
                          x2={chart.plotRight}
                          y2={y}
                          stroke={i === 0 ? '#D8E1EC' : '#EDF1F6'}
                          strokeWidth="1"
                        />
                        <text
                          x={chart.plotLeft - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="11"
                          fill="#94A3B8"
                          fontFamily="inherit"
                        >
                          {tick}
                        </text>
                      </g>
                    );
                  })}

                  {/* series */}
                  <path d={chart.meetingsPath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={chart.hoursPath} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                  {chart.weeks.map((w, i) => (
                    <g key={w.label}>
                      <circle
                        {...circleProps(chart, w.meetings, i)}
                        fill="#FFFFFF"
                        stroke="#3B82F6"
                        strokeWidth="2"
                      />
                      <circle
                        {...circleProps(chart, w.hours, i)}
                        fill="#FFFFFF"
                        stroke="#8B5CF6"
                        strokeWidth="2"
                      />
                      <text
                        x={chart.point(0, i)[0]}
                        y={CHART.height - 12}
                        textAnchor="middle"
                        fontSize="11.5"
                        fill="#64748B"
                        fontFamily="inherit"
                      >
                        {w.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* Team Activity */}
            <div className="org-ov-card">
              <div className="org-ov-card-head">
                <div>
                  <div className="org-ov-card-title">Team Activity</div>
                  <div className="org-ov-card-sub">
                    Meeting participation across your organisation.
                  </div>
                </div>
                <RangeSelect value={activityRange} onChange={setActivityRange} />
              </div>

              <div className="org-ov-donut-wrap">
                <Donut
                  segments={[
                    { value: teamActivity.active, color: '#22C55E' },
                    { value: teamActivity.inactive, color: '#94A3B8' },
                  ]}
                >
                  <span className="org-ov-donut-value">{teamActivity.total}</span>
                  <span className="org-ov-donut-label">Members</span>
                </Donut>

                <div className="org-ov-donut-legend">
                  <LegendRow color="#22C55E" name="Active" value={teamActivity.active} />
                  <LegendRow color="#94A3B8" name="Inactive" value={teamActivity.inactive} />
                  <LegendRow color="#CBD5E1" name="No Meetings Yet" value={teamActivity.noMeetings} />
                </div>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------- bottom row */}
          <div className="org-ov-bottom">
            {/* Recent Meetings */}
            <div className="org-ov-card">
              <div className="org-ov-card-head">
                <div>
                  <div className="org-ov-card-title">Recent Meetings</div>
                  <div className="org-ov-card-sub">Latest meetings from your organisation.</div>
                </div>
                <Link href="/organisation/meetings" className="org-ov-link">
                  View All <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </div>

              {recentMeetings.length === 0 ? (
                <EmptyState
                  title="No meetings yet."
                  sub="Your organisation's meetings will appear here"
                />
              ) : (
                <div className="org-ov-people">
                  {recentMeetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="org-ov-person"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="org-ov-avatar" style={{ backgroundColor: '#EAF2FF', color: '#0066FF' }}>
                        <Video size={15} strokeWidth={2} />
                      </span>
                      <span className="org-ov-person-meta">
                        <span className="org-ov-person-name">{m.title || 'Untitled Meeting'}</span>
                        <span className="org-ov-person-mail">
                          {formatMeetingDate(m.scheduled_start || m.started_at || m.created_at)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Top Participants */}
            <div className="org-ov-card">
              <div className="org-ov-card-head">
                <div>
                  <div className="org-ov-card-title">Top Participants</div>
                  <div className="org-ov-card-sub">Most active speakers across recorded meetings.</div>
                </div>
                <Link href="/organisation/members" className="org-ov-link">
                  View All <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </div>

              {topParticipants.length === 0 ? (
                <EmptyState title="No participants yet." sub="Members will appear here" />
              ) : (
                <div className="org-ov-people">
                  {topParticipants.map((p) => {
                    const colors = getAvatarColors(p.name || p.email);
                    return (
                      <div key={p.key} className="org-ov-person">
                        <span
                          className="org-ov-avatar"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {getInitials(p.name, p.email)}
                        </span>
                        <span className="org-ov-person-meta">
                          <span className="org-ov-person-name">
                            {p.name}
                            {p.email && p.email.toLowerCase() === currentUserEmail && (
                              <span style={{ color: '#94A3B8', fontWeight: 500 }}> (you)</span>
                            )}
                          </span>
                          <span className="org-ov-person-mail">{p.email}</span>
                        </span>
                        <span className="org-ov-person-stat">
                          <span className="org-ov-person-count">{p.meetings}</span>
                          <span className="org-ov-person-label">
                            {p.meetings === 1 ? 'Meeting' : 'Meetings'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upcoming Meetings */}
            <div className="org-ov-card">
              <div className="org-ov-card-head">
                <div>
                  <div className="org-ov-card-title">Upcoming Meetings</div>
                  <div className="org-ov-card-sub">
                    Organisation meetings scheduled this week.
                  </div>
                </div>
                <Link href="/organisation/meetings" className="org-ov-link">
                  View All <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </div>

              {upcomingMeetings.length === 0 ? (
                <EmptyState
                  icon={<Calendar size={17} strokeWidth={1.9} />}
                  title="No upcoming meetings."
                  sub="Scheduled meetings will appear here."
                />
              ) : (
                <div className="org-ov-people">
                  {upcomingMeetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="org-ov-person"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="org-ov-avatar" style={{ backgroundColor: '#EAF2FF', color: '#0066FF' }}>
                        <Calendar size={15} strokeWidth={2} />
                      </span>
                      <span className="org-ov-person-meta">
                        <span className="org-ov-person-name">{m.title || 'Untitled Meeting'}</span>
                        <span className="org-ov-person-mail">
                          {formatMeetingDate(m.scheduled_start)}
                        </span>
                      </span>
                    </Link>
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

function circleProps(chart, value, index) {
  const [x, y] = chart.point(value, index);
  return { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5 };
}

function MetricCard({ icon, label, value, delta, tone, sub }) {
  // `pct()` returns null when the previous period was zero, because a change
  // from a zero baseline is not a growth rate. `null >= 0` is true in JS, so the
  // old code rendered a bare "+%" chip instead of hiding it.
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const sign = hasDelta && delta >= 0 ? '+' : '';
  return (
    <div className="org-ov-metric">
      <div className="org-ov-metric-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="org-ov-metric-label">{label}</div>
        <div className="org-ov-metric-value-row">
          <span className="org-ov-metric-value tabular-nums">{value}</span>
          {hasDelta ? (
            <span className={`org-ov-metric-delta ${tone}`}>
              <TrendingUp size={12} strokeWidth={2.4} aria-hidden="true" />
              {sign}
              {delta}%
            </span>
          ) : (
            <span className="org-ov-metric-sub">new this period</span>
          )}
        </div>
        <div className="org-ov-metric-sub">{sub}</div>
      </div>
    </div>
  );
}

function RangeSelect({ value, onChange }) {
  return (
    <div className="org-ov-range">
      <select
        className="org-ov-range-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Select time range"
      >
        <option value={4}>Last 4 weeks</option>
        <option value={8}>Last 8 weeks</option>
        <option value={12}>Last 12 weeks</option>
      </select>
      <ChevronDown size={14} className="org-ov-range-chevron" aria-hidden="true" />
    </div>
  );
}

function Donut({ segments, children }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="org-ov-donut">
      <svg viewBox="0 0 168 168" width="168" height="168" role="presentation">
        <circle cx="84" cy="84" r={radius} fill="none" stroke="#E3EBF6" strokeWidth="24" />
        {total > 0 &&
          segments.map((s, i) => {
            if (s.value <= 0) return null;
            const length = (s.value / total) * circumference;
            const el = (
              <circle
                key={i}
                cx="84"
                cy="84"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="24"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 84 84)"
              />
            );
            offset += length;
            return el;
          })}
      </svg>
      <div className="org-ov-donut-center">{children}</div>
    </div>
  );
}

function LegendRow({ color, name, value }) {
  return (
    <div className="org-ov-donut-legend-row">
      <span className="org-ov-donut-legend-dot" style={{ backgroundColor: color }} />
      <span className="org-ov-donut-legend-name">{name}</span>
      <span className="org-ov-donut-legend-value tabular-nums">{value}</span>
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="org-ov-empty">
      <span className="org-ov-empty-icon">
        {icon || <Calendar size={17} strokeWidth={1.9} />}
      </span>
      <div className="org-ov-empty-title">{title}</div>
      <div className="org-ov-empty-sub">{sub}</div>
    </div>
  );
}

function countMembersWhoSpoke(members, speakerTurns) {
  const spoken = new Set();
  Object.values(speakerTurns).forEach((set) => {
    if (!set) return;
    set.forEach((s) => spoken.add(s.toLowerCase()));
  });
  return members.filter((m) => {
    const name = (m.display_name || m.email?.split('@')[0] || '').toLowerCase();
    return name && spoken.has(name);
  }).length;
}
