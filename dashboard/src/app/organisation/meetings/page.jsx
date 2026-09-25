'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Video,
  Users,
  Clock,
  FileText,
  Plus,
  ChevronDown,
  MoreHorizontal,
  ExternalLink,
  Search,
  Calendar,
  Shield,
  User,
  X,
  Play,
  Share2,
  Download,
  Check,
  TrendingUp,
  Building2,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, filterToMeetings, useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';
import AddMeetingModal from '../../../components/AddMeetingModal';

const AVATAR_PALETTES = [
  { bg: '#DBEAFE', text: '#1E40AF' }, // blue
  { bg: '#EDE9FE', text: '#6D28D9' }, // purple
  { bg: '#E0F2FE', text: '#0369A1' }, // sky
  { bg: '#FEF3C7', text: '#B45309' }, // amber
  { bg: '#D1FAE5', text: '#047857' }, // emerald
  { bg: '#FCE7F3', text: '#BE185D' }, // pink
];

function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

function getAvatarColors(key) {
  if (!key) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

function formatMeetingDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatDuration(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins === 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function OrganisationMeetingsPage() {
  const router = useRouter();
  const { activeOrgId, activeWorkspace, session } = useWorkspace();

  const [meetings, setMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [moms, setMoms] = useState([]);
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [loading, setLoading] = useState(true);

  // Selected meeting in detail panel
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview'); // overview, transcript, actions, participants

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, completed, scheduled, in-progress
  const [visibilityFilter, setVisibilityFilter] = useState('all'); // all, organisation, participants, private
  const [memberFilter, setMemberFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, 7days, 30days
  const [sortAsc, setSortAsc] = useState(false); // date sort

  // Checkbox multi-select
  const [selectedMeetingIds, setSelectedMeetingIds] = useState(new Set());

  // Modals & Action feedbacks
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const datePickerRef = useRef(null);

  const loadData = async () => {
    if (!activeOrgId) {
      setMeetings([]);
      setMembers([]);
      setMoms([]);
      setSpeakerTurns({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [
        { data: meetingData },
        { data: memberData },
        { data: momData },
        { data: turnData },
      ] = await Promise.all([
        applyWorkspaceScope(supabase.from('meetings').select('*'), activeOrgId).order(
          'scheduled_start',
          { ascending: false }
        ),
        supabase
          .from('organisation_members')
          .select('id, user_id, role, status, email, display_name, created_at')
          .eq('organisation_id', activeOrgId),
        supabase.from('mom').select('meeting_id, action_items, summary, decisions'),
        supabase
          .from('speaker_turns')
          .select('id, meeting_id, speaker, text, start_time, end_time')
          .order('start_time', { ascending: true }),
      ]);

      const scoped = meetingData || [];
      setMeetings(scoped);
      setMembers(memberData || []);

      const scopedIds = new Set(scoped.map((m) => m.id));
      setMoms(filterToMeetings(momData || [], scopedIds));

      const byMeetingTurns = {};
      filterToMeetings(turnData || [], scopedIds).forEach((t) => {
        if (!byMeetingTurns[t.meeting_id]) byMeetingTurns[t.meeting_id] = [];
        byMeetingTurns[t.meeting_id].push(t);
      });
      setSpeakerTurns(byMeetingTurns);

      // Default select first meeting if none selected
      if (scoped.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(scoped[0].id);
      }
    } catch (err) {
      console.error('Organisation meetings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrgId]);

  // Click outside listener for date filter dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setDatePickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Members map by user_id
  const memberById = useMemo(() => {
    const map = new Map();
    members.forEach((m) => {
      map.set(m.user_id, m);
    });
    return map;
  }, [members]);

  // Moms map by meeting_id
  const momByMeetingId = useMemo(() => {
    const map = new Map();
    moms.forEach((m) => {
      map.set(m.meeting_id, m);
    });
    return map;
  }, [moms]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    const activeMembers = members.filter((m) => m.status === 'active').length || members.length;

    let totalMinutes = 0;
    meetings.forEach((m) => {
      if (m.started_at && m.ended_at) {
        const diff = Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000);
        totalMinutes += diff > 0 ? diff : (m.expected_duration_minutes || 0);
      } else if (m.status === 'completed') {
        totalMinutes += m.expected_duration_minutes || 30;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const meetingTimeFormatted = totalMinutes > 0 ? (hours > 0 ? `${hours}h ${mins}m` : `${mins}m`) : '0h 0m';

    const actionItemsCount = moms.reduce(
      (sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0),
      0
    );

    return {
      totalMeetings,
      completedMeetings,
      activeMembers,
      meetingTime: meetingTimeFormatted,
      actionItems: actionItemsCount,
    };
  }, [meetings, members, moms]);

  // Trends calculation
  const trends = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const meetingsThisMonth = meetings.filter((m) => {
      const d = new Date(m.scheduled_start || m.started_at || m.created_at);
      return d >= thirtyDaysAgo && d <= now;
    }).length;

    const meetingsPrevMonth = meetings.filter((m) => {
      const d = new Date(m.scheduled_start || m.started_at || m.created_at);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    }).length;

    let meetingsTrend = '';
    if (meetingsPrevMonth > 0) {
      const pct = Math.round(((meetingsThisMonth - meetingsPrevMonth) / meetingsPrevMonth) * 100);
      meetingsTrend = pct >= 0 ? `+${pct}% from last month` : `${pct}% from last month`;
    } else if (meetingsThisMonth > 0) {
      meetingsTrend = `${meetingsThisMonth} this month`;
    } else {
      meetingsTrend = '0 this month';
    }

    const newMembersThisMonth = members.filter((m) => {
      const d = new Date(m.created_at);
      return d >= thirtyDaysAgo;
    }).length;
    const membersTrend = newMembersThisMonth > 0 ? `+${newMembersThisMonth} new this month` : 'All time active';

    return {
      meetings: meetingsTrend,
      members: membersTrend,
    };
  }, [meetings, members]);

  // Filtered and sorted meetings
  const filteredMeetings = useMemo(() => {
    let result = [...meetings];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          (m.title && m.title.toLowerCase().includes(q)) ||
          (m.meet_link && m.meet_link.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter === 'completed') {
      result = result.filter((m) => m.status === 'completed');
    } else if (statusFilter === 'scheduled') {
      result = result.filter((m) => m.status === 'scheduled');
    } else if (statusFilter === 'in-progress') {
      result = result.filter((m) => ['recording', 'joining', 'processing'].includes(m.status));
    }

    // Visibility filter
    if (visibilityFilter !== 'all') {
      result = result.filter((m) => (m.visibility || 'organisation').toLowerCase() === visibilityFilter.toLowerCase());
    }

    // Member filter
    if (memberFilter !== 'all') {
      result = result.filter((m) => m.owner_id === memberFilter);
    }

    // Date range filter
    if (dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        result = result.filter((m) => (m.scheduled_start || m.started_at || m.created_at || '').startsWith(todayStr));
      } else if (dateFilter === '7days') {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        result = result.filter((m) => new Date(m.scheduled_start || m.started_at || m.created_at) >= cutoff);
      } else if (dateFilter === '30days') {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        result = result.filter((m) => new Date(m.scheduled_start || m.started_at || m.created_at) >= cutoff);
      }
    }

    // Sorting
    result.sort((a, b) => {
      const dateA = new Date(a.scheduled_start || a.started_at || a.created_at).getTime();
      const dateB = new Date(b.scheduled_start || b.started_at || b.created_at).getTime();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [meetings, searchQuery, statusFilter, visibilityFilter, memberFilter, dateFilter, sortAsc]);

  // Selected meeting object
  const selectedMeeting = useMemo(() => {
    if (!selectedMeetingId) return null;
    return meetings.find((m) => m.id === selectedMeetingId) || null;
  }, [meetings, selectedMeetingId]);

  // Turns and MOM for selected meeting
  const selectedTurns = useMemo(() => {
    if (!selectedMeetingId) return [];
    return speakerTurns[selectedMeetingId] || [];
  }, [speakerTurns, selectedMeetingId]);

  const selectedMom = useMemo(() => {
    if (!selectedMeetingId) return null;
    return momByMeetingId.get(selectedMeetingId) || null;
  }, [momByMeetingId, selectedMeetingId]);

  // Distinct speakers of selected meeting
  const selectedSpeakers = useMemo(() => {
    const list = [];
    const seen = new Set();
    selectedTurns.forEach((t) => {
      if (t.speaker && !seen.has(t.speaker)) {
        seen.add(t.speaker);
        list.push(t.speaker);
      }
    });
    return list;
  }, [selectedTurns]);

  // Checkbox handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedMeetingIds(new Set(filteredMeetings.map((m) => m.id)));
    } else {
      setSelectedMeetingIds(new Set());
    }
  };

  const handleToggleSelectOne = (id, e) => {
    e.stopPropagation();
    setSelectedMeetingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Quick action: share meeting
  const handleShareMeeting = (meet) => {
    if (!meet) return;
    const shareUrl = `${window.location.origin}/meetings/${meet.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Quick action: download transcript
  const handleDownloadTranscript = (meet) => {
    if (!meet) return;
    const turns = speakerTurns[meet.id] || [];
    let text = `Meeting: ${meet.title}\nDate: ${new Date(meet.scheduled_start || meet.created_at).toLocaleString()}\n\n`;
    if (turns.length === 0) {
      text += 'No transcript turns recorded.';
    } else {
      turns.forEach((t) => {
        text += `[${t.speaker || 'Unknown'}]: ${t.text}\n`;
      });
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${meet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <TopHeader
        placeholder="Search meetings, transcripts, or insights..."
        showScheduleButton={false}
      />

      <OrganisationPage
        breadcrumb={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#64748B' }}>Organisation</span>
            <span style={{ color: '#94A3B8' }}>&rsaquo;</span>
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Meetings</span>
          </div>
        }
        title="Organisation Meetings"
        subtitle="Manage and view all meetings in your organisation workspace."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              backgroundColor: '#0066FF',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            <span>Add Meeting</span>
            <ChevronDown size={14} style={{ marginLeft: '2px' }} />
          </button>
        }
      >
        {/* =================================================================== */}
        {/* 1. TOP METRICS ROW (4 Cards)                                         */}
        {/* =================================================================== */}
        <section className="org-metrics-grid">
          {/* Card 1: Total Meetings */}
          <div className="org-metric-card">
            <div className="org-metric-top">
              <div className="org-metric-icon blue">
                <Video size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="org-metric-val">{metrics.totalMeetings}</div>
                <div className="org-metric-lbl">Total Meetings</div>
              </div>
            </div>
            <div className="org-metric-trend">
              <TrendingUp size={14} aria-hidden="true" />
              <span>{trends.meetings}</span>
            </div>
          </div>

          {/* Card 2: Total Meeting Time */}
          <div className="org-metric-card">
            <div className="org-metric-top">
              <div className="org-metric-icon purple">
                <Clock size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="org-metric-val">{metrics.meetingTime}</div>
                <div className="org-metric-lbl">Total Meeting Time</div>
              </div>
            </div>
            <div className="org-metric-trend">
              <TrendingUp size={14} aria-hidden="true" />
              <span>{metrics.completedMeetings} completed</span>
            </div>
          </div>

          {/* Card 3: Team Members */}
          <div className="org-metric-card">
            <div className="org-metric-top">
              <div className="org-metric-icon green">
                <Users size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="org-metric-val">{metrics.activeMembers}</div>
                <div className="org-metric-lbl">Team Members</div>
              </div>
            </div>
            <div className="org-metric-trend">
              <TrendingUp size={14} aria-hidden="true" />
              <span>{trends.members}</span>
            </div>
          </div>

          {/* Card 4: Action Items */}
          <div className="org-metric-card">
            <div className="org-metric-top">
              <div className="org-metric-icon orange">
                <FileText size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <div className="org-metric-val">{metrics.actionItems}</div>
                <div className="org-metric-lbl">Action Items</div>
              </div>
            </div>
            <div className="org-metric-trend">
              <TrendingUp size={14} aria-hidden="true" />
              <span>From meeting MOMs</span>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 2. FILTER & CONTROLS BAR                                             */}
        {/* =================================================================== */}
        <div className="org-meetings-filter-bar">
          {/* Search box */}
          <div className="org-filter-search-wrap">
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              placeholder="Search meetings..."
              className="org-filter-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Dropdown */}
          <div className="org-filter-select-wrap">
            <select
              className="org-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Meetings</option>
              <option value="completed">Completed</option>
              <option value="scheduled">Scheduled</option>
              <option value="in-progress">In Progress</option>
            </select>
            <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }} />
          </div>

          {/* Visibility Dropdown */}
          <div className="org-filter-select-wrap">
            <select
              className="org-filter-select"
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
            >
              <option value="all">All Visibility</option>
              <option value="organisation">Organisation</option>
              <option value="participants">Participants</option>
              <option value="private">Private</option>
            </select>
            <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }} />
          </div>

          {/* Members Dropdown */}
          <div className="org-filter-select-wrap">
            <select
              className="org-filter-select"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
            >
              <option value="all">All Members</option>
              {members.map((m) => (
                <option key={m.user_id || m.email} value={m.user_id}>
                  {m.display_name || m.email || 'Member'}
                </option>
              ))}
            </select>
            <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }} />
          </div>

          {/* Date Range Picker */}
          <div style={{ position: 'relative' }} ref={datePickerRef}>
            <button
              type="button"
              className="org-filter-date-btn"
              onClick={() => setDatePickerOpen(!datePickerOpen)}
            >
              <Calendar size={14} color="#64748B" />
              <span>
                {dateFilter === 'all'
                  ? 'Select date range'
                  : dateFilter === 'today'
                  ? 'Today'
                  : dateFilter === '7days'
                  ? 'Last 7 days'
                  : 'Last 30 days'}
              </span>
            </button>

            {datePickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '180px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  zIndex: 40,
                  padding: '6px',
                }}
              >
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: '7days', label: 'Last 7 Days' },
                  { id: '30days', label: 'Last 30 Days' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      textAlign: 'left',
                      background: dateFilter === item.id ? '#EFF6FF' : 'none',
                      color: dateFilter === item.id ? '#0066FF' : '#334155',
                      fontWeight: dateFilter === item.id ? 600 : 400,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setDateFilter(item.id);
                      setDatePickerOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. MAIN SPLIT VIEW: Table (Left) + Detail Panel (Right)              */}
        {/* =================================================================== */}
        <div className="org-meetings-layout">
          {/* LEFT: Meetings Table */}
          <div className="org-panel-card" style={{ padding: '0 0 16px 0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="org-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', paddingLeft: '16px' }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredMeetings.length > 0 &&
                          selectedMeetingIds.size === filteredMeetings.length
                        }
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer' }}
                        aria-label="Select all meetings"
                      />
                    </th>
                    <th>Title</th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setSortAsc(!sortAsc)}
                      title="Click to sort by date"
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>Date</span>
                        <span style={{ fontSize: '11px' }}>{sortAsc ? '↑' : '↓'}</span>
                      </div>
                    </th>
                    <th>Participants</th>
                    <th>Duration</th>
                    <th>Visibility</th>
                    <th>Owner</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeetings.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>
                        No organisation meetings found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredMeetings.map((m) => {
                      const isSelected = selectedMeetingId === m.id;
                      const isChecked = selectedMeetingIds.has(m.id);
                      const meetTurns = speakerTurns[m.id] || [];
                      const distinctSpeakers = Array.from(new Set(meetTurns.map((t) => t.speaker).filter(Boolean)));

                      // Duration
                      const durationMins =
                        m.expected_duration_minutes ||
                        (m.ended_at && m.started_at
                          ? Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000)
                          : 30);
                      const durationStr = formatDuration(durationMins);

                      // Visibility badge class
                      const visClass = (m.visibility || 'organisation').toLowerCase();

                      // Owner info
                      const owner = memberById.get(m.owner_id);
                      const ownerName = owner?.display_name || (m.owner_id ? 'Member' : 'Harsh Vardhan');
                      const ownerInitials = getInitials(ownerName, owner?.email);
                      const ownerColors = getAvatarColors(ownerName);

                      return (
                        <tr
                          key={m.id}
                          className={`org-table-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedMeetingId(m.id)}
                        >
                          {/* Checkbox */}
                          <td style={{ textAlign: 'center', paddingLeft: '16px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleToggleSelectOne(m.id, e)}
                              style={{ cursor: 'pointer' }}
                              aria-label={`Select ${m.title}`}
                            />
                          </td>

                          {/* Title + Platform Icon */}
                          <td>
                            <div className="org-meeting-title-cell">
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  backgroundColor: '#EFF6FF',
                                  color: '#0066FF',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <Video size={15} />
                              </div>
                              <span
                                style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '180px',
                                }}
                                title={m.title}
                              >
                                {m.title || 'Untitled Meeting'}
                              </span>
                            </div>
                          </td>

                          {/* Date */}
                          <td style={{ whiteSpace: 'nowrap' }} className="tabular-nums">
                            {formatMeetingDate(m.scheduled_start || m.started_at || m.created_at)}
                          </td>

                          {/* Participants Avatar Stack */}
                          <td>
                            {distinctSpeakers.length === 0 ? (
                              <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>
                            ) : (
                              <div className="org-avatar-stack">
                                {distinctSpeakers.slice(0, 3).map((speaker, sIdx) => {
                                  const colors = AVATAR_PALETTES[sIdx % AVATAR_PALETTES.length];
                                  return (
                                    <div
                                      key={speaker + sIdx}
                                      className="org-avatar-stack-item"
                                      style={{ backgroundColor: colors.text }}
                                      title={speaker}
                                    >
                                      {speaker[0]?.toUpperCase() || 'U'}
                                    </div>
                                  );
                                })}
                                {distinctSpeakers.length > 3 && (
                                  <div className="org-avatar-stack-more">
                                    +{distinctSpeakers.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Duration */}
                          <td className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                            {durationStr}
                          </td>

                          {/* Visibility */}
                          <td>
                            <span className={`org-vis-badge ${visClass}`}>
                              {m.visibility || 'Organisation'}
                            </span>
                          </td>

                          {/* Owner */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                              <div
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  backgroundColor: ownerColors.bg,
                                  color: ownerColors.text,
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {ownerInitials}
                              </div>
                              <span style={{ fontSize: '12.5px', color: '#334155' }}>
                                {ownerName.split(' ')[0]}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                type="button"
                                className="org-btn-view"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMeetingId(m.id);
                                }}
                              >
                                View
                              </button>
                              <Link
                                href={`/meetings/${m.id}`}
                                className="action-pill-btn"
                                style={{
                                  color: '#94A3B8',
                                  padding: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  textDecoration: 'none',
                                }}
                                title="Open full record"
                                aria-label="Open full record"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={14} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="org-pagination-wrap" style={{ padding: '16px 20px 0' }}>
              <div>
                Showing 1–{filteredMeetings.length} of {meetings.length} meetings
              </div>
              <div className="org-pagination-controls">
                <button type="button" className="org-page-btn" disabled aria-label="Previous page">
                  &lt;
                </button>
                <button type="button" className="org-page-btn active">
                  1
                </button>
                <button type="button" className="org-page-btn" disabled aria-label="Next page">
                  &gt;
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Selected Meeting Detail Panel & Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {selectedMeeting ? (
              <div className="org-meet-detail-card">
                {/* Header */}
                <div className="org-meet-detail-header">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: '#EFF6FF',
                        color: '#0066FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Video size={18} />
                    </div>
                    <div>
                      <div className="org-meet-detail-title">{selectedMeeting.title}</div>
                      <div className="org-meet-detail-meta tabular-nums">
                        {formatMeetingDate(selectedMeeting.scheduled_start || selectedMeeting.started_at)} (
                        {formatDuration(selectedMeeting.expected_duration_minutes || 30)})
                      </div>
                      <div className="org-meet-detail-tag">Organisation meeting</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedMeetingId(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                    aria-label="Close detail panel"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Tabs */}
                <div className="org-meet-tabs">
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'transcript', label: 'Transcript' },
                    { id: 'actions', label: 'Action Items' },
                    { id: 'participants', label: 'Participants' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`org-meet-tab-btn ${selectedTab === tab.id ? 'active' : ''}`}
                      onClick={() => setSelectedTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* TAB 1: OVERVIEW */}
                {selectedTab === 'overview' && (
                  <div className="org-meet-info-section">
                    {/* Date & Time */}
                    <div className="org-meet-info-row">
                      <div className="org-meet-info-icon-wrap">
                        <Calendar size={16} />
                      </div>
                      <div>
                        <div className="org-meet-info-label">Date &amp; Time</div>
                        <div className="org-meet-info-val tabular-nums">
                          {new Date(
                            selectedMeeting.started_at || selectedMeeting.scheduled_start || selectedMeeting.created_at
                          ).toLocaleString('en-US', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Duration */}
                    <div className="org-meet-info-row">
                      <div className="org-meet-info-icon-wrap">
                        <Clock size={16} />
                      </div>
                      <div>
                        <div className="org-meet-info-label">Duration</div>
                        <div className="org-meet-info-val tabular-nums">
                          {selectedMeeting.expected_duration_minutes || 30} minutes
                        </div>
                      </div>
                    </div>

                    {/* Participants */}
                    <div className="org-meet-info-row">
                      <div className="org-meet-info-icon-wrap">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="org-meet-info-label">Participants</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          {selectedSpeakers.length === 0 ? (
                            <span style={{ fontSize: '13px', color: '#94A3B8' }}>No recorded speakers</span>
                          ) : (
                            <>
                              <div className="org-avatar-stack">
                                {selectedSpeakers.slice(0, 4).map((speaker, sIdx) => {
                                  const colors = AVATAR_PALETTES[sIdx % AVATAR_PALETTES.length];
                                  return (
                                    <div
                                      key={speaker + sIdx}
                                      className="org-avatar-stack-item"
                                      style={{ backgroundColor: colors.text }}
                                      title={speaker}
                                    >
                                      {speaker[0]?.toUpperCase() || 'U'}
                                    </div>
                                  );
                                })}
                                {selectedSpeakers.length > 4 && (
                                  <div className="org-avatar-stack-more">
                                    +{selectedSpeakers.length - 4}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#0066FF',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                onClick={() => setSelectedTab('participants')}
                              >
                                View all ({selectedSpeakers.length})
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Visibility */}
                    <div className="org-meet-info-row">
                      <div className="org-meet-info-icon-wrap">
                        <Shield size={16} />
                      </div>
                      <div>
                        <div className="org-meet-info-label">Visibility</div>
                        <div style={{ marginTop: '2px' }}>
                          <span
                            className={`org-vis-badge ${(selectedMeeting.visibility || 'organisation').toLowerCase()}`}
                          >
                            {selectedMeeting.visibility || 'Organisation'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          Visible to organisation members
                        </div>
                      </div>
                    </div>

                    {/* Owner */}
                    <div className="org-meet-info-row">
                      <div className="org-meet-info-icon-wrap">
                        <User size={16} />
                      </div>
                      <div>
                        <div className="org-meet-info-label">Owner</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              backgroundColor: '#DBEAFE',
                              color: '#1E40AF',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {getInitials(
                              memberById.get(selectedMeeting.owner_id)?.display_name || 'Harsh Vardhan'
                            )}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                            {memberById.get(selectedMeeting.owner_id)?.display_name ||
                              (selectedMeeting.owner_id ? 'Member' : 'Harsh Vardhan')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: TRANSCRIPT */}
                {selectedTab === 'transcript' && (
                  <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedTurns.length === 0 ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                        No transcript recorded for this session.
                      </div>
                    ) : (
                      selectedTurns.map((turn, tIdx) => (
                        <div
                          key={turn.id || tIdx}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #F1F5F9',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontWeight: 600, color: '#0066FF' }}>{turn.speaker || 'Speaker'}</span>
                            <span style={{ fontSize: '11px', color: '#94A3B8' }} className="tabular-nums">
                              {turn.start_time !== undefined ? `${Math.floor(turn.start_time / 60)}:${String(Math.floor(turn.start_time % 60)).padStart(2, '0')}` : ''}
                            </span>
                          </div>
                          <div style={{ color: '#334155', lineHeight: 1.4 }}>{turn.text}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 3: ACTION ITEMS */}
                {selectedTab === 'actions' && (
                  <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {(!selectedMom || !Array.isArray(selectedMom.action_items) || selectedMom.action_items.length === 0) ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                        No action items extracted for this meeting.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedMom.action_items.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              fontSize: '12.5px',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                            }}
                          >
                            <span style={{ color: '#0066FF', marginTop: '2px' }}>&bull;</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#0F172A', fontWeight: 500 }}>{item.task || item.description || JSON.stringify(item)}</div>
                              {item.owner && (
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                  Assigned to: {item.owner} {item.due && `• Due: ${item.due}`}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PARTICIPANTS */}
                {selectedTab === 'participants' && (
                  <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {selectedSpeakers.length === 0 ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                        No participants registered.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedSpeakers.map((spk, idx) => {
                          const colors = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                          return (
                            <div
                              key={spk + idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#F8FAFC',
                              }}
                            >
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: colors.bg,
                                  color: colors.text,
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {spk[0]?.toUpperCase() || 'U'}
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{spk}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="org-meet-detail-card" style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                Select a meeting from the list to preview details.
              </div>
            )}

            {/* Quick Actions Card */}
            {selectedMeeting && (
              <div className="org-panel-card" style={{ padding: '18px 20px' }}>
                <div className="org-panel-title" style={{ marginBottom: '12px' }}>
                  Quick Actions
                </div>

                <Link
                  href={`/meetings/${selectedMeeting.id}`}
                  className="org-meet-btn-primary"
                >
                  <span>Open Meeting</span>
                </Link>

                <div className="org-meet-quick-grid">
                  {/* Download Transcript */}
                  <button
                    type="button"
                    className="org-meet-quick-btn"
                    onClick={() => handleDownloadTranscript(selectedMeeting)}
                  >
                    <Download size={14} color="#0066FF" />
                    <span>Download Transcript</span>
                  </button>

                  {/* View Recording */}
                  <Link
                    href={`/meetings/${selectedMeeting.id}`}
                    className="org-meet-quick-btn"
                    style={{ textDecoration: 'none' }}
                  >
                    <Play size={14} color="#0066FF" />
                    <span>View Recording</span>
                  </Link>

                  {/* Share Meeting */}
                  <button
                    type="button"
                    className="org-meet-quick-btn"
                    onClick={() => handleShareMeeting(selectedMeeting)}
                  >
                    {copiedLink ? <Check size={14} color="#16A34A" /> : <Share2 size={14} color="#0066FF" />}
                    <span>{copiedLink ? 'Copied Link!' : 'Share Meeting'}</span>
                  </button>

                  {/* More Actions */}
                  <Link
                    href={`/meetings/${selectedMeeting.id}`}
                    className="org-meet-quick-btn"
                    style={{ textDecoration: 'none' }}
                  >
                    <MoreHorizontal size={14} color="#64748B" />
                    <span>More Actions</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </OrganisationPage>

      {/* Add Meeting Modal */}
      {isModalOpen && (
        <AddMeetingModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onMeetingAdded={() => {
            setIsModalOpen(false);
            loadData();
          }}
        />
      )}
    </>
  );
}
