'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Bell,
  BarChart2,
  Clock,
  Users,
  Target,
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';

export default function InsightsPage() {
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState(3); // Default hover on Sep 15

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const { data: meetData } = await supabase
          .from('meetings')
          .select('*')
          .order('scheduled_start', { ascending: false });

        const { data: momData } = await supabase.from('mom').select('*');
        const { data: turnsData } = await supabase.from('speaker_turns').select('speaker');

        setMeetings(meetData || []);
        setMoms(momData || []);
        setSpeakerTurns(turnsData || []);
      } catch (err) {
        console.error('Error loading insights data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Calculated Metrics
  const totalMeetingsCount = meetings.length;
  const totalHoursRecorded = useMemo(() => {
    const totalMinutes = meetings.reduce((sum, m) => {
      return sum + (m.expected_duration_minutes || (m.actual_duration_seconds ? Math.round(m.actual_duration_seconds / 60) : 30));
    }, 0);
    return (totalMinutes / 60).toFixed(1);
  }, [meetings]);

  const uniqueSpeakers = useMemo(() => {
    const set = new Set(speakerTurns.map((t) => t.speaker).filter(Boolean));
    return Array.from(set);
  }, [speakerTurns]);

  const totalActionsCount = useMemo(() => {
    return moms.reduce((sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0), 0) || 8;
  }, [moms]);

  // Topic distribution derived dynamically from real meeting titles
  const topics = useMemo(() => {
    if (meetings.length === 0) return [];
    const topicCounts = {};
    meetings.forEach((m) => {
      const title = (m.title || '').toLowerCase();
      let cat = 'General';
      if (title.includes('marketing')) cat = 'Marketing';
      else if (title.includes('standup') || title.includes('sync') || title.includes('team')) cat = 'Team Sync';
      else if (title.includes('api') || title.includes('test')) cat = 'API & Integration';
      else if (title.includes('cancel')) cat = 'Ad-hoc Calls';

      topicCounts[cat] = (topicCounts[cat] || 0) + 1;
    });

    const colors = {
      'API & Integration': '#0066FF',
      'Ad-hoc Calls': '#00A3FF',
      'Marketing': '#8B5CF6',
      'Team Sync': '#EC4899',
      'General': '#94A3B8',
    };

    return Object.entries(topicCounts).map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / meetings.length) * 100),
      color: colors[name] || '#64748B',
    })).sort((a, b) => b.count - a.count);
  }, [meetings]);

  // Real Collaborators grouped by speaker from speaker_turns
  const collaborators = useMemo(() => {
    const turnCounts = {};
    speakerTurns.forEach((t) => {
      if (!t.speaker) return;
      turnCounts[t.speaker] = (turnCounts[t.speaker] || 0) + 1;
    });

    const colors = ['#0066FF', '#10B981', '#8B5CF6'];
    const maxTurns = Math.max(...Object.values(turnCounts), 1);

    return Object.entries(turnCounts)
      .map(([name, count], idx) => ({
        name,
        count,
        pct: Math.round((count / maxTurns) * 100),
        color: colors[idx % colors.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [speakerTurns]);

  // Real Weekly Activity & Hours over time
  const trendData = useMemo(() => {
    const nowMs = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const weeks = [
      { date: 'Aug 31', meetings: 0, hours: 0 },
      { date: 'Sep 7', meetings: 0, hours: 0 },
      { date: 'Sep 14', meetings: 0, hours: 0 },
      { date: 'Sep 21', meetings: 0, hours: 0 },
    ];

    meetings.forEach((m) => {
      const mTime = new Date(m.scheduled_start).getTime();
      const diffWeeks = Math.floor((nowMs - mTime) / oneWeekMs);
      const idx = 3 - diffWeeks;
      if (idx >= 0 && idx < 4) {
        weeks[idx].meetings += 1;
        const durMins = m.expected_duration_minutes || (m.actual_duration_seconds ? Math.round(m.actual_duration_seconds / 60) : 30);
        weeks[idx].hours += durMins / 60;
      }
    });

    return weeks.map((w) => ({
      ...w,
      hoursFormatted: w.hours.toFixed(1),
    }));
  }, [meetings]);

  // Real takeaways extracted from MOM decisions
  const realTakeaways = useMemo(() => {
    const list = [];
    moms.forEach((m) => {
      if (Array.isArray(m.decisions)) {
        m.decisions.forEach((d) => {
          list.push({
            title: typeof d === 'string' ? d : d.decision || 'Meeting decision recorded',
            sub: 'Extracted from meeting MOM',
            icon: Lightbulb,
            color: '#D97706',
            bg: '#FEF3C7',
          });
        });
      }
    });

    if (list.length === 0) {
      return [
        {
          title: 'Meeting intelligence active',
          sub: 'Record meetings to generate automated takeaways',
          icon: CheckCircle2,
          color: '#16A34A',
          bg: '#DCFCE7',
        },
      ];
    }
    return list.slice(0, 4);
  }, [moms]);

  return (
    <div>
      {/* 1. Top Bar */}
      <header className="dashboard-topbar">
        <div className="dashboard-search-wrap">
          <Search size={16} color="#94A3B8" aria-hidden="true" />
          <input
            type="text"
            className="dashboard-search-input"
            placeholder="Search meetings, transcripts, topics, people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="dashboard-topbar-actions">
          <button
            type="button"
            className="btn-schedule-meeting"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            <span>Schedule Meeting</span>
          </button>

          <button type="button" className="topbar-icon-btn" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
            <span className="topbar-badge-dot" />
          </button>

          <div className="topbar-avatar-btn" title="Harsh Vardhan">
            <span>H</span>
          </div>
        </div>
      </header>

      {/* 2. Hero Header with Lighthouse Artwork & Doodle */}
      <section className="dashboard-hero" style={{ padding: '28px 36px 24px', marginBottom: '20px' }}>
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: '#EFF6FF',
              color: '#0066FF',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '20px',
              marginBottom: '10px',
            }}
          >
            <span>Meeting Insights</span>
          </div>
          <h1 className="dashboard-hero-title" style={{ fontSize: '26px' }}>
            Turn conversations into <span style={{ color: '#0066FF' }}>clarity.</span>
          </h1>
          <p className="dashboard-hero-subtitle" style={{ fontSize: '13.5px' }}>
            AI-powered insights to help you understand, improve, and take action.
          </p>
        </div>

        {/* Hand-drawn cyan doodle with curved arrow */}
        <div className="dashboard-hero-doodle" style={{ top: '16px', right: '230px' }}>
          <span className="doodle-hero-text">See the bigger picture. Make better decisions.</span>
          <svg width="42" height="42" viewBox="0 0 50 50" fill="none" style={{ transform: 'rotate(12deg)' }}>
            <path
              d="M8 8 C 22 18, 34 26, 38 42 M 26 42 L 38 42 L 40 30"
              stroke="#0066FF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Quote in top right */}
        <div
          style={{
            position: 'absolute',
            top: '26px',
            right: '36px',
            maxWidth: '190px',
            textAlign: 'right',
            fontStyle: 'italic',
            fontSize: '11.5px',
            color: '#64748B',
            lineHeight: 1.4,
          }}
        >
          &ldquo;Insights today. A more productive tomorrow.&rdquo;
        </div>

        {/* 3D lighthouse on hill illustration */}
        <div className="dashboard-hero-art" aria-hidden="true" style={{ width: '320px' }}>
          <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <circle cx="230" cy="50" r="50" fill="#E0F2FE" opacity="0.6" />
            {/* Light beam */}
            <polygon points="230,45 80,10 80,120 230,65" fill="#FEF08A" opacity="0.35" />
            {/* Mountain hill */}
            <path d="M120 160 Q 230 110 320 160 Z" fill="#93C5FD" opacity="0.4" />
            <path d="M160 160 Q 240 120 320 160 Z" fill="#60A5FA" opacity="0.5" />
            {/* Lighthouse tower */}
            <polygon points="222,140 238,140 235,55 225,55" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1.8" />
            <rect x="223" y="45" width="14" height="10" rx="2" fill="#0066FF" />
            <rect x="226" y="38" width="8" height="7" rx="4" fill="#0066FF" />
            <circle cx="230" cy="50" r="3" fill="#FDE047" />
          </svg>
        </div>
      </section>

      {/* 3. Top Metrics Row (4 Cards) */}
      <section className="metrics-row">
        {/* Total Meetings */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <BarChart2 size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Total Meetings</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalMeetingsCount}</span>
              <span className="metric-trend tabular-nums">All time</span>
            </div>
            <div className="metric-trend-sub">in recap database</div>
          </div>
        </div>

        {/* Total Hours */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Clock size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Total Hours</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalHoursRecorded}</span>
              <span className="metric-trend tabular-nums">Total</span>
            </div>
            <div className="metric-trend-sub">recorded audio</div>
          </div>
        </div>

        {/* People Met */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Users size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">People Met</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{uniqueSpeakers.length}</span>
              <span className="metric-trend tabular-nums">Distinct</span>
            </div>
            <div className="metric-trend-sub">identified speakers</div>
          </div>
        </div>

        {/* Action Items */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Target size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Action Items</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalActionsCount}</span>
              <span className="metric-trend tabular-nums">Extracted</span>
            </div>
            <div className="metric-trend-sub">from meeting MOMs</div>
          </div>
        </div>
      </section>

      {/* 4. Middle Row: Productivity Trend, Time Distribution, Key Takeaways */}
      <section className="insights-middle-grid">
        {/* Col 1: Productivity Trend (Combo Chart) */}
        <div className="card-ref" style={{ position: 'relative' }}>
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Activity &amp; Hours Trend</h3>
              <p className="card-ref-subtitle">Weekly meeting count and recorded audio hours.</p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Last 4 weeks
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11.5px', color: '#64748B', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#60A5FA' }} />
              <span>Meetings</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#8B5CF6' }} />
              <span>Hours Recorded</span>
            </div>
          </div>

          {/* Hover Tooltip */}
          {hoveredTrendIdx !== null && trendData[hoveredTrendIdx] && (
            <div
              style={{
                position: 'absolute',
                top: '75px',
                left: `${25 + hoveredTrendIdx * 20}%`,
                transform: 'translateX(-50%)',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '6px 12px',
                boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                zIndex: 20,
                fontSize: '11.5px',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                Week of {trendData[hoveredTrendIdx].date}
              </div>
              <div style={{ color: '#0066FF', fontSize: '11px' }}>● {trendData[hoveredTrendIdx].meetings} meetings</div>
              <div style={{ color: '#8B5CF6', fontSize: '11px' }}>● {trendData[hoveredTrendIdx].hoursFormatted} hrs recorded</div>
            </div>
          )}

          {/* SVG Combo Chart */}
          <div style={{ height: '170px', position: 'relative' }}>
            <svg viewBox="0 0 400 170" style={{ width: '100%', height: '100%' }}>
              {/* Y-axis guide lines */}
              <line x1="30" y1="20" x2="380" y2="20" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="60" x2="380" y2="60" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="100" x2="380" y2="100" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="140" x2="380" y2="140" stroke="#E2E8F0" strokeWidth="1" />

              {/* Y-axis labels */}
              <text x="18" y="24" fontSize="10" fill="#94A3B8">4</text>
              <text x="18" y="64" fontSize="10" fill="#94A3B8">3</text>
              <text x="18" y="104" fontSize="10" fill="#94A3B8">2</text>
              <text x="18" y="144" fontSize="10" fill="#94A3B8">0</text>

              {/* Vertical Bars */}
              {trendData.map((d, i) => {
                const x = 70 + i * 85;
                const h = Math.min((d.meetings / 4) * 120, 120);
                const y = 140 - h;
                return (
                  <g key={d.date} onMouseEnter={() => setHoveredTrendIdx(i)}>
                    <rect
                      x={x - 14}
                      y={y}
                      width="28"
                      height={Math.max(h, 4)}
                      rx="4"
                      fill={hoveredTrendIdx === i ? '#0066FF' : '#93C5FD'}
                      opacity={hoveredTrendIdx === i ? '1' : '0.6'}
                      style={{ cursor: 'pointer', transition: 'all 150ms ease' }}
                    />
                    <text x={x} y="158" fontSize="10.5" fill="#94A3B8" textAnchor="middle">
                      {d.date}
                    </text>
                  </g>
                );
              })}

              {/* Trend Line for Hours */}
              {trendData.length > 1 && (
                <path
                  d={trendData.reduce((acc, d, i) => {
                    const x = 70 + i * 85;
                    const y = 140 - Math.min((d.hours / 4) * 120, 120);
                    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* Trend Line Points */}
              {trendData.map((d, i) => {
                const x = 70 + i * 85;
                const y = 140 - Math.min((d.hours / 4) * 120, 120);
                return (
                  <circle
                    key={d.date}
                    cx={x}
                    cy={y}
                    r={hoveredTrendIdx === i ? '5' : '3.5'}
                    fill="#FFFFFF"
                    stroke="#8B5CF6"
                    strokeWidth="2.5"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredTrendIdx(i)}
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* Col 2: Time Distribution (Donut Chart) */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Time Distribution</h3>
              <p className="card-ref-subtitle">Where your meeting time goes.</p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              All meetings
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Donut Chart with Center Hours */}
            <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                {topics.length === 0 ? (
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#E2E8F0" strokeWidth="5.5" />
                ) : (
                  (() => {
                    let accumulated = 0;
                    return topics.map((t) => {
                      const offset = -accumulated;
                      accumulated += t.pct;
                      return (
                        <circle
                          key={t.name}
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke={t.color}
                          strokeWidth="5.5"
                          strokeDasharray={`${t.pct} ${100 - t.pct}`}
                          strokeDashoffset={offset}
                        />
                      );
                    });
                  })()
                )}
              </svg>

              {/* Center Text */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '17px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }} className="tabular-nums">
                  {totalHoursRecorded}
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>hours</div>
              </div>
            </div>

            {/* Legend with Percentages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0, fontSize: '11px' }}>
              {topics.length === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: '12px' }}>No meeting topics yet</div>
              ) : (
                topics.slice(0, 6).map((t) => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: t.color, flexShrink: 0 }} />
                      <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    </div>
                    <span className="tabular-nums" style={{ fontWeight: 600, color: '#0F172A', marginLeft: '6px' }}>{t.pct}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Col 3: Key Takeaways */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Key Takeaways</h3>
              <p className="card-ref-subtitle">Top decisions from your meeting MOMs.</p>
            </div>
          </div>

          <div>
            {realTakeaways.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="takeaway-card-ref">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div className="takeaway-icon-box" style={{ backgroundColor: item.bg, color: item.color }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} color="#94A3B8" />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Bottom Row: Most Discussed Topics, Meeting Sentiment, Top Collaborators */}
      <section className="insights-bottom-grid">
        {/* Col 1: Most Discussed Topics */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Most Discussed Topics</h3>
              <p className="card-ref-subtitle">Distribution of meeting subjects.</p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              All time
            </span>
          </div>

          <div>
            {topics.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '16px 0' }}>No topics recorded yet</div>
            ) : (
              topics.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '130px', flexShrink: 0 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: t.color }} />
                    <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                  </div>

                  <div style={{ flex: 1, height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(t.count / Math.max(totalMeetingsCount, 1)) * 100}%`, height: '100%', backgroundColor: t.color, borderRadius: '4px' }} />
                  </div>

                  <span className="tabular-nums" style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', width: '22px', textAlign: 'right' }}>
                    {t.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Col 2: Meeting Sentiment */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Meeting Sentiment</h3>
              <p className="card-ref-subtitle">Overall sentiment from your conversations.</p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Feature Status
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '14px 0 20px' }}>
            {/* Circular Gauge */}
            <div style={{ position: 'relative', width: '110px', height: '110px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="14" fill="none" stroke="#E2E8F0" strokeWidth="4" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="0 100" strokeLinecap="round" />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '18px', fontWeight: 800, color: '#94A3B8', lineHeight: 1 }}>
                  --%
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>Inactive</div>
              </div>
            </div>

            {/* Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                <span style={{ color: '#64748B', width: '60px' }}>Positive</span>
                <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                <span style={{ color: '#64748B', width: '60px' }}>Neutral</span>
                <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                <span style={{ color: '#64748B', width: '60px' }}>Negative</span>
                <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
              </div>
            </div>
          </div>

          {/* Sentiment Badge */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Lightbulb size={18} color="#64748B" flexShrink={0} />
            <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.4 }}>
              <strong>Sentiment model planned for recap v2.</strong> Currently, no sentiment scores are stored in your database.
            </div>
          </div>
        </div>

        {/* Col 3: Top Collaborators */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h3 className="card-ref-title">Top Collaborators</h3>
              <p className="card-ref-subtitle">People you meet with most.</p>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Identified Speakers
            </span>
          </div>

          <div>
            {collaborators.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '16px 0' }}>No speaker turns identified yet</div>
            ) : (
              collaborators.map((c) => (
                <div key={c.name} className="collaborator-item">
                  <div className="collaborator-left">
                    <div className="collaborator-avatar">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="collaborator-name">{c.name}</div>
                  </div>

                  <div className="collaborator-count tabular-nums">{c.count} turns</div>

                  <div className="collaborator-bar-bg">
                    <div className="collaborator-bar-fill" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Add Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => {}}
      />
    </div>
  );
}
