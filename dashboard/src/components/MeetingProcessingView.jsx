'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Video,
  Clock,
  Calendar,
  MoreHorizontal,
  FileText,
  Users,
  Sparkles,
  ListTodo,
  Compass,
  Check,
  CheckCircle2,
  Loader2,
  BarChart2,
  Mail,
  Bell,
  Smartphone,
  Info,
} from 'lucide-react';

export default function MeetingProcessingView({ meeting, onOpenDetails }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inAppNotif, setInAppNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const totalMinutes = meeting?.expected_duration_minutes || 45;
  // Estimated processing time: ~75 to 120 seconds total
  const estimatedTotalSeconds = Math.min(180, Math.max(70, totalMinutes * 2.2));

  useEffect(() => {
    const startTime = meeting?.started_at
      ? new Date(meeting.started_at).getTime()
      : Date.now() - 15000;

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsedSeconds(elapsed);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [meeting?.started_at]);

  const isRecording = meeting?.status === 'recording';

  // Compute realistic stage progression
  // Stages:
  // 1. Recording uploaded (Done immediately once processing starts)
  // 2. Transcribing audio (0s - 30% of time)
  // 3. Identifying speakers (30% - 65% of time)
  // 4. Generating summary (65% - 82% of time)
  // 5. Extracting action items (82% - 92% of time)
  // 6. Finalizing and saving (92% - 100% of time)
  const ratio = Math.min(0.97, elapsedSeconds / estimatedTotalSeconds);

  let currentStep = isRecording ? 1 : 2; // 1 to 6
  let progress = isRecording
    ? Math.min(20, Math.max(5, Math.round((elapsedSeconds / (totalMinutes * 60)) * 100)))
    : Math.round(15 + ratio * 80);

  if (!isRecording) {
    if (ratio < 0.28) {
      currentStep = 2; // Transcribing audio
    } else if (ratio < 0.62) {
      currentStep = 3; // Identifying speakers
    } else if (ratio < 0.80) {
      currentStep = 4; // Generating summary
    } else if (ratio < 0.92) {
      currentStep = 5; // Extracting action items
    } else {
      currentStep = 6; // Finalizing and saving
    }
  }

  // Time remaining
  const remainingSeconds = Math.max(10, Math.round(estimatedTotalSeconds - elapsedSeconds));
  const remainingDisplay =
    remainingSeconds >= 60
      ? `~ ${Math.ceil(remainingSeconds / 60)} minutes`
      : `~ ${remainingSeconds} seconds`;

  // Processed minutes count (e.g. "30 of 45 minutes")
  const processedMinutes = Math.min(
    totalMinutes,
    Math.max(1, Math.round((progress / 100) * totalMinutes))
  );

  // SVG circular ring properties
  const size = 160;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Format meeting date and time
  const formattedDate = meeting?.scheduled_start
    ? new Date(meeting.scheduled_start).toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Today';

  const formattedTime = meeting?.scheduled_start
    ? new Date(meeting.scheduled_start).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '10:00 AM';

  const steps = [
    {
      id: 1,
      title: 'Recording uploaded',
      time: formattedTime,
      state: 'completed',
    },
    {
      id: 2,
      title: 'Transcribing audio',
      state: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'waiting',
    },
    {
      id: 3,
      title: 'Identifying speakers',
      state: currentStep > 3 ? 'completed' : currentStep === 3 ? 'active' : 'waiting',
    },
    {
      id: 4,
      title: 'Generating summary',
      state: currentStep > 4 ? 'completed' : currentStep === 4 ? 'active' : 'waiting',
    },
    {
      id: 5,
      title: 'Extracting action items',
      state: currentStep > 5 ? 'completed' : currentStep === 5 ? 'active' : 'waiting',
    },
    {
      id: 6,
      title: 'Finalizing and saving',
      state: currentStep > 6 ? 'completed' : currentStep === 6 ? 'active' : 'waiting',
    },
  ];

  const features = [
    {
      id: 'transcription',
      icon: FileText,
      title: 'AI Transcription',
      desc: 'Converting speech to text',
      status: currentStep > 2 ? 'done' : currentStep === 2 ? 'active' : 'waiting',
    },
    {
      id: 'diarization',
      icon: Users,
      title: 'Speaker Diarization',
      desc: 'Identifying different speakers',
      status: currentStep > 3 ? 'done' : currentStep === 3 ? 'active' : 'waiting',
    },
    {
      id: 'summary',
      icon: Sparkles,
      title: 'AI Summary',
      desc: 'Generating key points',
      status: currentStep > 4 ? 'done' : currentStep === 4 ? 'active' : 'waiting',
    },
    {
      id: 'actions',
      icon: ListTodo,
      title: 'Action Items',
      desc: 'Extracting tasks and decisions',
      status: currentStep > 5 ? 'done' : currentStep === 5 ? 'active' : 'waiting',
    },
    {
      id: 'insights',
      icon: Compass,
      title: 'Insights',
      desc: 'Analyzing topics and sentiment',
      status: currentStep > 6 ? 'done' : currentStep === 6 ? 'active' : 'waiting',
    },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Back Link */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/meetings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#0066FF',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Back to Meetings</span>
        </Link>
      </div>

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              {meeting?.title || 'Product Review'}
            </h1>

            {/* Processing Pill Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#0066FF',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#0066FF',
                  display: 'inline-block',
                }}
              />
              Processing
            </span>
          </div>

          {/* Subtitle Metadata */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              fontSize: '13px',
              color: '#64748B',
              marginTop: '8px',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Calendar size={14} />
              <span>{formattedDate}</span>
            </span>
            <span>&bull;</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={14} />
              <span className="tabular-nums">{formattedTime}</span>
            </span>
            <span>&bull;</span>
            <span className="tabular-nums">{totalMinutes} min</span>
            <span>&bull;</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="#00AC47"/>
              </svg>
              <span>Google Meet</span>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowDetailsModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              transition: 'background-color 150ms ease, border-color 150ms ease',
            }}
          >
            <Info size={14} />
            <span>View Meeting Details</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDetailsModal(true)}
            aria-label="More options"
            style={{
              width: '34px',
              height: '34px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Progress Ring + Steps Checklist + Metric Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Main Processing Box */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#0F172A',
                marginBottom: '4px',
              }}
            >
              Your meeting is being processed
            </h2>
            <p
              style={{
                fontSize: '13.5px',
                color: '#64748B',
                marginBottom: '28px',
                lineHeight: 1.5,
              }}
            >
              We're transcribing, identifying speakers, and generating insights. This usually takes a few minutes.
            </p>

            {/* Split: Left Circular Ring | Right Steps */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '170px minmax(0, 1fr)',
                gap: '28px',
                alignItems: 'center',
              }}
            >
              {/* Circular Progress Ring with floating dots */}
              <div
                style={{
                  position: 'relative',
                  width: `${size}px`,
                  height: `${size}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                {/* Subtle Decorative Dots */}
                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '12px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#60A5FA',
                    opacity: 0.8,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    left: '8px',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#93C5FD',
                    opacity: 0.6,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '18px',
                    right: '10px',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#3B82F6',
                    opacity: 0.7,
                  }}
                />

                <svg
                  width={size}
                  height={size}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                >
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#EFF6FF"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                  />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#0066FF"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    style={{
                      transition: 'stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </svg>

                {/* Centered Percentage & Label */}
                <div
                  style={{
                    position: 'absolute',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '32px',
                      fontWeight: 800,
                      color: '#0F172A',
                      lineHeight: 1,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {progress}%
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#64748B',
                      fontWeight: 500,
                      marginTop: '4px',
                    }}
                  >
                    Processing...
                  </span>
                </div>
              </div>

              {/* Vertical Step Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {steps.map((st, idx) => {
                  const isLast = idx === steps.length - 1;
                  return (
                    <div
                      key={st.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        position: 'relative',
                        paddingBottom: isLast ? '0' : '14px',
                      }}
                    >
                      {/* Connecting Vertical Line */}
                      {!isLast && (
                        <div
                          style={{
                            position: 'absolute',
                            left: '9px',
                            top: '18px',
                            bottom: '0',
                            width: '2px',
                            backgroundColor: st.state === 'completed' ? '#BFDBFE' : '#F1F5F9',
                            zIndex: 0,
                          }}
                        />
                      )}

                      {/* Icon Circle */}
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          zIndex: 1,
                          backgroundColor:
                            st.state === 'completed'
                              ? '#0066FF'
                              : st.state === 'active'
                              ? '#0066FF'
                              : '#FFFFFF',
                          border:
                            st.state === 'completed'
                              ? 'none'
                              : st.state === 'active'
                              ? '2px solid #0066FF'
                              : '2px solid #CBD5E1',
                          color: '#FFFFFF',
                        }}
                      >
                        {st.state === 'completed' && <Check size={12} strokeWidth={3} />}
                        {st.state === 'active' && (
                          <div
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: '#FFFFFF',
                            }}
                          />
                        )}
                      </div>

                      {/* Title & Status */}
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          lineHeight: '20px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: st.state === 'active' ? 600 : 500,
                            color:
                              st.state === 'completed' || st.state === 'active'
                                ? '#0F172A'
                                : '#94A3B8',
                          }}
                        >
                          {st.title}
                        </span>

                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: '12px',
                            fontWeight: st.state === 'active' ? 600 : 400,
                            color:
                              st.state === 'active'
                                ? '#0066FF'
                                : st.state === 'completed'
                                ? '#64748B'
                                : '#94A3B8',
                          }}
                        >
                          {st.time || (st.state === 'completed' ? 'Completed' : st.state === 'active' ? 'In progress...' : 'Waiting...')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Row: 2 Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Card A: Estimated time remaining */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#EFF6FF',
                    color: '#0066FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Clock size={16} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>
                  Estimated time remaining
                </span>
              </div>

              <div
                className="tabular-nums"
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#0F172A',
                  letterSpacing: '-0.02em',
                  marginBottom: '4px',
                }}
              >
                {remainingDisplay}
              </div>

              <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                This may vary based on meeting length and audio quality.
              </div>
            </div>

            {/* Card B: Processed */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '20px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#EFF6FF',
                    color: '#0066FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChart2 size={16} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>
                  Processed
                </span>
              </div>

              <div
                className="tabular-nums"
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#0F172A',
                  letterSpacing: '-0.02em',
                  marginBottom: '10px',
                }}
              >
                {processedMinutes} of {totalMinutes} minutes
              </div>

              {/* Progress Bar with Percentage */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    flex: 1,
                    height: '7px',
                    backgroundColor: '#EFF6FF',
                    borderRadius: '999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      backgroundColor: '#0066FF',
                      borderRadius: '999px',
                      transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </div>
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0F172A',
                    minWidth: '32px',
                    textAlign: 'right',
                  }}
                >
                  {progress}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Processing in real-time + Notification Preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card 1: Processing in real-time */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* Header with pulsing green dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  display: 'inline-block',
                }}
              />
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#0F172A',
                  margin: 0,
                }}
              >
                Processing in real-time
              </h3>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#64748B',
                marginBottom: '20px',
              }}
            >
              You can leave this page, we'll notify you when it's ready.
            </p>

            {/* 5 Feature Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {features.map((feat) => {
                const IconComp = feat.icon;
                return (
                  <div
                    key={feat.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: '#EFF6FF',
                          color: '#0066FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <IconComp size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                          {feat.title}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                          {feat.desc}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge Icon */}
                    <div>
                      {feat.status === 'done' ? (
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: '#10B981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                          }}
                        >
                          <Check size={12} strokeWidth={3} />
                        </div>
                      ) : feat.status === 'active' ? (
                        <Loader2
                          size={18}
                          color="#0066FF"
                          style={{ animation: 'spin 1.2s linear infinite' }}
                        />
                      ) : (
                        <Clock size={16} color="#CBD5E1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Notification Preferences */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h3
              style={{
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#0F172A',
                marginBottom: '16px',
              }}
            >
              You'll be notified when it's ready
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* In-app notification */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Bell size={16} color="#64748B" />
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                    In-app notification
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInAppNotif(!inAppNotif)}
                  role="switch"
                  aria-checked={inAppNotif}
                  style={{
                    width: '38px',
                    height: '22px',
                    borderRadius: '999px',
                    backgroundColor: inAppNotif ? '#0066FF' : '#CBD5E1',
                    position: 'relative',
                    transition: 'background-color 200ms ease',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: inAppNotif ? '18px' : '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 200ms ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  />
                </button>
              </div>

              {/* Email notification */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Mail size={16} color="#64748B" />
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                    Email notification
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailNotif(!emailNotif)}
                  role="switch"
                  aria-checked={emailNotif}
                  style={{
                    width: '38px',
                    height: '22px',
                    borderRadius: '999px',
                    backgroundColor: emailNotif ? '#0066FF' : '#CBD5E1',
                    position: 'relative',
                    transition: 'background-color 200ms ease',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: emailNotif ? '18px' : '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 200ms ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  />
                </button>
              </div>

              {/* Push notification */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Smartphone size={16} color="#64748B" />
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                    Push notification
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPushNotif(!pushNotif)}
                  role="switch"
                  aria-checked={pushNotif}
                  style={{
                    width: '38px',
                    height: '22px',
                    borderRadius: '999px',
                    backgroundColor: pushNotif ? '#0066FF' : '#CBD5E1',
                    position: 'relative',
                    transition: 'background-color 200ms ease',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: pushNotif ? '18px' : '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 200ms ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
              Meeting Details
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Title: </span>
                <span style={{ color: '#0F172A', fontWeight: 600 }}>{meeting?.title}</span>
              </div>
              <div>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Meeting Link: </span>
                <a
                  href={meeting?.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#0066FF', wordBreak: 'break-all' }}
                >
                  {meeting?.meet_link}
                </a>
              </div>
              <div>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Status: </span>
                <span style={{ color: '#0066FF', fontWeight: 600 }}>{meeting?.status}</span>
              </div>
              <div>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Started At: </span>
                <span className="tabular-nums" style={{ color: '#0F172A' }}>
                  {meeting?.started_at ? new Date(meeting.started_at).toLocaleString() : 'Just now'}
                </span>
              </div>
              <div>
                <span style={{ color: '#64748B', fontWeight: 500 }}>Duration: </span>
                <span className="tabular-nums" style={{ color: '#0F172A' }}>
                  {totalMinutes} minutes
                </span>
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
