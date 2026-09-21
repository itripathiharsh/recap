'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Copy,
  Check,
  CheckCircle2,
  Video,
  Clock,
  Calendar,
  Edit2,
  User,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import StatusBadge from '../../../components/StatusBadge';
import ProcessingProgress from '../../../components/ProcessingProgress';

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [speakerTurns, setSpeakerTurns] = useState([]);
  const [mom, setMom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  const handleRenameSpeaker = async (oldName) => {
    if (!newSpeakerName.trim() || newSpeakerName.trim() === oldName) {
      setEditingSpeaker(null);
      return;
    }
    const cleanName = newSpeakerName.trim();
    try {
      await supabase
        .from('speaker_turns')
        .update({ speaker: cleanName })
        .eq('meeting_id', meetingId)
        .eq('speaker', oldName);

      setSpeakerTurns(prev =>
        prev.map(turn => turn.speaker === oldName ? { ...turn, speaker: cleanName } : turn)
      );
    } catch (err) {
      console.error('Failed to rename speaker:', err);
    } finally {
      setEditingSpeaker(null);
      setNewSpeakerName('');
    }
  };

  const fetchDetails = async (isInitial = false) => {
    if (!meetingId) return;
    try {
      if (isInitial) setLoading(true);
      const { data: meetData, error: meetError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();
      if (meetError) throw meetError;
      setMeeting(meetData);

      const { data: transData } = await supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', meetingId)
        .limit(1);
      if (transData && transData.length > 0) setTranscript(transData[0]);

      const { data: turnsData } = await supabase
        .from('speaker_turns')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('start_time', { ascending: true });
      if (turnsData) setSpeakerTurns(turnsData);

      const { data: momData } = await supabase
        .from('mom')
        .select('*')
        .eq('meeting_id', meetingId)
        .limit(1);
      if (momData && momData.length > 0) setMom(momData[0]);
    } catch (err) {
      console.error('Error fetching meeting details:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails(true);

    // Auto-refresh every 3.5s if meeting is in progress or still missing mom/transcript
    const interval = setInterval(() => {
      fetchDetails(false);
    }, 3500);

    return () => clearInterval(interval);
  }, [meetingId]);

  const handleCopyMOM = () => {
    if (!mom?.mom_markdown) return;
    navigator.clipboard.writeText(mom.mom_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading meeting...
      </div>
    );
  }

  if (!meeting) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <h2 style={{ fontSize: '15px', marginBottom: '8px' }}>Meeting not found</h2>
        <Link href="/meetings" className="btn-secondary">
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '840px' }}>
      {/* Back Link */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/meetings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12.5px',
            color: 'var(--text-secondary)',
          }}
        >
          <ArrowLeft size={13} aria-hidden="true" />
          <span>Meetings</span>
        </Link>
      </div>

      {/* Header: Title, Metadata, Actions */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {meeting.title}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <span className="tabular-nums" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {new Date(meeting.scheduled_start).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span>&bull;</span>
              <span className="tabular-nums">{meeting.expected_duration_minutes} min</span>
              <span>&bull;</span>
              <StatusBadge status={meeting.status} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <a
              href={meeting.meet_link}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              <Video size={13} aria-hidden="true" />
              <span>Join / Replay</span>
            </a>

            {mom?.mom_markdown && (
              <>
                <button type="button" className="btn-secondary" onClick={handleCopyMOM}>
                  {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button type="button" className="btn-secondary" onClick={handleDownloadMOM}>
                  <Download size={13} aria-hidden="true" />
                  <span>Download</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Processing Progress & Time-Remaining Bar (for active/processing meetings) */}
      <ProcessingProgress meeting={meeting} />

      {/* Main Editorial Workspace Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Summary */}
        <section>
          <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Summary
          </h2>
          <div style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}>
            {mom?.summary || (
              <span style={{ color: 'var(--text-muted)' }}>
                {['joining', 'recording', 'processing'].includes(meeting.status)
                  ? 'Meeting is currently in progress. Summary will be generated after processing.'
                  : 'No summary available.'}
              </span>
            )}
          </div>
        </section>

        {/* Decisions */}
        {mom?.decisions && mom.decisions.length > 0 && (
          <section>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Decisions
            </h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {mom.decisions.map((dec, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={14} color="var(--status-success)" style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
                  <span>{dec}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Action Items */}
        {mom?.action_items && mom.action_items.length > 0 && (
          <section>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Action Items
            </h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mom.action_items.map((item, i) => {
                const text = typeof item === 'object' ? item.task || item.action || JSON.stringify(item) : item;
                const owner = typeof item === 'object' ? item.owner || item.assignee : null;
                return (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <input type="checkbox" style={{ marginTop: '3px', accentColor: 'var(--brand-blue)' }} />
                    <div>
                      <span>{text}</span>
                      {owner && (
                        <span
                          style={{
                            marginLeft: '6px',
                            fontSize: '11px',
                            color: 'var(--brand-blue)',
                            backgroundColor: 'var(--brand-blue-subtle)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                          }}
                        >
                          @{owner}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Open Questions */}
        {mom?.open_questions && mom.open_questions.length > 0 && (
          <section>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Open Questions
            </h2>
            <ul style={{ listStyle: 'disc', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: 'var(--text-primary)' }}>
              {mom.open_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Transcript Document View */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Transcript &amp; Speaker Attribution
            </h2>

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {speakerTurns.length > 0
                ? 'Voice-diarized with speaker alignment'
                : meeting?.status === 'processing'
                ? 'Diarization in progress...'
                : 'Raw transcript'}
            </div>
          </div>

          {/* Speaker Attribution Tip Banner */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #EDF2F7',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#475569',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <span>
              💡 <strong>Speaker Attribution:</strong> Voices are separated via acoustic diarization (pyannote) and resolved to real names using dialogue context. Click the <Edit2 size={11} style={{ display: 'inline', margin: '0 2px' }} /> icon to rename any speaker.
            </span>
          </div>

          {speakerTurns.length > 0 && speakerTurns.some(t => t.text && t.text.trim()) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {speakerTurns.filter(t => t.text && t.text.trim()).map((turn, i) => (
                <div key={turn.id || i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                          placeholder="Enter real name"
                          style={{
                            fontSize: '12px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--brand-blue)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: 'var(--brand-blue)',
                            color: '#fff',
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
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: turn.speaker?.toLowerCase().includes('harsh') ? '#0066FF' : 'var(--text-primary)',
                          }}
                        >
                          {turn.speaker}
                        </span>

                        {turn.speaker?.toLowerCase().includes('harsh') && (
                          <span
                            style={{
                              fontSize: '10px',
                              background: '#EFF6FF',
                              color: '#0066FF',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 600,
                            }}
                          >
                            You
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingSpeaker(turn.speaker);
                            setNewSpeakerName(turn.speaker);
                          }}
                          title="Rename speaker across meeting"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 2px',
                            color: 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <Edit2 size={11} aria-hidden="true" />
                        </button>
                      </>
                    )}

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="tabular-nums">
                      {turn.start_time?.toFixed(1)}s &ndash; {turn.end_time?.toFixed(1)}s
                    </span>
                  </div>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {turn.text}
                  </p>
                </div>
              ))}
            </div>
          ) : transcript?.transcript_json?.segments && transcript.transcript_json.segments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {transcript.transcript_json.segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Speaker {i % 2 === 0 ? '1' : '2'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="tabular-nums">
                      {seg.start?.toFixed(1)}s &ndash; {seg.end?.toFixed(1)}s
                    </span>
                  </div>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {seg.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              {['scheduled', 'queued', 'joining', 'recording', 'processing'].includes(meeting?.status)
                ? 'Transcript will appear here once audio processing completes.'
                : 'Transcript not available for this meeting.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
