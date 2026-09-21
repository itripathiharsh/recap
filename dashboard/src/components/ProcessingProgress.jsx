'use client';

import React, { useState, useEffect } from 'react';
import {
  Mic,
  Radio,
  FileText,
  Users,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

export default function ProcessingProgress({ meeting }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedRemaining, setEstimatedRemaining] = useState(65);

  const status = meeting?.status || 'processing';

  // Timer for recording or processing
  useEffect(() => {
    if (status !== 'recording' && status !== 'processing' && status !== 'joining') {
      return;
    }

    const startTime = meeting?.started_at ? new Date(meeting.started_at).getTime() : Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(elapsed);

      if (status === 'processing') {
        // Average pipeline takes ~75-90 seconds
        const estTotal = 80;
        const rem = Math.max(5, estTotal - (elapsed % estTotal));
        setEstimatedRemaining(rem);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, meeting?.started_at]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (status === 'recording') {
    return (
      <div
        style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              position: 'relative',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#EF4444',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-4px',
                left: '-4px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.4)',
                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#991B1B' }}>
              Live Recording In Progress
            </div>
            <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
              recap bot is inside the call capturing high-fidelity audio and attendee logs.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#FFFFFF',
            padding: '6px 14px',
            borderRadius: '20px',
            border: '1px solid #FCA5A5',
            fontSize: '13px',
            fontWeight: 700,
            color: '#DC2626',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <Radio size={15} className="animate-pulse" />
          <span>{formatTimer(elapsedSeconds)}</span>
        </div>
      </div>
    );
  }

  if (status === 'processing') {
    // Determine current progress percentage and stage
    let progressPct = 40;
    let activeStage = 'Transcribing Dialogue';

    if (elapsedSeconds < 25) {
      progressPct = 35;
      activeStage = 'Transcribing Dialogue (Groq Whisper / Gemini)';
    } else if (elapsedSeconds < 55) {
      progressPct = 65;
      activeStage = 'Voice Diarization (pyannote.audio)';
    } else if (elapsedSeconds < 75) {
      progressPct = 85;
      activeStage = 'Resolving Speaker Identities';
    } else {
      progressPct = 95;
      activeStage = 'Generating Executive MOM & Action Items';
    }

    const stages = [
      { id: 1, label: 'Audio Capture', done: true },
      { id: 2, label: 'Transcription', done: progressPct >= 50, active: progressPct < 50 },
      { id: 3, label: 'Voice Diarization', done: progressPct >= 75, active: progressPct >= 50 && progressPct < 75 },
      { id: 4, label: 'Speaker Identification', done: progressPct >= 90, active: progressPct >= 75 && progressPct < 90 },
      { id: 5, label: 'Executive MOM', done: false, active: progressPct >= 90 },
    ];

    return (
      <div
        style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Header: Title, Stage & Time Estimate */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0066FF',
              }}
            >
              <Loader2 size={18} style={{ animation: 'spin 1.2s linear infinite' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Processing Meeting Intelligence
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Current Stage: <span style={{ color: '#0066FF', fontWeight: 600 }}>{activeStage}</span>
              </div>
            </div>
          </div>

          {/* Time Remaining Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #DBEAFE',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#1D4ED8',
            }}
          >
            <Clock size={14} />
            <span>~{estimatedRemaining}s remaining</span>
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#E2E8F0',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: '#0066FF',
              borderRadius: '999px',
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
              backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)',
              backgroundSize: '16px 16px',
            }}
          />
        </div>

        {/* 5-Stage Checklist Pill Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
          }}
        >
          {stages.map((st) => (
            <div
              key={st.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: st.done
                  ? '#ECFDF5'
                  : st.active
                  ? '#EFF6FF'
                  : '#FFFFFF',
                border: st.done
                  ? '1px solid #A7F3D0'
                  : st.active
                  ? '1px solid #BFDBFE'
                  : '1px solid #F1F5F9',
                color: st.done
                  ? '#065F46'
                  : st.active
                  ? '#1E40AF'
                  : '#94A3B8',
                fontWeight: st.done || st.active ? 600 : 500,
              }}
            >
              {st.done ? (
                <CheckCircle2 size={13} color="#10B981" />
              ) : st.active ? (
                <Loader2 size={13} color="#0066FF" style={{ animation: 'spin 1.5s linear infinite' }} />
              ) : (
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#CBD5E1', margin: '0 3px' }} />
              )}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {st.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
