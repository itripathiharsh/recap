'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, Clock, FileText, TrendingUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';

const STATUS_COLORS = {
  completed: '#16A34A',
  processing: '#F59E0B',
  scheduled: '#0066FF',
  failed: '#DC2626',
  default: '#64748B',
};

const SPEAKER_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];

function meetingDurationSeconds(meeting) {
  if (meeting.started_at && meeting.ended_at) {
    const elapsed = (new Date(meeting.ended_at) - new Date(meeting.started_at)) / 1000;
    if (Number.isFinite(elapsed) && elapsed > 0) return elapsed;
  }
  return (meeting.expected_duration_minutes || 30) * 60;
}

function turnDurationSeconds(turn) {
  const start = Number(turn.start_time);
  const end = Number(turn.end_time);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return end - start;
  }
  return 0;
}

export default function OrganisationAnalyticsPage() {
  const { activeOrgId } = useWorkspace();
  const [meetings, setMeetings] = useState([]);
  const [turns, setTurns] = useState([]);
  const [moms, setMoms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) {
      setMeetings([]);
      setTurns([]);
      setMoms([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [{ data: meetingData }, { data: turnData }, { data: momData }] =
          await Promise.all([
            applyWorkspaceScope(
              supabase
                .from('meetings')
                .select(
                  'id, status, started_at, ended_at, scheduled_start, expected_duration_minutes'
                ),
              activeOrgId
            ).order('scheduled_start', { ascending: false }),
            supabase.from('speaker_turns').select('meeting_id, speaker, start_time, end_time'),
            supabase.from('mom').select('meeting_id, action_items'),
          ]);

        const scoped = meetingData || [];
        const scopedIds = new Set(scoped.map((m) => m.id));
        setMeetings(scoped);
        setTurns(filterToMeetings(turnData || [], scopedIds));
        setMoms(filterToMeetings(momData || [], scopedIds));
      } catch (err) {
        console.error('Organisation analytics load error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeOrgId]);

  const stats = useMemo(() => {
    const byStatus = {};
    let totalSeconds = 0;
    meetings.forEach((m) => {
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      totalSeconds += meetingDurationSeconds(m);
    });

    const speakerTotals = {};
    turns.forEach((t) => {
      if (!t.speaker) return;
      speakerTotals[t.speaker] =
        (speakerTotals[t.speaker] || 0) + turnDurationSeconds(t);
    });
    const topSpeakers = Object.entries(speakerTotals)
      .map(([speaker, seconds]) => ({ speaker, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5);
    const speakerTotalSeconds = topSpeakers.reduce((s, x) => s + x.seconds, 0);

    const actionItems = moms.reduce(
      (sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0),
      0
    );

    return {
      byStatus,
      totalSeconds,
      avgMinutes:
        meetings.length > 0 ? Math.round(totalSeconds / meetings.length / 60) : 0,
      topSpeakers,
      speakerTotalSeconds,
      actionItems,
    };
  }, [meetings, turns, moms]);

  const statusEntries = Object.entries(stats.byStatus);
  const maxStatusCount = Math.max(1, ...statusEntries.map(([, c]) => c));

  return (
    <OrganisationPage
      title="Analytics"
      subtitle="Meeting activity, duration and speaker distribution for this organisation."
    >
      {loading ? (
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Computing analytics...
        </div>
      ) : meetings.length === 0 ? (
        <div className="surface-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div className="metric-icon-box" style={{ margin: '0 auto 14px' }}>
            <BarChart2 size={20} strokeWidth={2} aria-hidden="true" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            No meetings to analyse yet
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', textWrap: 'pretty' }}>
            Analytics appear once this organisation has meetings with recordings,
            transcripts or MOMs.
          </p>
        </div>
      ) : (
        <>
          {/* Metrics Row */}
          <section className="metrics-row">
            <div className="metric-card-ref">
              <div className="metric-icon-box">
                <TrendingUp size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="metric-label">Meetings</div>
                <div className="metric-value-row">
                  <span className="metric-value tabular-nums">{meetings.length}</span>
                </div>
                <div className="metric-trend-sub">All time in this organisation</div>
              </div>
            </div>
            <div className="metric-card-ref">
              <div className="metric-icon-box">
                <Clock size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="metric-label">Total Hours</div>
                <div className="metric-value-row">
                  <span className="metric-value tabular-nums">
                    {(stats.totalSeconds / 3600).toFixed(1)}
                  </span>
                </div>
                <div className="metric-trend-sub">Recorded meeting time</div>
              </div>
            </div>
            <div className="metric-card-ref">
              <div className="metric-icon-box">
                <Clock size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="metric-label">Avg. Duration</div>
                <div className="metric-value-row">
                  <span className="metric-value tabular-nums">{stats.avgMinutes}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '2px' }}>min</span>
                </div>
                <div className="metric-trend-sub">Per meeting</div>
              </div>
            </div>
            <div className="metric-card-ref">
              <div className="metric-icon-box">
                <FileText size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="metric-label">Action Items</div>
                <div className="metric-value-row">
                  <span className="metric-value tabular-nums">{stats.actionItems}</span>
                </div>
                <div className="metric-trend-sub">Extracted from MOMs</div>
              </div>
            </div>
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {/* Status breakdown */}
            <div className="surface-card" style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                Meetings by Status
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {statusEntries.map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '90px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        textTransform: 'capitalize',
                        flexShrink: 0,
                      }}
                    >
                      {status}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: '8px',
                        backgroundColor: 'var(--bg-soft, #F1F5F9)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(count / maxStatusCount) * 100}%`,
                          height: '100%',
                          backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.default,
                          borderRadius: '4px',
                          transition: 'width 300ms ease',
                        }}
                      />
                    </div>
                    <span
                      className="tabular-nums"
                      style={{ width: '24px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top speakers */}
            <div className="surface-card" style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                Top Speakers
              </h2>
              {stats.topSpeakers.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  No diarized speakers found in transcripts yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stats.topSpeakers.map((sp, idx) => {
                    const pct =
                      stats.speakerTotalSeconds > 0
                        ? Math.round((sp.seconds / stats.speakerTotalSeconds) * 100)
                        : 0;
                    return (
                      <div key={sp.speaker} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            width: '90px',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          title={sp.speaker}
                        >
                          {sp.speaker}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: '8px',
                            backgroundColor: 'var(--bg-soft, #F1F5F9)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              backgroundColor: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
                              borderRadius: '4px',
                              transition: 'width 300ms ease',
                            }}
                          />
                        </div>
                        <span
                          className="tabular-nums"
                          style={{ width: '40px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </OrganisationPage>
  );
}
