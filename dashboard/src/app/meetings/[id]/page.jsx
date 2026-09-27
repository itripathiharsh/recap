'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Share2,
  Download,
  MoreHorizontal,
  Check,
  CheckCircle2,
  Clock,
  Calendar,
  Video,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
  Target,
  ListTodo,
  HelpCircle,
  Volume2,
  Play,
  Pause,
  Search,
  Trash2,
  Edit2,
  Copy,
  ChevronDown,
  Radio,
  FileCode,
  FileAudio,
  Activity,
  AlertCircle,
  Timer,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../../../lib/workspace';
import { formatDateTime, formatDuration } from '../../../lib/format';
import { speakingShare, isPlaceholderSpeaker } from '../../../lib/metrics';
import { unwrap, toMessage } from '../../../lib/supabaseError';
import MeetingHeroArt from '../../../components/MeetingHeroArt';

// Color ramp for participants
const SPEAKER_PALETTE = [
  { dot: '#2563EB', fill: '#2563EB', bg: '#EFF6FF', text: '#2563EB' }, // Blue
  { dot: '#8B5CF6', fill: '#8B5CF6', bg: '#F5F3FF', text: '#7C3AED' }, // Purple
  { dot: '#10B981', fill: '#10B981', bg: '#ECFDF5', text: '#059669' }, // Green
  { dot: '#F59E0B', fill: '#F59E0B', bg: '#FFFBEB', text: '#D97706' }, // Amber
  { dot: '#EC4899', fill: '#EC4899', bg: '#FDF2F8', text: '#DB2777' }, // Pink
  { dot: '#06B6D4', fill: '#06B6D4', bg: '#ECFEFF', text: '#0891B2' }, // Cyan
];

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { activeOrgId, loading: workspacesLoading } = useWorkspace();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [speakerTurns, setSpeakerTurns] = useState([]);
  const [mom, setMom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [outOfScope, setOutOfScope] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Tabs & Views
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'transcript' | 'speakers' | 'audio' | 'files'
  const [activityView, setActivityView] = useState('time'); // 'time' | 'timeline'
  const [transcriptSearch, setTranscriptSearch] = useState('');

  // Dropdowns & Modals
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);

  // Inline Speaker Renaming
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // Audio Player State
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.md-header-actions')) {
        setDownloadDropdownOpen(false);
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Fetch meeting data from Supabase
  const fetchDetails = async (isInitial = false) => {
    if (!meetingId) return;
    try {
      if (isInitial) {
        setLoading(true);
        setLoadError(null);
      }
      // Scope by workspace: a meeting id from the other workspace must not resolve.
      const { data: meetData, error: meetError } = await applyWorkspaceScope(
        supabase.from('meetings').select('*').eq('id', meetingId).single(),
        activeOrgId
      );
      if (meetError) {
        // PGRST116 = zero rows matched. That means the meeting exists but is not
        // in the active workspace, so drop the stale render instead of leaking it.
        const scopeMiss = meetError.code === 'PGRST116' || /0 rows/i.test(meetError.message || '');
        if (scopeMiss) {
          setOutOfScope(true);
          setMeeting(null);
          setTranscript(null);
          setSpeakerTurns([]);
          setMom(null);
          return;
        }
        throw meetError;
      }
      setMeeting(meetData);
      setOutOfScope(false);

      // These three reads are independent, so one denied table must not hide
      // the others. A read error is surfaced rather than silently rendered as
      // "no transcript / no summary available", which is a false empty state.
      const [transRes, turnsRes, momRes] = await Promise.all([
        supabase.from('transcripts').select('*').eq('meeting_id', meetingId).limit(1),
        supabase
          .from('speaker_turns')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('start_time', { ascending: true }),
        supabase.from('mom').select('*').eq('meeting_id', meetingId).limit(1),
      ]);

      if (transRes.error) throw transRes.error;
      if (turnsRes.error) throw turnsRes.error;
      if (momRes.error) throw momRes.error;

      setTranscript(transRes.data && transRes.data.length > 0 ? transRes.data[0] : null);
      setSpeakerTurns(turnsRes.data || []);
      setMom(momRes.data && momRes.data.length > 0 ? momRes.data[0] : null);
    } catch (err) {
      setLoadError(toMessage(err, 'Could not load this meeting.'));
      if (isInitial) setLoading(false);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for the workspace to resolve, otherwise the first fetch would run in
    // personal scope and briefly render another workspace's meeting.
    if (workspacesLoading) return;
    setOutOfScope(false);
    fetchDetails(true);

    // Auto-refresh every 4s if meeting is in progress or not finished
    const interval = setInterval(() => {
      fetchDetails(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [meetingId, activeOrgId, workspacesLoading]);

  // Rename speaker across all turns
  const handleRenameSpeaker = async (oldName) => {
    if (!newSpeakerName.trim() || newSpeakerName.trim() === oldName) {
      setEditingSpeaker(null);
      return;
    }
    const cleanName = newSpeakerName.trim();
    const previous = speakerTurns;
    try {
      // Applied optimistically, so it must be rolled back if the write is
      // denied; supabase-js resolves rather than throws on a PostgREST error.
      unwrap(
        await supabase
          .from('speaker_turns')
          .update({ speaker: cleanName })
          .eq('meeting_id', meetingId)
          .eq('speaker', oldName),
        'speaker'
      );

      setSpeakerTurns(prev =>
        prev.map(turn => (turn.speaker === oldName ? { ...turn, speaker: cleanName } : turn))
      );
    } catch (err) {
      setSpeakerTurns(previous);
      showToast(toMessage(err, `Could not rename ${oldName}. Please try again.`));
    } finally {
      setEditingSpeaker(null);
      setNewSpeakerName('');
    }
  };

  // Toggle Action Item Checkbox & Persist to Supabase
  const handleToggleActionItem = async (index) => {
    if (!mom || !Array.isArray(mom.action_items)) return;
    const previous = mom.action_items;
    const updated = previous.map((item, idx) => {
      if (idx === index) {
        const isObj = typeof item === 'object' && item !== null;
        const currentCompleted = isObj ? !!item.completed : false;
        return isObj ? { ...item, completed: !currentCompleted } : { task: item, completed: true };
      }
      return item;
    });

    setMom(prev => ({ ...prev, action_items: updated }));

    try {
      // supabase-js resolves on HTTP error codes; it does not throw. A denied
      // or failed write must be detected here or the checkbox lies to the user.
      unwrap(
        await supabase
          .from('mom')
          .update({ action_items: updated, updated_at: new Date().toISOString() })
          .eq('meeting_id', meetingId),
        'action item'
      );
    } catch (err) {
      setMom(prev => (prev ? { ...prev, action_items: previous } : prev));
      showToast(toMessage(err, 'Could not save that change. Please try again.'));
    }
  };

  // Delete Meeting Permanently
  const handleDeleteMeeting = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this meeting? This will remove all audio recordings, transcripts, and notes.')) {
      return;
    }
    try {
      // Delete the scoped meeting row FIRST. It is the permission gate, and
      // supabase-js does not throw on error, so if it is deleted after the
      // children a denied delete would leave the meeting with its transcript,
      // MOM and jobs already destroyed and no error shown.
      unwrap(
        await applyWorkspaceScope(
          supabase.from('meetings').delete().eq('id', meetingId),
          activeOrgId
        ),
        'meeting'
      );

      // Parent is gone, so the meeting is already deleted from the user's
      // point of view. Child cleanup is now best-effort: report it, but do
      // not block the navigation or claim a failure that did not happen.
      const childErrors = [];
      const cleanup = [
        ['audio', supabase.storage.from('recordings').remove([`${meetingId}/audio.wav`])],
        ['speaker_turns', supabase.from('speaker_turns').delete().eq('meeting_id', meetingId)],
        ['mom', supabase.from('mom').delete().eq('meeting_id', meetingId)],
        ['transcripts', supabase.from('transcripts').delete().eq('meeting_id', meetingId)],
        ['jobs', supabase.from('jobs').delete().eq('meeting_id', meetingId)],
        ['system_events', supabase.from('system_events').delete().eq('meeting_id', meetingId)],
      ];
      const results = await Promise.all(cleanup.map(([, p]) => p));
      results.forEach((r, i) => {
        if (r && r.error) childErrors.push(cleanup[i][0]);
      });

      router.push('/meetings');
      if (childErrors.length > 0) {
        console.error(
          `[delete] meeting ${meetingId} deleted, but cleanup failed for: ${childErrors.join(', ')}`
        );
      }
    } catch (err) {
      alert(toMessage(err, 'Failed to delete meeting. Please try again.'));
    }
  };

  // Copy helpers
  const showToast = (msg) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(null), 2500);
  };

  const handleShare = () => {
    if (meeting?.meet_link) {
      navigator.clipboard.writeText(meeting.meet_link);
      showToast('Meeting link copied to clipboard!');
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('Page link copied to clipboard!');
    }
  };

  const handleDownloadMOM = () => {
    if (!mom?.mom_markdown) return;
    const blob = new Blob([mom.mom_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting?.title || 'meeting'}_MOM.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadDropdownOpen(false);
  };

  const handleDownloadTranscript = () => {
    if (!transcript?.transcript_json) return;
    const blob = new Blob([JSON.stringify(transcript.transcript_json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting?.title || 'meeting'}_transcript.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadDropdownOpen(false);
  };

  // ==========================================
  // METRICS DERIVATIONS (PURELY FROM REAL DATA)
  // ==========================================

  // Unique participants & speaking duration breakdown
  const speakerStats = useMemo(() => {
    if (!speakerTurns || speakerTurns.length === 0) return [];
    const map = {};
    speakerTurns.forEach((turn) => {
      const spk = (turn.speaker || '').trim();
      // Placeholder diarization labels are not people; showing them as
      // participants with a 0% share made the card look broken.
      if (!spk || isPlaceholderSpeaker(spk)) return;
      const start = Number(turn.start_time);
      const end = Number(turn.end_time);
      const dur = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
      if (!map[spk]) {
        map[spk] = { name: spk, totalSecs: 0, turnsCount: 0 };
      }
      map[spk].totalSecs += dur;
      map[spk].turnsCount += 1;
    });

    const rows = Object.values(map);
    const totalSecs = rows.reduce((sum, item) => sum + item.totalSecs, 0);

    // If no turn carries a usable duration there is NO speaking-time data.
    // Publishing a percentage anyway produced cards where the most active
    // speaker showed "5 turns, 0%" next to someone with 2 turns at 31%.
    const hasDurations = totalSecs > 0;

    return rows
      .map((item, idx) => ({
        ...item,
        percentage: hasDurations ? Math.round((item.totalSecs / totalSecs) * 100) : null,
        minutes: hasDurations ? Math.max(1, Math.round(item.totalSecs / 60)) : null,
        color: SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length],
      }))
      .sort((a, b) => b.totalSecs - a.totalSecs || b.turnsCount - a.turnsCount || a.name.localeCompare(b.name));
  }, [speakerTurns]);

  const hasSpeakingDurations = speakerStats.some((s) => s.totalSecs > 0);

  // Total speaking time in seconds
  const totalSpeakingSecs = useMemo(() => {
    return speakerStats.reduce((sum, s) => sum + s.totalSecs, 0);
  }, [speakerStats]);

  // Actual meeting duration in minutes.
  // Measured from real timestamps only. `expected_duration_minutes` is a *plan*,
  // not a measurement, and the previous `return 30` made every meeting with no
  // timing data read as "30 min" regardless of its real length.
  const totalDurationMinutes = useMemo(() => {
    if (meeting?.started_at && meeting?.ended_at) {
      const diff = Math.round((new Date(meeting.ended_at) - new Date(meeting.started_at)) / 60000);
      if (diff > 0) return diff;
    }
    if (meeting?.scheduled_start && meeting?.scheduled_end) {
      const diff = Math.round(
        (new Date(meeting.scheduled_end) - new Date(meeting.scheduled_start)) / 60000
      );
      if (diff > 0) return diff;
    }
    return null;
  }, [meeting]);

  // Derived real metrics
  // A completed meeting with zero speaker turns has zero identified
  // participants, not one. The old `? 1 : 0` reported a participant for a
  // meeting where nobody was ever identified.
  const participantsCount = speakerStats.length;
  const totalSpeakerTurnsCount = speakerTurns.length;
  const actionItemsCount = Array.isArray(mom?.action_items) ? mom.action_items.length : 0;
  const decisionsCount = Array.isArray(mom?.decisions) ? mom.decisions.length : 0;
  const openQuestionsCount = Array.isArray(mom?.open_questions) ? mom.open_questions.length : 0;

  // Average speaking share, derived from measured durations. Returns null when
  // no turn carries a usable duration, because `100 / speakerCount` assumes a
  // perfectly even conversation and is not a measurement.
  const avgSpeakingPercentage = useMemo(() => {
    if (!hasSpeakingDurations) return null;
    const withPct = speakerStats.filter((s) => s.percentage != null);
    if (withPct.length === 0) return null;
    return Math.round(withPct.reduce((sum, s) => sum + s.percentage, 0) / withPct.length);
  }, [speakerStats, hasSpeakingDurations]);

  // Discussion Focus (Derived truthfully from meeting title or summary)
  const discussionFocus = useMemo(() => {
    if (!meeting?.title && !mom?.summary) return 'General Discussion';
    if (meeting?.title) return meeting.title;
    return 'General Discussion';
  }, [meeting, mom]);

  // Filtered transcript turns
  const filteredTurns = useMemo(() => {
    if (!speakerTurns) return [];
    if (!transcriptSearch.trim()) return speakerTurns;
    const q = transcriptSearch.toLowerCase();
    return speakerTurns.filter(
      (t) =>
        (t.text && t.text.toLowerCase().includes(q)) ||
        (t.speaker && t.speaker.toLowerCase().includes(q))
    );
  }, [speakerTurns, transcriptSearch]);

  // Audio chapters (DO NOT fabricate chapters)
  const chapters = useMemo(() => {
    if (Array.isArray(mom?.chapters) && mom.chapters.length > 0) return mom.chapters;
    if (Array.isArray(meeting?.chapters) && meeting.chapters.length > 0) return meeting.chapters;
    return null;
  }, [mom, meeting]);

  // Format timestamp (seconds -> M:SS or MM:SS)
  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Generate deterministic waveform bar heights
  const waveformBars = useMemo(() => {
    // 36 bars with natural variation
    return [
      12, 18, 14, 24, 28, 16, 20, 26, 14, 18, 22, 28, 20, 15, 24, 28,
      18, 14, 22, 26, 20, 16, 24, 18, 14, 26, 22, 18, 15, 20, 24, 16,
      12, 18, 14, 10
    ];
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>Loading meeting details...</div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>
          {loadError
            ? 'Could not load this meeting'
            : outOfScope
              ? 'Not in this workspace'
              : 'Meeting not found'}
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: '#64748B',
            marginBottom: '16px',
            maxWidth: '420px',
            margin: '0 auto 16px',
            textWrap: 'pretty',
          }}
        >
          {loadError
            ? loadError
            : outOfScope
              ? 'This meeting belongs to a different workspace. Switch workspaces to open it.'
              : 'The meeting may have been deleted, or the link is incorrect.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {loadError && (
            <button type="button" className="md-btn-outline" onClick={() => fetchDetails(true)}>
              Try again
            </button>
          )}
          <Link href="/meetings" className="md-btn-outline" style={{ display: 'inline-flex' }}>
            Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  // Calculate Donut segments
  let cumulativePercent = 0;
  const donutRadius = 46;
  const donutCircumference = 2 * Math.PI * donutRadius; // ~289

  return (
    <div className="meeting-details-root">
      {/* Toast Notification */}
      {copyToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            fontSize: '12.5px',
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 9999,
          }}
        >
          {copyToast}
        </div>
      )}

      {/* Hidden real audio element */}
      {meeting.recording_url && (
        <audio
          ref={audioRef}
          src={meeting.recording_url}
          preload="metadata"
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      {/* Top Back Link */}
      <div className="md-top-nav">
        <Link href="/meetings" className="md-back-link">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Meetings</span>
        </Link>
      </div>

      {/* Header Row: Title, Metadata, Actions */}
      <div className="md-header-row">
        <div className="md-header-info">
          <h1 className="md-header-title">{meeting.title || 'Untitled meeting'}</h1>

          <div className="md-header-meta">
            <span className="tabular-nums">
              {formatDateTime(meeting.scheduled_start || meeting.started_at || meeting.created_at) || (
                <span style={{ color: '#94A3B8' }}>No date recorded</span>
              )}
            </span>
            {totalDurationMinutes != null && (
              <>
                <span className="bullet">&bull;</span>
                <span className="tabular-nums">{formatDuration(totalDurationMinutes)}</span>
              </>
            )}
            <span className="bullet">&bull;</span>            <span className={`md-status-pill ${meeting.status}`}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor:
                    meeting.status === 'completed'
                      ? '#16A34A'
                      : meeting.status === 'recording'
                      ? '#DC2626'
                      : meeting.status === 'processing'
                      ? '#2563EB'
                      : '#D97706',
                }}
              />
              <span style={{ textTransform: 'capitalize' }}>{meeting.status}</span>
            </span>
          </div>
        </div>

        {/* Right Header Action Buttons */}
        <div className="md-header-actions">
          <button type="button" className="md-btn-outline" onClick={handleShare}>
            <Share2 size={13} aria-hidden="true" />
            <span>Share</span>
          </button>

          {/* Download Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="md-btn-outline"
              onClick={() => {
                setDownloadDropdownOpen(!downloadDropdownOpen);
                setMoreMenuOpen(false);
              }}
            >
              <Download size={13} aria-hidden="true" />
              <span>Download</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>

            {downloadDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  width: '200px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px',
                }}
              >
                {meeting.recording_url && (
                  <a
                    href={meeting.recording_url}
                    download={`${meeting.title || 'recording'}.wav`}
                    className="md-btn-outline"
                    style={{ border: 'none', justifyContent: 'flex-start', boxShadow: 'none' }}
                  >
                    <FileAudio size={13} color="#2563EB" />
                    <span>Download Audio (.wav)</span>
                  </a>
                )}
                {mom?.mom_markdown && (
                  <button
                    type="button"
                    onClick={handleDownloadMOM}
                    className="md-btn-outline"
                    style={{ border: 'none', justifyContent: 'flex-start', boxShadow: 'none' }}
                  >
                    <FileText size={13} color="#16A34A" />
                    <span>Download MOM (.md)</span>
                  </button>
                )}
                {transcript?.transcript_json && (
                  <button
                    type="button"
                    onClick={handleDownloadTranscript}
                    className="md-btn-outline"
                    style={{ border: 'none', justifyContent: 'flex-start', boxShadow: 'none' }}
                  >
                    <FileCode size={13} color="#7C3AED" />
                    <span>Download Transcript (.json)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* More Menu Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="md-btn-icon"
              onClick={() => {
                setMoreMenuOpen(!moreMenuOpen);
                setDownloadDropdownOpen(false);
              }}
              title="More actions"
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>

            {moreMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  width: '180px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px',
                }}
              >
                {meeting.meet_link && (
                  <a
                    href={meeting.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="md-btn-outline"
                    style={{ border: 'none', justifyContent: 'flex-start', boxShadow: 'none' }}
                  >
                    <Video size={13} color="#2563EB" />
                    <span>Open Google Meet</span>
                  </a>
                )}
                {mom?.mom_markdown && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(mom.mom_markdown);
                      showToast('MOM copied to clipboard!');
                      setMoreMenuOpen(false);
                    }}
                    className="md-btn-outline"
                    style={{ border: 'none', justifyContent: 'flex-start', boxShadow: 'none' }}
                  >
                    <Copy size={13} />
                    <span>Copy MOM Text</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteMeeting}
                  className="md-btn-outline"
                  style={{
                    border: 'none',
                    justifyContent: 'flex-start',
                    boxShadow: 'none',
                    color: '#DC2626',
                  }}
                >
                  <Trash2 size={13} color="#DC2626" />
                  <span>Delete Meeting</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="md-tabs-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`md-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'transcript'}
          className={`md-tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'speakers'}
          className={`md-tab-btn ${activeTab === 'speakers' ? 'active' : ''}`}
          onClick={() => setActiveTab('speakers')}
        >
          Speakers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audio'}
          className={`md-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          className={`md-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
      </div>

      {/* TAB 1: OVERVIEW (MATCHES THE 2-COLUMN REFERENCE UI EXACTLY) */}
      {activeTab === 'overview' && (
        <div className="md-overview-grid">
          {/* ========================================================= */}
          {/* LEFT COLUMN: HERO, METRICS, PARTICIPANT ACTIVITY, AUDIO   */}
          {/* ========================================================= */}
          <div className="md-col">
            {/* 1. Meeting Information / Processing Status Section */}
            <div className="md-hero-card">
              <div className="md-hero-art">
                <MeetingHeroArt />
              </div>

              <div className="md-hero-content">
                {/* 1. Status Box (Positioned above Google Meet link) */}
                <div className={`md-hero-status-box ${meeting.status}`}>
                  {meeting.status === 'completed' ? (
                    <>
                      <div className="md-hero-status-heading">
                        <CheckCircle2 size={15} color="#16A34A" />
                        <span>Meeting processed</span>
                      </div>
                      <div className="md-hero-status-desc">
                        All data is ready. You can view the summary, transcript, speakers and download files.
                      </div>
                    </>
                  ) : meeting.status === 'scheduled' ? (
                    <>
                      <div className="md-hero-status-heading">
                        <Clock size={15} color="#B45309" />
                        <span>Meeting hasn&apos;t started yet</span>
                      </div>
                      <div className="md-hero-status-desc">
                        Scheduled for{' '}
                        {new Date(meeting.scheduled_start).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        .
                      </div>
                    </>
                  ) : meeting.status === 'recording' ? (
                    <>
                      <div className="md-hero-status-heading">
                        <Radio size={15} color="#DC2626" />
                        <span>Recording in progress</span>
                      </div>
                      <div className="md-hero-status-desc">
                        The bot is currently capturing audio. Processing starts upon completion.
                      </div>
                    </>
                  ) : meeting.status === 'processing' ? (
                    <>
                      <div className="md-hero-status-heading">
                        <Activity size={15} color="#1D4ED8" />
                        <span>Processing your meeting</span>
                      </div>
                      <div className="md-hero-status-desc">
                        Transcribing audio and generating minutes of meeting.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="md-hero-status-heading">
                        <AlertCircle size={15} color="#DC2626" />
                        <span>Meeting processing failed</span>
                      </div>
                      <div className="md-hero-status-desc">
                        {meeting.error_message || 'An error occurred during pipeline execution.'}
                      </div>
                    </>
                  )}
                </div>

                {/* 2. Meeting Details (Google Meet Link & Metadata) */}
                <div className="md-hero-details">
                  <div className="md-hero-row">
                    <Calendar size={14} color="#64748B" style={{ flexShrink: 0 }} />
                    <span className="md-hero-label">Google Meet:</span>
                    {meeting.meet_link ? (
                      <a
                        href={meeting.meet_link}
                        target="_blank"
                        rel="noreferrer"
                        className="md-hero-link"
                        title={meeting.meet_link}
                      >
                        <span>{meeting.meet_link.replace('https://', '')}</span>
                        <ExternalLink size={11} style={{ flexShrink: 0 }} />
                      </a>
                    ) : (
                      <span className="md-hero-value">No link provided</span>
                    )}
                  </div>

                  <div className="md-hero-grid-2col">
                    <div className="md-hero-row">
                      <Clock size={13} color="#64748B" style={{ flexShrink: 0 }} />
                      <span className="md-hero-label">Started:</span>
                      <span className="md-hero-value tabular-nums">
                        {meeting.started_at
                          ? new Date(meeting.started_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : meeting.scheduled_start
                          ? new Date(meeting.scheduled_start).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Pending'}
                      </span>
                    </div>

                    <div className="md-hero-row">
                      <Clock size={13} color="#64748B" style={{ flexShrink: 0 }} />
                      <span className="md-hero-label">Ended:</span>
                      <span className="md-hero-value tabular-nums">
                        {meeting.ended_at
                          ? new Date(meeting.ended_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : meeting.status === 'completed'
                          ? 'Completed'
                          : 'In progress'}
                      </span>
                    </div>

                    <div className="md-hero-row">
                      <Timer size={13} color="#64748B" style={{ flexShrink: 0 }} />
                      <span className="md-hero-label">Duration:</span>
                      <span className="md-hero-value tabular-nums">
                        {formatDuration(totalDurationMinutes) || 'Not recorded'}
                      </span>
                    </div>

                    <div className="md-hero-row">
                      <Volume2 size={13} color="#64748B" style={{ flexShrink: 0 }} />
                      <span className="md-hero-label">Audio:</span>
                      <span className="md-hero-value">
                        {meeting.recording_url ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Meeting Metrics (4 Cards Row) */}
            <div className="md-metrics-grid">
              {/* Metric 1: Participants */}
              <div className="md-metric-card">
                <div className="md-metric-icon-box" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                  <Users size={16} />
                </div>
                <div>
                  <div className="md-metric-value tabular-nums">{participantsCount}</div>
                  <div className="md-metric-label">
                    Participants
                    <br />
                    in the meeting
                  </div>
                </div>
              </div>

              {/* Metric 2: Avg Speaking Time */}
              <div className="md-metric-card">
                <div className="md-metric-icon-box" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
                  <Clock size={16} />
                </div>
                <div>
                  <div className="md-metric-value tabular-nums">
                    {avgSpeakingPercentage == null ? '—' : `${avgSpeakingPercentage}%`}
                  </div>
                  <div className="md-metric-label">
                    Avg. speaking time
                    <br />
                    across participants
                  </div>
                </div>
              </div>

              {/* Metric 3: Total Speaker Turns */}
              <div className="md-metric-card">
                <div className="md-metric-icon-box" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                  <MessageSquare size={16} />
                </div>
                <div>
                  <div className="md-metric-value tabular-nums">{totalSpeakerTurnsCount}</div>
                  <div className="md-metric-label">
                    Total speaker turns
                    <br />
                    recorded
                  </div>
                </div>
              </div>

              {/* Metric 4: Action Items */}
              <div className="md-metric-card">
                <div className="md-metric-icon-box" style={{ backgroundColor: '#FAF5FF', color: '#9333EA' }}>
                  <FileText size={16} />
                </div>
                <div>
                  <div className="md-metric-value tabular-nums">{actionItemsCount}</div>
                  <div className="md-metric-label">
                    Action items
                    <br />
                    identified
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Participant Activity (Donut Chart + Speaking Bars) */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div>
                  <h3 className="md-card-title">Participant Activity</h3>
                  <div className="md-card-subtitle">Speaking time distribution</div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setActivityView('time')}
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: activityView === 'time' ? '#2563EB' : '#FFFFFF',
                      color: activityView === 'time' ? '#FFFFFF' : '#64748B',
                      border: activityView === 'time' ? '1px solid #2563EB' : '1px solid #E2E8F0',
                      cursor: 'pointer',
                    }}
                  >
                    Speaking time
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityView('timeline')}
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 500,
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: activityView === 'timeline' ? '#2563EB' : '#FFFFFF',
                      color: activityView === 'timeline' ? '#FFFFFF' : '#64748B',
                      border: activityView === 'timeline' ? '1px solid #2563EB' : '1px solid #E2E8F0',
                      cursor: 'pointer',
                    }}
                  >
                    Activity timeline
                  </button>
                </div>
              </div>

              {speakerStats.length > 0 ? (
                <div className="md-activity-content">
                  {/* Left: Donut Chart */}
                  <div className="md-donut-container">
                    <svg viewBox="0 0 120 120" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                      {/* Background Ring */}
                      <circle
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        fill="none"
                        stroke="#F1F5F9"
                        strokeWidth="14"
                      />

                      {/* Dynamic Segments */}
                      {speakerStats.map((spk, idx) => {
                        if (spk.percentage == null) return null;
                        const strokeLength = (spk.percentage / 100) * donutCircumference;
                        const strokeOffset = (cumulativePercent / 100) * donutCircumference;
                        cumulativePercent += spk.percentage;

                        return (
                          <circle
                            key={idx}
                            cx="60"
                            cy="60"
                            r={donutRadius}
                            fill="none"
                            stroke={spk.color.fill}
                            strokeWidth="14"
                            strokeDasharray={`${strokeLength} ${donutCircumference}`}
                            strokeDashoffset={-strokeOffset}
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </svg>
                    <div className="md-donut-center">
                      <div className="md-donut-duration tabular-nums">
                        {formatDuration(totalDurationMinutes) || '—'}
                      </div>
                      <div className="md-donut-sub">Total duration</div>
                    </div>
                  </div>

                  {/* Right: Speaker Bars */}
                  <div className="md-speakers-list">
                    {speakerStats.map((spk, idx) => (
                      <div key={idx} className="md-speaker-bar-row">
                        <div className="md-speaker-info">
                          <span className="md-speaker-dot" style={{ backgroundColor: spk.color.dot }} />
                          <span className="md-speaker-name" title={spk.name}>
                            {spk.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="md-speaker-stat tabular-nums">
                            {hasSpeakingDurations
                              ? `${spk.minutes} min (${spk.percentage}%)`
                              : `${spk.turnsCount} turn${spk.turnsCount === 1 ? '' : 's'}`}
                          </span>
                          {hasSpeakingDurations && (
                            <div className="md-bar-track">
                              <div
                                className="md-bar-fill"
                                style={{
                                  width: `${spk.percentage}%`,
                                  backgroundColor: spk.color.fill,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="md-empty-text">No speaker activity data available yet.</div>
              )}
            </div>

            {/* 9. Meeting Audio Player */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div className="md-card-title-group">
                  <Volume2 size={16} color="#2563EB" />
                  <h3 className="md-card-title">Meeting Audio</h3>
                </div>
              </div>

              {meeting.recording_url ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Player Controls Bar */}
                  <div className="md-audio-player-bar">
                    <button
                      type="button"
                      className="md-play-btn"
                      onClick={() => {
                        if (!audioRef.current) return;
                        if (isPlaying) {
                          audioRef.current.pause();
                          setIsPlaying(false);
                        } else {
                          audioRef.current.play();
                          setIsPlaying(true);
                        }
                      }}
                      title={isPlaying ? 'Pause audio' : 'Play audio'}
                    >
                      {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: '2px' }} />}
                    </button>

                    {/* Waveform Scrubber */}
                    <div
                      className="md-waveform-area"
                      onClick={(e) => {
                        if (!audioRef.current || !duration) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        audioRef.current.currentTime = pct * duration;
                        setCurrentTime(pct * duration);
                      }}
                    >
                      {waveformBars.map((height, i) => {
                        const barProgress = (i / waveformBars.length) * 100;
                        const isPlayed = duration > 0 && (currentTime / duration) * 100 >= barProgress;
                        return (
                          <div
                            key={i}
                            className="md-wave-bar"
                            style={{
                              height: `${height}px`,
                              backgroundColor: isPlayed ? '#2563EB' : '#CBD5E1',
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Time Counter */}
                    <span className="md-audio-time tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>

                    {/* Playback Speed */}
                    <button
                      type="button"
                      className="md-speed-btn"
                      onClick={() => {
                        const speeds = ['1x', '1.25x', '1.5x', '2x'];
                        const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                        setPlaybackSpeed(next);
                        if (audioRef.current) audioRef.current.playbackRate = parseFloat(next);
                      }}
                    >
                      {playbackSpeed}
                    </button>

                    {/* Download Audio */}
                    <a
                      href={meeting.recording_url}
                      download={`${meeting.title || 'recording'}.wav`}
                      className="md-btn-icon"
                      style={{ width: '28px', height: '28px', border: 'none', background: 'none' }}
                      title="Download audio recording"
                    >
                      <Download size={14} color="#64748B" />
                    </a>
                  </div>

                  {/* Chapters (Only if real backend data exists) */}
                  {chapters && (
                    <div className="md-chapters-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
                        <Clock size={13} color="#64748B" />
                        <span>Chapters</span>
                      </div>

                      {chapters.map((ch, idx) => (
                        <div
                          key={idx}
                          className="md-chapter-row"
                          onClick={() => {
                            if (audioRef.current && ch.start_time !== undefined) {
                              audioRef.current.currentTime = ch.start_time;
                              setCurrentTime(ch.start_time);
                              if (!isPlaying) {
                                audioRef.current.play();
                                setIsPlaying(true);
                              }
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="md-chapter-pill tabular-nums">{ch.timestamp || formatTime(ch.start_time)}</span>
                            <span style={{ fontWeight: 500, color: '#1E293B' }}>{ch.title}</span>
                          </div>
                          {ch.duration && (
                            <span className="tabular-nums" style={{ color: '#64748B', fontSize: '11.5px' }}>
                              {ch.duration}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="md-empty-text">No recording available</div>
              )}
            </div>

            {/* 10. Transcript & Speaker Attribution Block (Positioned directly below Meeting Audio) */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div className="md-card-title-group">
                  <FileText size={16} color="#2563EB" />
                  <h3 className="md-card-title">Transcript &amp; Speaker Attribution</h3>
                </div>

                <div className="md-transcript-search">
                  <Search size={13} color="#94A3B8" />
                  <input
                    type="text"
                    placeholder="Search transcript..."
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                  />
                </div>
              </div>

              {filteredTurns.length > 0 ? (
                <div className="md-transcript-turns">
                  {filteredTurns.map((turn, i) => {
                    const speakerIdx = speakerStats.findIndex((s) => s.name === turn.speaker);
                    const pal = speakerIdx >= 0 ? SPEAKER_PALETTE[speakerIdx % SPEAKER_PALETTE.length] : SPEAKER_PALETTE[0];

                    return (
                      <div key={turn.id || i} className="md-turn-item">
                        <div
                          className="md-turn-avatar"
                          style={{ backgroundColor: pal.bg, color: pal.text }}
                        >
                          {(turn.speaker || 'U').charAt(0).toUpperCase()}
                        </div>

                        <div className="md-turn-body">
                          <div className="md-turn-header">
                            {editingSpeaker === turn.speaker ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleRenameSpeaker(turn.speaker);
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <input
                                  type="text"
                                  value={newSpeakerName}
                                  onChange={(e) => setNewSpeakerName(e.target.value)}
                                  autoFocus
                                  style={{
                                    fontSize: '12px',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    border: '1px solid #2563EB',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  type="submit"
                                  style={{
                                    fontSize: '11px',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    backgroundColor: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSpeaker(null)}
                                  style={{
                                    fontSize: '11px',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    backgroundColor: '#F1F5F9',
                                    color: '#64748B',
                                    border: '1px solid #CBD5E1',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <>
                                <span className="md-turn-speaker">{turn.speaker}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSpeaker(turn.speaker);
                                    setNewSpeakerName(turn.speaker);
                                  }}
                                  title="Rename speaker"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94A3B8',
                                    display: 'inline-flex',
                                  }}
                                >
                                  <Edit2 size={11} />
                                </button>
                              </>
                            )}

                            <span
                              className="md-turn-time tabular-nums"
                              style={{ cursor: meeting.recording_url ? 'pointer' : 'default' }}
                              onClick={() => {
                                if (audioRef.current && turn.start_time !== undefined) {
                                  audioRef.current.currentTime = turn.start_time;
                                  setCurrentTime(turn.start_time);
                                  audioRef.current.play();
                                  setIsPlaying(true);
                                }
                              }}
                              title={meeting.recording_url ? 'Click to jump audio here' : ''}
                            >
                              {formatTime(turn.start_time)}
                            </span>
                          </div>

                          <p className="md-turn-text">{turn.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="md-empty-text">No transcript available</div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: KEY INSIGHTS, SUMMARY, DECISIONS, ACTIONS   */}
          {/* ========================================================= */}
          <div className="md-col">
            {/* 2. Key Insights (2x2 Grid) */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div className="md-card-title-group">
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={14} color="#2563EB" />
                  </div>
                  <h3 className="md-card-title">Key Insights</h3>
                </div>
              </div>

              <div className="md-insights-grid">
                {/* 1. Discussion Focus */}
                <div className="md-insight-card blue">
                  <div className="md-insight-icon-box">
                    <Target size={17} />
                  </div>
                  <div className="md-insight-details">
                    <span className="md-insight-label">Discussion Focus</span>
                    <span className="md-insight-value" title={discussionFocus}>
                      {discussionFocus}
                    </span>
                  </div>
                </div>

                {/* 2. Decisions Made */}
                <div className="md-insight-card green">
                  <div className="md-insight-icon-box">
                    <CheckCircle2 size={17} />
                  </div>
                  <div className="md-insight-details">
                    <span className="md-insight-label">Decisions Made</span>
                    <span className="md-insight-value tabular-nums">
                      {decisionsCount > 0 ? `${decisionsCount} key decisions` : 'No decisions'}
                    </span>
                  </div>
                </div>

                {/* 3. Action Items */}
                <div className="md-insight-card orange">
                  <div className="md-insight-icon-box">
                    <ListTodo size={17} />
                  </div>
                  <div className="md-insight-details">
                    <span className="md-insight-label">Action Items</span>
                    <span className="md-insight-value tabular-nums">
                      {actionItemsCount > 0 ? `${actionItemsCount} tasks assigned` : 'No tasks assigned'}
                    </span>
                  </div>
                </div>

                {/* 4. Open Questions */}
                <div className="md-insight-card purple">
                  <div className="md-insight-icon-box">
                    <HelpCircle size={17} />
                  </div>
                  <div className="md-insight-details">
                    <span className="md-insight-label">Open Questions</span>
                    <span className="md-insight-value tabular-nums">
                      {openQuestionsCount > 0 ? `${openQuestionsCount} questions` : '0 questions'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Summary */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div className="md-card-title-group">
                  <FileText size={16} color="#2563EB" />
                  <h3 className="md-card-title">Summary</h3>
                </div>
              </div>

              <div style={{ fontSize: '13.5px', lineHeight: 1.65, color: '#334155' }}>
                {mom?.summary ? (
                  <p style={{ margin: 0 }}>{mom.summary}</p>
                ) : (
                  <span className="md-empty-text">No summary available</span>
                )}
              </div>
            </div>

            {/* 6 & 7. Dual Row: Decisions & Action Items Side by Side */}
            <div className="md-dual-row">
              {/* Decisions Card */}
              <div className="md-card" style={{ flex: 1 }}>
                <div className="md-card-title-row">
                  <div className="md-card-title-group">
                    <CheckCircle2 size={16} color="#16A34A" />
                    <h3 className="md-card-title">Decisions</h3>
                  </div>
                  <span className="md-count-badge green tabular-nums">{decisionsCount}</span>
                </div>

                {Array.isArray(mom?.decisions) && mom.decisions.length > 0 ? (
                  <div className="md-numbered-list">
                    {mom.decisions.map((dec, i) => (
                      <div key={i} className="md-decision-item">
                        <span className="md-num-badge green tabular-nums">{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', textWrap: 'pretty' }}>{dec}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="md-empty-text">No decisions recorded</div>
                )}
              </div>

              {/* Action Items Card */}
              <div className="md-card" style={{ flex: 1 }}>
                <div className="md-card-title-row">
                  <div className="md-card-title-group">
                    <ListTodo size={16} color="#EA580C" />
                    <h3 className="md-card-title">Action Items</h3>
                  </div>
                  <span className="md-count-badge blue tabular-nums">{actionItemsCount}</span>
                </div>

                {Array.isArray(mom?.action_items) && mom.action_items.length > 0 ? (
                  <div className="md-actions-list">
                    {mom.action_items.map((item, i) => {
                      const text = typeof item === 'object' && item !== null ? item.task || item.action || JSON.stringify(item) : item;
                      const owner = typeof item === 'object' && item !== null ? item.owner || item.assignee : null;
                      const due = typeof item === 'object' && item !== null ? item.due : null;
                      const isCompleted = typeof item === 'object' && item !== null ? !!item.completed : false;

                      return (
                        <div key={i} className={`md-action-item ${isCompleted ? 'completed' : ''}`}>
                          <div
                            className={`md-action-checkbox ${isCompleted ? 'checked' : ''}`}
                            onClick={() => handleToggleActionItem(i)}
                            role="checkbox"
                            aria-checked={isCompleted}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                handleToggleActionItem(i);
                              }
                            }}
                          >
                            {isCompleted && <Check size={11} strokeWidth={3} />}
                          </div>

                          <div className="md-action-content">
                            <div className={`md-action-text ${isCompleted ? 'completed' : ''}`}>
                              {text}
                            </div>

                            {(owner || (due && due !== 'not specified')) && (
                              <div className="md-action-meta">
                                {owner && (
                                  <div className="md-action-assignee-pill" title={owner}>
                                    <span className="md-avatar-xs">{owner.charAt(0).toUpperCase()}</span>
                                    <span className="md-action-owner-name">{owner}</span>
                                  </div>
                                )}
                                {owner && due && due !== 'not specified' && (
                                  <span style={{ color: '#CBD5E1', fontSize: '9px' }}>&bull;</span>
                                )}
                                {due && due !== 'not specified' && (
                                  <span
                                    className={`md-action-due tabular-nums ${
                                      due.toLowerCase() === 'today' || due.toLowerCase() === 'tomorrow' ? 'urgent' : ''
                                    }`}
                                  >
                                    <Calendar size={10} aria-hidden="true" />
                                    <span>
                                      {due.toLowerCase() === 'today'
                                        ? 'Due today'
                                        : due.toLowerCase() === 'tomorrow'
                                        ? 'Due tomorrow'
                                        : `Due ${due}`}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div
                      className="md-view-all-link"
                      onClick={() => setActiveTab('transcript')}
                    >
                      <span>View all in transcript &rarr;</span>
                    </div>
                  </div>
                ) : (
                  <div className="md-empty-text">No action items recorded</div>
                )}
              </div>
            </div>

            {/* 8. Open Questions */}
            <div className="md-card">
              <div className="md-card-title-row">
                <div className="md-card-title-group">
                  <HelpCircle size={16} color="#7C3AED" />
                  <h3 className="md-card-title">Open Questions</h3>
                </div>
                <span className="md-count-badge purple tabular-nums">{openQuestionsCount}</span>
              </div>

              {Array.isArray(mom?.open_questions) && mom.open_questions.length > 0 ? (
                <div className="md-numbered-list">
                  {mom.open_questions.map((q, i) => (
                    <div key={i} className="md-question-item">
                      <span className="md-num-badge blue tabular-nums">{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{q}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="md-empty-text">No open questions</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FULL TRANSCRIPT VIEW */}
      {activeTab === 'transcript' && (
        <div className="md-card">
          <div className="md-card-title-row">
            <div className="md-card-title-group">
              <FileText size={18} color="#2563EB" />
              <div>
                <h3 className="md-card-title">Full Meeting Transcript</h3>
                <div className="md-card-subtitle">
                  {speakerTurns.length} turns recorded with acoustic diarization
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="md-transcript-search" style={{ width: '220px' }}>
                <Search size={14} color="#94A3B8" />
                <input
                  type="text"
                  placeholder="Filter dialogue..."
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {transcript?.transcript_json && (
                <button type="button" className="md-btn-outline" onClick={handleDownloadTranscript}>
                  <Download size={13} />
                  <span>Export JSON</span>
                </button>
              )}
            </div>
          </div>

          {filteredTurns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              {filteredTurns.map((turn, i) => {
                const speakerIdx = speakerStats.findIndex((s) => s.name === turn.speaker);
                const pal = speakerIdx >= 0 ? SPEAKER_PALETTE[speakerIdx % SPEAKER_PALETTE.length] : SPEAKER_PALETTE[0];

                return (
                  <div
                    key={turn.id || i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: i % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                      border: '1px solid #EDF2F7',
                    }}
                  >
                    <div
                      className="md-turn-avatar"
                      style={{ backgroundColor: pal.bg, color: pal.text, width: '32px', height: '32px' }}
                    >
                      {(turn.speaker || 'U').charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            {turn.speaker}
                          </span>
                          <span className="tabular-nums" style={{ fontSize: '11px', color: '#94A3B8' }}>
                            {formatTime(turn.start_time)} - {formatTime(turn.end_time)}
                          </span>
                        </div>

                        {meeting.recording_url && (
                          <button
                            type="button"
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = turn.start_time;
                                setCurrentTime(turn.start_time);
                                audioRef.current.play();
                                setIsPlaying(true);
                              }
                            }}
                            className="md-btn-outline"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                          >
                            <Play size={10} />
                            <span>Play segment</span>
                          </button>
                        )}
                      </div>

                      <p style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                        {turn.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="md-empty-text">No transcript available</div>
          )}
        </div>
      )}

      {/* TAB 3: SPEAKERS VIEW */}
      {activeTab === 'speakers' && (
        <div className="md-card">
          <div className="md-card-title-row">
            <div className="md-card-title-group">
              <Users size={18} color="#2563EB" />
              <div>
                <h3 className="md-card-title">Meeting Participants</h3>
                <div className="md-card-subtitle">
                  {speakerStats.length} resolved participants with speaking time analytics
                </div>
              </div>
            </div>
          </div>

          {speakerStats.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {speakerStats.map((spk, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #EDF2F7',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: spk.color.bg,
                        color: spk.color.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                      }}
                    >
                      {spk.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{spk.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748B' }} className="tabular-nums">
                        {spk.turnsCount} speaker turns recorded
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }} className="tabular-nums">
                        {hasSpeakingDurations ? `${spk.minutes} min` : `${spk.turnsCount} turns`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {hasSpeakingDurations
                          ? `${spk.percentage}% of conversation`
                          : 'speaking time not recorded'}
                      </div>
                    </div>

                    {hasSpeakingDurations && (
                      <div style={{ width: '120px' }}>
                        <div className="md-bar-track">
                          <div
                            className="md-bar-fill"
                            style={{
                              width: `${spk.percentage}%`,
                              backgroundColor: spk.color.fill,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="md-empty-text">No speaker activity data available yet.</div>
          )}
        </div>
      )}

      {/* TAB 4: AUDIO VIEW */}
      {activeTab === 'audio' && (
        <div className="md-card">
          <div className="md-card-title-row">
            <div className="md-card-title-group">
              <Volume2 size={18} color="#2563EB" />
              <div>
                <h3 className="md-card-title">Audio Studio</h3>
                <div className="md-card-subtitle">High-fidelity Google Meet audio recording</div>
              </div>
            </div>

            {meeting.recording_url && (
              <a
                href={meeting.recording_url}
                download={`${meeting.title || 'recording'}.wav`}
                className="md-btn-outline"
              >
                <Download size={13} />
                <span>Download Audio (.wav)</span>
              </a>
            )}
          </div>

          {meeting.recording_url ? (
            <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="md-audio-player-bar" style={{ padding: '16px 20px' }}>
                <button
                  type="button"
                  className="md-play-btn"
                  style={{ width: '44px', height: '44px' }}
                  onClick={() => {
                    if (!audioRef.current) return;
                    if (isPlaying) {
                      audioRef.current.pause();
                      setIsPlaying(false);
                    } else {
                      audioRef.current.play();
                      setIsPlaying(true);
                    }
                  }}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
                </button>

                <div
                  className="md-waveform-area"
                  style={{ height: '44px' }}
                  onClick={(e) => {
                    if (!audioRef.current || !duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    audioRef.current.currentTime = pct * duration;
                    setCurrentTime(pct * duration);
                  }}
                >
                  {waveformBars.map((height, i) => {
                    const barProgress = (i / waveformBars.length) * 100;
                    const isPlayed = duration > 0 && (currentTime / duration) * 100 >= barProgress;
                    return (
                      <div
                        key={i}
                        className="md-wave-bar"
                        style={{
                          height: `${height * 1.3}px`,
                          backgroundColor: isPlayed ? '#2563EB' : '#CBD5E1',
                        }}
                      />
                    );
                  })}
                </div>

                <span className="md-audio-time tabular-nums" style={{ fontSize: '13px' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          ) : (
            <div className="md-empty-text">No recording available</div>
          )}
        </div>
      )}

      {/* TAB 5: FILES VIEW */}
      {activeTab === 'files' && (
        <div className="md-card">
          <div className="md-card-title-row">
            <div className="md-card-title-group">
              <Download size={18} color="#2563EB" />
              <div>
                <h3 className="md-card-title">Meeting Files &amp; Assets</h3>
                <div className="md-card-subtitle">Real downloadable artifacts from this recording session</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '12px' }}>
            {/* File 1: Audio WAV */}
            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileAudio size={18} color="#2563EB" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>audio.wav</div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Master audio recording</div>
                </div>
              </div>

              {meeting.recording_url ? (
                <a
                  href={meeting.recording_url}
                  download={`${meeting.title || 'recording'}.wav`}
                  className="md-btn-outline"
                >
                  <Download size={12} />
                  <span>Download</span>
                </a>
              ) : (
                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>Unavailable</span>
              )}
            </div>

            {/* File 2: MOM Markdown */}
            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} color="#16A34A" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>MOM.md</div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Minutes of meeting markdown</div>
                </div>
              </div>

              {mom?.mom_markdown ? (
                <button type="button" onClick={handleDownloadMOM} className="md-btn-outline">
                  <Download size={12} />
                  <span>Download</span>
                </button>
              ) : (
                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>Unavailable</span>
              )}
            </div>

            {/* File 3: JSON Transcript */}
            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#FAF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileCode size={18} color="#7C3AED" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>transcript.json</div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Time-aligned diarized JSON</div>
                </div>
              </div>

              {transcript?.transcript_json ? (
                <button type="button" onClick={handleDownloadTranscript} className="md-btn-outline">
                  <Download size={12} />
                  <span>Download</span>
                </button>
              ) : (
                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>Unavailable</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
