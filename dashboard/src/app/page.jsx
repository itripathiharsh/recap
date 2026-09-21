'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  CheckCircle2,
  Check,
  Shield,
  Zap,
  Mic,
  Cpu,
  Sparkles,
  Video,
  FileText,
  UserCheck,
  Volume2,
  Search,
  Calendar,
  Lock,
  ChevronDown,
  ChevronUp,
  Play,
  Share2,
  Download,
  HelpCircle,
  Clock,
  Bell,
  Mail,
  Linkedin,
  Twitter,
  Youtube,
  Database,
  Layers,
  CheckSquare,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('features'); // 'features' | 'how-it-works' | 'pricing' | 'security' | 'faq'
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' | 'yearly'
  const [faqCategory, setFaqCategory] = useState('all');
  const [faqSearch, setFaqSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState({});

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session || null);
      } catch (e) {
        console.error('Landing page auth check error:', e);
      }
    }
    checkAuth();
  }, []);

  const authTarget = session ? '/dashboard' : '/login';
  const signupTarget = session ? '/dashboard' : '/login?mode=signup';

  const toggleFaq = (id) => {
    setExpandedFaq((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const faqs = [
    {
      id: 'g1',
      category: 'general',
      q: 'What is recap?',
      a: 'recap is an autonomous meeting intelligence platform that joins your Google Meet sessions silently, records 16kHz high-fidelity audio via virtual sinks, transcribes verbatim Hinglish and English dialogues, attributes real speakers, and outputs structured Minutes of Meeting.',
    },
    {
      id: 'g2',
      category: 'general',
      q: 'How does recap work?',
      a: 'recap monitors your scheduled meetings. At meeting time, a headless browser joins automatically through an isolated Xvfb display, captures clean audio without physical soundcard bleed, and executes our dual-cloud STT and LLM pipeline.',
    },
    {
      id: 'g3',
      category: 'general',
      q: 'Who is recap for?',
      a: 'recap is built for founders, engineering leads, product managers, and teams who want accurate meeting records, action items, and decisions without awkward bot interruptions or pricey enterprise subscriptions.',
    },
    {
      id: 'g4',
      category: 'general',
      q: 'Do I need to install any software?',
      a: 'No participant installation is required. The recorder daemon runs in the background on your server or local WSL2 environment, and the web console is accessible from any modern browser.',
    },
    {
      id: 'g5',
      category: 'general',
      q: 'Is recap free to use?',
      a: 'Yes! recap is engineered with a 100% free-tier architecture utilizing Google Gemini 2.5 Flash, Groq Whisper v3, pyannote.audio, and Supabase free quotas with zero monthly fees.',
    },
    {
      id: 'm1',
      category: 'meetings',
      q: 'Which meeting platforms are supported?',
      a: 'recap currently provides deep, native support for Google Meet (including automated admission, participant DOM scraping, and silent audio loopback).',
    },
    {
      id: 'm2',
      category: 'meetings',
      q: 'Do I need to invite a bot to my meeting?',
      a: 'No awkward bot invites or waiting room disruptions. recap joins directly via your meeting URL with a dedicated profile.',
    },
    {
      id: 'm3',
      category: 'meetings',
      q: 'Will recap join my meeting automatically?',
      a: 'Yes. Once a meeting is scheduled in the dashboard or synced via Google Calendar, the scheduler daemon claims and joins the call precisely at the start time.',
    },
    {
      id: 'm4',
      category: 'meetings',
      q: 'Can I record meetings without a Google account?',
      a: 'Yes, recap can join meetings as a guest attendee using your configured display name.',
    },
    {
      id: 'm5',
      category: 'meetings',
      q: 'What happens if I reschedule or cancel a meeting?',
      a: 'You can update or cancel meetings with one click in the web dashboard, and the scheduler will automatically adjust its queue.',
    },
    {
      id: 'f1',
      category: 'features',
      q: 'What kind of summaries does recap generate?',
      a: 'recap produces structured Executive MOM including an executive summary, key decisions made, action items with assigned owners, and unresolved questions.',
    },
    {
      id: 'f2',
      category: 'features',
      q: 'Can recap identify different speakers?',
      a: 'Yes! recap uses pyannote/speaker-diarization-3.1 neural voice embeddings combined with Gemini 2.5 Flash dialogue analysis and DOM participant scraping to assign real names.',
    },
    {
      id: 'f3',
      category: 'features',
      q: 'Does recap extract action items and decisions?',
      a: 'Yes, every turn is analyzed to extract actionable commitments, complete with assigned owners and deadlines.',
    },
    {
      id: 'f4',
      category: 'features',
      q: 'Can I search across past meetings?',
      a: 'Yes, full-text semantic search allows you to query transcripts, topics, speakers, and decisions across your entire meeting history.',
    },
    {
      id: 'f5',
      category: 'features',
      q: 'Can I edit the transcript or summary?',
      a: 'Yes, the dashboard provides one-click inline editing for speaker names, transcript turns, and generated summaries.',
    },
    {
      id: 'p1',
      category: 'pricing',
      q: 'How much does recap cost?',
      a: 'The core self-hosted and free-tier pipeline is $0/month. Cloud managed tiers start at $12/month for pro teams.',
    },
    {
      id: 'p2',
      category: 'pricing',
      q: 'Is there a free plan available?',
      a: 'Yes, our Free plan includes 5 meetings per month with full transcript, speaker diarization, and MOM generation.',
    },
    {
      id: 'p3',
      category: 'pricing',
      q: 'Can I change my plan later?',
      a: 'Yes, you can upgrade, downgrade, or cancel at any time with no lock-in.',
    },
    {
      id: 's1',
      category: 'security',
      q: 'Is my meeting data secure?',
      a: 'Yes. All data is encrypted in transit via TLS 1.3 and at rest with AES-256 in Supabase. Audio files are automatically purged after 7 days.',
    },
    {
      id: 's2',
      category: 'security',
      q: 'How long are recordings stored?',
      a: 'Raw audio recordings are automatically cleaned up after 7 days by default to protect storage and privacy. Transcripts and MOM are retained permanently.',
    },
    {
      id: 's3',
      category: 'security',
      q: 'Do you use my data to train AI models?',
      a: 'No. Neither recap nor our API providers (Google Cloud Gemini Enterprise and Groq) use customer meeting data for training public AI models.',
    },
  ];

  const filteredFaqs = faqs.filter((f) => {
    const matchesCategory = faqCategory === 'all' || f.category === faqCategory;
    const matchesSearch =
      faqSearch.trim() === '' ||
      f.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      f.a.toLowerCase().includes(faqSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="landing-root">
      {/* 1. Header / Navbar */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="landing-brand">
            <div style={{ position: 'relative', width: '32px', height: '32px' }}>
              <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
            </div>
            <span>recap</span>
          </Link>

          {/* Nav Tabs */}
          <nav className="landing-nav-tabs">
            {[
              { id: 'features', label: 'Features' },
              { id: 'how-it-works', label: 'How It Works' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'security', label: 'Security' },
              { id: 'faq', label: 'FAQ' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`landing-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              href={authTarget}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#475569',
                transition: 'color 120ms ease',
              }}
            >
              {session ? 'Console' : 'Sign in'}
            </Link>

            <Link href={signupTarget} className="landing-btn-primary">
              <span>{session ? 'Open Dashboard' : 'Get Started'}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* =========================================================================
          TAB 1: FEATURES / HOME VIEW (Image 1)
          ========================================================================= */}
      {activeTab === 'features' && (
        <>
          {/* Hero Section */}
          <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '48px', alignItems: 'center' }}>
              {/* Left Column: Hero Text */}
              <div>
                <div className="landing-badge-pill" style={{ marginBottom: '20px' }}>
                  <span>From Meetings to Meaning</span>
                </div>

                <h1
                  style={{
                    fontSize: 'clamp(36px, 4.5vw, 56px)',
                    fontWeight: 800,
                    lineHeight: 1.12,
                    letterSpacing: '-0.035em',
                    color: '#0F172A',
                    marginBottom: '20px',
                  }}
                >
                  Turn your meetings into <span className="gradient-text">meaningful progress.</span>
                </h1>

                <p
                  style={{
                    fontSize: '16.5px',
                    lineHeight: 1.6,
                    color: '#475569',
                    maxWidth: '520px',
                    marginBottom: '32px',
                  }}
                >
                  recap automatically records, transcribes, and summarizes your Google Meet sessions — so you can focus on
                  conversations, not note-taking.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '32px' }}>
                  <Link href={signupTarget} className="landing-btn-primary" style={{ padding: '12px 26px', fontSize: '15px' }}>
                    <span>{session ? 'Open Dashboard' : 'Get Started Free'}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>

                  <Link href={authTarget} className="landing-btn-secondary" style={{ padding: '12px 22px', fontSize: '15px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: '#EFF6FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Play size={10} color="#0066FF" style={{ marginLeft: '1px' }} />
                    </div>
                    <span>Launch Console</span>
                  </Link>
                </div>

                {/* Trust Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} color="#10B981" aria-hidden="true" />
                    <span>Works with Google Meet</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} color="#10B981" aria-hidden="true" />
                    <span>AI-powered insights</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} color="#10B981" aria-hidden="true" />
                    <span>Secure & private</span>
                  </div>
                </div>
              </div>

              {/* Right Column: 3D Perspective Floating Dashboard Mockup */}
              <div style={{ position: 'relative' }}>
                {/* Cyan Handwriting Annotation */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-36px',
                    right: '40px',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '6px',
                  }}
                >
                  <span className="doodle-text">Your meetings in one place.</span>
                  <svg width="34" height="34" viewBox="0 0 40 40" fill="none" style={{ transform: 'rotate(10deg)' }}>
                    <path
                      d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24"
                      stroke="#00A3FF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* 3D Tilted Card */}
                <div className="mockup-3d-wrapper">
                  <div className="mockup-3d-card" style={{ padding: '20px' }}>
                    {/* Mockup Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: '14px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                          <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>recap</span>
                      </div>

                      {/* Search Bar */}
                      <div
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px' }}>
                      {/* Left: Greeting & Next Meeting Card */}
                      <div>
                        <div style={{ marginBottom: '14px' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Good morning, Harsh</h3>
                          <p style={{ fontSize: '12px', color: '#64748B' }}>Here's your meeting overview for today.</p>
                        </div>

                        {/* Next Meeting Box */}
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div>
                              <span style={{ fontSize: '10.5px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Next Meeting</span>
                              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>Product Review</h4>
                              <span style={{ fontSize: '11px', color: '#64748B' }}>10:00 AM – 10:45 AM • Google Meet</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '10px', color: '#64748B' }}>Starts in</span>
                              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }} className="tabular-nums">25 min</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '-4px' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3B82F6', color: '#FFF', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFF' }}>H</div>
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#10B981', color: '#FFF', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFF' }}>M</div>
                              <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '6px' }}>+3</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0066FF', background: '#EBF3FF', padding: '4px 8px', borderRadius: '4px' }}>
                                + Join Meeting
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748B', padding: '4px 8px' }}>View Details</span>
                            </div>
                          </div>
                        </div>

                        {/* Today's Schedule */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Today's Schedule</span>
                            <span style={{ fontSize: '11px', color: '#0066FF', fontWeight: 600 }}>View Calendar →</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#FFF', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                              <div>
                                <span style={{ fontWeight: 600, color: '#0F172A' }}>10:00 AM</span>
                                <span style={{ color: '#475569', marginLeft: '8px' }}>Product Review</span>
                              </div>
                              <span style={{ color: '#0066FF', background: '#EBF3FF', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600 }}>Upcoming</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#FFF', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                              <div>
                                <span style={{ fontWeight: 600, color: '#0F172A' }}>12:00 PM</span>
                                <span style={{ color: '#475569', marginLeft: '8px' }}>Team Sync</span>
                              </div>
                              <span style={{ color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '3px', fontSize: '10px' }}>Scheduled</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Worker Status & Recent Meetings */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* System Status Box */}
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                          <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>System Status</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>Online</span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>Worker active • Last sync 2 min ago</span>
                        </div>

                        {/* Recent Meetings */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Recent Meetings</span>
                            <span style={{ fontSize: '10px', color: '#0066FF' }}>View all →</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                            <div style={{ padding: '6px 8px', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>Sprint Retrospective</div>
                              <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>Yesterday • 42 min</span>
                            </div>
                            <div style={{ padding: '6px 8px', border: '1px solid #EDF2F7', borderRadius: '6px' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>Marketing Sync</div>
                              <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>live-meet-guh • 24 min</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Logo Cloud */}
          <section style={{ borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', padding: '36px 24px', background: '#FAFCFF' }}>
            <div style={{ maxWidth: '1240px', margin: '0 auto', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600, marginBottom: '20px' }}>
                Trusted by teams who value their time
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '48px', flexWrap: 'wrap', opacity: 0.8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600, color: '#475569' }}>
                  <Video size={20} color="#00832d" />
                  <span>Google Meet</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 6px', background: '#000', color: '#FFF', borderRadius: '4px', fontSize: '12px' }}>N</span>
                  <span>Notion</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#4A154B' }}>
                  <span># Slack</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                  <span>Figma</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                  <span>Linear</span>
                </div>
              </div>
            </div>
          </section>

          {/* 6 Feature Pillars ("What recap does") */}
          <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '80px 24px' }}>
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 56px' }}>
              <div className="landing-badge-pill" style={{ marginBottom: '14px' }}>
                <span>What recap does</span>
              </div>
              <h2 style={{ fontSize: '34px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                More than transcription. <br />
                A complete <span className="gradient-text">meeting companion</span>.
              </h2>
              <p style={{ fontSize: '15px', color: '#64748B', marginTop: '12px' }}>
                recap helps you understand, organize, and act on what matters from your meetings.
              </p>
            </div>

            {/* 6 Grid Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {[
                {
                  icon: <Mic size={20} />,
                  title: 'Automatic Recording',
                  desc: 'Joins your Google Meet and records automatically with zero participant disruption.',
                },
                {
                  icon: <FileText size={20} />,
                  title: 'Accurate Transcripts',
                  desc: 'Clean transcripts with speaker identification and verbatim Hinglish code-switching.',
                },
                {
                  icon: <Sparkles size={20} />,
                  title: 'AI Summaries',
                  desc: 'Concise executive summaries of key discussions, decisions, and context.',
                },
                {
                  icon: <CheckSquare size={20} />,
                  title: 'Action Items',
                  desc: 'Extract and track action items automatically with assigned owners and deadlines.',
                },
                {
                  icon: <HelpCircle size={20} />,
                  title: 'Open Questions',
                  desc: 'Identify unresolved questions and follow ups that need team alignment.',
                },
                {
                  icon: <Search size={20} />,
                  title: 'Search Everything',
                  desc: 'Find information, decisions, and exact quotes across all your past meetings instantly.',
                },
              ].map((item, idx) => (
                <div key={idx} className="feature-card-clean">
                  <div className="feature-icon-circle">{item.icon}</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{item.title}</h3>
                  <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.55 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Curved CTA Banner */}
          <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 24px 80px' }}>
            <div className="cta-curved-banner">
              <div className="landing-badge-pill" style={{ marginBottom: '14px', background: '#FFFFFF' }}>
                <span>Get started today</span>
              </div>
              <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em', marginBottom: '10px' }}>
                Ready to make your meetings more meaningful?
              </h2>
              <p style={{ fontSize: '15px', color: '#475569', marginBottom: '28px' }}>
                Join teams that turn conversations into real outcomes.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '24px' }}>
                <Link href={signupTarget} className="landing-btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
                  <span>{session ? 'Open Dashboard' : 'Get Started Free'}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link href={authTarget} className="landing-btn-secondary" style={{ padding: '12px 22px', fontSize: '15px' }}>
                  <span>Launch Console</span>
                </Link>
              </div>

              {/* Cyan Doodle on CTA */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  right: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="40" height="30" viewBox="0 0 50 30" fill="none">
                  <path d="M4 18 C 18 26, 32 24, 46 8 M 38 6 L 46 8 L 44 18" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="doodle-text" style={{ transform: 'rotate(4deg)' }}>Less work. More progress.</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', fontSize: '12.5px', color: '#64748B', fontWeight: 500, flexWrap: 'wrap' }}>
                <span>✓ No credit card required</span>
                <span>✓ Setup in minutes</span>
                <span>✓ Cancel anytime</span>
              </div>
            </div>
          </section>
        </>
      )}

      {/* =========================================================================
          TAB 2: HOW IT WORKS VIEW (Image 2)
          ========================================================================= */}
      {activeTab === 'how-it-works' && (
        <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '48px', alignItems: 'center', marginBottom: '80px' }}>
            <div>
              <div className="landing-badge-pill" style={{ marginBottom: '18px' }}>
                <span>Simple. Seamless. Powerful.</span>
              </div>
              <h1 style={{ fontSize: 'clamp(36px, 4.5vw, 54px)', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.035em', lineHeight: 1.15, marginBottom: '20px' }}>
                From meeting to meaning in <span className="gradient-text">four simple steps</span>.
              </h1>
              <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.6, maxWidth: '520px' }}>
                recap works quietly in the background so you can stay focused on what matters — the conversation.
              </p>
            </div>

            {/* In-Meeting Live Recording Card */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-34px',
                  right: '30px',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '6px',
                }}
              >
                <span className="doodle-text">Less meetings overhead. More progress.</span>
                <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
                  <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="mockup-3d-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 8px #EF4444' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Recording in progress...</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Video size={16} color="#00832d" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Google Meet</span>
                  </div>
                </div>

                {/* Waveform and Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {[30, 60, 40, 80, 50, 90, 70, 45, 85, 30, 60, 95, 40, 70, 80, 30, 50, 65, 85, 40].map((h, i) => (
                      <span key={i} style={{ width: '3px', height: `${h * 0.22}px`, background: '#0066FF', borderRadius: '1px' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0F172A' }} className="tabular-nums">
                    00:24:18
                  </span>
                </div>

                {/* Speaker Turns Stream */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#0066FF' }}>Sarah</span> <span style={{ color: '#94A3B8', fontSize: '11px' }}>00:09</span>
                    <p style={{ color: '#475569', marginTop: '2px' }}>Let's start with the product roadmap for next quarter...</p>
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, color: '#10B981' }}>Rohan</span> <span style={{ color: '#94A3B8', fontSize: '11px' }}>00:24</span>
                    <p style={{ color: '#475569', marginTop: '2px' }}>I think we should prioritize the analytics module.</p>
                  </div>
                  <div>
                    <span style={{ fontWeight: 700, color: '#8B5CF6' }}>Priya</span> <span style={{ color: '#94A3B8', fontSize: '11px' }}>00:51</span>
                    <p style={{ color: '#475569', marginTop: '2px' }}>Agreed. We can also look into improving onboarding...</p>
                  </div>
                </div>

                {/* Floating "Generating summary..." Box */}
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
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0066FF' }}>Generating summary...</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', fontSize: '11px', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={12} color="#10B981" /> <span>Transcribing audio</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={12} color="#10B981" /> <span>Identifying speakers</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Radio size={12} color="#0066FF" /> <span>Generating summary</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                      <span>○ Extracting action items</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Steps Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '80px' }}>
            {[
              {
                num: '1',
                icon: <Calendar size={22} />,
                title: 'Schedule or Connect',
                desc: 'Add your Google Meet link or connect your calendar. Recap takes care of the rest.',
              },
              {
                num: '2',
                icon: <Mic size={22} />,
                title: 'We Record',
                desc: 'Recap joins the meeting and records automatically (no bots disrupting your call).',
              },
              {
                num: '3',
                icon: <FileText size={22} />,
                title: 'AI Processes',
                desc: 'Your meeting is transcribed, speakers are identified, and key insights are generated.',
              },
              {
                num: '4',
                icon: <CheckSquare size={22} />,
                title: 'Get Meaningful Results',
                desc: 'View summaries, decisions, action items, and more — all in one place.',
              },
            ].map((step, i) => (
              <div key={i} className="feature-card-clean" style={{ position: 'relative' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#0066FF',
                    color: '#FFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                  }}
                >
                  {step.num}
                </div>
                <div className="feature-icon-circle">{step.icon}</div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '6px' }}>{step.title}</h3>
                <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Tools & Testimonial Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px', alignItems: 'center' }}>
            {/* Tools */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '36px' }}>
              <div className="landing-badge-pill" style={{ marginBottom: '14px' }}>
                <span>Works with your existing tools</span>
              </div>
              <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                Built for the tools you already use.
              </h3>
              <p style={{ fontSize: '14.5px', color: '#64748B', marginBottom: '24px' }}>
                recap integrates seamlessly with your workflow.
              </p>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {['Google Meet', 'Google Calendar', 'Notion', 'Slack', 'Export (PDF)'].map((tool, idx) => (
                  <div key={idx} style={{ background: '#FFF', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                    {tool}
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonial Quote */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '36px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: '36px', color: '#0066FF', lineHeight: 1, fontFamily: 'serif' }}>“</span>
              <p style={{ fontSize: '16px', color: '#0F172A', fontWeight: 500, lineHeight: 1.6, marginTop: '4px', marginBottom: '20px' }}>
                Recap saves me hours every week. The summaries and action items are spot on.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0066FF' }}>
                  PS
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Priya S.</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Product Manager</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 3: PRICING VIEW (Image 3)
          ========================================================================= */}
      {activeTab === 'pricing' && (
        <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: '760px', margin: '0 auto 48px' }}>
            <div className="landing-badge-pill" style={{ marginBottom: '14px' }}>
              <span>Simple, Transparent Pricing</span>
            </div>
            <h1 style={{ fontSize: 'clamp(34px, 4.5vw, 50px)', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '12px' }}>
              Choose the plan that fits <span className="gradient-text">your team</span>.
            </h1>
            <p style={{ fontSize: '15.5px', color: '#64748B', maxWidth: '520px', margin: '0 auto' }}>
              Start free and upgrade as you grow. No hidden fees.
            </p>

            {/* Monthly / Yearly Toggle + Non-colliding Doodle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginTop: '28px', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '9999px' }}>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  style={{
                    padding: '6px 20px',
                    borderRadius: '9999px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: billingPeriod === 'monthly' ? '#0066FF' : '#64748B',
                    background: billingPeriod === 'monthly' ? '#FFFFFF' : 'transparent',
                    boxShadow: billingPeriod === 'monthly' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('yearly')}
                  style={{
                    padding: '6px 20px',
                    borderRadius: '9999px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: billingPeriod === 'yearly' ? '#0066FF' : '#64748B',
                    background: billingPeriod === 'yearly' ? '#FFFFFF' : 'transparent',
                    boxShadow: billingPeriod === 'yearly' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Yearly <span style={{ color: '#10B981', fontSize: '11px', marginLeft: '4px', fontWeight: 700 }}>Save 20%</span>
                </button>
              </div>

              {/* Clean Doodle Placed Next to Toggle (Never collides with title) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="34" height="24" viewBox="0 0 40 30" fill="none" style={{ transform: 'rotate(-5deg)' }}>
                  <path d="M4 8 C 18 18, 28 20, 36 28 M 26 28 L 36 28 L 36 18" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="doodle-text" style={{ transform: 'rotate(2deg)', fontSize: '20px', whiteSpace: 'nowrap' }}>
                  More meetings. More progress.
                </span>
              </div>
            </div>
          </div>

          {/* 3 Pricing Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '60px' }}>
            {/* Free */}
            <div className="feature-card-clean" style={{ padding: '36px', border: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Free</h3>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>For individuals getting started</p>
              <div style={{ margin: '24px 0 18px' }}>
                <span style={{ fontSize: '42px', fontWeight: 800, color: '#0F172A' }}>$0</span>
                <span style={{ fontSize: '14px', color: '#64748B', marginLeft: '6px' }}>/ month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#475569', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>5 meetings per month</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Transcripts & summaries</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Basic search</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Google Meet integration</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Standard support</span></div>
              </div>
              <Link href={signupTarget} className="landing-btn-secondary" style={{ width: '100%' }}>
                Get Started
              </Link>
            </div>

            {/* Pro (Highlighted) */}
            <div
              className="feature-card-clean"
              style={{
                padding: '36px',
                border: '2px solid #0066FF',
                position: 'relative',
                boxShadow: '0 20px 40px -10px rgba(0, 102, 255, 0.15)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '24px',
                  background: '#00A3FF',
                  color: '#FFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 12px',
                  borderRadius: '9999px',
                }}
              >
                Most Popular
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Pro</h3>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>For professionals and small teams</p>
              <div style={{ margin: '24px 0 18px' }}>
                <span style={{ fontSize: '42px', fontWeight: 800, color: '#0F172A' }}>
                  {billingPeriod === 'monthly' ? '$12' : '$10'}
                </span>
                <span style={{ fontSize: '14px', color: '#64748B', marginLeft: '6px' }}>/ month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#475569', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Unlimited meetings</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>AI summaries & action items</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Speaker identification</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Advanced search</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Export (PDF, Notion, etc.)</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Calendar integration</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Priority support</span></div>
              </div>
              <Link href={signupTarget} className="landing-btn-primary" style={{ width: '100%' }}>
                Get Started
              </Link>
            </div>

            {/* Team */}
            <div className="feature-card-clean" style={{ padding: '36px', border: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Team</h3>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>For growing teams</p>
              <div style={{ margin: '24px 0 18px' }}>
                <span style={{ fontSize: '42px', fontWeight: 800, color: '#0F172A' }}>
                  {billingPeriod === 'monthly' ? '$29' : '$24'}
                </span>
                <span style={{ fontSize: '14px', color: '#64748B', marginLeft: '6px' }}>/ month per user</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#475569', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Everything in Pro</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Team workspace</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Shared meeting library</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Admin controls</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Usage analytics</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>SSO (coming soon)</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="#10B981" /> <span>Dedicated support</span></div>
              </div>
              <Link href={signupTarget} className="landing-btn-secondary" style={{ width: '100%' }}>
                Contact Sales
              </Link>
            </div>
          </div>

          {/* Value Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '18px 24px', borderRadius: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0066FF' }}>
                <Check size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>No credit card required</h4>
                <p style={{ fontSize: '12px', color: '#64748B' }}>Start using recap for free.</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '18px 24px', borderRadius: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0066FF' }}>
                <Zap size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Upgrade anytime</h4>
                <p style={{ fontSize: '12px', color: '#64748B' }}>Change plans as your needs grow.</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '18px 24px', borderRadius: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0066FF' }}>
                <Shield size={18} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Cancel anytime</h4>
                <p style={{ fontSize: '12px', color: '#64748B' }}>No long-term contracts.</p>
              </div>
            </div>
          </div>

          {/* Compare Plans Matrix */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '36px', overflowX: 'auto' }}>
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Compare Plans</h3>
            <p style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '24px' }}>See what's included in each plan.</p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>Feature</th>
                  <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, width: '160px' }}>Free</th>
                  <th style={{ padding: '12px 16px', color: '#0066FF', fontWeight: 700, width: '160px', background: '#F0F7FF' }}>Pro</th>
                  <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, width: '160px' }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Meetings per month', free: '5', pro: 'Unlimited', team: 'Unlimited' },
                  { name: 'AI summaries', free: true, pro: true, team: true },
                  { name: 'Action items', free: false, pro: true, team: true },
                  { name: 'Speaker identification', free: false, pro: true, team: true },
                  { name: 'Advanced search', free: false, pro: true, team: true },
                  { name: 'Export (PDF, Notion, etc.)', free: false, pro: true, team: true },
                  { name: 'Team workspace', free: false, pro: false, team: true },
                  { name: 'Admin controls', free: false, pro: false, team: true },
                  { name: 'Priority support', free: false, pro: true, team: true },
                  { name: 'SSO (coming soon)', free: false, pro: false, team: true },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 500, color: '#0F172A' }}>{row.name}</td>
                    <td style={{ padding: '14px 16px', color: '#64748B' }}>
                      {typeof row.free === 'boolean' ? (row.free ? <Check size={16} color="#10B981" /> : '—') : row.free}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#0066FF', fontWeight: 600, background: '#F0F7FF' }}>
                      {typeof row.pro === 'boolean' ? (row.pro ? <Check size={16} color="#10B981" /> : '—') : row.pro}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748B' }}>
                      {typeof row.team === 'boolean' ? (row.team ? <Check size={16} color="#10B981" /> : '—') : row.team}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 4: SECURITY VIEW (Image 4)
          ========================================================================= */}
      {activeTab === 'security' && (
        <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '48px', alignItems: 'center', marginBottom: '80px' }}>
            <div>
              <div className="landing-badge-pill" style={{ marginBottom: '18px' }}>
                <span>Your Data, Your Control</span>
              </div>
              <h1 style={{ fontSize: 'clamp(36px, 4.5vw, 54px)', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.035em', lineHeight: 1.15, marginBottom: '20px' }}>
                Built with privacy and <span className="gradient-text">security in mind</span>.
              </h1>
              <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.6, maxWidth: '520px', marginBottom: '28px' }}>
                Your meetings contain important conversations. We take security seriously and are committed to keeping your data
                safe, private, and under your control.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Secure by design</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Privacy focused</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Transparent practices</span></div>
              </div>
            </div>

            {/* Security Shield Graphic */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', padding: '20px 0' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-45px',
                  right: '15px',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '6px',
                }}
              >
                <span className="doodle-text" style={{ whiteSpace: 'nowrap' }}>Safe meetings. Smarter outcomes.</span>
                <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
                  <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Central Shield Container */}
              <div
                style={{
                  width: '360px',
                  height: '360px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, #EBF5FF 0%, #FFFFFF 70%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ width: '140px', height: '160px', background: '#00A3FF', borderRadius: '18px 18px 65px 65px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 15px 35px rgba(0, 163, 255, 0.3)' }}>
                  <Lock size={52} color="#FFFFFF" />
                </div>

                {/* Floating Badges - Spaced Out With No Collisions */}
                <div style={{ position: 'absolute', top: '20px', left: '-50px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Lock size={13} color="#0066FF" /> <span>Encrypted in transit & at rest</span>
                </div>
                <div style={{ position: 'absolute', top: '55px', right: '-45px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <UserCheck size={13} color="#10B981" /> <span>Your data, your control</span>
                </div>
                <div style={{ position: 'absolute', bottom: '55px', left: '-55px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Video size={13} color="#00832d" /> <span>Secure Google Meet integration</span>
                </div>
                <div style={{ position: 'absolute', bottom: '20px', right: '-45px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Database size={13} color="#F59E0B" /> <span>No data used for AI training</span>
                </div>
              </div>
            </div>
          </div>

          {/* 6 Security Principles */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>Our Security Principles</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', marginTop: '6px' }}>
              We follow industry best practices to ensure your data stays secure at every step.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '80px' }}>
            {[
              { title: 'End-to-End Security', desc: 'Your data is encrypted in transit and at rest using industry-standard encryption protocols (TLS 1.3 & AES-256).' },
              { title: 'Your Data, Your Control', desc: 'You own your data and can access, export, or delete it anytime from the console.' },
              { title: 'No AI Training on Your Data', desc: 'Your meetings, transcripts, and summaries are never used to train public AI models.' },
              { title: 'Secure Google Meet Access', desc: 'We follow Google security guidelines and access permissions without recording background video.' },
              { title: 'Data Retention', desc: 'Raw audio recordings are stored for a limited time (7 days) and automatically deleted.' },
              { title: 'Compliance Ready', desc: 'We follow industry best practices and are committed to meeting global compliance requirements.' },
            ].map((p, i) => (
              <div key={i} className="feature-card-clean">
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{p.title}</h3>
                <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.55 }}>{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Privacy Matters Banner */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px 40px', position: 'relative', marginBottom: '80px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '40px', alignItems: 'center' }}>
              <div>
                <div className="landing-badge-pill" style={{ marginBottom: '14px' }}><span>Our Commitment</span></div>
                <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '10px' }}>
                  Your privacy matters.
                </h3>
                <p style={{ fontSize: '14.5px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
                  We are committed to keeping your data safe, secure, and private. Recap is designed with enterprise-grade security practices and complies with industry standards.
                </p>
                <Link href="/dashboard" className="landing-btn-primary">
                  <span>Learn more about our security practices</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Encrypted communication</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Secure infrastructure</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Role-based access controls</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Regular security reviews</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Transparent data practices</span></div>
              </div>
            </div>

            {/* Cyan Doodle */}
            <div style={{ position: 'absolute', bottom: '24px', right: '40px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="doodle-text" style={{ transform: 'rotate(-4deg)' }}>Trust in every meeting.</span>
              <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Compliance & Standards */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A' }}>Compliance & Standards</h3>
            <p style={{ fontSize: '13.5px', color: '#64748B', marginTop: '4px' }}>
              We follow industry best practices and work towards global compliance standards.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { name: 'SOC 2', desc: 'Security, Availability & Confidentiality' },
              { name: 'ISO 27001', desc: 'Information Security Management' },
              { name: 'GDPR', desc: 'Data Protection & Privacy' },
              { name: 'CCPA', desc: 'Consumer Privacy Compliance' },
            ].map((c, idx) => (
              <div key={idx} className="feature-card-clean" style={{ textAlign: 'center', padding: '24px 16px' }}>
                <h4 style={{ fontSize: '18px', fontWeight: 800, color: '#0066FF' }}>{c.name}</h4>
                <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 5: FAQ VIEW (Image 5)
          ========================================================================= */}
      {activeTab === 'faq' && (
        <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 40px', position: 'relative' }}>
            <div className="landing-badge-pill" style={{ marginBottom: '14px' }}>
              <span>Frequently Asked Questions</span>
            </div>
            <h1 style={{ fontSize: 'clamp(36px, 4.5vw, 52px)', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              Everything you need to know about <span className="gradient-text">recap</span>.
            </h1>
            <p style={{ fontSize: '15.5px', color: '#64748B', marginTop: '10px' }}>
              Find answers to common questions about features, pricing, security, and more. Can't find what you're looking for? We're here to help.
            </p>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '520px', margin: '28px auto 0', background: '#FFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 6px 4px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <Search size={16} color="#94A3B8" />
              <input
                type="text"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search questions... (e.g. pricing, Google Meet, data security)"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13.5px', color: '#0F172A' }}
              />
              <button type="button" className="landing-btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>
                Search
              </button>
            </div>

            {/* Cyan Doodle */}
            <div style={{ position: 'absolute', top: '40px', right: '-60px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="doodle-text" style={{ transform: 'rotate(6deg)' }}>Answers that keep you moving forward.</span>
              <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
                <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '40px' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'general', label: 'General' },
              { id: 'meetings', label: 'Meetings' },
              { id: 'features', label: 'Features' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'security', label: 'Security' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFaqCategory(cat.id)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: faqCategory === cat.id ? '#FFFFFF' : '#475569',
                  background: faqCategory === cat.id ? '#0066FF' : '#F1F5F9',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 120ms ease, color 120ms ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Accordion 2-Column List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px', marginBottom: '80px' }}>
            {filteredFaqs.map((faq) => (
              <div key={faq.id} className="accordion-item">
                <button type="button" onClick={() => toggleFaq(faq.id)} className="accordion-trigger">
                  <span>{faq.q}</span>
                  {expandedFaq[faq.id] ? <ChevronUp size={16} color="#0066FF" /> : <ChevronDown size={16} color="#64748B" />}
                </button>
                {expandedFaq[faq.id] && (
                  <div style={{ padding: '0 20px 16px', fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Still have questions? Help Card */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '40px', position: 'relative' }}>
            <div style={{ maxWidth: '600px' }}>
              <div className="landing-badge-pill" style={{ marginBottom: '12px' }}><span>Still have questions?</span></div>
              <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                We're here to help.
              </h3>
              <p style={{ fontSize: '14.5px', color: '#64748B', marginBottom: '24px' }}>
                Can't find the answer you're looking for? Our team is happy to assist you.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href={authTarget} className="landing-btn-primary">
                  <span>Contact Support</span>
                  <ArrowRight size={14} />
                </Link>
                <a href="mailto:support@recap.ai" className="landing-btn-secondary">
                  <Mail size={14} color="#64748B" />
                  <span>Send us an Email</span>
                </a>
              </div>
            </div>

            {/* Cyan Doodle */}
            <div style={{ position: 'absolute', top: '30px', right: '40px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="doodle-text" style={{ transform: 'rotate(-6deg)' }}>Real people. Real support.</span>
              <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                <path d="M6 8 C 18 14, 28 22, 32 34 M 22 34 L 32 34 L 34 24" stroke="#00A3FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          UNIVERSAL FOOTER (Clean 2026 Product Design)
          ========================================================================= */}
      <footer style={{ borderTop: '1px solid #EDF2F7', padding: '60px 24px 48px', background: '#FFFFFF' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '36px' }}>
          {/* Left: Big Footer Logo + Tagline + 2026 Copyright */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative', width: '300px', height: '100px' }}>
              <Image
                src="/landing-footer-logo.png"
                alt="recap logo"
                fill
                style={{ objectFit: 'contain', objectPosition: 'left center' }}
                priority
              />
            </div>
            <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '380px', lineHeight: 1.55 }}>
              From Meetings to Meaning. Autonomous Google Meet recording, transcription, and executive intelligence.
            </p>
            <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 500 }}>
              © 2026 recap. All rights reserved.
            </span>
          </div>

          {/* Right: Product Navigation & Launch Console */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '14px', fontWeight: 600, color: '#475569', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setActiveTab('features')} className={`landing-tab-btn ${activeTab === 'features' ? 'active' : ''}`} style={{ padding: 0 }}>Features</button>
              <button type="button" onClick={() => setActiveTab('how-it-works')} className={`landing-tab-btn ${activeTab === 'how-it-works' ? 'active' : ''}`} style={{ padding: 0 }}>How It Works</button>
              <button type="button" onClick={() => setActiveTab('pricing')} className={`landing-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`} style={{ padding: 0 }}>Pricing</button>
              <button type="button" onClick={() => setActiveTab('security')} className={`landing-tab-btn ${activeTab === 'security' ? 'active' : ''}`} style={{ padding: 0 }}>Security</button>
              <button type="button" onClick={() => setActiveTab('faq')} className={`landing-tab-btn ${activeTab === 'faq' ? 'active' : ''}`} style={{ padding: 0 }}>FAQ</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>Google Meet Native • Free-Tier Cloud Pipeline</span>
              <Link href={authTarget} className="landing-btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>
                <span>Launch Console</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

