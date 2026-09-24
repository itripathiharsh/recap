'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Plus,
  Bell,
  ChevronLeft,
  ChevronRight,
  Video,
  Clock,
  Calendar as CalendarIcon,
  Settings,
  ExternalLink,
  ArrowLeft,
  Users,
  CheckCircle2,
  MoreVertical,
  CalendarCheck,
  Share2,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';
import TopHeader from '../../components/TopHeader';

// Distinct colors cycle for event dots and tints
const EVENT_COLORS = [
  '#0066FF', // blue
  '#16A34A', // green
  '#9333EA', // purple
  '#EA580C', // orange
  '#DB2777', // pink
  '#0D9488', // teal
];

const CARD_TINT_CLASSES = [
  'day-card-tint-0',
  'day-card-tint-1',
  'day-card-tint-2',
  'day-card-tint-3',
  'day-card-tint-4',
  'day-card-tint-5',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// Helper: Format date to local 'YYYY-MM-DD'
function getLocalDateStr(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper: Format time '10:00 AM'
function formatTime(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Helper: Format short time '10:00'
function formatShortTime(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Helper: Calculate duration in minutes
function getMeetingDurationMinutes(m) {
  if (m.started_at && m.ended_at) {
    const diff = Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000);
    if (diff > 0) return diff;
  }
  if (m.scheduled_start && m.scheduled_end) {
    const diff = Math.round((new Date(m.scheduled_end) - new Date(m.scheduled_start)) / 60000);
    if (diff > 0) return diff;
  }
  return m.expected_duration_minutes || 30;
}

// Helper: Format duration display
function formatMeetingDuration(mins) {
  if (!mins || mins <= 0) return '30 min';
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (rem > 0) return `${hrs}h ${rem}m`;
    return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  }
  return `${mins} min`;
}

// Helper: Format total day minutes, e.g. '8h 30m'
function formatTotalMinutes(totalMins) {
  if (!totalMins || totalMins <= 0) return '0 min';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

// Helper: Participant initials
function getParticipantInitials(speakerName) {
  if (!speakerName) return '?';
  const clean = speakerName.trim();
  if (clean.startsWith('SPEAKER_')) {
    const num = clean.replace('SPEAKER_', '');
    return num ? `S${num}` : 'S';
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Google Meet Authentic SVG Icon
function GoogleMeetIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }} aria-hidden="true">
      <path fill="#00832d" d="M28 24l7.5-6.5V30.5z" />
      <path fill="#0066da" d="M5 33.5V14.5C5 12.57 6.57 11 8.5 11H28v26H8.5C6.57 37 5 35.43 5 33.5z" />
      <path fill="#e94235" d="M35.5 17.5L28 24v-13h7.5c1.93 0 3.5 1.57 3.5 3.5v3z" />
      <path fill="#2684fc" d="M28 37h-9.5V27H28v10z" />
      <path fill="#00ac47" d="M5 33.5c0 1.93 1.57 3.5 3.5 3.5H18.5V27H5v6.5z" />
      <path fill="#ffba00" d="M35.5 30.5L28 24v13h7.5c1.93 0 3.5-1.57 3.5-3.5v-3z" />
    </svg>
  );
}

export default function CalendarPage() {
  const searchParams = useSearchParams();

  // Primary state
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState({});
  const [speakersByMeeting, setSpeakersByMeeting] = useState({});

  // View & Date state
  const [selectedDate, setSelectedDate] = useState(() => {
    const paramDate = searchParams?.get('date');
    if (paramDate) {
      const d = new Date(paramDate + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  const [calendarView, setCalendarView] = useState(() => {
    const paramView = searchParams?.get('view');
    if (paramView && ['month', 'day', 'week', 'agenda'].includes(paramView)) {
      return paramView;
    }
    return 'month';
  });

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popoverDay, setPopoverDay] = useState(null); // { dateStr, dayNum, meetings, colIndex }
  const [activeMenuMeetingId, setActiveMenuMeetingId] = useState(null);
  const [copiedMeetingId, setCopiedMeetingId] = useState(null);

  // Mini calendar month navigation in Day View
  const [miniCalMonth, setMiniCalMonth] = useState(() => selectedDate.getMonth());
  const [miniCalYear, setMiniCalYear] = useState(() => selectedDate.getFullYear());

  // Sync mini calendar view when selectedDate changes
  useEffect(() => {
    setMiniCalMonth(selectedDate.getMonth());
    setMiniCalYear(selectedDate.getFullYear());
  }, [selectedDate]);

  // Open modal if ?add=true
  useEffect(() => {
    if (searchParams?.get('add') === 'true') {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  // Close popovers and menus on outside click
  useEffect(() => {
    function handleOutsideClick(e) {
      if (!e.target.closest('.month-day-popover') && !e.target.closest('.calendar-more-badge')) {
        setPopoverDay(null);
      }
      if (!e.target.closest('.day-menu-container')) {
        setActiveMenuMeetingId(null);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch real data from Supabase
  const fetchData = useCallback(async () => {
    try {
      const [meetingsRes, momsRes, turnsRes] = await Promise.all([
        supabase
          .from('meetings')
          .select('*')
          .order('scheduled_start', { ascending: true }),
        supabase
          .from('mom')
          .select('meeting_id, summary'),
        supabase
          .from('speaker_turns')
          .select('meeting_id, speaker'),
      ]);

      setMeetings(meetingsRes.data || []);

      // Index MOMs by meeting_id
      const momMap = {};
      (momsRes.data || []).forEach((m) => {
        if (m.meeting_id) momMap[m.meeting_id] = m;
      });
      setMoms(momMap);

      // Index distinct speakers by meeting_id
      const spkMap = {};
      (turnsRes.data || []).forEach((t) => {
        if (!t.meeting_id || !t.speaker) return;
        if (!spkMap[t.meeting_id]) spkMap[t.meeting_id] = new Set();
        spkMap[t.meeting_id].add(t.speaker);
      });
      const spkObj = {};
      Object.keys(spkMap).forEach((k) => {
        spkObj[k] = Array.from(spkMap[k]);
      });
      setSpeakersByMeeting(spkObj);
    } catch (err) {
      console.error('Error fetching calendar data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Realtime subscription for meeting changes
    const channel = supabase
      .channel('calendar_meetings_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Calendar calculations for Month View
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const prevMonthDays = new Date(year, month, 0).getDate();

  const prevMonth = () => setSelectedDate(new Date(year, month - 1, 1));
  const nextMonth = () => setSelectedDate(new Date(year, month + 1, 1));
  const setToday = () => {
    const today = new Date();
    setSelectedDate(today);
  };

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  // Group meetings by local date string 'YYYY-MM-DD'
  const meetingsByDay = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      const dStr = getLocalDateStr(m.scheduled_start);
      if (!dStr) return;
      if (!map[dStr]) map[dStr] = [];
      map[dStr].push(m);
    });
    return map;
  }, [meetings]);

  // Upcoming meetings for right sidebar in Month View
  const upcomingMeetings = useMemo(() => {
    return meetings
      .filter((m) => ['scheduled', 'queued', 'joining', 'recording', 'processing'].includes(m.status))
      .slice(0, 4);
  }, [meetings]);

  // Generate calendar grid cells (35 or 42 cells)
  const now = useMemo(() => new Date(), []);
  const nowDateStr = useMemo(() => getLocalDateStr(now), [now]);

  const calendarCells = useMemo(() => {
    const cells = [];

    // 1. Previous month tail
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dStr = getLocalDateStr(prevDate);
      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: false,
        isToday: dStr === nowDateStr,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const curDate = new Date(year, month, dayNum);
      const dStr = getLocalDateStr(curDate);
      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: true,
        isToday: dStr === nowDateStr,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    // 3. Next month head (fill to 35 or 42)
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextDate = new Date(year, month + 1, dayNum);
      const dStr = getLocalDateStr(nextDate);
      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: false,
        isToday: dStr === nowDateStr,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    return cells;
  }, [year, month, daysInMonth, firstDayIndex, prevMonthDays, meetingsByDay, nowDateStr]);

  // --------------------------------------------------------------------------
  // DAY AGENDA VIEW DATA & CALCULATIONS (PART 2)
  // --------------------------------------------------------------------------
  const selectedDateStr = useMemo(() => getLocalDateStr(selectedDate), [selectedDate]);

  const dayMeetings = useMemo(() => {
    const list = meetingsByDay[selectedDateStr] || [];
    return [...list].sort(
      (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
    );
  }, [meetingsByDay, selectedDateStr]);

  // Real Day Summary Calculations
  const daySummaryStats = useMemo(() => {
    // 1. Total participants: Distinct speakers in today's meetings
    const allSpeakers = new Set();
    dayMeetings.forEach((m) => {
      const list = speakersByMeeting[m.id] || [];
      list.forEach((s) => allSpeakers.add(s));
    });
    const totalParticipants = allSpeakers.size;

    // 2. Total meeting time in minutes
    const totalMins = dayMeetings.reduce((sum, m) => {
      return sum + getMeetingDurationMinutes(m);
    }, 0);

    // 3. Google Meet meetings count
    const googleMeetCount = dayMeetings.filter(
      (m) => m.meet_link && m.meet_link.includes('meet.google.com')
    ).length;

    // 4. Completed meetings count
    const completedCount = dayMeetings.filter((m) => m.status === 'completed').length;

    return {
      totalParticipants,
      totalMins,
      googleMeetCount,
      completedCount,
    };
  }, [dayMeetings, speakersByMeeting]);

  // Formatted day strings
  const formattedDayTitle = useMemo(() => {
    const dayName = DAY_NAMES[selectedDate.getDay()];
    const monthName = MONTH_NAMES[selectedDate.getMonth()];
    const dateNum = selectedDate.getDate();
    const fullYear = selectedDate.getFullYear();
    return `${dayName}, ${monthName} ${dateNum}, ${fullYear}`;
  }, [selectedDate]);

  // Switch to Day Agenda View for a specific date
  const openDayAgendaView = (dateStr) => {
    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        setSelectedDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      }
    }
    setCalendarView('day');
    setPopoverDay(null);
  };

  // Mini Calendar generation for Day View right sidebar
  const miniCalDaysInMonth = new Date(miniCalYear, miniCalMonth + 1, 0).getDate();
  const miniCalFirstDay = new Date(miniCalYear, miniCalMonth, 1).getDay();
  const miniCalPrevDays = new Date(miniCalYear, miniCalMonth, 0).getDate();

  const miniCalCells = useMemo(() => {
    const cells = [];
    // Prev month days
    for (let i = miniCalFirstDay - 1; i >= 0; i--) {
      const dNum = miniCalPrevDays - i;
      const d = new Date(miniCalYear, miniCalMonth - 1, dNum);
      const dStr = getLocalDateStr(d);
      cells.push({
        dayNum: dNum,
        dateStr: dStr,
        isCurrentMonth: false,
        isSelected: dStr === selectedDateStr,
        hasMeetings: (meetingsByDay[dStr] || []).length > 0,
      });
    }
    // Current month days
    for (let dNum = 1; dNum <= miniCalDaysInMonth; dNum++) {
      const d = new Date(miniCalYear, miniCalMonth, dNum);
      const dStr = getLocalDateStr(d);
      cells.push({
        dayNum: dNum,
        dateStr: dStr,
        isCurrentMonth: true,
        isSelected: dStr === selectedDateStr,
        hasMeetings: (meetingsByDay[dStr] || []).length > 0,
      });
    }
    // Next month days
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length;
    for (let dNum = 1; dNum <= remaining; dNum++) {
      const d = new Date(miniCalYear, miniCalMonth + 1, dNum);
      const dStr = getLocalDateStr(d);
      cells.push({
        dayNum: dNum,
        dateStr: dStr,
        isCurrentMonth: false,
        isSelected: dStr === selectedDateStr,
        hasMeetings: (meetingsByDay[dStr] || []).length > 0,
      });
    }
    return cells;
  }, [miniCalYear, miniCalMonth, miniCalDaysInMonth, miniCalFirstDay, miniCalPrevDays, selectedDateStr, meetingsByDay]);

  const handleCopyLink = (meetingId, link) => {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopiedMeetingId(meetingId);
      setTimeout(() => setCopiedMeetingId(null), 2000);
    }
  };

  return (
    <div>
      {/* 1. Global Interactive Top Bar */}
      <TopHeader
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search meetings, transcripts, people, topics..."
      />

      {/* ------------------------------------------------------------------ */}
      {/* PART 1: CALENDAR MONTH VIEW (IMAGE 1)                              */}
      {/* ------------------------------------------------------------------ */}
      {calendarView === 'month' && (
        <>
          {/* Hero Header with Floating Artwork & Doodle */}
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
                <span>Your Calendar</span>
              </div>
              <h1 className="dashboard-hero-title" style={{ fontSize: '26px' }}>
                Stay on top of your <span style={{ color: '#0066FF' }}>meetings.</span>
              </h1>
              <p className="dashboard-hero-subtitle" style={{ fontSize: '13.5px' }}>
                Sync your calendar, get reminders, and let recap handle the rest.
              </p>
            </div>

            {/* Hand-drawn cyan doodle with curved arrow */}
            <div className="dashboard-hero-doodle" style={{ top: '16px', right: '230px' }}>
              <span className="doodle-hero-text">More meetings. More progress.</span>
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

            {/* Quote in top right (Matches Image 1) */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '36px',
                maxWidth: '180px',
                textAlign: 'right',
                fontStyle: 'italic',
                fontSize: '11.5px',
                color: '#64748B',
                lineHeight: 1.4,
                zIndex: 5,
              }}
            >
              &ldquo;Every meeting leads to progress.&rdquo;
            </div>

            {/* 3D floating calendar illustration */}
            <div className="dashboard-hero-art" aria-hidden="true" style={{ width: '320px' }}>
              <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <g transform="translate(0, 30)">
                <circle cx="200" cy="60" r="50" fill="#E0F2FE" opacity="0.6" />
                <rect x="140" y="30" width="110" height="85" rx="12" fill="#FFFFFF" stroke="#0066FF" strokeWidth="2" filter="drop-shadow(0 10px 20px rgba(0,102,255,0.08))" />
                <rect x="140" y="30" width="110" height="24" rx="12" fill="#0066FF" />
                <rect x="160" y="22" width="6" height="14" rx="3" fill="#60A5FA" />
                <rect x="224" y="22" width="6" height="14" rx="3" fill="#60A5FA" />
                <rect x="155" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
                <rect x="175" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
                <rect x="195" y="66" width="14" height="14" rx="3" fill="#0066FF" />
                <rect x="215" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
                <rect x="155" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
                <rect x="175" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
                <rect x="195" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
              
                </g>
              </svg>
            </div>
          </section>

          {/* Month Split Section */}
          <div className="calendar-month-split">
            {/* Left Column: Fixed Row-Height Calendar Grid */}
            <div className="meetings-list-card" style={{ padding: '20px', position: 'relative', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              {/* Navigation Toolbar */}
              <div className="calendar-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button type="button" className="btn-cal-today" onClick={setToday}>
                    Today
                  </button>
                  <div className="calendar-nav-btns">
                    <button type="button" className="btn-cal-nav" onClick={prevMonth} aria-label="Previous month">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" className="btn-cal-nav" onClick={nextMonth} aria-label="Next month">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <h2 className="calendar-month-title">
                    {MONTH_NAMES[month]} {year}
                  </h2>
                </div>

                {/* View Pills */}
                <div className="calendar-view-pills">
                  {['month', 'week', 'day', 'agenda'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`btn-cal-view ${calendarView === v ? 'active' : ''}`}
                      onClick={() => {
                        if (v === 'day' || v === 'agenda') {
                          setCalendarView('day');
                        } else {
                          setCalendarView(v);
                        }
                      }}
                    >
                      <span style={{ textTransform: 'capitalize' }}>{v}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Month Table Grid (Fixed Row Height) */}
              <div className="calendar-month-grid">
                {/* Days of Week Header */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="calendar-header-cell">
                    {d}
                  </div>
                ))}

                {/* Day Cells (104px fixed height) */}
                {calendarCells.map((cell, idx) => {
                  const visibleMeetings = cell.meetings.slice(0, 2);
                  const extraCount = cell.meetings.length - 2;
                  const colIndex = idx % 7;
                  const isPopoverOpen = popoverDay?.dateStr === cell.dateStr;

                  return (
                    <div
                      key={cell.dateStr + '_' + idx}
                      className={`calendar-day-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${cell.isToday ? 'today' : ''}`}
                    >
                      {/* Day Number Row */}
                      <div className="calendar-day-cell-top">
                        <button
                          type="button"
                          className={`calendar-day-number ${cell.isToday ? 'today-pill' : ''}`}
                          onClick={() => openDayAgendaView(cell.dateStr)}
                          title={`View ${cell.dateStr}`}
                        >
                          {cell.dayNum}
                        </button>
                      </div>

                      {/* Visible Meetings (Max 2 compact rows) */}
                      <div className="calendar-day-events-list">
                        {visibleMeetings.map((m, mIdx) => {
                          const dotColor = EVENT_COLORS[mIdx % EVENT_COLORS.length];
                          const timeStr = formatShortTime(m.scheduled_start);

                          return (
                            <Link
                              key={m.id}
                              href={`/meetings/${m.id}`}
                              className="calendar-compact-item"
                              title={`${timeStr} - ${m.title}`}
                            >
                              <span className="calendar-dot" style={{ backgroundColor: dotColor }} />
                              <span className="calendar-time-str">{timeStr}</span>
                              <span className="calendar-title-str">{m.title}</span>
                            </Link>
                          );
                        })}

                        {/* "+ X more" link if more than 2 meetings */}
                        {extraCount > 0 && (
                          <button
                            type="button"
                            className="calendar-more-badge"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPopoverOpen) {
                                setPopoverDay(null);
                              } else {
                                setPopoverDay({
                                  dateStr: cell.dateStr,
                                  dayNum: cell.dayNum,
                                  meetings: cell.meetings,
                                  colIndex,
                                });
                              }
                            }}
                          >
                            + {extraCount} more
                          </button>
                        )}
                      </div>

                      {/* Popover Card (Matches Image 1) */}
                      {isPopoverOpen && (
                        <div
                          className="month-day-popover"
                          style={{
                            left: colIndex >= 5 ? 'auto' : '6px',
                            right: colIndex >= 5 ? '6px' : 'auto',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="month-popover-header">
                            <span className="month-popover-title">
                              {new Date(cell.dateStr + 'T00:00:00').toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="month-popover-count">
                              {cell.meetings.length} {cell.meetings.length === 1 ? 'meeting' : 'meetings'}
                            </span>
                          </div>

                          <div className="month-popover-list">
                            {cell.meetings.map((m, pIdx) => {
                              const dotColor = EVENT_COLORS[pIdx % EVENT_COLORS.length];
                              const timeStr = formatTime(m.scheduled_start);
                              return (
                                <Link
                                  key={m.id}
                                  href={`/meetings/${m.id}`}
                                  className="month-popover-item"
                                  title={m.title}
                                >
                                  <span className="calendar-dot" style={{ backgroundColor: dotColor }} />
                                  <span className="month-popover-time">{timeStr}</span>
                                  <span className="month-popover-name">{m.title}</span>
                                </Link>
                              );
                            })}
                          </div>

                          <div className="month-popover-footer">
                            <button
                              type="button"
                              className="month-popover-link"
                              onClick={() => openDayAgendaView(cell.dateStr)}
                            >
                              <span>View all meetings for this day &rarr;</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Upcoming Meetings, Integrations & Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Card 1: Upcoming Meetings */}
              <div className="card-ref">
                <div className="card-ref-header">
                  <div>
                    <h3 className="card-ref-title">Upcoming Meetings</h3>
                  </div>
                  <Link href="/meetings" className="card-ref-link">
                    <span>View All &rarr;</span>
                  </Link>
                </div>

                <div>
                  {upcomingMeetings.length > 0 ? (
                    upcomingMeetings.map((m) => (
                      <div key={m.id} className="upcoming-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                          <GoogleMeetIcon size={20} />
                          <div style={{ minWidth: 0 }}>
                            <div className="upcoming-title">{m.title}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748B' }} className="tabular-nums">
                              {new Date(m.scheduled_start).toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                              , {formatTime(m.scheduled_start)}
                            </div>
                          </div>
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
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
                      No upcoming meetings.
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Connect Your Calendar */}
              <div className="card-ref" style={{ position: 'relative' }}>
                <div>
                  <h3 className="card-ref-title">Connect Your Calendar</h3>
                  <p className="card-ref-subtitle">
                    Sync your calendar to automatically find, record and organize your meetings.
                  </p>
                </div>

                {/* Hand-drawn doodle */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span className="doodle-banner-text" style={{ fontSize: '15px' }}>
                    All your meetings in one place.
                  </span>
                  <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                    <path
                      d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24"
                      stroke="#0066FF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* 3 Integrations */}
                <div className="integrations-grid">
                  {/* Google Calendar */}
                  <div className="integration-card">
                    <div className="integration-logo-box">
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    </div>
                    <div className="integration-name">Google Calendar</div>
                    <Link href="/calendar/connect" className="integration-link-connect">
                      Connect
                    </Link>
                  </div>

                  {/* Outlook */}
                  <div className="integration-card">
                    <div className="integration-logo-box">
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          backgroundColor: '#0078D4',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFF',
                          fontWeight: 800,
                          fontSize: '10px',
                        }}
                      >
                        O
                      </div>
                    </div>
                    <div className="integration-name">Outlook</div>
                    <Link href="/calendar/connect" className="integration-link-connect">
                      Connect
                    </Link>
                  </div>

                  {/* Apple Calendar */}
                  <div className="integration-card">
                    <div className="integration-logo-box">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.61 1.34-.55.63-.99 1.68-.86 2.7 1 .08 2-.45 2.54-1.19z" />
                      </svg>
                    </div>
                    <div className="integration-name">Apple Calendar</div>
                    <Link href="/calendar/connect" className="integration-link-connect">
                      Connect
                    </Link>
                  </div>
                </div>
              </div>

              {/* Card 3: Calendar Settings */}
              <Link
                href="/settings"
                className="card-ref"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textDecoration: 'none',
                  transition: 'border-color 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      backgroundColor: '#EFF6FF',
                      color: '#0066FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Settings size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                      Calendar Settings
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      Manage your calendar sync, meeting detection and notification preferences.
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#94A3B8" />
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PART 2: DAY AGENDA VIEW (IMAGE 2)                                  */}
      {/* ------------------------------------------------------------------ */}
      {calendarView === 'day' && (
        <div className="day-agenda-container">
          {/* Top Breadcrumb: Back to Calendar */}
          <button
            type="button"
            className="btn-back-calendar"
            onClick={() => setCalendarView('month')}
          >
            <ArrowLeft size={16} />
            <span>Back to Calendar</span>
          </button>

          {/* Header Row: Date Title + Navigation Controls */}
          <div className="day-agenda-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="day-agenda-icon-box">
                <CalendarIcon size={22} color="#0066FF" />
              </div>
              <div>
                <h1 className="day-agenda-title">{formattedDayTitle}</h1>
                <p className="day-agenda-subtitle">
                  {dayMeetings.length > 0 ? (
                    <>
                      {dayMeetings.length} {dayMeetings.length === 1 ? 'meeting' : 'meetings'} scheduled &bull;{' '}
                      {formatTotalMinutes(daySummaryStats.totalMins)} total
                    </>
                  ) : (
                    'No meetings scheduled'
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-cal-nav"
                onClick={prevDay}
                aria-label="Previous day"
                title="Previous day"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="btn-cal-nav"
                onClick={nextDay}
                aria-label="Next day"
                title="Next day"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="btn-cal-today"
                onClick={setToday}
              >
                Today
              </button>
            </div>
          </div>

          {/* Day View Split Layout */}
          <div className="day-agenda-split">
            {/* Left Column: Chronological Meetings Timeline */}
            <div className="day-agenda-timeline-column">
              {dayMeetings.length === 0 ? (
                /* Empty state */
                <div className="day-agenda-empty">
                  <div className="day-agenda-empty-icon">
                    <CalendarIcon size={26} color="#94A3B8" />
                  </div>
                  <h3 className="day-agenda-empty-title">No meetings scheduled</h3>
                  <p className="day-agenda-empty-subtitle">
                    There are no meetings on this day. Schedule one or choose another date from the calendar.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setIsModalOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={16} />
                    <span>Schedule a Meeting</span>
                  </button>
                </div>
              ) : (
                /* Meetings List with Vertical Timeline */
                <div className="day-timeline-list">
                  {dayMeetings.map((m, idx) => {
                    const isCompleted = m.status === 'completed';
                    const isUpcoming = ['scheduled', 'queued', 'joining'].includes(m.status);
                    const isRecording = m.status === 'recording' || m.status === 'processing';
                    const durationMins = getMeetingDurationMinutes(m);
                    const dotColor = EVENT_COLORS[idx % EVENT_COLORS.length];
                    const tintClass = CARD_TINT_CLASSES[idx % CARD_TINT_CLASSES.length];
                    const participants = speakersByMeeting[m.id] || [];
                    const summaryText = moms[m.id]?.summary || '';
                    const isMenuOpen = activeMenuMeetingId === m.id;

                    return (
                      <div key={m.id} className="day-timeline-item">
                        {/* Timeline Left Track */}
                        <div className="day-timeline-left">
                          <div className="day-timeline-node">
                            <span
                              className="day-timeline-dot"
                              style={{ backgroundColor: dotColor }}
                            />
                            <span className="day-timeline-time">{formatTime(m.scheduled_start)}</span>
                          </div>
                          <span className="day-timeline-duration">{formatMeetingDuration(durationMins)}</span>
                          <div className="day-timeline-line" />
                        </div>

                        {/* Meeting Card (Pastel Tint) */}
                        <div className={`day-meeting-card ${tintClass}`}>
                          {/* Top Row: Title + Status + Avatars + Meet + Action Button + Overflow */}
                          <div className="day-card-top">
                            {/* Title & Status */}
                            <div className="day-card-title-group">
                              <h3 className="day-card-title">{m.title}</h3>
                              {isCompleted && <span className="day-badge-completed">Completed</span>}
                              {isUpcoming && <span className="day-badge-upcoming">Upcoming</span>}
                              {isRecording && <span className="day-badge-recording">Recording</span>}
                              {m.status === 'failed' && (
                                <span className="day-badge-recording" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                                  Failed
                                </span>
                              )}
                            </div>

                            {/* Right Actions Cluster */}
                            <div className="day-card-actions-group">
                              {/* Real Participants Avatars (if available) */}
                              {participants.length > 0 && (
                                <div className="day-avatars-cluster" title={participants.join(', ')}>
                                  {participants.slice(0, 3).map((speaker, sIdx) => (
                                    <div
                                      key={speaker + '_' + sIdx}
                                      className="day-avatar-pill"
                                      title={speaker}
                                    >
                                      {getParticipantInitials(speaker)}
                                    </div>
                                  ))}
                                  {participants.length > 3 && (
                                    <div className="day-avatar-pill more">
                                      +{participants.length - 3}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Google Meet Quad-Color Icon */}
                              <GoogleMeetIcon size={22} />

                              {/* Action Button: View Recap (for completed) or Join (for upcoming) */}
                              {isCompleted ? (
                                <Link href={`/meetings/${m.id}`} className="btn-view-recap">
                                  View Recap
                                </Link>
                              ) : (
                                <a
                                  href={m.meet_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-join-action"
                                >
                                  Join
                                </a>
                              )}

                              {/* Overflow Menu */}
                              <div className="day-menu-container" style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  className="btn-card-more"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMeetingId(isMenuOpen ? null : m.id);
                                  }}
                                  aria-label="More options"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {isMenuOpen && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '32px',
                                      right: '0',
                                      width: '180px',
                                      backgroundColor: '#FFFFFF',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '10px',
                                      boxShadow: '0 8px 20px -4px rgba(0,0,0,0.12)',
                                      zIndex: 70,
                                      padding: '6px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '2px',
                                    }}
                                  >
                                    <Link
                                      href={`/meetings/${m.id}`}
                                      className="month-popover-item"
                                      style={{ fontSize: '12px' }}
                                    >
                                      View Details
                                    </Link>
                                    {m.meet_link && (
                                      <button
                                        type="button"
                                        className="month-popover-item"
                                        style={{
                                          fontSize: '12px',
                                          background: 'none',
                                          border: 'none',
                                          width: '100%',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                        }}
                                        onClick={() => handleCopyLink(m.id, m.meet_link)}
                                      >
                                        <span>Copy Meet Link</span>
                                        {copiedMeetingId === m.id && <Check size={14} color="#16A34A" />}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row: Meeting Summary / Description (Real data) */}
                          {summaryText ? (
                            <p className="day-card-summary">{summaryText}</p>
                          ) : m.error_message ? (
                            <p className="day-card-summary" style={{ color: '#DC2626' }}>
                              {m.error_message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Mini Calendar, Quote Card, Day Summary, Quick Actions */}
            <div className="day-agenda-sidebar">
              {/* 1. Mini Monthly Calendar */}
              <div className="mini-calendar-card">
                <div className="mini-cal-header">
                  <button
                    type="button"
                    className="btn-cal-nav"
                    onClick={() => {
                      if (miniCalMonth === 0) {
                        setMiniCalMonth(11);
                        setMiniCalYear((y) => y - 1);
                      } else {
                        setMiniCalMonth((m) => m - 1);
                      }
                    }}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="mini-cal-title">
                    {MONTH_NAMES[miniCalMonth]} {miniCalYear}
                  </span>
                  <button
                    type="button"
                    className="btn-cal-nav"
                    onClick={() => {
                      if (miniCalMonth === 11) {
                        setMiniCalMonth(0);
                        setMiniCalYear((y) => y + 1);
                      } else {
                        setMiniCalMonth((m) => m + 1);
                      }
                    }}
                    aria-label="Next month"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className="mini-cal-days-header">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <span key={d} className="mini-cal-day-name">
                      {d}
                    </span>
                  ))}
                </div>

                <div className="mini-cal-grid">
                  {miniCalCells.map((c, cIdx) => (
                    <button
                      key={c.dateStr + '_' + cIdx}
                      type="button"
                      className={`mini-cal-cell ${c.isSelected ? 'selected' : ''} ${!c.isCurrentMonth ? 'other-month' : ''} ${c.hasMeetings ? 'has-meetings' : ''}`}
                      onClick={() => openDayAgendaView(c.dateStr)}
                      title={`${c.dateStr} (${(meetingsByDay[c.dateStr] || []).length} meetings)`}
                    >
                      {c.dayNum}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Visual / Date Information Card (Matches Image 2) */}
              <div className="day-visual-card">
                <div style={{ flexShrink: 0, width: '64px', height: '64px' }}>
                  <svg viewBox="0 0 80 80" fill="none" style={{ width: '100%', height: '100%' }}>
                    <rect x="8" y="14" width="64" height="54" rx="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="2.5" />
                    <rect x="8" y="14" width="64" height="16" rx="10" fill="#0066FF" />
                    <rect x="22" y="8" width="5" height="10" rx="2" fill="#60A5FA" />
                    <rect x="53" y="8" width="5" height="10" rx="2" fill="#60A5FA" />
                    <rect x="18" y="38" width="8" height="8" rx="2" fill="#EFF6FF" />
                    <rect x="36" y="38" width="8" height="8" rx="2" fill="#0066FF" />
                    <rect x="54" y="38" width="8" height="8" rx="2" fill="#EFF6FF" />
                    <rect x="18" y="52" width="8" height="8" rx="2" fill="#EFF6FF" />
                    <rect x="36" y="52" width="8" height="8" rx="2" fill="#EFF6FF" />
                    <rect x="54" y="52" width="8" height="8" rx="2" fill="#EFF6FF" />
                  </svg>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                      <path
                        d="M4 16 C 10 8, 20 6, 26 14 M 18 16 L 26 14 L 24 6"
                        stroke="#0066FF"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{
                        fontFamily: 'Caveat, cursive, sans-serif',
                        fontSize: '18px',
                        color: '#0066FF',
                        fontWeight: 700,
                      }}
                    >
                      {dayMeetings.length} {dayMeetings.length === 1 ? 'meeting' : 'meetings'} today!
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontStyle: 'italic', lineHeight: 1.4 }}>
                    &ldquo;Good meetings build great progress.&rdquo;
                  </span>
                </div>
              </div>

              {/* 3. Day Summary (Real Calculated Data) */}
              <div className="day-summary-card">
                <div className="day-section-title">
                  <CalendarCheck size={18} color="#0066FF" />
                  <span>Day Summary</span>
                </div>

                <div className="day-summary-grid">
                  {/* Tile 1: Total Participants */}
                  <div className="day-summary-tile">
                    <div className="day-summary-tile-icon" style={{ backgroundColor: '#EFF6FF', color: '#0066FF' }}>
                      <Users size={16} />
                    </div>
                    <div className="day-summary-num">{daySummaryStats.totalParticipants}</div>
                    <div className="day-summary-label">Total participants</div>
                  </div>

                  {/* Tile 2: Total Meeting Time */}
                  <div className="day-summary-tile">
                    <div className="day-summary-tile-icon" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
                      <Clock size={16} />
                    </div>
                    <div className="day-summary-num">{formatTotalMinutes(daySummaryStats.totalMins)}</div>
                    <div className="day-summary-label">Total meeting time</div>
                  </div>

                  {/* Tile 3: Google Meet Meetings */}
                  <div className="day-summary-tile">
                    <div className="day-summary-tile-icon" style={{ backgroundColor: '#F0FDF4' }}>
                      <GoogleMeetIcon size={16} />
                    </div>
                    <div className="day-summary-num">{daySummaryStats.googleMeetCount}</div>
                    <div className="day-summary-label">Google Meet meetings</div>
                  </div>

                  {/* Tile 4: Meetings Completed */}
                  <div className="day-summary-tile">
                    <div className="day-summary-tile-icon" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="day-summary-num">{daySummaryStats.completedCount}</div>
                    <div className="day-summary-label">Meetings completed</div>
                  </div>
                </div>
              </div>

              {/* 4. Quick Actions */}
              <div className="day-actions-card">
                <div className="day-section-title">
                  <Plus size={16} color="#0066FF" />
                  <span>Quick Actions</span>
                </div>

                <button
                  type="button"
                  className="btn-quick-schedule"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>Schedule a Meeting</span>
                </button>

                <button
                  type="button"
                  className="btn-quick-week"
                  onClick={() => setCalendarView('month')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CalendarIcon size={15} color="#0066FF" />
                    <span>View Day in Month Grid</span>
                  </div>
                  <ChevronRight size={15} color="#94A3B8" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchData()}
      />
    </div>
  );
}
