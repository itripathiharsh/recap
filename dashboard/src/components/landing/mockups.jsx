'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Search, Bell, Video, Check, Loader2 } from 'lucide-react';
import { useReducedMotion } from './motion';

/* ---------------------------------------------------------------------------
   Doodle — handwriting caption + hand-drawn arrow that draws itself on scroll.
   Three arrow variants so the signature doesn't read as copy-paste clip-art.
--------------------------------------------------------------------------- */
const DOODLE_PATHS = [
  'M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24',
  'M6 30 C 16 28, 26 20, 34 6 M 24 6 L 34 6 L 34 16',
  'M4 22 C 14 12, 26 14, 34 24 M 26 26 L 34 24 L 33 15',
];

export function Doodle({ text, variant = 0, arrowSize = 30, textStyle, style, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in-view');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view');
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`landing-doodle l-doodle ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}>
      <span className="doodle-text doodle-text-anim" style={textStyle}>
        {text}
      </span>
      <svg width={arrowSize} height={arrowSize} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path
          className="doodle-path"
          d={DOODLE_PATHS[variant % DOODLE_PATHS.length]}
          stroke="#00A3FF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Live countdown ("Starts in 24:59") — ticks every second, resets at zero.
--------------------------------------------------------------------------- */
function Countdown() {
  const reduced = useReducedMotion();
  const [secs, setSecs] = useState(25 * 60);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSecs((s) => (s <= 1 ? 25 * 60 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [reduced]);

  if (reduced) return <>25 min</>;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <>
      {mm}:{ss}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Cycling recent-meeting rows — swaps dataset every 4s with a fade.
--------------------------------------------------------------------------- */
const RECENT_SETS = [
  [
    { title: 'Sprint Retrospective', meta: 'Yesterday • 42 min' },
    { title: 'Marketing Sync', meta: 'live-meet-guh • 24 min' },
  ],
  [
    { title: 'Design Critique', meta: 'Yesterday • 31 min' },
    { title: 'Investor Update', meta: 'Monday • 55 min' },
  ],
  [
    { title: 'Onboarding Sync', meta: 'Friday • 18 min' },
    { title: 'Sprint Planning', meta: 'Thursday • 47 min' },
  ],
];

function RecentMeetings() {
  const reduced = useReducedMotion();
  const [setIndex, setSetIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSetIndex((i) => (i + 1) % RECENT_SETS.length), 4000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div key={setIndex} className="l-fade-swap" style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
      {RECENT_SETS[setIndex].map((m) => (
        <div key={m.title} style={{ padding: '6px 8px', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>{m.title}</div>
          <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{m.meta}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   HeroDashboardMockup — the floating 3D dashboard card with live details.
--------------------------------------------------------------------------- */
export function HeroDashboardMockup() {
  return (
    <div style={{ padding: '20px' }}>
      {/* Mockup Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '22px', height: '22px' }}>
            <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '15px' }}>recap</span>
        </div>

        <div
          className="landing-mock-search"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#94A3B8',
            width: '240px',
          }}
        >
          <Search size={13} />
          <span>Search meetings, transcripts...</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={16} color="#64748B" />
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>
            H
          </div>
        </div>
      </div>

      {/* Mockup Inner Body */}
      <div className="landing-mock-grid">
        {/* Left: Greeting & Next Meeting Card */}
        <div>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Good morning, Harsh</h3>
            <p style={{ fontSize: '12px', color: '#64748B' }}>Here&apos;s your meeting overview for today.</p>
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '10.5px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Next Meeting</span>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>Product Review</h4>
                <span style={{ fontSize: '11px', color: '#64748B' }}>10:00 AM – 10:45 AM • Google Meet</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '10px', color: '#64748B' }}>Starts in</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }} className="tabular-nums">
                  <Countdown />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3B82F6', color: '#FFF', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFF' }}>H</div>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#10B981', color: '#FFF', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFF' }}>M</div>
                <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '6px' }}>+3</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#0066FF', background: '#EBF3FF', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                  + Join Meeting
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', padding: '4px 8px', whiteSpace: 'nowrap' }}>View Details</span>
              </div>
            </div>
          </div>

          {/* Today's Schedule */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Today&apos;s Schedule</span>
              <span style={{ fontSize: '11px', color: '#0066FF', fontWeight: 600 }}>View Calendar →</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#FFF', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>10:00 AM</span>
                  <span style={{ color: '#475569', marginLeft: '8px' }}>Product Review</span>
                </div>
                <span style={{ color: '#0066FF', background: '#EBF3FF', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Upcoming</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#FFF', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>12:00 PM</span>
                  <span style={{ color: '#475569', marginLeft: '8px' }}>Team Sync</span>
                </div>
                <span style={{ color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', whiteSpace: 'nowrap' }}>Scheduled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Worker Status & Recent Meetings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
            <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>System Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span className="l-pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', '--pulse-c': 'rgba(16, 185, 129, 0.45)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>Online</span>
            </div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>Worker active • Last sync 2 min ago</span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Recent Meetings</span>
              <span style={{ fontSize: '10px', color: '#0066FF' }}>View all →</span>
            </div>
            <RecentMeetings />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Live recording card pieces (How It Works hero)
--------------------------------------------------------------------------- */
const WAVE_HEIGHTS = [30, 60, 40, 80, 50, 90, 70, 45, 85, 30, 60, 95, 40, 70, 80, 30, 50, 65, 85, 40];

function LiveWaveform() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} aria-hidden="true">
      {WAVE_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="l-wave-bar"
          style={{ width: '3px', height: `${h * 0.22}px`, background: '#0066FF', borderRadius: '1px', '--i': i }}
        />
      ))}
    </div>
  );
}

function RecTimer() {
  const reduced = useReducedMotion();
  const [secs, setSecs] = useState(24 * 60 + 18);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduced]);

  const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0F172A' }} className="tabular-nums">
      {hh}:{mm}:{ss}
    </span>
  );
}

const TRANSCRIPT_LINES = [
  { name: 'Sarah', color: '#0066FF', time: '00:09', text: "Let's start with the product roadmap for next quarter..." },
  { name: 'Rohan', color: '#10B981', time: '00:24', text: 'I think we should prioritize the analytics module.' },
  { name: 'Priya', color: '#8B5CF6', time: '00:51', text: 'Agreed. We can also look into improving onboarding...' },
];

function TypingTranscript() {
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let timer;
    const current = TRANSCRIPT_LINES[line];
    if (chars < current.text.length) {
      timer = setTimeout(() => setChars((c) => c + 1), 30);
    } else if (line < TRANSCRIPT_LINES.length - 1) {
      timer = setTimeout(() => {
        setLine((l) => l + 1);
        setChars(0);
      }, 800);
    } else {
      timer = setTimeout(() => {
        setLine(0);
        setChars(0);
      }, 3200);
    }
    return () => clearTimeout(timer);
  }, [line, chars, reduced]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px', minHeight: '132px' }}>
      {TRANSCRIPT_LINES.map((l, i) => {
        if (reduced || i < line) {
          return <TranscriptLine key={l.name} line={l} text={l.text} />;
        }
        if (i === line) {
          const partial = l.text.slice(0, chars);
          return <TranscriptLine key={l.name} line={l} text={partial} active />;
        }
        return null;
      })}
    </div>
  );
}

function TranscriptLine({ line, text, active = false }) {
  return (
    <div>
      <span style={{ fontWeight: 700, color: line.color }}>{line.name}</span>{' '}
      <span style={{ color: '#94A3B8', fontSize: '11px' }}>{line.time}</span>
      <p style={{ color: '#475569', marginTop: '2px' }}>
        {text}
        {active && <span className="l-caret" style={{ display: 'inline-block', width: '2px', height: '12px', background: '#0066FF', marginLeft: '2px', verticalAlign: '-1px' }} />}
      </p>
    </div>
  );
}

const CHECKLIST_STEPS = ['Transcribing audio', 'Identifying speakers', 'Generating summary', 'Extracting action items'];

function SummaryChecklist() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStep((s) => (s >= CHECKLIST_STEPS.length + 1 ? 0 : s + 1)), 1400);
    return () => clearInterval(id);
  }, [reduced]);

  const done = reduced ? CHECKLIST_STEPS.length : step;

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '12px 14px',
        background: '#FFFFFF',
        border: '1px solid #BFDBFE',
        borderRadius: '8px',
        boxShadow: '0 8px 20px rgba(0, 102, 255, 0.08)',
      }}
    >
      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0066FF' }}>
        {done > CHECKLIST_STEPS.length ? 'Summary ready!' : 'Generating summary...'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', fontSize: '11px', color: '#475569' }}>
        {CHECKLIST_STEPS.map((label, i) => {
          const isDone = i < done;
          const isActive = !reduced && i === done && done <= CHECKLIST_STEPS.length;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isDone || isActive ? 1 : 0.55 }}>
              {isDone ? (
                <Check size={12} color="#10B981" />
              ) : isActive ? (
                <Loader2 size={12} color="#0066FF" className="l-spin" />
              ) : (
                <span style={{ width: '12px', textAlign: 'center' }}>○</span>
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiveRecordingCard() {
  return (
    <div className="mockup-3d-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="l-pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', '--pulse-c': 'rgba(239, 68, 68, 0.45)' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Recording in progress...</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Video size={16} color="#00832d" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Google Meet</span>
        </div>
      </div>

      {/* Waveform and Timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
        <LiveWaveform />
        <RecTimer />
      </div>

      <TypingTranscript />
      <SummaryChecklist />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   LogoMarquee — infinite loop, pauses on hover, edges masked.
--------------------------------------------------------------------------- */
function LogoItem({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
      {children}
    </div>
  );
}

function LogoSet() {
  return (
    <>
      <LogoItem>
        <Video size={20} color="#00832d" />
        <span>Google Meet</span>
      </LogoItem>
      <LogoItem>
        <span style={{ padding: '2px 6px', background: '#000', color: '#FFF', borderRadius: '4px', fontSize: '12px' }}>N</span>
        <span style={{ color: '#0F172A' }}>Notion</span>
      </LogoItem>
      <LogoItem>
        <span style={{ color: '#4A154B' }}># Slack</span>
      </LogoItem>
      <LogoItem>
        <span style={{ color: '#0F172A' }}>Figma</span>
      </LogoItem>
      <LogoItem>
        <span style={{ color: '#0F172A' }}>Linear</span>
      </LogoItem>
    </>
  );
}

export function LogoMarquee() {
  return (
    <div className="l-marquee">
      <div className="l-marquee-track">
        <div className="l-marquee-set">
          <LogoSet />
        </div>
        <div className="l-marquee-set l-marquee-copy" aria-hidden="true">
          <LogoSet />
        </div>
      </div>
    </div>
  );
}
