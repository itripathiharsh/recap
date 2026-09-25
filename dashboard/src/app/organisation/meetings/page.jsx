'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';
import StatusBadge from '../../../components/StatusBadge';

export default function OrganisationMeetingsPage() {
  const { activeOrgId } = useWorkspace();
  const [meetings, setMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [speakers, setSpeakers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) {
      setMeetings([]);
      setMembers([]);
      setSpeakers({});
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [{ data: meetingData }, { data: memberData }, { data: turnData }] =
          await Promise.all([
            applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId).order(
              'scheduled_start',
              { ascending: false }
            ),
            supabase
              .from('organisation_members')
              .select('user_id, display_name, email'),
            supabase.from('speaker_turns').select('meeting_id, speaker'),
          ]);

        const scoped = meetingData || [];
        setMeetings(scoped);
        setMembers(memberData || []);

        const scopedIds = new Set(scoped.map((m) => m.id));
        const byMeeting = {};
        filterToMeetings(turnData || [], scopedIds).forEach((t) => {
          if (!byMeeting[t.meeting_id]) byMeeting[t.meeting_id] = new Set();
          if (t.speaker) byMeeting[t.meeting_id].add(t.speaker);
        });
        setSpeakers(byMeeting);
      } catch (err) {
        console.error('Organisation meetings load error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeOrgId]);

  const memberNameById = useMemo(() => {
    const map = new Map();
    members.forEach((m) => map.set(m.user_id, m.display_name || m.email || 'Member'));
    return map;
  }, [members]);

  return (
    <OrganisationPage
      title="Organisation Meetings"
      subtitle="Meetings owned by this organisation workspace, with owners and participants."
    >
      <div className="surface-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Loading organisation meetings...
          </div>
        ) : meetings.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No meetings in this organisation yet. Schedule one from the Meetings
            page while this workspace is active.
          </div>
        ) : (
          <table className="data-table-clean">
            <thead>
              <tr>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Meeting
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Owner
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Participants
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Date
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const meetingSpeakers = Array.from(speakers[m.id] || []);
                const dateObj = new Date(m.started_at || m.scheduled_start || m.created_at);
                let minutes = m.expected_duration_minutes || 30;
                if (m.started_at && m.ended_at) {
                  const elapsed = (new Date(m.ended_at) - new Date(m.started_at)) / 60000;
                  if (Number.isFinite(elapsed) && elapsed > 0) {
                    minutes = Math.round(elapsed);
                  }
                }
                return (
                  <tr key={m.id}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className="metric-icon-box"
                          style={{ width: '30px', height: '30px', borderRadius: '8px' }}
                        >
                          <Video size={14} color="#00832d" aria-hidden="true" />
                        </span>
                        <div>
                          <Link
                            href={`/meetings/${m.id}`}
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                            }}
                          >
                            {m.title}
                          </Link>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            {m.visibility || 'private'} visibility
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {memberNameById.get(m.owner_id) || 'Member'}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <div className="upcoming-avatars">
                        {meetingSpeakers.length === 0 ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>—</span>
                        ) : (
                          <>
                            {meetingSpeakers.slice(0, 3).map((spk, idx) => {
                              const bgColors = ['#3B82F6', '#10B981', '#8B5CF6'];
                              return (
                                <div
                                  key={spk}
                                  className="upcoming-avatar"
                                  style={{ backgroundColor: bgColors[idx % bgColors.length] }}
                                  title={spk}
                                >
                                  {spk[0].toUpperCase()}
                                </div>
                              );
                            })}
                            {meetingSpeakers.length > 3 && (
                              <span className="upcoming-avatar-more">+{meetingSpeakers.length - 3}</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                      <div>{dateObj.toLocaleDateString()}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted, #94A3B8)' }}>
                        {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <StatusBadge status={m.status} />
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                      {minutes} min
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </OrganisationPage>
  );
}
