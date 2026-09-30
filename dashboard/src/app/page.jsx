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
  Sparkles,
  Video,
  FileText,
  UserCheck,
  Search,
  Calendar,
  Lock,
  ChevronDown,
  HelpCircle,
  Mail,
  Database,
  CheckSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Reveal, SlidingNav, TiltCard } from '../components/landing/motion';
import { Doodle, HeroDashboardMockup, LiveRecordingCard, LogoMarquee } from '../components/landing/mockups';

const NAV_TABS = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
];

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

  const handleTabChange = (id) => {
    setActiveTab(id);
    window.scrollTo({ top: 0 });
  };

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
          <Link href="/" className="landing-brand" style={{ gap: '12px' }}>
            <div style={{ position: 'relative', width: '44px', height: '44px' }}>
              <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
            </div>
            <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>recap</span>
          </Link>

          <SlidingNav tabs={NAV_TABS} active={activeTab} onChange={handleTabChange} />

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
          TAB 1: FEATURES / HOME VIEW
          ========================================================================= */}
      {activeTab === 'features' && (
        <>
          {/* Hero Section — entrance choreography (badge → headline → sub → CTA → trust) */}
          <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
            <div className="landing-split">
              {/* Left Column: Hero Text */}
              <div>
                <div className="landing-badge-pill hero-enter" style={{ marginBottom: '20px', animationDelay: '0ms' }}>
                  <span>From Meetings to Meaning</span>
                </div>

                <h1
                  className="hero-enter"
                  style={{
                    fontSize: 'clamp(36px, 4.5vw, 56px)',
                    fontWeight: 800,
                    lineHeight: 1.12,
                    letterSpacing: '-0.035em',
                    color: '#0F172A',
                    marginBottom: '20px',
                    animationDelay: '90ms',
                  }}
                >
                  Turn your meetings into <span className="gradient-text">meaningful progress.</span>
                </h1>

                <p
                  className="hero-enter"
                  style={{
                    fontSize: '16.5px',
                    lineHeight: 1.6,
                    color: '#475569',
                    maxWidth: '520px',
                    marginBottom: '32px',
                    animationDelay: '180ms',
                  }}
                >
                  recap automatically records, transcribes, and summarizes your Google Meet sessions — so you can focus on
                  conversations, not note-taking.
                </p>

                <div className="hero-enter" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '32px', animationDelay: '270ms' }}>
                  <Link href={signupTarget} className="landing-btn-primary" style={{ padding: '12px 26px', fontSize: '15px' }}>
                    <span>{session ? 'Open Dashboard' : 'Get Started Free'}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>

                  <Link href={authTarget} className="landing-btn-secondary" style={{ padding: '12px 22px', fontSize: '15px' }}>
                    <span>Launch Console</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>

                {/* Trust Badges */}
                <div className="hero-enter" style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: '#475569', fontWeight: 500, animationDelay: '360ms' }}>
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

              {/* Right Column: floating, pointer-tilting live dashboard mockup */}
              <div className="hero-enter" style={{ position: 'relative', animationDelay: '160ms' }}>
                <Doodle
                  text="Your meetings in one place."
                  variant={0}
                  arrowSize={34}
                  style={{ position: 'absolute', top: '-36px', right: '40px', zIndex: 10, alignItems: 'flex-end', gap: '6px' }}
                />
                <div className="l-float">
                  <TiltCard>
                    <HeroDashboardMockup />
                  </TiltCard>
                </div>
              </div>
            </div>
          </section>

          <div key="features-rest" className="l-view-enter">
            {/* Integrations Marquee */}
            <section style={{ borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', padding: '36px 24px', background: '#FAFCFF' }}>
              <div style={{ maxWidth: '1240px', margin: '0 auto', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600, marginBottom: '20px' }}>
                  Connects with the tools your team already uses
                </p>
                <LogoMarquee />
              </div>
            </section>

            {/* 6 Feature Pillars ("What recap does") */}
            <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '80px 24px' }}>
              <Reveal style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 56px' }}>
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
              </Reveal>

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
                  <Reveal key={item.title} delay={idx * 60}>
                    <div className="feature-card-clean" style={{ height: '100%' }}>
                      <div className="feature-icon-circle">{item.icon}</div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{item.title}</h3>
                      <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.55 }}>{item.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>

            {/* Curved CTA Banner */}
            <section style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 24px 80px' }}>
              <Reveal>
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

                  <Doodle
                    text="Less work. More progress."
                    variant={2}
                    arrowSize={40}
                    textStyle={{ transform: 'rotate(4deg)' }}
                    style={{ position: 'absolute', bottom: '24px', right: '48px' }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', fontSize: '12.5px', color: '#64748B', fontWeight: 500, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#10B981" aria-hidden="true" /> No credit card required
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#10B981" aria-hidden="true" /> Setup in minutes
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={13} color="#10B981" aria-hidden="true" /> Cancel anytime
                    </span>
                  </div>
                </div>
              </Reveal>
            </section>
          </div>
        </>
      )}

      {/* =========================================================================
          TAB 2: HOW IT WORKS VIEW
          ========================================================================= */}
      {activeTab === 'how-it-works' && (
        <section key="how-it-works" className="l-view-enter" style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div className="landing-split" style={{ marginBottom: '80px' }}>
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
              <Doodle
                text="Less meetings overhead. More progress."
                variant={1}
                style={{ position: 'absolute', top: '-34px', right: '30px', zIndex: 10, alignItems: 'flex-end', gap: '6px' }}
              />
              <div className="l-float">
                <LiveRecordingCard />
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
              <Reveal key={step.num} delay={i * 60}>
                <div className="feature-card-clean" style={{ position: 'relative', height: '100%' }}>
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
              </Reveal>
            ))}
          </div>

          {/* Tools & Testimonial Row */}
          <div className="landing-split-rev">
            <Reveal>
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
                  {['Google Meet', 'Google Calendar', 'Notion', 'Slack', 'Export (PDF)'].map((tool) => (
                    <div key={tool} style={{ background: '#FFF', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                      {tool}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
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
            </Reveal>
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 3: PRICING VIEW
          ========================================================================= */}
      {activeTab === 'pricing' && (
        <section key="pricing" className="l-view-enter" style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
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

            {/* Monthly / Yearly Toggle + Doodle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginTop: '28px', flexWrap: 'wrap' }}>
              <div className="l-toggle" data-active={billingPeriod} role="group" aria-label="Billing period">
                <span className="l-toggle-pill" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setBillingPeriod('monthly')}
                  className={`l-toggle-btn ${billingPeriod === 'monthly' ? 'active' : ''}`}
                  aria-pressed={billingPeriod === 'monthly'}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod('yearly')}
                  className={`l-toggle-btn ${billingPeriod === 'yearly' ? 'active' : ''}`}
                  aria-pressed={billingPeriod === 'yearly'}
                >
                  Yearly <span style={{ color: '#10B981', fontSize: '11px', marginLeft: '4px', fontWeight: 700 }}>Save 20%</span>
                </button>
              </div>

              <Doodle text="More meetings. More progress." variant={2} arrowSize={34} textStyle={{ transform: 'rotate(2deg)', fontSize: '20px', whiteSpace: 'nowrap' }} />
            </div>
          </div>

          {/* 3 Pricing Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '60px' }}>
            {/* Free */}
            <Reveal>
              <div className="feature-card-clean" style={{ padding: '36px', border: '1px solid #E2E8F0', height: '100%' }}>
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
                <Link href={signupTarget} className="landing-btn-secondary" style={{ width: '100%', marginTop: 'auto' }}>
                  Get Started
                </Link>
              </div>
            </Reveal>

            {/* Pro (Highlighted) */}
            <Reveal delay={80}>
              <div
                className="feature-card-clean"
                style={{
                  padding: '36px',
                  border: '2px solid #0066FF',
                  position: 'relative',
                  height: '100%',
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
                  <span key={billingPeriod} className="l-fade-swap tabular-nums" style={{ display: 'inline-block', fontSize: '42px', fontWeight: 800, color: '#0F172A' }}>
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
                <Link href={signupTarget} className="landing-btn-primary" style={{ width: '100%', marginTop: 'auto' }}>
                  Get Started
                </Link>
              </div>
            </Reveal>

            {/* Team */}
            <Reveal delay={160}>
              <div className="feature-card-clean" style={{ padding: '36px', border: '1px solid #E2E8F0', height: '100%' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Team</h3>
                <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>For growing teams</p>
                <div style={{ margin: '24px 0 18px' }}>
                  <span key={billingPeriod} className="l-fade-swap tabular-nums" style={{ display: 'inline-block', fontSize: '42px', fontWeight: 800, color: '#0F172A' }}>
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
                <a href="mailto:support@recap.ai?subject=Team%20plan%20enquiry" className="landing-btn-secondary" style={{ width: '100%', marginTop: 'auto' }}>
                  Contact Sales
                </a>
              </div>
            </Reveal>
          </div>

          {/* Value Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '80px' }}>
            {[
              { icon: <Check size={18} />, title: 'No credit card required', desc: 'Start using recap for free.' },
              { icon: <Zap size={18} />, title: 'Upgrade anytime', desc: 'Change plans as your needs grow.' },
              { icon: <Shield size={18} />, title: 'Cancel anytime', desc: 'No long-term contracts.' },
            ].map((b, i) => (
              <Reveal key={b.title} delay={i * 60}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '18px 24px', borderRadius: '12px', height: '100%' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0066FF', flexShrink: 0 }}>
                    {b.icon}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{b.title}</h4>
                    <p style={{ fontSize: '12px', color: '#64748B' }}>{b.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Compare Plans Matrix */}
          <Reveal>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '36px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Compare Plans</h3>
              <p style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '24px' }}>See what&apos;s included in each plan.</p>

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
                  ].map((row) => (
                    <tr key={row.name} style={{ borderBottom: '1px solid #F1F5F9' }}>
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
          </Reveal>
        </section>
      )}

      {/* =========================================================================
          TAB 4: SECURITY VIEW
          ========================================================================= */}
      {activeTab === 'security' && (
        <section key="security" className="l-view-enter" style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div className="landing-split" style={{ marginBottom: '80px' }}>
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
              <Doodle
                text="Safe meetings. Smarter outcomes."
                variant={1}
                textStyle={{ whiteSpace: 'nowrap' }}
                style={{ position: 'absolute', top: '-45px', right: '15px', zIndex: 10, alignItems: 'flex-end', gap: '6px' }}
              />

              {/* Central Shield Container */}
              <div
                className="landing-shield l-float"
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
                <div style={{ width: '140px', height: '160px', background: '#00A3FF', borderRadius: '18px 18px 65px 65px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 15px 35px rgba(0, 163, 255, 0.3)', flexShrink: 0 }}>
                  <Lock size={52} color="#FFFFFF" />
                </div>

                <div className="landing-shield-badge" style={{ position: 'absolute', top: '20px', left: '-50px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Lock size={13} color="#0066FF" /> <span>Encrypted in transit & at rest</span>
                </div>
                <div className="landing-shield-badge" style={{ position: 'absolute', top: '55px', right: '-45px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <UserCheck size={13} color="#10B981" /> <span>Your data, your control</span>
                </div>
                <div className="landing-shield-badge" style={{ position: 'absolute', bottom: '55px', left: '-55px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Video size={13} color="#00832d" /> <span>Secure Google Meet integration</span>
                </div>
                <div className="landing-shield-badge" style={{ position: 'absolute', bottom: '20px', right: '-45px', background: '#FFF', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', zIndex: 2 }}>
                  <Database size={13} color="#F59E0B" /> <span>No data used for AI training</span>
                </div>
              </div>
            </div>
          </div>

          {/* 6 Security Principles */}
          <Reveal style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>Our Security Principles</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', marginTop: '6px' }}>
              We follow industry best practices to ensure your data stays secure at every step.
            </p>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '80px' }}>
            {[
              { title: 'End-to-End Security', desc: 'Your data is encrypted in transit and at rest using industry-standard encryption protocols (TLS 1.3 & AES-256).' },
              { title: 'Your Data, Your Control', desc: 'You own your data and can access, export, or delete it anytime from the console.' },
              { title: 'No AI Training on Your Data', desc: 'Your meetings, transcripts, and summaries are never used to train public AI models.' },
              { title: 'Secure Google Meet Access', desc: 'We follow Google security guidelines and access permissions without recording background video.' },
              { title: 'Data Retention', desc: 'Raw audio recordings are stored for a limited time (7 days) and automatically deleted.' },
              { title: 'Compliance Ready', desc: 'We follow industry best practices and are committed to meeting global compliance requirements.' },
            ].map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 60}>
                <div className="feature-card-clean" style={{ height: '100%' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{p.title}</h3>
                  <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.55 }}>{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Privacy Matters Banner */}
          <Reveal>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px 40px', position: 'relative', marginBottom: '80px' }}>
              <div className="landing-split-even">
                <div>
                  <div className="landing-badge-pill" style={{ marginBottom: '14px' }}><span>Our Commitment</span></div>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '10px' }}>
                    Your privacy matters.
                  </h3>
                  <p style={{ fontSize: '14.5px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
                    We are committed to keeping your data safe, secure, and private. Recap is designed with enterprise-grade security practices and complies with industry standards.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFaqCategory('security');
                      handleTabChange('faq');
                    }}
                    className="landing-btn-primary"
                  >
                    <span>Read security answers in the FAQ</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Encrypted communication</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Secure infrastructure</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Role-based access controls</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Regular security reviews</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} color="#10B981" /> <span>Transparent data practices</span></div>
                </div>
              </div>

              <Doodle
                text="Trust in every meeting."
                variant={0}
                arrowSize={24}
                textStyle={{ transform: 'rotate(-4deg)' }}
                style={{ position: 'absolute', bottom: '24px', right: '40px', gap: '6px' }}
              />
            </div>
          </Reveal>

          {/* Compliance & Standards */}
          <Reveal style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A' }}>Compliance & Standards</h3>
            <p style={{ fontSize: '13.5px', color: '#64748B', marginTop: '4px' }}>
              We follow industry best practices and work towards global compliance standards.
            </p>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { name: 'SOC 2', desc: 'Security, Availability & Confidentiality' },
              { name: 'ISO 27001', desc: 'Information Security Management' },
              { name: 'GDPR', desc: 'Data Protection & Privacy' },
              { name: 'CCPA', desc: 'Consumer Privacy Compliance' },
            ].map((c, i) => (
              <Reveal key={c.name} delay={i * 60}>
                <div className="feature-card-clean" style={{ textAlign: 'center', padding: '24px 16px', height: '100%' }}>
                  <h4 style={{ fontSize: '18px', fontWeight: 800, color: '#0066FF' }}>{c.name}</h4>
                  <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 5: FAQ VIEW
          ========================================================================= */}
      {activeTab === 'faq' && (
        <section key="faq" className="l-view-enter" style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 24px 80px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 40px', position: 'relative' }}>
            <div className="landing-badge-pill" style={{ marginBottom: '14px' }}>
              <span>Frequently Asked Questions</span>
            </div>
            <h1 style={{ fontSize: 'clamp(36px, 4.5vw, 52px)', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              Everything you need to know about <span className="gradient-text">recap</span>.
            </h1>
            <p style={{ fontSize: '15.5px', color: '#64748B', marginTop: '10px' }}>
              Find answers to common questions about features, pricing, security, and more. Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
            </p>

            {/* Search Input — filters live as you type */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '520px', margin: '28px auto 0', background: '#FFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <Search size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search questions... (e.g. pricing, Google Meet, data security)"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13.5px', color: '#0F172A', minWidth: 0 }}
              />
            </div>

            <Doodle
              text="Answers that keep you moving forward."
              variant={2}
              className="landing-doodle-faq"
              textStyle={{ transform: 'rotate(6deg)' }}
              style={{ position: 'absolute', top: '-14px', right: '-110px', gap: '6px' }}
            />
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
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Accordion List */}
          <div className="landing-faq-grid" style={{ marginBottom: '80px' }}>
            {filteredFaqs.map((faq) => {
              const open = !!expandedFaq[faq.id];
              return (
                <div key={faq.id} className="accordion-item" style={{ marginBottom: 0 }}>
                  <button type="button" onClick={() => toggleFaq(faq.id)} className="accordion-trigger" aria-expanded={open}>
                    <span>{faq.q}</span>
                    <ChevronDown size={16} color={open ? '#0066FF' : '#64748B'} className={`accordion-chevron ${open ? 'open' : ''}`} />
                  </button>
                  <div className={`l-acc-panel ${open ? 'open' : ''}`}>
                    <div className="l-acc-inner">
                      <div style={{ padding: '0 20px 16px', fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                        {faq.a}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Still have questions? Help Card */}
          <Reveal>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '40px', position: 'relative' }}>
              <div style={{ maxWidth: '600px' }}>
                <div className="landing-badge-pill" style={{ marginBottom: '12px' }}><span>Still have questions?</span></div>
                <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                  We&apos;re here to help.
                </h3>
                <p style={{ fontSize: '14.5px', color: '#64748B', marginBottom: '24px' }}>
                  Can&apos;t find the answer you&apos;re looking for? Our team is happy to assist you.
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

              <Doodle
                text="Real people. Real support."
                variant={1}
                arrowSize={24}
                textStyle={{ transform: 'rotate(-6deg)' }}
                style={{ position: 'absolute', top: '30px', right: '40px' }}
              />
            </div>
          </Reveal>
        </section>
      )}

      {/* =========================================================================
          UNIVERSAL FOOTER
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
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`landing-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  style={{ padding: 0 }}
                >
                  {tab.label}
                </button>
              ))}
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
