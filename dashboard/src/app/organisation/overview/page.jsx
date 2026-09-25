'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, Clock, FileText, Users, ExternalLink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';
import StatusBadge from '../../../components/StatusBadge';

export default function OrganisationOverviewPage() {
  const { activeOrgId, activeWorkspace, activeOrgRole } = useWorkspace();
  const [organisation, setOrganisation] = useState(null);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) {
      setOrganisation(null);
      setMembers([]);
      setMeetings([]);
      setMoms([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const [{ data: orgData }, { data: memberData }, { data: meetingData }, { data: momData }] =
          await Promise.all([
            supabase
              .from('organisations')
              .select('id, name, created_at, owner_id')
              .eq('id', activeOrgId)
              .maybeSingle(),
            supabase
              .from('organisation_members')
              .select('user_id, role, status, email, display_name, created_at')
              .eq('organisation_id', activeOrgId),
            applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId).order(
              'scheduled_start',
              { ascending: false }
            ),
            supabase.from('mom').select('meeting_id, action_items'),
          ]);

        setOrganisation(orgData || null);
        setMembers(memberData || []);
        const scopedMeetings = meetingData || [];
        setMeetings(scopedMeetings);
        setMoms(filterToMeetings(momData || [], new Set(scopedMeetings.map((m) => m.id))));
      } catch (err) {
        console.error('Organisation overview load error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeOrgId]);

  const memberNameById = useMemo(() => {
    const map = new Map();
    members.forEach((m) => {
      map.set(m.user_id, m.display_name || m.email || 'Member');
    });
    return map;
  }, [members]);

  const stats = useMemo(() => {
    const activeMembers = members.filter((m) => m.status === 'active').length;
    const actionItems = moms.reduce(
      (sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0),
      0
    );
    const completed = meetings.filter((m) => m.status === 'completed').length;
    return { activeMembers, actionItems, completed };
  }, [members, moms, meetings]);

  const recentMeetings = meetings.slice(0, 5);

  if (loading) {
    return (
      <OrganisationPage title="Organisation Overview" subtitle="Loading organisation data...">
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Loading organisation data...
        </div>
      </OrganisationPage>
    );
  }

  return (
    <OrganisationPage
      title={organisation?.name || activeWorkspace?.name || 'Organisation'}
      subtitle={
        organisation
          ? `Owner workspace overview · created ${new Date(organisation.created_at).toLocaleDateString()}`
          : 'Organisation overview'
      }
    >
      {/* Metrics Row */}
      <section className="metrics-row">
        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Users size={20} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <div className="metric-label">Active Members</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{stats.activeMembers}</span>
              <span
                className="metric-trend tabular-nums"
                style={{ color: '#7C3AED', backgroundColor: '#F5F3FF' }}
              >
                Roster
              </span>
            </div>
            <div className="metric-trend-sub">Owners, admins and members</div>
          </div>
        </div>

        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Calendar size={20} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <div className="metric-label">Organisation Meetings</div>
            <div className="metric-value-row">
              <span className="metric-value tabular-nums">{meetings.length}</span>
              <span
                className="metric-trend tabular-nums"
                style={{ color: '#0066FF', backgroundColor: '#EFF6FF' }}
              >
                All time
              </span>
            </div>
            <div className="metric-trend-sub">{stats.completed} completed</div>
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
              <span
                className="metric-trend tabular-nums"
                style={{ color: '#16A34A', backgroundColor: '#F0FDF4' }}
              >
                Extracted
              </span>
            </div>
            <div className="metric-trend-sub">From meeting MOMs</div>
          </div>
        </div>

        <div className="metric-card-ref">
          <div className="metric-icon-box">
            <Clock size={20} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <div className="metric-label">Your Role</div>
            <div className="metric-value-row">
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {activeOrgRole || 'member'}
              </span>
            </div>
            <div className="metric-trend-sub">In this organisation</div>
          </div>
        </div>
      </section>

      {/* Recent meetings */}
      <div className="surface-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Recent Meetings
          </span>
          <Link href="/organisation/meetings" className="card-ref-link" style={{ fontSize: '12px' }}>
            <span>View all &rarr;</span>
          </Link>
        </div>

        {recentMeetings.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No organisation meetings yet. Schedule one from the Meetings page while
            this workspace is active.
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
                  Date
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '10px 20px' }} />
              </tr>
            </thead>
            <tbody>
              {recentMeetings.map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {m.title}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    {memberNameById.get(m.owner_id) || 'Member'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                    {new Date(m.started_at || m.scheduled_start || m.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <StatusBadge status={m.status} />
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <Link
                      href={`/meetings/${m.id}`}
                      className="detail-icon-btn"
                      title="Open meeting"
                      aria-label="Open meeting"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </OrganisationPage>
  );
}
