'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Users,
  FileText,
  ChevronDown,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import { isPlaceholderSpeaker } from '../../../lib/metrics';
import {
  getTeam,
  getTopic,
  getPlatform,
  teamColor,
  PLATFORM_LABEL,
  PLATFORM_COLORS,
  TOPIC_COLORS,
} from '../../../lib/teams.mjs';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';

const AVATAR_PALETTES = [
  { bg: '#E3EDFD', text: '#1D4ED8' },
  { bg: '#EBE4FD', text: '#6D28D9' },
  { bg: '#FCE7F3', text: '#BE185D' },
  { bg: '#FEF3C7', text: '#B45309' },
  { bg: '#D9F7E8', text: '#047857' },
  { bg: '#E0F2FE', text: '#075985' },
];

const PLATFORM_ORDER = ['gmeet', 'zoom', 'teams', 'other'];
const WEEKS = 5;

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

function meetingMinutes(m) {
  if (m.started_at && m.ended_at) {
    const diff = (new Date(m.ended_at) - new Date(m.started_at)) / 60000;
    if (diff > 0) return diff;
  }
  return Number(m.expected_duration_minutes) || 0;
}

function meetingStamp(m) {
  return new Date(m.started_at || m.scheduled_start || m.created_at || 0).getTime() || 0;
}

