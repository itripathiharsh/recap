'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserCheck,
  Clock,
  ShieldCheck,
  Link2,
  Copy,
  Check,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Search as SearchIcon,
  X,
  AlertCircle,
  Mail,
  TrendingUp,
  CalendarDays,
  Download,
  Settings2,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';
import { getPersonTeam, teamColor, UNASSIGNED_TEAM } from '../lib/teams.mjs';

const AVATAR_PALETTES = [
  { bg: '#E3EDFD', text: '#1D4ED8' },
  { bg: '#EBE4FD', text: '#6D28D9' },
  { bg: '#FCE7F3', text: '#BE185D' },
  { bg: '#FEF3C7', text: '#B45309' },
  { bg: '#D9F7E8', text: '#047857' },
  { bg: '#E0F2FE', text: '#075985' },
];

const PAGE_SIZES = [10, 25, 50];

const ACCESS_CONTROLS = [
  {
    key: 'meeting_data_access',
    label: 'Meeting Data Access',
    hint: 'Who can open transcripts and summaries',
    icon: CalendarDays,
    options: ['All members', 'Own meetings', 'Admins only'],
  },
  {
    key: 'export_downloads',
    label: 'Export & Downloads',
    hint: 'Who can export transcripts',
    icon: Download,
    options: ['All members', 'Admins only'],
  },
  {
    key: 'org_settings_access',
    label: 'Organisation Settings',
    hint: 'Who can change settings',
    icon: Settings2,
    options: ['All members', 'Admins only'],
  },
];

