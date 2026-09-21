'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';

export default function CalendarPage() {
  const [meetings, setMeetings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState('month'); // 'month', 'week', 'day', 'agenda'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fetchMeetings = async () => {
    try {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: true });
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching calendar meetings:', err);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  // Calendar calculations
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon...
  const prevMonthDays = new Date(year, month, 0).getDate();

  const prevMonth = () => setSelectedDate(new Date(year, month - 1, 1));
  const nextMonth = () => setSelectedDate(new Date(year, month + 1, 1));
  const setToday = () => setSelectedDate(new Date());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Map meetings by date string 'YYYY-MM-DD'
  const meetingsByDay = useMemo(() => {
    const map = {};
    meetings.forEach((m) => {
      const dStr = new Date(m.scheduled_start).toISOString().split('T')[0];
      if (!map[dStr]) map[dStr] = [];
      map[dStr].push(m);
    });
    return map;
  }, [meetings]);

  // Upcoming meetings for right sidebar
  const now = new Date();
  const upcomingMeetings = useMemo(() => {
    return meetings
      .filter((m) => ['scheduled', 'queued', 'joining', 'recording', 'processing'].includes(m.status))
      .slice(0, 4);
  }, [meetings]);

  // Color classes cycle for meeting event pills
  const pillColors = [
    'event-pill-blue',
    'event-pill-green',
    'event-pill-purple',
    'event-pill-orange',
    'event-pill-pink',
  ];

  // Generate calendar grid cells (42 cells: prev month tail + current month + next month head)
  const calendarCells = useMemo(() => {
    const cells = [];

    // 1. Previous month tail
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dStr = prevDate.toISOString().split('T')[0];
      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: false,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const curDate = new Date(year, month, dayNum);
      const dStr = curDate.toISOString().split('T')[0];
      const isToday =
        curDate.getDate() === now.getDate() &&
        curDate.getMonth() === now.getMonth() &&
        curDate.getFullYear() === now.getFullYear();

      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: true,
        isToday,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    // 3. Next month head (fill remaining to 35 or 42)
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextDate = new Date(year, month + 1, dayNum);
      const dStr = nextDate.toISOString().split('T')[0];
      cells.push({
        dayNum,
        dateStr: dStr,
        isCurrentMonth: false,
        meetings: meetingsByDay[dStr] || [],
      });
    }

    return cells;
  }, [year, month, daysInMonth, firstDayIndex, prevMonthDays, meetingsByDay, now]);

  return (
    <div>
      {/* 1. Top Bar */}
      <header className="dashboard-topbar">
        <div className="dashboard-search-wrap">
          <Search size={16} color="#94A3B8" aria-hidden="true" />
          <input
            type="text"
            className="dashboard-search-input"
            placeholder="Search meetings, transcripts, people, topics..."
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

      {/* 2. Hero Header with Floating Calendar Artwork & Doodle */}
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

        {/* Quote in top right */}
        <div
          style={{
            position: 'absolute',
            top: '26px',
            right: '36px',
            maxWidth: '180px',
            textAlign: 'right',
            fontStyle: 'italic',
            fontSize: '11.5px',
            color: '#64748B',
            lineHeight: 1.4,
          }}
        >
          &ldquo;A well planned day leads to meaningful outcomes.&rdquo;
        </div>

        {/* 3D floating calendar illustration */}
        <div className="dashboard-hero-art" aria-hidden="true" style={{ width: '320px' }}>
          <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <circle cx="200" cy="60" r="50" fill="#E0F2FE" opacity="0.6" />
            <rect x="140" y="30" width="110" height="85" rx="12" fill="#FFFFFF" stroke="#0066FF" strokeWidth="2" filter="drop-shadow(0 10px 20px rgba(0,102,255,0.08))" />
            <rect x="140" y="30" width="110" height="24" rx="12" fill="#0066FF" />
            <rect x="160" y="22" width="6" height="14" rx="3" fill="#60A5FA" />
            <rect x="224" y="22" width="6" height="14" rx="3" fill="#60A5FA" />
            {/* Calendar grid lines */}
            <rect x="155" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
            <rect x="175" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
            <rect x="195" y="66" width="14" height="14" rx="3" fill="#0066FF" />
            <rect x="215" y="66" width="14" height="14" rx="3" fill="#EFF6FF" />
            <rect x="155" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
            <rect x="175" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
            <rect x="195" y="86" width="14" height="14" rx="3" fill="#EFF6FF" />
          </svg>
        </div>
      </section>

      {/* 3. Main Split Section */}
      <div className="meetings-split-layout" style={{ gridTemplateColumns: '1.45fr 1fr' }}>
        {/* Left Column: Interactive Calendar Grid */}
        <div className="meetings-list-card" style={{ padding: '20px' }}>
          {/* Calendar Navigation Toolbar */}
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
                {monthNames[month]} {year}
              </h2>
            </div>

            {/* View Pills */}
            <div className="calendar-view-pills">
              {['month', 'week', 'day', 'agenda'].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`btn-cal-view ${calendarView === v ? 'active' : ''}`}
                  onClick={() => setCalendarView(v)}
                >
                  <span style={{ textTransform: 'capitalize' }}>{v}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Month Table Grid */}
          <div className="calendar-month-grid">
            {/* Days of Week Header */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="calendar-header-cell">
                {d}
              </div>
            ))}

            {/* Day Cells */}
            {calendarCells.map((cell, idx) => (
              <div
                key={idx}
                className={`calendar-day-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${cell.isToday ? 'today' : ''}`}
              >
                <span className={`calendar-day-number ${cell.isToday ? 'today-pill' : ''}`}>
                  {cell.dayNum}
                </span>

                {/* Event Pills */}
                {cell.meetings.map((m, mIdx) => {
                  const colorCls = pillColors[mIdx % pillColors.length];
                  const time = new Date(m.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className={`calendar-event-pill ${colorCls}`}
                      title={`${time} - ${m.title}`}
                    >
                      <span style={{ fontSize: '9px' }}>●</span>
                      <span className="tabular-nums" style={{ fontWeight: 600 }}>{time}</span>
                      <span>{m.title}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
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
                      <div className="upcoming-platform-badge">
                        <Video size={16} color="#00832d" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="upcoming-title">{m.title}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }} className="tabular-nums">
                          {new Date(m.scheduled_start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                          {new Date(m.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              <span className="doodle-banner-text" style={{ fontSize: '15px' }}>All your meetings in one place.</span>
              <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#0066FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* 3 Integrations */}
            <div className="integrations-grid">
              {/* Google Calendar */}
              <div className="integration-card">
                <div className="integration-logo-box">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div className="integration-name">Google Calendar</div>
                <span className="integration-status-connected">● Connected</span>
              </div>

              {/* Outlook */}
              <div className="integration-card">
                <div className="integration-logo-box">
                  <div style={{ width: '18px', height: '18px', backgroundColor: '#0078D4', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: '10px' }}>
                    O
                  </div>
                </div>
                <div className="integration-name">Outlook</div>
                <button type="button" className="integration-link-connect">Connect</button>
              </div>

              {/* Apple Calendar */}
              <div className="integration-card">
                <div className="integration-logo-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.61 1.34-.55.63-.99 1.68-.86 2.7 1 .08 2-.45 2.54-1.19z" />
                  </svg>
                </div>
                <div className="integration-name">Apple Calendar</div>
                <button type="button" className="integration-link-connect">Connect</button>
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

      {/* Add Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchMeetings()}
      />
    </div>
  );
}
