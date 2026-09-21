'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Bell,
  Calendar,
  Clock,
  FileText,
  Users,
  ChevronRight,
  Play,
  Lightbulb,
  Check,
  Video,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';
import TopHeader from '../../components/TopHeader';

export default function DashboardPage() {
  const [meetings, setMeetings] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [uniqueSpeakers, setUniqueSpeakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completedTasks, setCompletedTasks] = useState(new Set());
  const [activeTooltip, setActiveTooltip] = useState(2); // Default to W3 hover tooltip like in mockup

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch meetings
      const { data: meetData, error: meetErr } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: false });

      if (meetErr) throw meetErr;
      const allMeetings = meetData || [];
      setMeetings(allMeetings);

      // 2. Fetch MOMs for action items
      const { data: momData } = await supabase.from('mom').select('*');
      const allActions = [];
      (momData || []).forEach((m) => {
        if (Array.isArray(m.action_items)) {
          m.action_items.forEach((item, idx) => {
            allActions.push({
              id: `${m.meeting_id}-${idx}`,
              meetingId: m.meeting_id,
              task: item.task || item.description || 'Follow up on discussion items',
              owner: item.owner || 'Team',
              due: item.due || 'not specified',
            });
          });
        }
      });
      setActionItems(allActions);

      // 3. Fetch unique speakers from speaker_turns
      const { data: turnsData } = await supabase
        .from('speaker_turns')
        .select('speaker');
      const speakersSet = new Set((turnsData || []).map((t) => t.speaker).filter(Boolean));
      setUniqueSpeakers(Array.from(speakersSet));
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('realtime_dashboard_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mom' }, () => fetchDashboardData())
      .subscribe();

    const interval = setInterval(fetchDashboardData, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Calculate Real Metrics
  const totalMeetingsCount = meetings.length;
  const totalHoursRecorded = useMemo(() => {
    const totalMinutes = meetings.reduce((sum, m) => {
      return sum + (m.expected_duration_minutes || (m.actual_duration_seconds ? Math.round(m.actual_duration_seconds / 60) : 30));
    }, 0);
    return (totalMinutes / 60).toFixed(1);
  }, [meetings]);

  const totalActionItemsCount = actionItems.length;
  const peopleMetCount = uniqueSpeakers.length;

  // Real Upcoming Meetings
  const now = new Date();
  const upcomingMeetings = useMemo(() => {
    return meetings
      .filter((m) => ['scheduled', 'queued', 'joining', 'recording', 'processing'].includes(m.status))
      .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
  }, [meetings]);

  // Real Recent Meetings (completed)
  const recentMeetings = useMemo(() => {
    return meetings
      .filter((m) => m.status === 'completed')
      .slice(0, 4);
  }, [meetings]);

  const toggleTask = (taskId) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Helper for upcoming meeting countdown
  const getCountdownText = (targetDateStr, status) => {
    if (['joining', 'recording', 'processing'].includes(status)) {
      return 'in progress';
    }
    const diffMs = new Date(targetDateStr).getTime() - Date.now();
    if (diffMs <= 0) return 'Starting now';
    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins < 60) return `in ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    return `in ${diffHours} hrs`;
  };

  // Real Weekly Meeting Insights calculation (last 4 weeks)
  const weeklyInsights = useMemo(() => {
    const nowMs = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const weeks = [
      { label: 'W1', meetings: 0, hours: 0 },
      { label: 'W2', meetings: 0, hours: 0 },
      { label: 'W3', meetings: 0, hours: 0 },
      { label: 'W4', meetings: 0, hours: 0 },
    ];

    meetings.forEach((m) => {
      const mTime = new Date(m.scheduled_start).getTime();
      const diffWeeks = Math.floor((nowMs - mTime) / oneWeekMs);
      const idx = 3 - diffWeeks; // 3 = current week (W4), 2 = W3, 1 = W2, 0 = W1
      if (idx >= 0 && idx < 4) {
        weeks[idx].meetings += 1;
        const durMins = m.expected_duration_minutes || (m.actual_duration_seconds ? Math.round(m.actual_duration_seconds / 60) : 30);
        weeks[idx].hours += durMins / 60;
      }
    });

    const maxMeetings = Math.max(...weeks.map((w) => w.meetings), 1);
    const maxHours = Math.max(...weeks.map((w) => w.hours), 1);

    return weeks.map((w) => ({
      ...w,
      meetingsH: w.meetings > 0 ? Math.max(Math.round((w.meetings / maxMeetings) * 100), 14) : 6,
      hoursH: w.hours > 0 ? Math.max(Math.round((w.hours / maxHours) * 110), 14) : 6,
      hoursFormatted: w.hours.toFixed(1),
    }));
  }, [meetings]);

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
      else if (title.includes('product') || title.includes('review')) cat = 'Product Review';
      else if (title.includes('cancel')) cat = 'Ad-hoc Calls';

      topicCounts[cat] = (topicCounts[cat] || 0) + 1;
    });

    const colors = {
      'Marketing': '#EC4899',
      'Team Sync': '#8B5CF6',
      'API & Integration': '#0066FF',
      'Product Review': '#00A3FF',
      'Ad-hoc Calls': '#F97316',
      'General': '#94A3B8',
    };

    return Object.entries(topicCounts).map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / meetings.length) * 100),
      color: colors[name] || '#64748B',
    })).sort((a, b) => b.count - a.count);
  }, [meetings]);

  return (
    <div>
      {/* 1. Interactive Top Bar with Search, Schedule, Notifications & Profile Menu */}
      <TopHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      {/* 2. Hero Greeting with Sun/Clouds Illustration & Doodle */}
      <section className="dashboard-hero">
        <div>
          <h1 className="dashboard-hero-title">
            {greeting}, Harsh <span role="img" aria-label="wave">👋</span>
          </h1>
          <p className="dashboard-hero-subtitle">
            Here&apos;s your meeting intelligence for today.
          </p>
        </div>

        {/* Hand-drawn cyan doodle with curved arrow */}
        <div className="dashboard-hero-doodle">
          <span className="doodle-hero-text">Less meetings. More progress.</span>
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

        {/* Soft pastel watercolor cloud/mountain landscape illustration */}
        <div className="dashboard-hero-art" aria-hidden="true">
          <svg viewBox="0 0 400 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            {/* Glowing Sun */}
            <circle cx="280" cy="45" r="30" fill="url(#sun-gradient)" opacity="0.85" />
            <circle cx="280" cy="45" r="42" fill="#FEF08A" opacity="0.25" />

            {/* Distant Mountain Silhouettes */}
            <path
              d="M180 160 L240 85 L280 120 L330 65 L400 160 Z"
              fill="url(#mountain-gradient-1)"
              opacity="0.35"
            />
            <path
              d="M260 160 L310 95 L355 130 L400 85 L400 160 Z"
              fill="url(#mountain-gradient-2)"
              opacity="0.45"
            />

            {/* Soft Cloud Formations */}
            <path
              d="M120 160 C130 130, 160 125, 185 135 C205 110, 245 112, 260 132 C285 120, 320 130, 335 150 C360 142, 390 150, 400 160 Z"
              fill="url(#cloud-gradient-1)"
              opacity="0.9"
            />
            <path
              d="M160 160 C180 142, 215 138, 235 150 C260 135, 300 136, 315 152 C340 144, 380 150, 400 160 Z"
              fill="#FFFFFF"
              opacity="0.95"
            />

            <defs>
              <linearGradient id="sun-gradient" x1="280" y1="15" x2="280" y2="75" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDE047" />
                <stop offset="1" stopColor="#F59E0B" />
              </linearGradient>
              <linearGradient id="mountain-gradient-1" x1="290" y1="65" x2="290" y2="160" gradientUnits="userSpaceOnUse">
                <stop stopColor="#93C5FD" />
                <stop offset="1" stopColor="#DBEAFE" />
              </linearGradient>
              <linearGradient id="mountain-gradient-2" x1="330" y1="85" x2="330" y2="160" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" />
                <stop offset="1" stopColor="#BFDBFE" />
              </linearGradient>
              <linearGradient id="cloud-gradient-1" x1="260" y1="110" x2="260" y2="160" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E0F2FE" />
                <stop offset="1" stopColor="#F0F9FF" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </section>

      {/* 3. Metrics Row (4 Cards) */}
      <section className="metrics-row">
        {/* Total Meetings */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Calendar size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Total Meetings</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalMeetingsCount}</span>
              <span className="metric-trend tabular-nums" style={{ color: '#0066FF', backgroundColor: '#EFF6FF' }}>All time</span>
            </div>
            <div className="metric-trend-sub">Total recorded in recap</div>
          </div>
        </div>

        {/* Hours Recorded */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Clock size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Hours Recorded</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalHoursRecorded}</span>
              <span className="metric-trend tabular-nums" style={{ color: '#0066FF', backgroundColor: '#EFF6FF' }}>Total</span>
            </div>
            <div className="metric-trend-sub">Across all meetings</div>
          </div>
        </div>

        {/* Action Items */}
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <FileText size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="metric-label">Action Items</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{totalActionItemsCount}</span>
              <span className="metric-trend tabular-nums" style={{ color: '#16A34A', backgroundColor: '#F0FDF4' }}>Extracted</span>
            </div>
            <div className="metric-trend-sub">From meeting MOMs</div>
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
              <span className="metric-value tabular-nums">{peopleMetCount}</span>
              <span className="metric-trend tabular-nums" style={{ color: '#7C3AED', backgroundColor: '#F5F3FF' }}>Speakers</span>
            </div>
            <div className="metric-trend-sub">Distinct diarized speakers</div>
          </div>
        </div>
      </section>

      {/* 4. Middle Split Row (Upcoming Meetings & Today's Focus) */}
      <section className="middle-split-row">
        {/* Upcoming Meetings */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div>
              <h2 className="card-ref-title">Upcoming Meetings</h2>
              <p className="card-ref-subtitle">Stay prepared for what&apos;s next.</p>
            </div>
            <Link href="/calendar" className="card-ref-link">
              <span>View Calendar &rarr;</span>
            </Link>
          </div>

          {upcomingMeetings.length > 0 ? (
            <div>
              {upcomingMeetings.map((m) => (
                <div key={m.id} className="upcoming-row">
                  <div className="upcoming-time-col">
                    <div className="upcoming-time-text tabular-nums">
                      {new Date(m.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="upcoming-time-countdown">
                      {getCountdownText(m.scheduled_start, m.status)}
                    </div>
                  </div>

                  <div className="upcoming-info-col">
                    <div className="upcoming-title">{m.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="upcoming-avatars">
                        <div className="upcoming-avatar">H</div>
                      </div>
                    </div>
                  </div>

                  <div className="upcoming-platform-badge">
                    <Video size={14} color="#00832d" aria-hidden="true" />
                    <span>Google Meet</span>
                  </div>

                  <a
                    href={m.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-join-pill"
                  >
                    <span>Join</span>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {/* If no upcoming meetings in DB, present clean state with quick action */}
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B' }}>
                <p style={{ fontSize: '13.5px', marginBottom: '14px' }}>
                  No upcoming meetings on your calendar for today.
                </p>
                <button
                  type="button"
                  className="btn-schedule-meeting"
                  style={{ margin: '0 auto' }}
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>Schedule a Meeting</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Today's Focus */}
        <div className="card-ref">
          <div className="card-ref-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Lightbulb size={16} strokeWidth={2} />
              </div>
              <div>
                <h2 className="card-ref-title">Today&apos;s Focus</h2>
                <p className="card-ref-subtitle">Action items extracted by recap from your meetings.</p>
              </div>
            </div>
          </div>

          <div>
            {actionItems.length > 0 ? (
              actionItems.slice(0, 4).map((item) => {
                const isChecked = completedTasks.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`focus-item ${isChecked ? 'completed' : ''}`}
                    onClick={() => toggleTask(item.id)}
                  >
                    <div className="focus-item-left">
                      <div className={`focus-checkbox ${isChecked ? 'checked' : ''}`}>
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="focus-item-title">{item.task}</div>
                        <div className="focus-item-subtitle">
                          Assigned to {item.owner} • {item.due !== 'not specified' ? `Due ${item.due}` : 'Pending follow-up'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} color="#94A3B8" />
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748B', fontSize: '13px' }}>
                No pending action items. Tasks extracted from your completed meetings will appear here.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. Bottom 3-Column Row (Recent Meetings, Meeting Insights, Top Topics) */}
      <section className="bottom-three-row">
        {/* Column 1: Recent Meetings */}
        <div className="card-ref">
          <div className="card-ref-header">
            <h3 className="card-ref-title">Recent Meetings</h3>
            <Link href="/meetings" className="card-ref-link">
              <span>View All &rarr;</span>
            </Link>
          </div>

          <div>
            {recentMeetings.length > 0 ? (
              recentMeetings.map((m) => (
                <div key={m.id} className="recent-meet-item">
                  <div className="recent-meet-left">
                    <div className="recent-play-btn">
                      <Play size={13} fill="#0066FF" stroke="none" style={{ marginLeft: '1px' }} />
                    </div>
                    <div>
                      <div className="recent-meet-title">{m.title}</div>
                      <div className="recent-meet-meta">
                        {new Date(m.started_at || m.scheduled_start).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {m.expected_duration_minutes || 30} min
                      </div>
                    </div>
                  </div>

                  <Link href={`/meetings/${m.id}`} className="recent-summary-btn">
                    <span>Summary</span>
                  </Link>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
                No completed meetings yet.
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Meeting Insights */}
        <div className="card-ref">
          <div className="card-ref-header">
            <h3 className="card-ref-title">Meeting Insights</h3>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              Past 4 weeks
            </span>
          </div>

          {/* Bar Chart with Dual Bars (Meetings & Hours) */}
          <div className="insights-chart-wrap">
            {/* Real Tooltip for hovered week */}
            {activeTooltip !== null && weeklyInsights[activeTooltip] && (
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: `${20 + activeTooltip * 22}%`,
                  transform: 'translateX(-50%)',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  zIndex: 10,
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  textAlign: 'center',
                }}
              >
                <div>{weeklyInsights[activeTooltip].meetings} meetings</div>
                <div style={{ color: '#64748B', fontSize: '10.5px', fontWeight: 500 }}>
                  {weeklyInsights[activeTooltip].hoursFormatted} hours
                </div>
              </div>
            )}

            {weeklyInsights.map((col, idx) => (
              <div
                key={col.label}
                className="insights-week-col"
                onMouseEnter={() => setActiveTooltip(idx)}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <div className="insights-bars-group">
                  <div
                    className="insights-bar meetings-bar"
                    style={{ height: `${col.meetingsH}px` }}
                  />
                  <div
                    className="insights-bar hours-bar"
                    style={{ height: `${col.hoursH}px` }}
                  />
                </div>
                <span className="insights-week-label">{col.label}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="insights-legend">
            <div>
              <span className="insights-legend-dot" style={{ backgroundColor: '#0066FF' }} />
              <span>Meetings</span>
            </div>
            <div>
              <span className="insights-legend-dot" style={{ backgroundColor: '#93C5FD' }} />
              <span>Hours Recorded</span>
            </div>
          </div>
        </div>

        {/* Column 3: Top Topics */}
        <div className="card-ref">
          <div className="card-ref-header">
            <h3 className="card-ref-title">Top Topics</h3>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, backgroundColor: '#F8FAFC', border: '1px solid #EDF2F7', padding: '3px 8px', borderRadius: '6px' }}>
              From meetings
            </span>
          </div>

          <div>
            {topics.length > 0 ? (
              topics.map((t) => (
                <div key={t.name} className="topic-row">
                  <div className="topic-info">
                    <div className="topic-name">
                      <span className="topic-dot" style={{ backgroundColor: t.color }} />
                      <span>{t.name}</span>
                    </div>
                    <span className="topic-pct tabular-nums">{t.pct}%</span>
                  </div>
                  <div className="topic-progress-bg">
                    <div
                      className="topic-progress-fill"
                      style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
                No meetings recorded yet.
              </div>
            )}
          </div>
        </div>
      </section>


      {/* Add Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchDashboardData()}
      />
    </div>
  );
}
