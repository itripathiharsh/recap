'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft, ChevronRight, Video, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import AddMeetingModal from '../../components/AddMeetingModal';

export default function CalendarPage() {
  const [meetings, setMeetings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchMeetings = async () => {
    try {
      const { data } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: true });
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  // Calendar calculations
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Shift to start Monday (0 = Mon, ..., 6 = Sun)
  const startOffset = (firstDay + 6) % 7;

  const prevMonth = () => {
    setSelectedDate(new Date(year, month - 1, 1));
    setSelectedMeeting(null);
  };

  const nextMonth = () => {
    setSelectedDate(new Date(year, month + 1, 1));
    setSelectedMeeting(null);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Group meetings by day string 'YYYY-MM-DD'
  const meetingsByDay = {};
  meetings.forEach((m) => {
    const dStr = new Date(m.scheduled_start).toISOString().split('T')[0];
    if (!meetingsByDay[dStr]) meetingsByDay[dStr] = [];
    meetingsByDay[dStr].push(m);
  });

  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  const meetingsOnSelectedDate = meetingsByDay[selectedDateStr] || [];

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
            Calendar
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Your meeting schedule.
          </p>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={14} aria-hidden="true" />
          <span>Schedule Meeting</span>
        </button>
      </div>

      {/* Main Layout: Left Calendar Grid / Right Upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        {/* Calendar Grid */}
        <div className="surface-card" style={{ padding: '16px 18px' }}>
          {/* Month Header Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {monthNames[month]} {year}
            </h2>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px' }}
                onClick={prevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 8px' }}
                onClick={nextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '6px' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px' }}>
                {day}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} style={{ backgroundColor: 'var(--bg-soft)', minHeight: '68px' }} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateObj = new Date(year, month, dayNum);
              const dStr = dateObj.toISOString().split('T')[0];
              const isSelected = dStr === selectedDateStr;
              const dayMeetings = meetingsByDay[dStr] || [];

              return (
                <div
                  key={dayNum}
                  onClick={() => {
                    setSelectedDate(dateObj);
                    setSelectedMeeting(dayMeetings[0] || null);
                  }}
                  style={{
                    backgroundColor: isSelected ? 'var(--brand-blue-subtle)' : 'var(--bg-surface)',
                    minHeight: '68px',
                    padding: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: '11.5px',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? 'var(--brand-blue)' : 'var(--text-primary)',
                      }}
                    >
                      {dayNum}
                    </span>

                    {dayMeetings.length > 0 && (
                      <span
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--brand-blue)',
                        }}
                      />
                    )}
                  </div>

                  {dayMeetings.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                      {dayMeetings.slice(0, 2).map((m) => (
                        <div
                          key={m.id}
                          style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            padding: '1px 3px',
                            borderRadius: '3px',
                            backgroundColor: 'var(--brand-teal-subtle)',
                            color: 'var(--brand-teal)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.title}
                        </div>
                      ))}
                      {dayMeetings.length > 2 && (
                        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                          +{dayMeetings.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Upcoming & Contextual Meeting Detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Upcoming for Selected Date */}
          <div className="surface-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Schedule for {selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </div>

            {meetingsOnSelectedDate.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '8px 0' }}>
                No meetings scheduled on this day.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {meetingsOnSelectedDate.map((m) => {
                  const isCur = selectedMeeting?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMeeting(m)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '5px',
                        border: '1px solid',
                        borderColor: isCur ? 'var(--brand-blue)' : 'var(--border)',
                        backgroundColor: isCur ? 'var(--brand-blue-subtle)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span className="tabular-nums" style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {new Date(m.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {m.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Contextual Meeting Detail Panel */}
          {selectedMeeting && (
            <div className="surface-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Selected Meeting
              </div>

              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {selectedMeeting.title}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                <Clock size={12} aria-hidden="true" />
                <span className="tabular-nums">{selectedMeeting.expected_duration_minutes} min</span>
                <span>&bull;</span>
                <Video size={12} color="var(--brand-blue)" aria-hidden="true" />
                <span>Google Meet</span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={selectedMeeting.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  Join Call
                </a>
                <Link
                  href={`/meetings/${selectedMeeting.id}`}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Workspace
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchMeetings()}
      />
    </div>
  );
}
