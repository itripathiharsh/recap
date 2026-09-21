'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Video, ExternalLink, ArrowRight, Radio, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import AddMeetingModal from '../../components/AddMeetingModal';

export default function DashboardPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState({
    cpu_percent: 0,
    ram_percent: 0,
    disk: { percent: 0, free_gb: 0 },
  });
  const [workerStatus, setWorkerStatus] = useState('online');
  const [lastHeartbeat, setLastHeartbeat] = useState(null);

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeartbeat = async () => {
    try {
      const { data } = await supabase
        .from('system_events')
        .select('*')
        .eq('event_type', 'heartbeat')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const hb = data[0];
        setLastHeartbeat(hb.created_at);
        const diffMinutes = (Date.now() - new Date(hb.created_at).getTime()) / (1000 * 60);
        setWorkerStatus(diffMinutes < 10 ? 'online' : 'offline');

        if (hb.metadata?.metrics) {
          setSystemMetrics(hb.metadata.metrics);
        }
      }
    } catch (err) {
      console.error('Error fetching heartbeat:', err);
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchHeartbeat();

    const channel = supabase
      .channel('realtime_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchMeetings())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, (p) => {
        if (p.new?.event_type === 'heartbeat') fetchHeartbeat();
      })
      .subscribe();

    const interval = setInterval(() => {
      fetchMeetings();
      fetchHeartbeat();
    }, 20000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Identify next upcoming or active meeting
  const activeMeeting = meetings.find((m) =>
    ['joining', 'recording', 'processing'].includes(m.status)
  );

  const upcomingMeetings = meetings
    .filter((m) => new Date(m.scheduled_start) >= now && ['scheduled', 'queued'].includes(m.status))
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());

  const nextMeeting = activeMeeting || (upcomingMeetings.length > 0 ? upcomingMeetings[0] : null);

  // Compute countdown
  const getCountdown = (targetDateStr, status) => {
    if (['joining', 'recording', 'processing'].includes(status)) {
      return 'LIVE RECORDING';
    }
    if (!targetDateStr) return '';
    const diffMs = new Date(targetDateStr).getTime() - Date.now();
    if (diffMs <= 0) return 'Starting now';
    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins < 60) return `in ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `in ${diffHours}h ${diffMins % 60}m`;
  };

  const todayMeetings = meetings.filter((m) => {
    const meetDate = new Date(m.scheduled_start).toISOString().split('T')[0];
    return meetDate === todayStr;
  });

  const recentMeetings = meetings
    .filter((m) => m.status === 'completed')
    .slice(0, 5);

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Good morning, Harsh
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Here's your meetings overview for today.
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

      {/* Top Split Row: Next Meeting Panel (Left/Main) & System Status (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '18px', marginBottom: '28px' }}>
        {/* Next Meeting Panel */}
        <div className="surface-card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={13} color="var(--text-secondary)" aria-hidden="true" />
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Next Meeting
              </span>
            </div>

            {nextMeeting && (
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: activeMeeting ? 'var(--status-warning)' : 'var(--brand-blue)',
                  backgroundColor: activeMeeting ? 'var(--status-warning-bg)' : 'var(--brand-blue-subtle)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {activeMeeting && <Radio size={12} aria-hidden="true" />}
                <span>{getCountdown(nextMeeting.scheduled_start, nextMeeting.status)}</span>
              </span>
            )}
          </div>

          {nextMeeting ? (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                {nextMeeting.title}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', flexWrap: 'wrap' }}>
                <span className="tabular-nums" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                  {new Date(nextMeeting.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>&bull;</span>
                <span className="tabular-nums">{nextMeeting.expected_duration_minutes} min</span>
                <span>&bull;</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Video size={13} color="var(--brand-blue)" aria-hidden="true" />
                  <span>Google Meet</span>
                </span>
                <span>&bull;</span>
                <StatusBadge status={nextMeeting.status} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <a
                  href={nextMeeting.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  <span>Join Meeting</span>
                </a>
                <Link
                  href={`/meetings/${nextMeeting.id}`}
                  className="btn-secondary"
                >
                  <span>View Details</span>
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '16px 0' }}>
              No upcoming meetings scheduled for today. Click &quot;Schedule Meeting&quot; to queue a call.
            </div>
          )}
        </div>

        {/* System Status (Very Compact Card) */}
        <div className="surface-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)' }}>
                System Readiness
              </span>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: workerStatus === 'online' ? 'var(--status-success)' : 'var(--status-error)',
                }}
              />
            </div>

            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
              {workerStatus === 'online' ? 'Oracle VM Active' : 'Worker Offline'}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Audio: 7-day retention &bull; Whisper &amp; Pyannote ready
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }} className="tabular-nums">
              CPU: {systemMetrics.cpu_percent}% &bull; RAM: {systemMetrics.ram_percent}% &bull; Disk: {systemMetrics.disk?.free_gb || 0} GB free
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }} className="tabular-nums">
            {lastHeartbeat
              ? `Synced ${new Date(lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Awaiting sync'}
          </div>
        </div>
      </div>

      {/* Main Area: Today's Schedule & Recent Meetings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' }}>
        {/* Today's Schedule */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Today&apos;s Schedule
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }} className="tabular-nums">
              {todayMeetings.length} {todayMeetings.length === 1 ? 'meeting' : 'meetings'}
            </span>
          </div>

          <div className="surface-card">
            {todayMeetings.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No meetings scheduled for today.
              </div>
            ) : (
              <table className="data-table-clean">
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>Time</th>
                    <th>Meeting</th>
                    <th style={{ width: '80px' }}>Duration</th>
                    <th style={{ width: '100px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayMeetings.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular-nums" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {new Date(m.scheduled_start).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <Link href={`/meetings/${m.id}`} style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {m.title}
                        </Link>
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {m.expected_duration_minutes}m
                      </td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Meetings */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recent Meetings
            </h2>
            <Link
              href="/meetings"
              style={{ fontSize: '12.5px', color: 'var(--brand-blue)', fontWeight: 500 }}
            >
              View all meetings &rarr;
            </Link>
          </div>

          <div className="surface-card">
            {recentMeetings.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No recent meetings found.
              </div>
            ) : (
              <table className="data-table-clean">
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th style={{ width: '110px' }}>Date</th>
                    <th style={{ width: '100px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMeetings.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/meetings/${m.id}`} style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {m.title}
                        </Link>
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(m.started_at || m.scheduled_start).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
