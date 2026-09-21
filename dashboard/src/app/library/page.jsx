'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Bell,
  FileText,
  Play,
  Sparkles,
  CheckSquare,
  Users,
  Database,
  Filter,
  Tag,
  ChevronDown,
  MoreHorizontal,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AddMeetingModal from '../../components/AddMeetingModal';
import TopHeader from '../../components/TopHeader';

export default function LibraryPage() {
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [transcriptsCount, setTranscriptsCount] = useState(2);
  const [speakerTurns, setSpeakerTurns] = useState({});
  const [diskUsage, setDiskUsage] = useState({ used: '0.2', total: '25.0', pct: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'recordings', 'transcripts', 'summaries', 'actions'
  const [selectedTag, setSelectedTag] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const { data: meetData } = await supabase
          .from('meetings')
          .select('*')
          .order('scheduled_start', { ascending: false });

        const { data: momData } = await supabase.from('mom').select('*');
        const { count: transCount } = await supabase
          .from('transcripts')
          .select('*', { count: 'exact', head: true });

        const { data: turnsData } = await supabase
          .from('speaker_turns')
          .select('meeting_id, speaker');

        const turnsMap = {};
        (turnsData || []).forEach((t) => {
          if (!turnsMap[t.meeting_id]) turnsMap[t.meeting_id] = [];
          turnsMap[t.meeting_id].push(t.speaker);
        });

        setMeetings(meetData || []);
        setMoms(momData || []);
        if (transCount !== null && transCount !== undefined) {
          setTranscriptsCount(transCount);
        }
        setSpeakerTurns(turnsMap);

        // Fetch real disk usage from backend API if available
        try {
          const res = await fetch('http://localhost:8000/api/system/status');
          if (res.ok) {
            const data = await res.json();
            if (data.disk_usage) {
              setDiskUsage({
                used: data.disk_usage.used_gb.toString(),
                total: data.disk_usage.total_gb.toString(),
                pct: Math.round(data.disk_usage.percent_used),
              });
            }
          }
        } catch {
          // Keep lightweight local fallback
        }
      } catch (err) {
        console.error('Error loading library data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Map meeting id to MOM
  const momMap = useMemo(() => {
    const map = {};
    moms.forEach((m) => {
      map[m.meeting_id] = m;
    });
    return map;
  }, [moms]);

  // Real completed meetings count
  const completedCount = useMemo(() => {
    return meetings.filter((m) => m.status === 'completed').length;
  }, [meetings]);

  // Total action items
  const totalActionsCount = useMemo(() => {
    return moms.reduce((sum, m) => sum + (Array.isArray(m.action_items) ? m.action_items.length : 0), 0);
  }, [moms]);

  // Distinct speakers across all meetings
  const uniqueSpeakersCount = useMemo(() => {
    const set = new Set();
    Object.values(speakerTurns).forEach((arr) => {
      arr.forEach((s) => set.add(s));
    });
    return set.size || 3;
  }, [speakerTurns]);

  // Derived real tags from actual meeting titles
  const popularTags = useMemo(() => {
    const tagMap = {};
    meetings.forEach((m) => {
      const title = (m.title || '').toLowerCase();
      if (title.includes('marketing')) tagMap['Marketing'] = (tagMap['Marketing'] || 0) + 1;
      if (title.includes('standup') || title.includes('sync')) tagMap['Team Sync'] = (tagMap['Team Sync'] || 0) + 1;
      if (title.includes('api')) tagMap['API'] = (tagMap['API'] || 0) + 1;
      if (title.includes('test')) tagMap['Testing'] = (tagMap['Testing'] || 0) + 1;
      if (title.includes('cancel')) tagMap['Cancelled'] = (tagMap['Cancelled'] || 0) + 1;
    });
    return Object.entries(tagMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [meetings]);

  const getTagsForMeeting = (title) => {
    const tLower = (title || '').toLowerCase();
    const tags = [];
    if (tLower.includes('marketing')) tags.push({ name: 'Marketing', cls: 'tag-pink' });
    if (tLower.includes('standup') || tLower.includes('sync')) tags.push({ name: 'Team Sync', cls: 'tag-purple' });
    if (tLower.includes('api')) tags.push({ name: 'API', cls: 'tag-blue' });
    if (tLower.includes('test')) tags.push({ name: 'Testing', cls: 'tag-cyan' });
    if (tLower.includes('cancel')) tags.push({ name: 'Cancelled', cls: 'tag-gray' });
    if (tags.length === 0) tags.push({ name: 'General', cls: 'tag-blue' });
    return tags;
  };

  // Filter items
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const qLower = search.toLowerCase();
      const mom = momMap[m.id];
      const matchesSearch =
        m.title.toLowerCase().includes(qLower) ||
        (mom?.summary && mom.summary.toLowerCase().includes(qLower));

      if (!matchesSearch) return false;

      if (selectedTag) {
        const tags = getTagsForMeeting(m.title).map((t) => t.name.toLowerCase());
        if (!tags.includes(selectedTag.toLowerCase())) return false;
      }

      if (filterTab === 'recordings') return m.status === 'completed';
      if (filterTab === 'summaries') return Boolean(mom?.summary);
      if (filterTab === 'transcripts') return m.status === 'completed';
      if (filterTab === 'actions') return Boolean(mom?.action_items && mom.action_items.length > 0);
      return true;
    });
  }, [meetings, search, filterTab, selectedTag, momMap]);

  return (
    <div>
      {/* 1. Interactive Top Bar with Search, Schedule, Notifications & Profile Menu */}
      <TopHeader searchQuery={search} onSearchChange={setSearch} />

      {/* 2. Hero Header with Floating Knowledge Artwork & Doodle */}
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
            <span>Your Knowledge Library</span>
          </div>
          <h1 className="dashboard-hero-title" style={{ fontSize: '26px' }}>
            All your meeting knowledge, <span style={{ color: '#0066FF' }}>in one place.</span>
          </h1>
          <p className="dashboard-hero-subtitle" style={{ fontSize: '13.5px' }}>
            Recordings, transcripts, summaries, action items and more — searchable and organized.
          </p>
        </div>

        {/* Hand-drawn cyan doodle with curved arrow */}
        <div className="dashboard-hero-doodle" style={{ top: '16px', right: '220px' }}>
          <span className="doodle-hero-text">Find insights from your past conversations.</span>
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

        {/* 3D floating folder and documents illustration */}
        <div className="dashboard-hero-art" aria-hidden="true" style={{ width: '340px' }}>
          <svg viewBox="0 0 340 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <circle cx="230" cy="60" r="55" fill="#E0F2FE" opacity="0.6" />
            {/* Back folder */}
            <rect x="140" y="45" width="120" height="75" rx="10" fill="#93C5FD" opacity="0.5" transform="rotate(-6 140 45)" />
            {/* Front folder */}
            <rect x="155" y="40" width="125" height="80" rx="10" fill="#FFFFFF" stroke="#0066FF" strokeWidth="1.8" filter="drop-shadow(0 10px 20px rgba(0,102,255,0.08))" />
            <path d="M155 52 C155 46 160 40 166 40 L195 40 L205 50 L270 50 C276 50 280 54 280 60 L280 110 C280 116 276 120 270 120 L166 120 C160 120 155 116 155 110 Z" fill="#EFF6FF" stroke="#0066FF" strokeWidth="1.5" />
            {/* Floating check pill */}
            <rect x="245" y="70" width="28" height="28" rx="8" fill="#0066FF" />
            <path d="M253 84 L257 88 L265 80" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* 3. Top Metrics Row (6 Cards) */}
      <section className="library-metrics-row">
        {/* All Files */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px' }}>
            <FileText size={18} />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>All Files</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{meetings.length}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Total items</div>
          </div>
        </div>

        {/* Recordings */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px', backgroundColor: '#EFF6FF' }}>
            <Play size={18} fill="#0066FF" stroke="none" />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>Recordings</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{completedCount}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Audio &amp; video</div>
          </div>
        </div>

        {/* Transcripts */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px' }}>
            <FileText size={18} />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>Transcripts</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{transcriptsCount}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Full transcripts</div>
          </div>
        </div>

        {/* Summaries */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px', color: '#7C3AED', backgroundColor: '#F5F3FF' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>Summaries</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{moms.length}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>AI summaries</div>
          </div>
        </div>

        {/* Action Items */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px', color: '#16A34A', backgroundColor: '#F0FDF4' }}>
            <CheckSquare size={18} />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>Action Items</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{totalActionsCount}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Tasks extracted</div>
          </div>
        </div>

        {/* Shared */}
        <div className="library-metric-box">
          <div className="metric-icon-box" style={{ width: '38px', height: '38px', color: '#0284C7', backgroundColor: '#F0F9FF' }}>
            <Users size={18} />
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '11.5px' }}>Shared</div>
            <div className="metric-value tabular-nums" style={{ fontSize: '20px' }}>{uniqueSpeakersCount}</div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Collaborators</div>
          </div>
        </div>
      </section>

      {/* 4. Main Split View Layout */}
      <div className="meetings-split-layout" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        {/* Left Column: Knowledge Items Table */}
        <div className="meetings-list-card" style={{ padding: '20px' }}>
          {/* Controls bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            {/* Filter tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All Items' },
                { id: 'recordings', label: 'Recordings' },
                { id: 'transcripts', label: 'Transcripts' },
                { id: 'summaries', label: 'Summaries' },
                { id: 'actions', label: 'Action Items' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`filter-pill ${filterTab === tab.id ? 'active' : ''}`}
                  onClick={() => setFilterTab(tab.id)}
                  style={{ fontSize: '12px', padding: '5px 12px' }}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* View toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '2px' }}>
                <button type="button" style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', color: '#0066FF' }}>
                  <LayoutList size={14} />
                </button>
                <button type="button" style={{ padding: '4px 8px', borderRadius: '6px', color: '#64748B' }}>
                  <LayoutGrid size={14} />
                </button>
              </div>

              <button type="button" className="action-pill-dropdown" style={{ padding: '5px 10px', fontSize: '11.5px' }}>
                <span>Newest First</span>
                <ChevronDown size={12} color="#94A3B8" />
              </button>
            </div>
          </div>

          {/* Items Table */}
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              Loading knowledge library...
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No items match your filter criteria.
            </div>
          ) : (
            <table className="meetings-ref-table">
              <tbody>
                {filteredMeetings.map((m, idx) => {
                  const tags = getTagsForMeeting(m.title);
                  const dateStr = new Date(m.started_at || m.scheduled_start).toLocaleDateString([], {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = new Date(m.started_at || m.scheduled_start).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={m.id}>
                      <td style={{ width: '32px', textAlign: 'center' }}>
                        <input type="checkbox" style={{ accentColor: '#0066FF' }} />
                      </td>

                      <td style={{ width: '40px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#EFF6FF',
                            color: '#0066FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {idx % 3 === 0 ? <Play size={13} fill="#0066FF" stroke="none" /> : idx % 3 === 1 ? <FileText size={15} /> : <Sparkles size={15} />}
                        </div>
                      </td>

                      <td>
                        <Link href={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0F172A' }}>
                            {m.title}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }} className="tabular-nums">
                            {dateStr} • {timeStr} • {m.expected_duration_minutes || 30} min
                          </div>
                        </Link>
                      </td>

                      <td style={{ width: '100px' }}>
                        <div className="upcoming-avatars">
                          {(() => {
                            const meetSpeakers = speakerTurns[m.id] || [];
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

                      <td style={{ width: '150px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {tags.map((t) => (
                            <span key={t.name} className={`library-tag-pill ${t.cls}`}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td style={{ width: '30px', textAlign: 'right' }}>
                        <button type="button" style={{ color: '#94A3B8' }} aria-label="More options">
                          <MoreHorizontal size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Column: Storage, Filters & Popular Tags */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: Storage Usage */}
          <div className="library-sidebar-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#EFF6FF', color: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>Storage Usage</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  <span>{diskUsage.used} GB of {diskUsage.total} GB used</span>
                  <span className="tabular-nums" style={{ fontWeight: 600 }}>{diskUsage.pct}%</span>
                </div>
              </div>
            </div>

            <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ width: `${Math.max(diskUsage.pct, 2)}%`, height: '100%', backgroundColor: '#0066FF', borderRadius: '3px' }} />
            </div>

            <Link href="/settings" style={{ fontSize: '12px', color: '#0066FF', fontWeight: 600, textDecoration: 'none' }}>
              Manage retention &amp; storage &rarr;
            </Link>
          </div>

          {/* Card 2: Filters */}
          <div className="library-sidebar-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                <Filter size={15} color="#0066FF" />
                <span>Filters</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(null);
                  setSearch('');
                  setFilterTab('all');
                }}
                style={{ fontSize: '11.5px', color: '#0066FF', fontWeight: 600 }}
              >
                Clear All
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Date Range', val: 'Last 30 days' },
                { label: 'Meeting Type', val: 'All types' },
                { label: 'Platform', val: 'All platforms' },
                { label: 'Participants', val: 'All participants' },
                { label: 'Tags', val: selectedTag ? selectedTag : 'All tags' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid #EDF2F7', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>{item.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
                    <span>{item.val}</span>
                    <ChevronDown size={12} color="#94A3B8" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Popular Tags */}
          <div className="library-sidebar-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                <Tag size={15} color="#0066FF" />
                <span>Popular Tags</span>
              </div>
              <span style={{ fontSize: '11.5px', color: '#0066FF', fontWeight: 600 }}>View All</span>
            </div>

            <div className="popular-tags-cloud">
              {popularTags.map((tag) => (
                <button
                  key={tag.name}
                  type="button"
                  className="popular-tag-btn"
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                  style={{
                    backgroundColor: selectedTag === tag.name ? '#EFF6FF' : '#F8FAFC',
                    borderColor: selectedTag === tag.name ? '#0066FF' : '#E2E8F0',
                    color: selectedTag === tag.name ? '#0066FF' : '#475569',
                  }}
                >
                  <span>{tag.name}</span>
                  <span className="popular-tag-count">{tag.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Meeting Modal */}
      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => {}}
      />
    </div>
  );
}