function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function getAvatarColors(key) {
  if (!key) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

/**
 * The members workspace, shared by /organisation/members and the
 * "Members & Access" settings section so both stay in sync.
 *
 * variant="page"     -> standalone page, invite-oriented hero
 * variant="settings" -> rendered inside the settings grid, access-oriented hero
 */
export default function MembersAccessPanel({ variant = 'page' }) {
  const router = useRouter();
  const { activeOrgId, activeOrgRole, session } = useWorkspace();

  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [orgSettings, setOrgSettings] = useState(null);

  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('joined');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState(() => new Set());
  const [rowMenuOpen, setRowMenuOpen] = useState(null);
  const [actionError, setActionError] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [linkRole, setLinkRole] = useState('member');
  const [linkCopied, setLinkCopied] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  const myUserId = session?.user?.id || null;
  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';
  const canChangeRoles = activeOrgRole === 'owner';

  /* ------------------------------------------------------------------ load */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) {
        setMembers([]);
        setInvitations([]);
        setMeetings([]);
        setSpeakerTurns({});
        return;
      }
      try {
        const [memberRes, inviteRes, meetingRes, turnRes, settingsRes] = await Promise.all([
          supabase
            .from('organisation_members')
            .select('id, user_id, role, status, email, display_name, created_at')
            .eq('organisation_id', activeOrgId)
            .order('created_at', { ascending: true }),
          supabase
            .from('organisation_invitations')
            .select('id, email, name, role, status, expires_at, created_at')
            .eq('organisation_id', activeOrgId)
            .order('created_at', { ascending: false }),
          applyWorkspaceScope(
            supabase.from('meetings').select('id, title, scheduled_start, started_at'),
            activeOrgId
          ),
          supabase.from('speaker_turns').select('meeting_id, speaker'),
          supabase
            .from('organisation_settings')
            .select('meeting_data_access, export_downloads, org_settings_access')
            .eq('organisation_id', activeOrgId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const scoped = meetingRes.data || [];
        const ids = new Set(scoped.map((m) => m.id));
        const byMeeting = {};
        (turnRes.data || []).forEach((t) => {
          if (!ids.has(t.meeting_id)) return;
          if (!byMeeting[t.meeting_id]) byMeeting[t.meeting_id] = new Set();
          if (t.speaker && t.speaker.trim()) byMeeting[t.meeting_id].add(t.speaker.trim());
        });

        setMembers(memberRes.data || []);
        setInvitations(inviteRes.data || []);
        setMeetings(scoped);
        setSpeakerTurns(byMeeting);
        setOrgSettings(settingsRes.error ? null : settingsRes.data);
      } catch (err) {
        console.error('Members load error:', err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  useEffect(() => {
    setRowMenuOpen(null);
    setActionError('');
  }, [activeOrgId]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, pageSize]);

  /* ------------------------------------------------------------ people list */

  const meetingsWithSpeakers = useMemo(
    () => meetings.map((m) => ({ title: m.title, speakers: speakerTurns[m.id] || new Set() })),
    [meetings, speakerTurns]
  );

  const people = useMemo(() => {
    const memberRows = members.map((m) => {
      const name = m.display_name || m.email?.split('@')[0] || 'Member';
      return {
        key: m.id,
        kind: 'member',
        userId: m.user_id,
        name,
        email: m.email || '',
        role: m.role || 'member',
        status: m.status || 'active',
        createdAt: m.created_at,
        team: getPersonTeam({ name: m.display_name, email: m.email }, meetingsWithSpeakers),
      };
    });

    const inviteRows = invitations
      .filter((inv) => inv.status === 'pending')
      .map((inv) => {
        const name = inv.name || inv.email?.split('@')[0] || 'Invitee';
        return {
          key: inv.id,
          kind: 'invite',
          userId: null,
          name,
          email: inv.email || '',
          role: inv.role || 'member',
          status: 'pending',
          createdAt: inv.created_at,
          team: UNASSIGNED_TEAM,
        };
      });

    return [...memberRows, ...inviteRows].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [members, invitations, meetingsWithSpeakers]);

  const visible = useMemo(() => {
    let rows = people;
    if (activeTab === 'admins') rows = rows.filter((p) => p.kind === 'member' && isAdminRole(p.role));
    else if (activeTab === 'members') rows = rows.filter((p) => p.kind === 'member' && !isAdminRole(p.role));
    else if (activeTab === 'pending') rows = rows.filter((p) => p.kind === 'invite');

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      );
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'email':
          return a.email.localeCompare(b.email) * dir;
        case 'role':
          return a.role.localeCompare(b.role) * dir;
        case 'team':
          return a.team.localeCompare(b.team) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        default:
          return (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dir;
      }
    });
  }, [people, activeTab, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => visible.slice((safePage - 1) * pageSize, safePage * pageSize),
    [visible, safePage, pageSize]
  );

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ----------------------------------------------------------------- stats */

  const stats = useMemo(() => {
    const pending = people.filter((p) => p.kind === 'invite').length;
    const accepted = people.filter((p) => p.kind === 'member');
    return {
      total: accepted.length,
      active: accepted.filter((p) => p.status === 'active').length,
      pending,
      admins: accepted.filter((p) => isAdminRole(p.role)).length,
      members: accepted.filter((p) => !isAdminRole(p.role)).length,
    };
  }, [people]);

  const deltas = useMemo(() => {
    const now = Date.now();
    const win = 28 * 24 * 60 * 60 * 1000;
    const inRange = (list, from, to) =>
      list.filter((p) => {
        const t = new Date(p.createdAt || 0).getTime();
        return t >= from && t < to;
      }).length;
    const pct = (a, b) => (b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / b) * 100));
    const activeList = people.filter((p) => p.status === 'active');
    return {
      total: pct(inRange(people, now - win, now + 1), inRange(people, now - win * 2, now - win)),
      active: pct(
        inRange(activeList, now - win, now + 1),
        inRange(activeList, now - win * 2, now - win)
      ),
    };
  }, [people]);

  const roleSplit = useMemo(
    () => [
      { key: 'admins', name: 'Admins', count: stats.admins, color: '#A855F7' },
      { key: 'members', name: 'Members', count: stats.members, color: '#0066FF' },
      { key: 'pending', name: 'Pending', count: stats.pending, color: '#F59E0B' },
    ],
    [stats]
  );

  /* ---------------------------------------------------------------- invite */

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/join?org=${activeOrgId || ''}&role=${linkRole}`;
  }, [activeOrgId, linkRole]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setActionError('Could not copy to clipboard — select the link and copy manually.');
    }
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) {
      setInviteError('Email is required.');
      return;
    }
    setInviteBusy(true);
    try {
      const { error } = await supabase.rpc('invite_member', {
        p_organisation_id: activeOrgId,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
      });
      if (error) throw error;
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setInviteError(err.message || 'Could not send invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleChangeRole = async (person, newRole) => {
    setRowMenuOpen(null);
    setActionError('');
    try {
      const { error } = await supabase.rpc('update_member_role', {
        p_organisation_id: activeOrgId,
        p_target_user_id: person.userId,
        p_role: newRole,
      });
      if (error) throw error;
    } catch (err) {
      setActionError(err.message || 'Could not change role.');
    }
  };

  const handleRemove = async (person) => {
    setRowMenuOpen(null);
    if (!window.confirm(`Remove ${person.name} from this organisation? They will lose access immediately.`)) {
      return;
    }
    setActionError('');
    try {
      const { error } = await supabase.rpc('remove_member', {
        p_organisation_id: activeOrgId,
        p_target_user_id: person.userId,
      });
      if (error) throw error;
    } catch (err) {
      setActionError(err.message || 'Could not remove member.');
    }
  };

  const handleRevoke = async (person) => {
    setRowMenuOpen(null);
    setActionError('');
    try {
      const { error } = await supabase.rpc('revoke_invitation', { p_invitation_id: person.key });
      if (error) throw error;
    } catch (err) {
      setActionError(err.message || 'Could not revoke invitation.');
    }
  };

  const saveAccess = async (key, value) => {
    if (!activeOrgId) return;
    setSavingAccess(true);
    setActionError('');
    const previous = orgSettings?.[key];
    setOrgSettings((s) => ({ ...(s || {}), [key]: value }));
    try {
      const { error } = await supabase
        .from('organisation_settings')
        .update({ [key]: value })
        .eq('organisation_id', activeOrgId);
      if (error) throw error;
    } catch (err) {
      setOrgSettings((s) => ({ ...(s || {}), [key]: previous }));
      setActionError(err.message || 'Could not update access control.');
    } finally {
      setSavingAccess(false);
    }
  };

  const allPageChecked = pageRows.length > 0 && pageRows.every((p) => checked.has(p.key));

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allPageChecked) pageRows.forEach((p) => next.delete(p.key));
      else pageRows.forEach((p) => next.add(p.key));
      return next;
    });
  };

  /* ---------------------------------------------------------------- render */

  const isSettings = variant === 'settings';

  const hero = (
    <section className={`org-mb-hero ${isSettings ? 'org-mb-hero-access' : ''}`}>
      <span className="org-mb-hero-badge">Members &amp; Access</span>
      <h1 className="org-mb-hero-title">
        Manage your team, <em>together.</em>
      </h1>
      <p className="org-mb-hero-sub">
        Invite members, manage roles, and control access across your organisation.
      </p>

      <div className="org-mb-hero-doodle" aria-hidden="true">
        <span className="org-mb-doodle-text">
          {isSettings ? 'Give the right access.\nKeep your data secure.' : 'Grow your team.\nMore collaboration.'}
        </span>
        <svg width="40" height="44" viewBox="0 0 50 52" fill="none">
          <path
            d="M10 6 C 20 18, 30 28, 34 44 M 24 44 L 34 45 L 37 34"
            stroke="#0066FF"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="org-mb-hero-art" aria-hidden="true">
        {isSettings ? (
          /* two figures + a lock badge */
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="mba-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M52 168 C52 114, 92 88, 152 88 C212 88, 252 116, 252 168 Z" fill="url(#mba-blob)" opacity="0.8" />
            <circle cx="238" cy="40" r="22" fill="#DCEBFD" opacity="0.55" />

            <circle cx="96" cy="72" r="34" fill="#FFFFFF" />
            <circle cx="96" cy="62" r="11.5" fill="#2F6FE4" />
            <path d="M77 93 C78 80, 114 80, 115 93 Z" fill="#2F6FE4" />

            <circle cx="164" cy="80" r="26" fill="#CFE0F7" />
            <circle cx="164" cy="74" r="8.5" fill="#7FA8E0" />
            <path d="M150 96 C151 86, 177 86, 178 96 Z" fill="#7FA8E0" />

            {/* lock badge */}
            <circle cx="228" cy="98" r="34" fill="#FFFFFF" />
            <circle cx="228" cy="98" r="29" fill="#0066FF" />
            <rect x="216" y="95" width="24" height="18" rx="4" fill="#FFFFFF" />
            <path d="M221 95 V90 a7 7 0 0 1 14 0 v5" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" fill="none" />
            <circle cx="228" cy="103" r="2.6" fill="#0066FF" />
          </svg>
        ) : (
          /* three figures + an add badge */
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="mb-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M46 168 C46 112, 88 82, 152 82 C216 82, 258 114, 258 168 Z" fill="url(#mb-blob)" opacity="0.8" />
            <circle cx="96" cy="74" r="36" fill="#FFFFFF" />
            <circle cx="96" cy="64" r="12" fill="#2F6FE4" />
            <path d="M76 96 C77 82, 115 82, 116 96 Z" fill="#2F6FE4" />
            <circle cx="156" cy="84" r="25" fill="#CFE0F7" />
            <circle cx="156" cy="78" r="8.5" fill="#7FA8E0" />
            <path d="M142 100 C143 90, 169 90, 170 100 Z" fill="#7FA8E0" />
            <circle cx="214" cy="70" r="32" fill="#FFFFFF" />
            <circle cx="214" cy="61" r="11" fill="#2F6FE4" />
            <path d="M196 90 C197 78, 231 78, 232 90 Z" fill="#2F6FE4" />
            <circle cx="252" cy="118" r="19" fill="#FFFFFF" />
            <circle cx="252" cy="118" r="15" fill="#0066FF" />
            <path d="M252 111 L252 125 M245 118 L259 118" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </section>
  );

  const metricRow = (
    <section className="org-mb-metrics">
      <MetricCard
        icon={<Users size={20} strokeWidth={2} />}
        label="Total Members"
        value={stats.total}
        delta={deltas.total}
        sub="Across your organisation"
      />
      <MetricCard
        icon={<UserCheck size={20} strokeWidth={2} />}
        label="Active Members"
        value={stats.active}
        delta={deltas.active}
        sub="Currently active"
      />
      <MetricCard
        icon={<Clock size={20} strokeWidth={2} />}
        label="Pending Invites"
        value={stats.pending}
        sub="Awaiting acceptance"
      />
      <MetricCard
        icon={<ShieldCheck size={20} strokeWidth={2} />}
        label="Admins"
        value={stats.admins}
        sub="Organisation admins"
      />
    </section>
  );

  const toolbar = (
    <div className="org-mb-toolbar">
      <div className="org-mb-tabs" role="tablist" aria-label="Member scope">
        {[
          { id: 'all', label: 'All Members' },
          { id: 'admins', label: 'Admins' },
          { id: 'members', label: 'Members' },
          { id: 'pending', label: 'Pending Invites' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`org-mb-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div className="org-mb-search">
          <SearchIcon size={15} className="org-mb-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="org-mb-search-input"
            placeholder="Search members..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search members"
          />
        </div>

        {canManage && (
          <button type="button" className="org-mb-btn-primary inline" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} strokeWidth={2.2} aria-hidden="true" />
            Invite Members
          </button>
        )}
      </div>
    </div>
  );

  const table = (
    <div className="org-mb-card">
      <div className="org-mb-table-wrap">
        <table className="org-mb-table">
          <thead>
            <tr>
              <th style={{ width: 32, paddingLeft: 14 }}>
                <input
                  type="checkbox"
                  className="org-mb-check"
                  checked={allPageChecked}
                  onChange={toggleAll}
                  aria-label="Select all members on this page"
                />
              </th>
              <SortableTh label="Name" k="name" current={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Email" k="email" current={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Role" k="role" current={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Team" k="team" current={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Status" k="status" current={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Joined" k="joined" current={sortKey} dir={sortDir} onSort={onSort} />
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="org-mb-empty">
                    <div className="org-mb-empty-title">
                      {query.trim() ? 'No members match your search.' : 'No members here yet.'}
                    </div>
                    <p className="org-mb-empty-sub">
                      {query.trim()
                        ? 'Try a different name, email or team.'
                        : 'Invite a teammate to get your organisation started.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((p) => {
                const colors = getAvatarColors(p.name || p.email);
                const isSelf = p.userId && p.userId === myUserId;
                const isOwnerRow = p.role === 'owner';
                const canRemoveRow = canManage && p.kind === 'member' && !isSelf && !isOwnerRow;
                const canRevokeRow = canManage && p.kind === 'invite';
                const roleClass = isAdminRole(p.role) ? (p.role === 'owner' ? 'owner' : 'admin') : 'member';
                const statusLabel =
                  p.status === 'active'
                    ? 'Active'
                    : p.status === 'pending'
                    ? 'Pending'
                    : p.status.charAt(0).toUpperCase() + p.status.slice(1);

                return (
                  <tr key={p.key}>
                    <td style={{ paddingLeft: 14 }}>
                      <input
                        type="checkbox"
                        className="org-mb-check"
                        checked={checked.has(p.key)}
                        onChange={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.key)) next.delete(p.key);
                            else next.add(p.key);
                            return next;
                          })
                        }
                        aria-label={`Select ${p.name}`}
                      />
                    </td>

                    <td>
                      <div className="org-mb-name">
                        <span className="org-mb-avatar" style={{ backgroundColor: colors.bg, color: colors.text }}>
                          {getInitials(p.name, p.email)}
                        </span>
                        <span className="org-mb-name-text">
                          <span className="org-mb-name-label" title={p.name}>
                            {p.name}
                          </span>
                          {isSelf && <span className="org-mb-me">Me</span>}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="org-mb-email">{p.email || '—'}</span>
                    </td>

                    <td>
                      <span className={`org-mb-role ${roleClass}`}>
                        {isAdminRole(p.role) ? 'Admin' : 'Member'}
                      </span>
                    </td>

                    <td>
                      <span className="org-mb-team">{p.team}</span>
                    </td>

                    <td>
                      <span className={`org-mb-status ${p.status}`}>
                        <span className="org-mb-status-dot" />
                        {statusLabel}
                      </span>
                    </td>

                    <td>
                      <span className="org-mb-joined">
                        {p.kind === 'invite' && !isSettings
                          ? `Invited ${formatDate(p.createdAt)}`
                          : formatDate(p.createdAt)}
                      </span>
                    </td>

                    <td style={{ position: 'relative' }}>
                      {(canRemoveRow || canRevokeRow) && (
                        <>
                          <button
                            type="button"
                            className="org-mb-kebab"
                            aria-label={`Actions for ${p.name}`}
                            aria-expanded={rowMenuOpen === p.key}
                            onClick={() => setRowMenuOpen(rowMenuOpen === p.key ? null : p.key)}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {rowMenuOpen === p.key && (
                            <div className="org-mb-menu" role="menu">
                              {p.kind === 'member' && canChangeRoles && !isOwnerRow && (
                                <>
                                  <button type="button" className="org-mb-menu-item" onClick={() => handleChangeRole(p, 'admin')}>
                                    <ShieldCheck size={13} aria-hidden="true" />
                                    Make admin
                                  </button>
                                  <button type="button" className="org-mb-menu-item" onClick={() => handleChangeRole(p, 'member')}>
                                    <UserPlus size={13} aria-hidden="true" />
                                    Make member
                                  </button>
                                </>
                              )}
                              {p.kind === 'invite' && (
                                <button type="button" className="org-mb-menu-item danger" onClick={() => handleRevoke(p)}>
                                  <Trash2 size={13} aria-hidden="true" />
                                  Revoke invite
                                </button>
                              )}
                              {canRemoveRow && (
                                <button type="button" className="org-mb-menu-item danger" onClick={() => handleRemove(p)}>
                                  <Trash2 size={13} aria-hidden="true" />
                                  Remove member
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="org-mb-foot">
        <span className="org-mb-foot-info">
          {visible.length === 0
            ? 'No members'
            : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, visible.length)} of ${visible.length} ${visible.length === 1 ? 'member' : 'members'}`}
        </span>

        <div className="org-mb-foot-controls">
          <div className="org-mb-pages">
            <button
              type="button"
              className="org-mb-page"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              &lsaquo;
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter((n) => pageCount <= 5 || n === 1 || n === pageCount || Math.abs(n - safePage) <= 1)
              .map((n, idx, arr) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {idx > 0 && arr[idx - 1] !== n - 1 && (
                    <span style={{ color: '#CBD5E1', fontSize: 12 }}>&hellip;</span>
                  )}
                  <button
                    type="button"
                    className={`org-mb-page ${n === safePage ? 'active' : ''}`}
                    onClick={() => setPage(n)}
                    aria-current={n === safePage ? 'page' : undefined}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <button
              type="button"
              className="org-mb-page"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Next page"
            >
              &rsaquo;
            </button>
          </div>

          <label className="org-mb-perpage">
            {pageSize} per page
            <ChevronDown size={13} style={{ marginLeft: 6, color: '#64748B' }} aria-hidden="true" />
            <select
              className="org-mb-perpage-select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Members per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );

  const rail = (
    <>
      <div className="org-mb-card org-mb-card-pad">
        <div className="org-mb-link-head">
          <span className="org-mb-link-icon">
            <Link2 size={17} strokeWidth={2} />
          </span>
          <span>
            <span className="org-mb-link-title">Invite via link</span>
            <span className="org-mb-link-sub">
              Share this link to invite members to your organisation.
            </span>
          </span>
        </div>

        <div className="org-mb-link-row">
          <span className="org-mb-link-value" title={inviteLink}>
            {inviteLink}
          </span>
          <button type="button" className="org-mb-icon-btn" onClick={copyLink} aria-label="Copy invite link" title="Copy invite link">
            {linkCopied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>

        <div className="org-mb-link-actions">
          <span className="org-mb-select">
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value)} aria-label="Role for invite link">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <ChevronDown size={14} className="org-mb-select-chevron" aria-hidden="true" />
          </span>
          <button type="button" className="org-mb-btn-blue" onClick={copyLink}>
            {linkCopied ? (
              <>
                <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                Copied
              </>
            ) : (
              'Copy Link'
            )}
          </button>
        </div>
      </div>

      <div className="org-mb-card org-mb-card-pad">
        <div className="org-mb-card-head">
          <span className="org-mb-card-title">Role Distribution</span>
          <span className="org-mb-pill">
            Total {stats.admins + stats.members + stats.pending}
          </span>
        </div>

        <div className="org-mb-donut-wrap">
          <Donut segments={roleSplit}>
            <span className="org-mb-donut-value">{stats.admins + stats.members + stats.pending}</span>
            <span className="org-mb-donut-label">Members</span>
          </Donut>
          <div className="org-mb-legend">
            {roleSplit.map((s) => (
              <div key={s.key} className="org-mb-legend-row">
                <span className="org-mb-legend-dot" style={{ backgroundColor: s.color }} />
                <span className="org-mb-legend-name">{s.name}</span>
                <span className="org-mb-legend-value tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="org-mb-card org-mb-card-pad">
        <div className="org-mb-card-title">Access Controls</div>
        <div className="org-mb-card-sub" style={{ marginBottom: 4 }}>
          Manage what members can access and do.
        </div>

        <div className="org-mb-access-list">
          {ACCESS_CONTROLS.map((c) => {
            const Icon = c.icon;
            const value = orgSettings?.[c.key] ?? c.options[0];
            return (
              <div key={c.key} className="org-mb-access-row">
                <span className="org-mb-access-icon">
                  <Icon size={15} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="org-mb-access-text">
                  <span className="org-mb-access-label" title={c.label}>
                    {c.label}
                  </span>
                </span>
                <span className="org-mb-access-control">
                  <select
                    value={value}
                    onChange={(e) => saveAccess(c.key, e.target.value)}
                    disabled={!canManage || savingAccess}
                    aria-label={c.label}
                  >
                    {c.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <ChevronRight size={14} className="org-mb-access-chevron" aria-hidden="true" />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="org-mb-root">
      {hero}
      {metricRow}
      {toolbar}

      {actionError && (
        <div className="org-mb-alert" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="org-mb-split">
        {table}
        <div className="org-mb-rail">{rail}</div>
      </div>

      {inviteOpen && (
        <div className="modal-overlay" onClick={() => setInviteOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Invite Member</h2>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                style={{ color: 'var(--text-secondary)', padding: 2, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {inviteError && (
              <div className="org-mb-alert" style={{ marginBottom: 14 }}>
                <AlertCircle size={14} aria-hidden="true" />
                <span>{inviteError}</span>
              </div>
            )}
            {inviteSuccess && (
              <div className="org-mb-alert ok" style={{ marginBottom: 14 }}>
                <Mail size={14} aria-hidden="true" />
                <span>{inviteSuccess}</span>
              </div>
            )}

            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label className="form-label" htmlFor="mb-invite-email">
                  Email Address
                </label>
                <input
                  id="mb-invite-email"
                  type="email"
                  className="form-input"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="mb-invite-role">
                  Role
                </label>
                <select
                  id="mb-invite-role"
                  className="form-input"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="member">Member — access shared meetings</option>
                  <option value="admin">Admin — manage members and meetings</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={inviteBusy}>
                  {inviteBusy ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function MetricCard({ icon, label, value, delta, sub }) {
  return (
    <div className="org-mb-metric">
      <div className="org-mb-metric-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="org-mb-metric-label">{label}</div>
        <div className="org-mb-metric-value-row">
          <span className="org-mb-metric-value tabular-nums">{value}</span>
          {delta !== undefined && (
            <span className="org-mb-metric-delta">
              <TrendingUp size={12} strokeWidth={2.4} aria-hidden="true" />
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          )}
        </div>
        <div className="org-mb-metric-sub">{sub}</div>
      </div>
    </div>
  );
}

function SortableTh({ label, k, current, dir, onSort }) {
  const active = current === k;
  return (
    <th
      className="sortable"
      onClick={() => onSort(k)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="org-mb-th-inner">
        {label}
        <span className={`org-mb-sort ${active ? 'on' : ''}`} aria-hidden="true">
          <svg width="8" height="11" viewBox="0 0 8 11" fill="none">
            <path d="M4 0.5 L7 4 H1 Z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.45} />
            <path d="M4 10.5 L1 7 H7 Z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.45} />
          </svg>
        </span>
      </span>
    </th>
  );
}

function Donut({ segments, children }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="org-mb-donut">
      <svg viewBox="0 0 124 124" width="124" height="124" role="presentation">
        <circle cx="62" cy="62" r={radius} fill="none" stroke="#EDF2F9" strokeWidth="20" />
        {total > 0 &&
          segments.map((s) => {
            if (s.count <= 0) return null;
            const length = (s.count / total) * circumference;
            const el = (
              <circle
                key={s.key}
                cx="62"
                cy="62"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="20"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 62 62)"
              />
            );
            offset += length;
            return el;
          })}
      </svg>
      <div className="org-mb-donut-center">{children}</div>
    </div>
  );
}
