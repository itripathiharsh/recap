'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Bell,
  Calendar,
  Clock,
  FileText,
  Users,
  Video,
  Play,
  Pause,
  Star,
  MoreHorizontal,
  ChevronDown,
  Download,
  Check,
  CalendarDays,
  Heart,
  User,
  Users2,
  Filter,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';
import TopHeader from '../../components/TopHeader';
import ProcessingProgress from '../../components/ProcessingProgress';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState({});
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'my', 'shared', 'favorites'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', '7d', '30d', '90d'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'completed', 'recording', 'scheduled', 'cancelled'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'oldest', 'duration_desc', 'duration_asc', 'title_asc'
  const [openDropdown, setOpenDropdown] = useState(null); // 'date', 'status', 'sort'

  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview'); // 'overview', 'transcript', 'insights', 'actions', 'participants'
  const [favorites, setFavorites] = useState(new Set());
  const [completedActions, setCompletedActions] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Audio player state
  const audioRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');
  const [audioNotice, setAudioNotice] = useState(null);

  const fetchMeetingsData = async () => {
    try {
      setLoading(true);
      // 1. Fetch meetings
      const { data: meetData, error: meetErr } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: false });

      if (meetErr) throw meetErr;
      const allMeetings = meetData || [];
      setMeetings(allMeetings);

      if (allMeetings.length > 0 && !selectedMeetingId) {
        setSelectedMeetingId(allMeetings[0].id);
      }

      // 2. Fetch MOMs
      const { data: momData } = await supabase.from('mom').select('*');
      const momsMap = {};
      (momData || []).forEach((m) => {
        momsMap[m.meeting_id] = m;
      });
      setMoms(momsMap);

      // 3. Fetch Speaker Turns
      const { data: turnsData } = await supabase
        .from('speaker_turns')
        .select('*')
        .order('start_time', { ascending: true });

      const turnsMap = {};
      (turnsData || []).forEach((t) => {
        if (!turnsMap[t.meeting_id]) {
          turnsMap[t.meeting_id] = [];
        }
        turnsMap[t.meeting_id].push(t);
      });
      setSpeakerTurns(turnsMap);
    } catch (err) {
      console.error('Error fetching meetings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetingsData();

    const channel = supabase
      .channel('realtime_meetings_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchMeetingsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mom' }, () => fetchMeetingsData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.action-pill-dropdown-wrapper')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filter & sort meetings
  const filteredMeetings = useMemo(() => {
    let list = meetings.filter((m) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (m.title || '').toLowerCase().includes(q) ||
        (m.meet_link && m.meet_link.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Filter tab
      if (filterTab === 'favorites') {
        if (!favorites.has(m.id)) return false;
      } else if (filterTab === 'my') {
        const meetSpeakers = speakerTurns[m.id] || [];
        const isHarsh = meetSpeakers.some((s) => (s?.speaker || s || '').toLowerCase().includes('harsh')) ||
          (m.title || '').toLowerCase().includes('test') ||
          (m.title || '').toLowerCase().includes('standup') ||
          (m.title || '').toLowerCase().includes('marketing');
        if (!isHarsh) return false;
      } else if (filterTab === 'shared') {
        const meetSpeakers = speakerTurns[m.id] || [];
        if (meetSpeakers.length <= 1) return false;
      }

      // Date filter
      if (dateFilter !== 'all') {
        const meetDate = new Date(m.scheduled_start || m.started_at || m.created_at);
        const now = new Date();
        const diffDays = (now - meetDate) / (1000 * 60 * 60 * 24);
        if (dateFilter === '7d' && diffDays > 7) return false;
        if (dateFilter === '30d' && diffDays > 30) return false;
        if (dateFilter === '90d' && diffDays > 90) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'recording') {
          if (!['recording', 'processing', 'joining'].includes(m.status)) return false;
        } else if (m.status !== statusFilter) {
          return false;
        }
      }

      return true;
    });

    // Sort order
    return [...list].sort((a, b) => {
      if (sortOrder === 'oldest') {
        return new Date(a.scheduled_start || a.created_at) - new Date(b.scheduled_start || b.created_at);
      } else if (sortOrder === 'duration_desc') {
        return (b.expected_duration_minutes || 30) - (a.expected_duration_minutes || 30);
      } else if (sortOrder === 'duration_asc') {
        return (a.expected_duration_minutes || 30) - (b.expected_duration_minutes || 30);
      } else if (sortOrder === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // default: newest
      return new Date(b.scheduled_start || b.created_at) - new Date(a.scheduled_start || a.created_at);
    });
  }, [meetings, search, filterTab, favorites, dateFilter, statusFilter, sortOrder, speakerTurns]);

  // Selected meeting object
  const currentMeeting = useMemo(() => {
    return meetings.find((m) => m.id === selectedMeetingId) || (meetings.length > 0 ? meetings[0] : null);
  }, [meetings, selectedMeetingId]);

  // Reset audio when selected meeting changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioNotice(null);
  }, [selectedMeetingId]);

  const currentMom = currentMeeting ? moms[currentMeeting.id] : null;
  const currentTurns = currentMeeting ? speakerTurns[currentMeeting.id] || [] : [];

  // Unique speakers for current meeting
  const currentSpeakers = useMemo(() => {
    const set = new Set(currentTurns.map((t) => t.speaker).filter(Boolean));
    return Array.from(set);
  }, [currentTurns]);

  const toggleFavorite = (id, e) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleActionDone = (actionId) => {
    setCompletedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  };

  const togglePlayAudio = () => {
    if (!currentMeeting?.recording_url) {
      setAudioNotice('No audio recording available for this meeting yet.');
      setTimeout(() => setAudioNotice(null), 3500);
      return;
    }
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio playback error:', err);
        setAudioNotice('Could not play audio. Please check network/file.');
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekPct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = seekPct * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cycleSpeed = () => {
    const speeds = ['1x', '1.25x', '1.5x', '2x'];
    const idx = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(idx + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = parseFloat(nextSpeed);
    }
  };

  const formatAudioTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      {/* 1. Interactive Top Bar with Search, Schedule, Notifications & Profile Menu */}
      <TopHeader searchQuery={search} onSearchChange={setSearch} />

      {/* 2. Hero Header with Floating Cards Illustration & Doodle */}
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
            <span>Your Meetings</span>
          </div>
          <h1 className="dashboard-hero-title" style={{ fontSize: '26px' }}>
            All your meetings, <span style={{ color: '#0066FF' }}>in one place.</span>
          </h1>
          <p className="dashboard-hero-subtitle" style={{ fontSize: '13.5px' }}>
            Recordings, transcripts, summaries and action items — automatically.
          </p>
        </div>

        {/* Hand-drawn cyan doodle with curved arrow */}
        <div className="dashboard-hero-doodle" style={{ top: '16px', right: '190px' }}>
          <span className="doodle-hero-text">Find any meeting in seconds.</span>
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

        {/* 3D-like floating cards illustration */}
        <div className="dashboard-hero-art" aria-hidden="true">
          <svg viewBox="0 0 400 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            {/* Soft background glow */}
            <circle cx="300" cy="50" r="45" fill="#E0F2FE" opacity="0.6" />

            {/* Back Card */}
            <rect x="250" y="25" width="90" height="65" rx="8" fill="#FFFFFF" stroke="#D0E4FF" strokeWidth="1.5" transform="rotate(8 250 25)" />
            <circle cx="280" cy="45" r="10" fill="#EFF6FF" transform="rotate(8 250 25)" />

            {/* Front Floating Calendar Card */}
            <rect x="220" y="40" width="105" height="75" rx="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1.8" filter="drop-shadow(0 8px 16px rgba(0,102,255,0.08))" />
            <rect x="232" y="52" width="24" height="24" rx="6" fill="#EFF6FF" />
            <path d="M239 60 H249 M239 64 H246 M241 57 V59 M247 57 V59" stroke="#0066FF" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="264" y="55" width="48" height="6" rx="3" fill="#E2E8F0" />
            <rect x="264" y="66" width="32" height="5" rx="2.5" fill="#F1F5F9" />
            <rect x="232" y="86" width="80" height="16" rx="4" fill="#F8FAFC" />

            {/* Accent badge */}
            <circle cx="330" cy="95" r="14" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1" />
            <path d="M326 95 L329 98 L335 92" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* Live Recording / Processing Progress Banner */}
      {meetings.find(m => ['recording', 'processing', 'joining'].includes(m.status)) && (
        <ProcessingProgress meeting={meetings.find(m => ['recording', 'processing', 'joining'].includes(m.status))} />
      )}

      {/* 3. Controls & Filter Pills Row */}
      <div className="meetings-controls-bar">
        {/* Left Filter Pills */}
        <div className="meetings-filter-pills">
          <button
            type="button"
            className={`filter-pill ${filterTab === 'all' ? 'active' : ''}`}
            onClick={() => setFilterTab('all')}
          >
            <CalendarDays size={14} />
            <span>All Meetings</span>
          </button>

          <button
            type="button"
            className={`filter-pill ${filterTab === 'my' ? 'active' : ''}`}
            onClick={() => setFilterTab('my')}
          >
            <User size={14} />
            <span>My Meetings</span>
          </button>

          <button
            type="button"
            className={`filter-pill ${filterTab === 'shared' ? 'active' : ''}`}
            onClick={() => setFilterTab('shared')}
          >
            <Users2 size={14} />
            <span>Shared with Me</span>
          </button>

          <button
            type="button"
            className={`filter-pill ${filterTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setFilterTab('favorites')}
          >
            <Heart size={14} />
            <span>Favorites</span>
          </button>
        </div>

        {/* Right Action Dropdowns */}
        <div className="meetings-action-pills" style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          {/* Date Filter Dropdown */}
          <div className="action-pill-dropdown-wrapper" style={{ position: 'relative' }}>
            <button
              type="button"
              className="action-pill-dropdown"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'date' ? null : 'date');
              }}
              style={{
                backgroundColor: dateFilter !== 'all' ? '#EFF6FF' : '#FFFFFF',
                borderColor: dateFilter !== 'all' ? '#0066FF' : '#E2E8F0',
                color: dateFilter !== 'all' ? '#0066FF' : '#475569',
              }}
            >
              <Calendar size={13} color={dateFilter !== 'all' ? '#0066FF' : '#64748B'} />
              <span>
                {dateFilter === '7d'
                  ? 'Last 7 days'
                  : dateFilter === '30d'
                  ? 'Last 30 days'
                  : dateFilter === '90d'
                  ? 'Last 90 days'
                  : 'All Time'}
              </span>
              <ChevronDown size={13} color={dateFilter !== 'all' ? '#0066FF' : '#94A3B8'} />
            </button>

            {openDropdown === 'date' && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 50,
                  minWidth: '150px',
                  padding: '4px',
                }}
              >
                {[
                  { id: 'all', label: 'All time' },
                  { id: '7d', label: 'Last 7 days' },
                  { id: '30d', label: 'Last 30 days' },
                  { id: '90d', label: 'Last 90 days' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setDateFilter(opt.id);
                      setOpenDropdown(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      fontSize: '12.5px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: dateFilter === opt.id ? '#EFF6FF' : 'transparent',
                      color: dateFilter === opt.id ? '#0066FF' : '#334155',
                      fontWeight: dateFilter === opt.id ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{opt.label}</span>
                    {dateFilter === opt.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="action-pill-dropdown-wrapper" style={{ position: 'relative' }}>
            <button
              type="button"
              className="action-pill-dropdown"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'status' ? null : 'status');
              }}
              style={{
                backgroundColor: statusFilter !== 'all' ? '#EFF6FF' : '#FFFFFF',
                borderColor: statusFilter !== 'all' ? '#0066FF' : '#E2E8F0',
                color: statusFilter !== 'all' ? '#0066FF' : '#475569',
              }}
            >
              <Filter size={13} color={statusFilter !== 'all' ? '#0066FF' : '#64748B'} />
              <span>
                {statusFilter === 'all'
                  ? 'Filter'
                  : statusFilter === 'completed'
                  ? 'Completed'
                  : statusFilter === 'recording'
                  ? 'In Progress'
                  : statusFilter === 'scheduled'
                  ? 'Scheduled'
                  : 'Cancelled'}
              </span>
              <ChevronDown size={13} color={statusFilter !== 'all' ? '#0066FF' : '#94A3B8'} />
            </button>

            {openDropdown === 'status' && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 50,
                  minWidth: '170px',
                  padding: '4px',
                }}
              >
                {[
                  { id: 'all', label: 'All Statuses' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'recording', label: 'In Progress / Recording' },
                  { id: 'scheduled', label: 'Scheduled' },
                  { id: 'cancelled', label: 'Cancelled' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.id);
                      setOpenDropdown(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      fontSize: '12.5px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: statusFilter === opt.id ? '#EFF6FF' : 'transparent',
                      color: statusFilter === opt.id ? '#0066FF' : '#334155',
                      fontWeight: statusFilter === opt.id ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{opt.label}</span>
                    {statusFilter === opt.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="action-pill-dropdown-wrapper" style={{ position: 'relative' }}>
            <button
              type="button"
              className="action-pill-dropdown"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown(openDropdown === 'sort' ? null : 'sort');
              }}
              style={{
                backgroundColor: sortOrder !== 'newest' ? '#EFF6FF' : '#FFFFFF',
                borderColor: sortOrder !== 'newest' ? '#0066FF' : '#E2E8F0',
                color: sortOrder !== 'newest' ? '#0066FF' : '#475569',
              }}
            >
              <ArrowUpDown size={13} color={sortOrder !== 'newest' ? '#0066FF' : '#64748B'} />
              <span>
                {sortOrder === 'newest'
                  ? 'Sort'
                  : sortOrder === 'oldest'
                  ? 'Oldest First'
                  : sortOrder === 'duration_desc'
                  ? 'Longest'
                  : sortOrder === 'duration_asc'
                  ? 'Shortest'
                  : 'Title (A-Z)'}
              </span>
              <ChevronDown size={13} color={sortOrder !== 'newest' ? '#0066FF' : '#94A3B8'} />
            </button>

            {openDropdown === 'sort' && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  zIndex: 50,
                  minWidth: '160px',
                  padding: '4px',
                }}
              >
                {[
                  { id: 'newest', label: 'Newest First' },
                  { id: 'oldest', label: 'Oldest First' },
                  { id: 'duration_desc', label: 'Longest Duration' },
                  { id: 'duration_asc', label: 'Shortest Duration' },
                  { id: 'title_asc', label: 'Title (A-Z)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSortOrder(opt.id);
                      setOpenDropdown(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      fontSize: '12.5px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: sortOrder === opt.id ? '#EFF6FF' : 'transparent',
                      color: sortOrder === opt.id ? '#0066FF' : '#334155',
                      fontWeight: sortOrder === opt.id ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{opt.label}</span>
                    {sortOrder === opt.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Split View Layout (Left: Table, Right: Selected Meeting Details) */}
      <div className="meetings-split-layout">
        {/* Left Column: Meetings Table */}
        <div className="meetings-list-card">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              Loading meetings from Supabase...
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No meetings found. Click &quot;Schedule Meeting&quot; to add a session.
            </div>
          ) : (
            <table className="meetings-ref-table">
              <thead>
                <tr>
                  <th style={{ width: '36px', textAlign: 'center' }}>
                    <input type="checkbox" style={{ accentColor: '#0066FF' }} readOnly />
                  </th>
                  <th>Meeting</th>
                  <th style={{ width: '130px' }}>Date &amp; Time</th>
                  <th style={{ width: '80px' }}>Duration</th>
                  <th style={{ width: '80px' }}>Platform</th>
                  <th style={{ width: '90px' }}>Participants</th>
                  <th style={{ width: '36px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredMeetings.map((m, idx) => {
                  const isSelected = m.id === selectedMeetingId;
                  const mom = moms[m.id];
                  const snippet = mom?.summary
                    ? mom.summary.slice(0, 48) + '...'
                    : m.status === 'completed'
                    ? 'Summary and transcript ready'
                    : m.status;

                  const dateObj = new Date(m.started_at || m.scheduled_start);
                  const dateStr = dateObj.toLocaleDateString([], {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = dateObj.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={m.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setSelectedMeetingId(m.id)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelectedMeetingId(m.id)}
                          style={{ accentColor: '#0066FF' }}
                        />
                      </td>

                      <td>
                        <div className="meet-row-title-cell">
                          <div className="meet-type-icon">
                            {idx % 3 === 0 ? (
                              <FileText size={16} />
                            ) : idx % 3 === 1 ? (
                              <Users size={16} />
                            ) : (
                              <Calendar size={16} />
                            )}
                          </div>
                          <div>
                            <div className="meet-title-text">{m.title}</div>
                            <div className="meet-snippet-text">{snippet}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="meet-datetime-text tabular-nums">{dateStr}</div>
                        <div className="meet-subtime-text tabular-nums">{timeStr}</div>
                      </td>

                      <td>
                        <span className="meet-duration-text tabular-nums">
                          {m.expected_duration_minutes || (m.actual_duration_seconds ? Math.round(m.actual_duration_seconds / 60) : 30)} min
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Video size={14} color="#00832d" aria-hidden="true" />
                        </div>
                      </td>

                      <td>
                        <div className="upcoming-avatars">
                          {(() => {
                            const meetSpeakers = Array.from(new Set((speakerTurns[m.id] || []).map((t) => t.speaker).filter(Boolean)));
                            if (meetSpeakers.length === 0) {
                              return <div className="upcoming-avatar">H</div>;
                            }
                            return (
                              <>
                                {meetSpeakers.slice(0, 3).map((spk, sIdx) => {
                                  const bgColors = ['#3B82F6', '#10B981', '#8B5CF6'];
                                  return (
                                    <div
                                      key={spk}
                                      className="upcoming-avatar"
                                      style={{ backgroundColor: bgColors[sIdx % bgColors.length] }}
                                      title={spk}
                                    >
                                      {spk[0].toUpperCase()}
                                    </div>
                                  );
                                })}
                                {meetSpeakers.length > 3 && (
                                  <span className="upcoming-avatar-more">+{meetSpeakers.length - 3}</span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(m.id, e)}
                          style={{ color: favorites.has(m.id) ? '#F59E0B' : '#CBD5E1', padding: '4px' }}
                          aria-label="Star meeting"
                        >
                          <Star size={14} fill={favorites.has(m.id) ? '#F59E0B' : 'none'} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Column: Selected Meeting Detail Panel */}
        <div className="meeting-detail-card">
          {currentMeeting ? (
            <div>
              {/* Header */}
              <div className="detail-header">
                <div className="detail-header-left">
                  <div className="detail-platform-icon">
                    <Video size={22} color="#00832d" />
                  </div>
                  <div>
                    <h2 className="detail-title">{currentMeeting.title}</h2>
                    <div className="detail-meta-text tabular-nums">
                      {new Date(currentMeeting.started_at || currentMeeting.scheduled_start).toLocaleDateString([], {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      •{' '}
                      {new Date(currentMeeting.started_at || currentMeeting.scheduled_start).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                <div className="detail-header-actions">
                  <button
                    type="button"
                    className={`detail-icon-btn ${favorites.has(currentMeeting.id) ? 'starred' : ''}`}
                    onClick={(e) => toggleFavorite(currentMeeting.id, e)}
                    aria-label="Favorite"
                  >
                    <Star size={15} fill={favorites.has(currentMeeting.id) ? '#F59E0B' : 'none'} />
                  </button>
                  <Link
                    href={`/meetings/${currentMeeting.id}`}
                    className="detail-icon-btn"
                    title="Open Full Meeting Record"
                  >
                    <ExternalLink size={15} />
                  </Link>
                </div>
              </div>

              {/* Tabs Bar */}
              <div className="detail-tabs-bar">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'transcript', label: 'Transcript' },
                  { id: 'actions', label: 'Action Items' },
                  { id: 'participants', label: 'Participants' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`detail-tab-btn ${selectedTab === tab.id ? 'active' : ''}`}
                    onClick={() => setSelectedTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: OVERVIEW */}
              {selectedTab === 'overview' && (
                <div>
                  {/* Summary & Key Takeaways Grid */}
                  <div className="detail-summary-grid">
                    <div>
                      <div className="detail-section-title">
                        <FileText size={15} color="#0066FF" />
                        <span>Summary</span>
                      </div>
                      <p className="detail-summary-text">
                        {currentMom?.summary || 'No summary available for this meeting yet.'}
                      </p>
                      <button
                        type="button"
                        className="detail-link-blue"
                        onClick={() => setSelectedTab('transcript')}
                      >
                        <span>View Full Transcript &rarr;</span>
                      </button>
                    </div>

                    <div>
                      <div className="detail-section-title">
                        <span>Key Takeaways</span>
                      </div>
                      <ul className="detail-takeaways-list">
                        {Array.isArray(currentMom?.decisions) && currentMom.decisions.length > 0 ? (
                          currentMom.decisions.slice(0, 4).map((d, i) => (
                            <li key={i}>{typeof d === 'string' ? d : d.decision || JSON.stringify(d)}</li>
                          ))
                        ) : (
                          <li style={{ color: '#94A3B8', listStyle: 'none' }}>No key takeaways recorded.</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* 3-Col Meta Grid */}
                  <div className="detail-meta-grid">
                    <div className="detail-meta-item">
                      <div className="detail-meta-icon">
                        <Clock size={16} />
                      </div>
                      <div>
                        <div className="detail-meta-label">Duration</div>
                        <div className="detail-meta-val tabular-nums">
                          {currentMeeting.expected_duration_minutes || (currentMeeting.actual_duration_seconds ? Math.round(currentMeeting.actual_duration_seconds / 60) : 30)} min
                        </div>
                      </div>
                    </div>

                    <div className="detail-meta-item">
                      <div className="detail-meta-icon">
                        <Users size={16} />
                      </div>
                      <div>
                        <div className="detail-meta-label">Participants</div>
                        <div className="detail-meta-val tabular-nums">
                          {currentSpeakers.length}
                        </div>
                      </div>
                    </div>

                    <div className="detail-meta-item">
                      <div className="detail-meta-icon">
                        <Video size={16} color="#00832d" />
                      </div>
                      <div>
                        <div className="detail-meta-label">Platform</div>
                        <div className="detail-meta-val">Google Meet</div>
                      </div>
                    </div>
                  </div>

                  {/* Action Items Section */}
                  <div className="detail-actions-section">
                    <div className="detail-actions-header">
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                        Action Items ({Array.isArray(currentMom?.action_items) ? currentMom.action_items.length : 0})
                      </span>
                      <button
                        type="button"
                        className="card-ref-link"
                        onClick={() => setSelectedTab('actions')}
                        style={{ fontSize: '12px' }}
                      >
                        <span>View All &rarr;</span>
                      </button>
                    </div>

                    <div>
                      {Array.isArray(currentMom?.action_items) && currentMom.action_items.length > 0 ? (
                        currentMom.action_items.slice(0, 3).map((item, idx) => {
                          const actionKey = `${currentMeeting.id}-${idx}`;
                          const isDone = completedActions.has(actionKey);
                          return (
                            <div
                              key={actionKey}
                              className={`detail-action-row ${isDone ? 'done' : ''}`}
                              onClick={() => toggleActionDone(actionKey)}
                            >
                              <div className="detail-action-left">
                                <div className={`focus-checkbox ${isDone ? 'checked' : ''}`}>
                                  {isDone && <Check size={11} strokeWidth={3} />}
                                </div>
                                <span className="detail-action-text">{item.task || item.description}</span>
                              </div>
                              <div className="detail-action-right">
                                <div className="detail-action-assignee">
                                  <div className="detail-action-avatar">
                                    {(item.owner || 'H')[0].toUpperCase()}
                                  </div>
                                  <span>{item.owner || 'Harsh'}</span>
                                </div>
                                <span className="detail-action-due">{item.due || 'not specified'}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', color: '#64748B', fontSize: '12.5px' }}>
                          No action items recorded for this meeting.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recording & Audio Player */}
                  <div className="detail-audio-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                        Recording &amp; Transcript
                      </span>
                      <Link
                        href={`/meetings/${currentMeeting.id}`}
                        className="card-ref-link"
                        style={{ fontSize: '12px' }}
                      >
                        <span>Open Transcript &rarr;</span>
                      </Link>
                    </div>

                    {/* Real HTML5 Audio Element */}
                    {currentMeeting?.recording_url && (
                      <audio
                        ref={audioRef}
                        src={currentMeeting.recording_url}
                        preload="metadata"
                        onTimeUpdate={() => {
                          if (audioRef.current) {
                            setCurrentTime(audioRef.current.currentTime);
                          }
                        }}
                        onLoadedMetadata={() => {
                          if (audioRef.current) {
                            setDuration(audioRef.current.duration);
                          }
                        }}
                        onEnded={() => {
                          setIsPlaying(false);
                          setCurrentTime(0);
                        }}
                      />
                    )}

                    <div className="detail-audio-player" style={{ opacity: currentMeeting?.recording_url ? 1 : 0.65 }}>
                      <button
                        type="button"
                        className="player-play-btn"
                        onClick={togglePlayAudio}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        title={currentMeeting?.recording_url ? (isPlaying ? 'Pause' : 'Play') : 'No audio recording available'}
                        style={{ cursor: currentMeeting?.recording_url ? 'pointer' : 'not-allowed' }}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '1px' }} />}
                      </button>

                      <span className="player-time-display tabular-nums">
                        {formatAudioTime(currentTime)} / {formatAudioTime(duration || (currentMeeting?.expected_duration_minutes ? currentMeeting.expected_duration_minutes * 60 : 0))}
                      </span>

                      <div
                        className="player-track"
                        onClick={handleSeek}
                        style={{ cursor: currentMeeting?.recording_url && duration > 0 ? 'pointer' : 'default' }}
                        title={currentMeeting?.recording_url ? 'Click to seek' : ''}
                      >
                        <div
                          className="player-progress"
                          style={{
                            width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                            transition: isPlaying ? 'none' : 'width 100ms ease',
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="player-speed-btn"
                        onClick={cycleSpeed}
                        title="Playback speed"
                        disabled={!currentMeeting?.recording_url}
                      >
                        {playbackSpeed}
                      </button>

                      {currentMeeting?.recording_url ? (
                        <a
                          href={currentMeeting.recording_url}
                          download={`${currentMeeting.title || 'recording'}.wav`}
                          target="_blank"
                          rel="noreferrer"
                          className="player-download-btn"
                          title="Download Recording (WAV)"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        >
                          <Download size={15} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="player-download-btn"
                          title="No recording file available"
                          disabled
                          style={{ cursor: 'not-allowed', opacity: 0.5 }}
                        >
                          <Download size={15} />
                        </button>
                      )}
                    </div>

                    {audioNotice && (
                      <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>ℹ️ {audioNotice}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TRANSCRIPT */}
              {selectedTab === 'transcript' && (
                <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '6px' }}>
                  {currentTurns.length > 0 ? (
                    currentTurns.map((turn, i) => (
                      <div
                        key={turn.id || i}
                        style={{
                          marginBottom: '12px',
                          padding: '10px 12px',
                          backgroundColor: turn.speaker === 'Harsh Vardhan Tripathi' ? '#EFF6FF' : '#F8FAFC',
                          borderRadius: '8px',
                          border: '1px solid #EDF2F7',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                            {turn.speaker}
                          </span>
                          <span className="tabular-nums" style={{ fontSize: '11px', color: '#94A3B8' }}>
                            {Math.floor(turn.start_time / 60)}:{(turn.start_time % 60).toFixed(0).padStart(2, '0')}
                          </span>
                        </div>
                        <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                          {turn.text}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      No transcripts recorded for this meeting.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ACTION ITEMS */}
              {selectedTab === 'actions' && (
                <div>
                  {Array.isArray(currentMom?.action_items) && currentMom.action_items.length > 0 ? (
                    currentMom.action_items.map((item, idx) => {
                      const actionKey = `${currentMeeting.id}-${idx}`;
                      const isDone = completedActions.has(actionKey);
                      return (
                        <div
                          key={actionKey}
                          className={`detail-action-row ${isDone ? 'done' : ''}`}
                          onClick={() => toggleActionDone(actionKey)}
                        >
                          <div className="detail-action-left">
                            <div className={`focus-checkbox ${isDone ? 'checked' : ''}`}>
                              {isDone && <Check size={11} strokeWidth={3} />}
                            </div>
                            <span className="detail-action-text">{item.task || item.description}</span>
                          </div>
                          <div className="detail-action-right">
                            <div className="detail-action-assignee">
                              <div className="detail-action-avatar">
                                {(item.owner || 'H')[0].toUpperCase()}
                              </div>
                              <span>{item.owner || 'Harsh'}</span>
                            </div>
                            <span className="detail-action-due">{item.due || '21 Sept'}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      No action items found for this meeting.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PARTICIPANTS */}
              {selectedTab === 'participants' && (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {currentSpeakers.length > 0 ? (
                      currentSpeakers.map((speaker, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px',
                            border: '1px solid #EDF2F7',
                            borderRadius: '10px',
                            backgroundColor: '#F8FAFC',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: idx === 0 ? '#3B82F6' : idx === 1 ? '#10B981' : '#8B5CF6',
                                color: '#FFFFFF',
                                fontSize: '12px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {speaker[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                                {speaker}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {idx === 0 ? 'Organizer / Host' : 'Attendee'}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', color: '#0066FF', fontWeight: 600 }}>Active</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                        No participants recorded for this meeting.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              Select a meeting to view its overview and details.
            </div>
          )}
        </div>
      </div>


      {/* Add Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchMeetingsData()}
      />
    </div>
  );
}