/** An action item counts as overdue only when it carries a real past due date. */
function isOverdue(item) {
  const due = item?.due;
  if (!due || typeof due !== 'string') return false;
  if (/not specified|unspecified|none|tbd/i.test(due)) return false;
  const t = new Date(due).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function niceMax(value, steps) {
  if (value <= 0) return steps;
  const rough = value / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return Math.ceil(value / step) * step;
}

const CHART = { width: 560, height: 210, left: 34, right: 34, top: 24, bottom: 30 };

export default function OrganisationAnalyticsPage() {
  const { activeOrgId } = useWorkspace();

  const [meetings, setMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [range, setRange] = useState(4);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
          applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId),
          supabase
            .from('organisation_members')
            .select('id, user_id, role, status, email, display_name')
            .eq('organisation_id', activeOrgId),
          supabase.from('mom').select('meeting_id, action_items'),
          supabase.from('speaker_turns').select('meeting_id, speaker'),
        ]);

        if (cancelled) return;

        const scoped = meetingData || [];
        const ids = new Set(scoped.map((m) => m.id));
        const byMeeting = {};
        filterToMeetings(turnData || [], ids).forEach((t) => {
          if (!byMeeting[t.meeting_id]) byMeeting[t.meeting_id] = new Set();
          if (t.speaker && t.speaker.trim()) byMeeting[t.meeting_id].add(t.speaker.trim());
        });

        setMeetings(scoped);
        setMembers(memberData || []);
        setMoms(filterToMeetings(momData || [], ids));
        setSpeakerTurns(byMeeting);
      } catch (err) {
        console.error('Organisation analytics load error:', err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  /* ------------------------------------------------- weekly buckets (combo) */

  const buckets = useMemo(() => {
    const now = startOfDay(new Date());
    const out = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      out.push({
        start,
        end,
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        meetings: 0,
        hours: 0,
      });
    }
    meetings.forEach((m) => {
      const t = meetingStamp(m);
      if (!t) return;
      const b = out.find((w) => t >= w.start.getTime() && t < w.end.getTime());
      if (!b) return;
      b.meetings += 1;
      b.hours += meetingMinutes(m) / 60;
    });
    return out;
  }, [meetings]);

  const combo = useMemo(() => {
    const leftMax = niceMax(Math.max(0, ...buckets.map((b) => b.meetings)), 4);
    const rightMax = niceMax(Math.max(0, ...buckets.map((b) => b.hours)), 4);
    const plotLeft = CHART.left;
    const plotRight = CHART.width - CHART.right;
    const plotTop = CHART.top;
    const plotBottom = CHART.height - CHART.bottom;
    const step = (plotRight - plotLeft) / buckets.length;

    const x = (i) => plotLeft + step * (i + 0.5);
    const yL = (v) => plotBottom - (leftMax ? (v / leftMax) * (plotBottom - plotTop) : 0);
    const yR = (v) => plotBottom - (rightMax ? (v / rightMax) * (plotBottom - plotTop) : 0);

    return {
      leftMax,
      rightMax,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      x,
      yL,
      yR,
      barW: Math.min(20, step * 0.34),
      linePath: buckets
        .map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${yR(b.hours).toFixed(1)}`)
        .join(' '),
    };
  }, [buckets]);

  /* --------------------------------------------------------------- headline */

  const totals = useMemo(() => {
    const hours = meetings.reduce((s, m) => s + meetingMinutes(m), 0) / 60;
  const participants = new Set();
  // Diarization placeholders (SPEAKER_02, UNKNOWN) are not people; counting them
  // made this card disagree with the Members page.
  Object.values(speakerTurns).forEach(
    (s) => s && s.forEach((x) => { if (!isPlaceholderSpeaker(x)) participants.add(x); })
  );

    const items = [];
    moms.forEach((m) => {
      (Array.isArray(m.action_items) ? m.action_items : []).forEach((it) => items.push(it));
    });
    const overdue = items.filter(isOverdue).length;

    return {
      meetings: meetings.length,
      hours,
      participants: participants.size,
      actionItems: items.length,
      // action_items has no status/completed field (see prompts/mom_prompt.md),
      // so completion is genuinely unknown rather than zero.
      overdue,
      completed: null,
    };
  }, [meetings, speakerTurns, moms]);

  const deltas = useMemo(() => {
    const now = Date.now();
    const win = 28 * 24 * 60 * 60 * 1000;
    const inWin = (from, to) => meetings.filter((m) => {
      const t = meetingStamp(m);
      return t >= from && t < to;
    });
    // A percentage change from a zero baseline is not a growth rate. Returning
    // 100 here produced a confident "+100%" chip on brand-new workspaces.
    const pct = (a, b) => {
      if (b === 0) return a === 0 ? 0 : null;
      return Math.round(((a - b) / b) * 100);
    };
    const hours = (list) => list.reduce((s, m) => s + meetingMinutes(m), 0) / 60;
    const speakers = (list) => {
    const s = new Set();
    list.forEach((m) =>
      (speakerTurns[m.id] || new Set()).forEach((x) => { if (!isPlaceholderSpeaker(x)) s.add(x); })
    );
    return s.size;
    };
    const actions = (list) => {
      const ids = new Set(list.map((m) => m.id));
      let n = 0;
      moms.forEach((m) => {
        if (!ids.has(m.meeting_id)) return;
        n += Array.isArray(m.action_items) ? m.action_items.length : 0;
      });
      return n;
    };

    const cur = inWin(now - win, now + 1);
    const prev = inWin(now - win * 2, now - win);

    return {
      meetings: pct(cur.length, prev.length),
      hours: pct(hours(cur), hours(prev)),
      participants: pct(speakers(cur), speakers(prev)),
      actionItems: pct(actions(cur), actions(prev)),
    };
  }, [meetings, moms, speakerTurns]);

  /* ------------------------------------------------------- team + member rank */

  const teamActivity = useMemo(() => {
    const counts = new Map();
    meetings.forEach((m) => {
      const t = getTeam(m.title);
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    const rows = [...counts.entries()]
      .map(([name, count]) => ({ name, count, color: teamColor(name) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [meetings]);

  const topMembers = useMemo(() => {
    const counts = new Map();
    Object.values(speakerTurns).forEach((set) => {
      if (!set) return;
      set.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
    });

    const byEmail = new Map(members.map((m) => [(m.email || '').toLowerCase(), m]));
    const rows = [...counts.entries()]
      .map(([speaker, count]) => {
        const local = speaker.toLowerCase();
        const member =
          byEmail.get(local) ||
          members.find((m) => (m.display_name || '').toLowerCase() === local) ||
          members.find((m) => (m.display_name || '').toLowerCase().split(' ')[0] === local.split(' ')[0]);
        return { name: member?.display_name || speaker, email: member?.email || '', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const max = Math.max(1, ...rows.map((r) => r.count));
    // Rank palette — a person has no team, so colour by position, not inference.
    return rows.map((r, i) => ({
      ...r,
      pct: Math.round((r.count / max) * 100),
      color: TOPIC_COLORS[i % TOPIC_COLORS.length],
    }));
  }, [speakerTurns, members]);

  /* ------------------------------------------------------ platform + topics */

  const platformSplit = useMemo(() => {
    const counts = new Map();
    meetings.forEach((m) => {
      const p = getPlatform(m);
      counts.set(p, (counts.get(p) || 0) + 1);
    });
    const total = meetings.length;
    return PLATFORM_ORDER.filter((p) => counts.get(p)).map((p) => ({
      key: p,
      name: PLATFORM_LABEL[p],
      count: counts.get(p),
      pct: total ? Math.round((counts.get(p) / total) * 100) : 0,
      color: PLATFORM_COLORS[p],
    }));
  }, [meetings]);

  const topicSplit = useMemo(() => {
    const counts = new Map();
    meetings.forEach((m) => {
      const t = getTopic(m.title);
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    const rows = [...counts.entries()]
      .map(([name, count], i) => ({ name, count, color: TOPIC_COLORS[i % TOPIC_COLORS.length] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [meetings]);

  const actionSplit = useMemo(() => {
    // `mom.action_items` has no completion field, so a "Completed" slice could
    // only ever be a hardcoded 0. What IS real is whether the due date has
    // passed, so the split is Overdue vs On Track / No Due Date.
    const total = totals.actionItems ?? 0;
    const overdue = totals.overdue ?? 0;
    const onTrack = Math.max(0, total - overdue);
    return [
      { key: 'overdue', name: 'Overdue', count: overdue, color: '#EF4444' },
      { key: 'ontrack', name: 'On track', count: onTrack, color: '#22C55E' },
    ].map((s) => ({ ...s, pct: total ? Math.round((s.count / total) * 100) : 0 }));
  }, [totals]);

  return (
    <>
      <TopHeader placeholder="Search meetings, people, teams, or insights..." />

      <OrganisationPage chrome={false}>
        {/* ------------------------------------------------------------- hero */}
        <section className="org-an-hero">
          <span className="org-an-hero-badge">Organisation Analytics</span>
          <h1 className="org-an-hero-title">
            Turn conversations into <em>impact.</em>
          </h1>
          <p className="org-an-hero-sub">
            Track meeting activity, team productivity and collaboration across your organisation.
          </p>

          <div className="org-an-hero-doodle" aria-hidden="true">
            <span className="org-an-doodle-text">{`See what your organisation\nis achieving.`}</span>
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

          {/* report card with a bar-chart badge */}
          <div className="org-an-hero-art" aria-hidden="true">
            <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="an-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#D8E8FD" />
                  <stop offset="1" stopColor="#EEF5FE" />
                </linearGradient>
              </defs>

              <path d="M40 168 C40 116, 82 88, 146 88 C210 88, 256 118, 256 168 Z" fill="url(#an-blob)" opacity="0.75" />
              <circle cx="66" cy="46" r="20" fill="#DCEBFD" opacity="0.55" />

              {/* report sheet */}
              <rect x="64" y="18" width="150" height="132" rx="12" fill="#FFFFFF" />
              <rect x="64.75" y="18.75" width="148.5" height="130.5" rx="11.25" stroke="#DCE7F5" strokeWidth="1.5" />
              <rect x="80" y="34" width="44" height="7" rx="3.5" fill="#0066FF" opacity="0.85" />
              <rect x="80" y="48" width="72" height="5" rx="2.5" fill="#DCE4EE" />

              {/* in-sheet bars */}
              <rect x="82" y="112" width="13" height="22" rx="3" fill="#BEDCFC" />
              <rect x="103" y="100" width="13" height="34" rx="3" fill="#8CBBF7" />
              <rect x="124" y="90" width="13" height="44" rx="3" fill="#4E8BEE" />
              <rect x="145" y="106" width="13" height="28" rx="3" fill="#2F6FE4" />
              <rect x="166" y="80" width="13" height="54" rx="3" fill="#1B57C9" />
              <path d="M80 138 L186 138" stroke="#E3EAF3" strokeWidth="2" strokeLinecap="round" />

              {/* chart badge */}
              <circle cx="222" cy="52" r="34" fill="#FFFFFF" />
              <circle cx="222" cy="52" r="29" fill="#0066FF" />
              <rect x="207" y="46" width="6" height="14" rx="2" fill="#FFFFFF" opacity="0.75" />
              <rect x="217" y="38" width="6" height="22" rx="2" fill="#FFFFFF" opacity="0.9" />
              <rect x="227" y="42" width="6" height="18" rx="2" fill="#FFFFFF" />
            </svg>
          </div>
        </section>

        {/* ---------------------------------------------------------- metrics */}
        <section className="org-an-metrics">
          <MetricCard
            icon={<Calendar size={19} strokeWidth={2} />}
            label="Total Meetings"
            value={totals.meetings}
            delta={deltas.meetings}
            sub="vs previous 4 weeks"
          />
          <MetricCard
            icon={<Clock size={19} strokeWidth={2} />}
            label="Total Hours"
            value={totals.hours.toFixed(1)}
            delta={deltas.hours}
            sub="vs previous 4 weeks"
          />
          <MetricCard
            icon={<Users size={19} strokeWidth={2} />}
            label="Speakers Identified"
            value={totals.participants}
            delta={deltas.participants}
            sub="distinct named speakers"
          />
          <MetricCard
            icon={<FileText size={19} strokeWidth={2} />}
            label="Action Items"
            value={totals.actionItems}
            delta={deltas.actionItems}
            sub="extracted from meetings"
          />
        </section>

        {/* ------------------------------------------------------ top row */}
        <div className="org-an-row org-an-row-top">
          {/* Meeting Activity — bars (meetings) + line (hours), dual axis */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Meeting Activity</div>
                <div className="org-an-panel-sub">
                  Number of meetings and recorded hours across your organisation.
                </div>
              </div>
              <RangeSelect value={range} onChange={setRange} />
            </div>

            <div className="org-an-legend">
              <span className="org-an-legend-item">
                <span className="org-an-legend-swatch" style={{ backgroundColor: '#3B82F6' }} />
                Meetings
              </span>
              <span className="org-an-legend-item">
                <span className="org-an-legend-swatch" style={{ backgroundColor: '#8B5CF6' }} />
                Hours
              </span>
            </div>

            <svg
              className="org-an-chart"
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              role="img"
              aria-label="Weekly meetings and recorded hours"
            >
              {/* gridlines + both axis scales (max at top, 0 at bottom) */}
              {[0, 1, 2, 3, 4].map((i) => {
                const t = i / 4;
                const y = combo.plotTop + (combo.plotBottom - combo.plotTop) * t;
                const v = 1 - t;
                return (
                  <g key={i}>
                    <line
                      x1={combo.plotLeft}
                      y1={y}
                      x2={combo.plotRight}
                      y2={y}
                      stroke={i === 4 ? '#D8E1EC' : '#EDF1F6'}
                      strokeWidth="1"
                    />
                    <text x={combo.plotLeft - 7} y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
                      {Math.round(combo.leftMax * v)}
                    </text>
                    <text
                      x={combo.plotRight + 7}
                      y={y + 4}
                      textAnchor="start"
                      fontSize="10"
                      fill="#94A3B8"
                    >
                      {Math.round(combo.rightMax * v)}
                    </text>
                  </g>
                );
              })}

              <text x={combo.plotLeft - 7} y={combo.plotTop - 10} textAnchor="end" fontSize="9.5" fill="#64748B">
                Meetings
              </text>
              <text x={combo.plotRight + 7} y={combo.plotTop - 10} textAnchor="start" fontSize="9.5" fill="#64748B">
                Hours
              </text>

              {/* bars */}
              {buckets.map((b, i) => {
                const y = combo.yL(b.meetings);
                return (
                  <rect
                    key={b.label}
                    x={combo.x(i) - combo.barW / 2}
                    y={y}
                    width={combo.barW}
                    height={Math.max(0, combo.plotBottom - y)}
                    rx="3"
                    fill="#3B82F6"
                    opacity="0.85"
                  >
                    <title>{`${b.label}: ${b.meetings} meetings, ${b.hours.toFixed(1)} h`}</title>
                  </rect>
                );
              })}

              {/* hours line */}
              <path
                d={combo.linePath}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {buckets.map((b, i) => (
                <circle
                  key={b.label}
                  cx={combo.x(i)}
                  cy={combo.yR(b.hours)}
                  r="3.5"
                  fill="#FFFFFF"
                  stroke="#8B5CF6"
                  strokeWidth="2"
                />
              ))}

              {/* x labels */}
              {buckets.map((b, i) => (
                <text
                  key={b.label}
                  x={combo.x(i)}
                  y={CHART.height - 10}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill="#64748B"
                >
                  {b.label}
                </text>
              ))}
            </svg>
          </div>

          {/* Team Activity */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Team Activity</div>
                <div className="org-an-panel-sub">Meeting count by team.</div>
              </div>
              <RangeSelect value={range} onChange={setRange} />
            </div>

            {teamActivity.length === 0 ? (
              <p className="org-an-empty">No meetings in this period.</p>
            ) : (
              <div className="org-an-bars">
                {teamActivity.map((t) => (
                  <div key={t.name} className="org-an-bar-row">
                    <span className="org-an-bar-name" title={t.name}>
                      {t.name}
                    </span>
                    <span className="org-an-bar-track">
                      <span
                        className="org-an-bar-fill"
                        style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                      />
                    </span>
                    <span className="org-an-bar-value">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most Active Members */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Most Active Members</div>
              </div>
              <RangeSelect value={range} onChange={setRange} />
            </div>

            {topMembers.length === 0 ? (
              <p className="org-an-empty">No speaking activity yet.</p>
            ) : (
              <div className="org-an-rank-list">
                {topMembers.map((m, i) => {
                  const colors = getAvatarColors(m.name || m.email);
                  return (
                    <div key={m.name} className="org-an-rank-row">
                      <span className="org-an-rank-num">{i + 1}</span>
                      <span
                        className="org-an-rank-avatar"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {getInitials(m.name, m.email)}
                      </span>
                      <span className="org-an-rank-name" title={m.name}>
                        {m.name}
                      </span>
                      <span className="org-an-rank-value">{m.count}</span>
                      <span className="org-an-bar-track">
                        <span
                          className="org-an-bar-fill"
                          style={{ width: `${m.pct}%`, backgroundColor: m.color }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------- bottom row */}
        <div className="org-an-row org-an-row-bottom">
          {/* Meeting Distribution */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Meeting Distribution</div>
                <div className="org-an-panel-sub">Meetings by platform.</div>
              </div>
            </div>

            {platformSplit.length === 0 ? (
              <p className="org-an-empty">No meetings yet.</p>
            ) : (
              <div className="org-an-donut-wrap">
                <Donut segments={platformSplit}>
                  <span className="org-an-donut-value">{totals.meetings}</span>
                  <span className="org-an-donut-label">Meetings</span>
                </Donut>
                <div className="org-an-dl">
                  {platformSplit.map((p) => (
                    <div key={p.key} className="org-an-dl-row">
                      <span className="org-an-dl-dot" style={{ backgroundColor: p.color }} />
                      <span className="org-an-dl-name" title={p.name}>
                        {p.name}
                      </span>
                      <span className="org-an-dl-value">{p.count}</span>
                      <span className="org-an-dl-pct">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meeting Topics */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Meeting Topics</div>
                <div className="org-an-panel-sub">
                  Most discussed topics across all meetings.
                </div>
              </div>
              <RangeSelect value={range} onChange={setRange} />
            </div>

            {topicSplit.length === 0 ? (
              <p className="org-an-empty">No topics detected yet.</p>
            ) : (
              <div className="org-an-bars">
                {topicSplit.map((t) => (
                  <div key={t.name} className="org-an-bar-row">
                    <span className="org-an-bar-name" title={t.name}>
                      {t.name}
                    </span>
                    <span className="org-an-bar-track">
                      <span
                        className="org-an-bar-fill"
                        style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                      />
                    </span>
                    <span className="org-an-bar-value">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Items Overview */}
          <div className="org-an-panel">
            <div className="org-an-panel-head">
              <div>
                <div className="org-an-panel-title">Action Items Overview</div>
                <div className="org-an-panel-sub">
                  Due-date status of action items extracted from meetings.
                </div>
              </div>
            </div>

            {totals.actionItems === 0 ? (
              <p className="org-an-empty">No action items extracted yet.</p>
            ) : (
              <div className="org-an-donut-wrap">
                <Donut segments={actionSplit}>
                  <span className="org-an-donut-value">{totals.actionItems}</span>
                  <span className="org-an-donut-label">Items</span>
                </Donut>
                <div className="org-an-dl">
                  {actionSplit.map((s) => (
                    <div key={s.key} className="org-an-dl-row">
                      <span className="org-an-dl-dot" style={{ backgroundColor: s.color }} />
                      <span className="org-an-dl-name">{s.name}</span>
                      <span className="org-an-dl-value">{s.count}</span>
                      <span className="org-an-dl-pct">{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </OrganisationPage>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function MetricCard({ icon, label, value, delta, sub }) {
  return (
    <div className="org-an-metric">
      <div className="org-an-metric-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="org-an-metric-label">{label}</div>
        <div className="org-an-metric-value-row">
          <span className="org-an-metric-value tabular-nums">{value}</span>
          {delta !== undefined && delta !== null && (
            <span className={`org-an-metric-delta ${delta < 0 ? 'down' : ''}`}>
              <TrendingUp
                size={11}
                strokeWidth={2.6}
                aria-hidden="true"
                style={delta < 0 ? { transform: 'rotate(180deg)' } : undefined}
              />
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          )}
          {delta === null && <span className="org-an-metric-sub">new this period</span>}
        </div>
        <div className="org-an-metric-sub">{sub}</div>
      </div>
    </div>
  );
}

function RangeSelect({ value, onChange }) {
  return (
    <span className="org-an-range">
      Last {value} weeks
      <ChevronDown size={13} style={{ color: '#64748B' }} aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Select time range"
      >
        <option value={4}>Last 4 weeks</option>
        <option value={8}>Last 8 weeks</option>
        <option value={12}>Last 12 weeks</option>
      </select>
    </span>
  );
}

function Donut({ segments, children }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="org-an-donut">
      <svg viewBox="0 0 112 112" width="112" height="112" role="presentation">
        <circle cx="56" cy="56" r={42} fill="none" stroke="#EDF2F9" strokeWidth="19" />
        {total > 0 &&
          segments.map((s) => {
            if (s.count <= 0) return null;
            const length = (s.count / total) * circumference;
            const el = (
              <circle
                key={s.key}
                cx="56"
                cy="56"
                r={42}
                fill="none"
                stroke={s.color}
                strokeWidth="19"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 56 56)"
              />
            );
            offset += length;
            return el;
          })}
      </svg>
      <div className="org-an-donut-center">{children}</div>
    </div>
  );
}
