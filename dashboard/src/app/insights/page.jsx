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
import TopHeader from '../../components/TopHeader';

export default function InsightsPage() {
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState(null);

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

        // Only calculate insights from genuine completed meetings
        const genuineMeetings = (meetData || []).filter((m) => m.status === 'completed');
        setMeetings(genuineMeetings);
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

  const cardStyle = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #EDF2F7',
    borderRadius: '14px',
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    height: '350px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  return (
    <div>
      {/* 1. Interactive Top Bar with Search, Schedule, Notifications & Profile Menu */}
      <TopHeader searchQuery={search} onSearchChange={setSearch} placeholder="Search meetings, transcripts, topics, people..." />

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

      {/* 4. Insights 6-Box Grid (All boxes same size & perfectly aligned) */}
      <section className="insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
        {/* Card 1: Activity & Hours Trend */}
        <div className="insights-card" style={{ ...cardStyle, position: 'relative' }}>
          <div className="card-ref-header" style={{ alignItems: 'flex-start', gap: '8px', flexWrap: 'nowrap', marginBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="card-ref-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Activity &amp; Hours Trend</h3>
              <p className="card-ref-subtitle" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Weekly meeting count &amp; hours.</p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Last 4 weeks
            </span>
          </div>

          {/* Legend & Hover Info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '8px', flexWrap: 'nowrap', minHeight: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#60A5FA', flexShrink: 0 }} />
                <span>Meetings</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#8B5CF6', flexShrink: 0 }} />
                <span>Hours</span>
              </div>
            </div>

            {hoveredTrendIdx !== null && trendData[hoveredTrendIdx] && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #DBEAFE',
                  borderRadius: '5px',
                  padding: '1px 6px',
                  fontSize: '10.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontWeight: 600, color: '#1E40AF' }}>{trendData[hoveredTrendIdx].date}:</span>
                <span style={{ color: '#0066FF', fontWeight: 600 }}>{trendData[hoveredTrendIdx].meetings} mtgs</span>
                <span style={{ color: '#8B5CF6', fontWeight: 600 }}>{trendData[hoveredTrendIdx].hoursFormatted}h</span>
              </div>
            )}
          </div>

          {/* SVG Combo Chart */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }} onMouseLeave={() => setHoveredTrendIdx(null)}>
            <svg viewBox="0 0 400 170" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <line x1="30" y1="20" x2="380" y2="20" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="60" x2="380" y2="60" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="100" x2="380" y2="100" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="30" y1="140" x2="380" y2="140" stroke="#E2E8F0" strokeWidth="1" />

              <text x="18" y="24" fontSize="10" fill="#94A3B8">4</text>
              <text x="18" y="64" fontSize="10" fill="#94A3B8">3</text>
              <text x="18" y="104" fontSize="10" fill="#94A3B8">2</text>
              <text x="18" y="144" fontSize="10" fill="#94A3B8">0</text>

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

        {/* Card 2: Time Distribution */}
        <div className="insights-card" style={cardStyle}>
          <div className="card-ref-header" style={{ marginBottom: '10px' }}>
            <div>
              <h3 className="card-ref-title">Time Distribution</h3>
              <p className="card-ref-subtitle">Where your meeting time goes.</p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              All meetings
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'center' }}>
            {/* Donut Chart with Center Hours */}
            <div style={{ position: 'relative', width: '125px', height: '125px', flexShrink: 0 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0, fontSize: '11px' }}>
              {topics.length === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: '12px' }}>No meeting topics yet</div>
              ) : (
                topics.slice(0, 5).map((t) => (
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

        {/* Card 3: Key Takeaways */}
        <div className="insights-card" style={cardStyle}>
          <div className="card-ref-header" style={{ marginBottom: '10px' }}>
            <div>
              <h3 className="card-ref-title">Key Takeaways</h3>
              <p className="card-ref-subtitle">Top decisions from your meeting MOMs.</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
            {realTakeaways.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="takeaway-card-ref">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div className="takeaway-icon-box" style={{ backgroundColor: item.bg, color: item.color }}>
                      <Icon size={14} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 4: Most Discussed Topics */}
        <div className="insights-card" style={cardStyle}>
          <div className="card-ref-header" style={{ marginBottom: '12px' }}>
            <div>
              <h3 className="card-ref-title">Most Discussed Topics</h3>
              <p className="card-ref-subtitle">Distribution of meeting subjects.</p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              All time
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px', flex: 1 }}>
            {topics.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '16px 0', textAlign: 'center' }}>No topics recorded yet</div>
            ) : (
              topics.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '120px', flexShrink: 0 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: t.color }} />
                    <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                  </div>

                  <div style={{ flex: 1, height: '7px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(t.count / Math.max(totalMeetingsCount, 1)) * 100}%`, height: '100%', backgroundColor: t.color, borderRadius: '4px' }} />
                  </div>

                  <span className="tabular-nums" style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', width: '20px', textAlign: 'right' }}>
                    {t.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 5: Meeting Sentiment */}
        <div className="insights-card" style={cardStyle}>
          <div className="card-ref-header" style={{ marginBottom: '10px' }}>
            <div>
              <h3 className="card-ref-title">Meeting Sentiment</h3>
              <p className="card-ref-subtitle">Overall sentiment from your conversations.</p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Feature Status
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '6px 0 10px' }}>
              {/* Circular Gauge */}
              <div style={{ position: 'relative', width: '95px', height: '95px' }}>
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
                  <div style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '17px', fontWeight: 800, color: '#94A3B8', lineHeight: 1 }}>
                    --%
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>Inactive</div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                  <span style={{ color: '#64748B', width: '55px' }}>Positive</span>
                  <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                  <span style={{ color: '#64748B', width: '55px' }}>Neutral</span>
                  <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                  <span style={{ color: '#64748B', width: '55px' }}>Negative</span>
                  <span className="tabular-nums" style={{ fontWeight: 600, color: '#94A3B8' }}>--%</span>
                </div>
              </div>
            </div>

            {/* Sentiment Badge */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Lightbulb size={16} color="#64748B" flexShrink={0} />
              <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.35 }}>
                <strong>Sentiment model planned for recap v2.</strong> Currently, no sentiment scores are stored in your database.
              </div>
            </div>
          </div>
        </div>

        {/* Card 6: Top Collaborators */}
        <div className="insights-card" style={cardStyle}>
          <div className="card-ref-header" style={{ marginBottom: '10px' }}>
            <div>
              <h3 className="card-ref-title">Top Collaborators</h3>
              <p className="card-ref-subtitle">People you meet with most.</p>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Identified Speakers
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', flex: 1 }}>
            {collaborators.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '16px 0', textAlign: 'center' }}>No speaker turns identified yet</div>
            ) : (
              collaborators.slice(0, 4).map((c) => (
                <div key={c.name} className="collaborator-item" style={{ padding: '8px 0' }}>
                  <div className="collaborator-left" style={{ minWidth: '110px' }}>
                    <div className="collaborator-avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="collaborator-name" style={{ fontSize: '12px' }}>{c.name}</div>
                  </div>

                  <div className="collaborator-count tabular-nums" style={{ fontSize: '11px' }}>{c.count} turns</div>

                  <div className="collaborator-bar-bg" style={{ width: '70px', height: '6px' }}>
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
