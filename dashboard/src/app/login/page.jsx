'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Video,
  Users,
  FileText,
  Search,
  LayoutGrid,
  Play,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Check if already authenticated
  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        router.push(redirectTo);
      }
    }
    checkAuth();
  }, [redirectTo, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw error;
        }

        if (data?.session) {
          router.push(redirectTo);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: name.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data?.session) {
          router.push(redirectTo);
        } else {
          setSuccessMsg('Account created! You can now sign in with your credentials.');
          setMode('signin');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8FAFC',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Background Soft Glow Accents */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-5%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(224, 242, 254, 0.6) 0%, rgba(248, 250, 252, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '20%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239, 246, 255, 0.7) 0%, rgba(248, 250, 252, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        style={{
          maxWidth: '1360px',
          margin: '0 auto',
          padding: '32px 36px 40px',
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr',
          gap: '64px',
          minHeight: '100vh',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* =========================================================================
            LEFT COLUMN: BRANDING, PILLARS & 3D MOCKUP
            ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '20px' }}>
          {/* Brand Logo */}
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: '#0F172A',
              marginBottom: '32px',
            }}
          >
            <div style={{ position: 'relative', width: '40px', height: '40px' }}>
              <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
            </div>
            <span style={{ fontSize: '25px', fontWeight: 800, letterSpacing: '-0.035em' }}>recap</span>
          </Link>

          {/* Badge Pill */}
          <div style={{ marginBottom: '18px' }}>
            <div className="landing-badge-pill">
              <span>Your AI Meeting Companion</span>
            </div>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: '44px',
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.035em',
              color: '#0F172A',
              marginBottom: '18px',
            }}
          >
            Record less.<br />
            Remember <span style={{ color: '#0066FF' }}>more.</span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: '15.5px',
              lineHeight: 1.6,
              color: '#475569',
              maxWidth: '520px',
              marginBottom: '36px',
            }}
          >
            recap automatically joins your meetings, records, transcribes, summarizes, and helps you take action — so you can focus on what truly matters.
          </p>

          {/* 2x3 Feature Pillars Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px 32px',
              maxWidth: '540px',
              marginBottom: '44px',
            }}
          >
            {/* 1. Auto-join & Record */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <Video size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Auto-join &amp; Record</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Never miss a meeting</div>
              </div>
            </div>

            {/* 2. Speaker Identification */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <Users size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Speaker Identification</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Know who said what</div>
              </div>
            </div>

            {/* 3. AI Summaries */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <FileText size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>AI Summaries</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Get key insights instantly</div>
              </div>
            </div>

            {/* 4. Search Everything */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <Search size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Search Everything</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Find any moment in seconds</div>
              </div>
            </div>

            {/* 5. Action Items */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Action Items</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Turn decisions into progress</div>
              </div>
            </div>

            {/* 6. Works Across Platforms */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0066FF',
                  flexShrink: 0,
                }}
              >
                <LayoutGrid size={19} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Works Across Platforms</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '1px' }}>Meet, Teams, Zoom &amp; more</div>
              </div>
            </div>
          </div>

          {/* 3D Perspective Floating Card Mockup */}
          <div style={{ position: 'relative', maxWidth: '580px', marginTop: '10px' }}>
            {/* Cyan Handwriting Annotation (Top) */}
            <div
              style={{
                position: 'absolute',
                top: '-32px',
                right: '40px',
                zIndex: 10,
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
              }}
            >
              <span className="doodle-text" style={{ fontSize: '20px' }}>From conversations....</span>
              <svg width="36" height="36" viewBox="0 0 40 40" fill="none" style={{ transform: 'rotate(12deg)' }}>
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
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.12), 0 12px 24px -8px rgba(15, 23, 42, 0.08)',
                padding: '20px',
                transform: 'perspective(1200px) rotateX(2deg) rotateY(-3deg)',
                transition: 'transform 300ms ease',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px', gap: '16px' }}>
                {/* Mini Sidebar */}
                <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                    <div style={{ position: 'relative', width: '20px', height: '20px' }}>
                      <Image src="/logo.png" alt="recap" fill style={{ objectFit: 'contain' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 800 }}>recap</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', color: '#64748B' }}>
                    <div style={{ color: '#0066FF', fontWeight: 700 }}>● Dashboard</div>
                    <div>Meetings</div>
                    <div>Library</div>
                    <div>Insights</div>
                    <div>Settings</div>
                  </div>
                </div>

                {/* Center Content */}
                <div>
                  {/* Meeting Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Video size={11} color="#0066FF" />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Product Review</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>Mon, 21 Sept 2025 • 10:00 AM • 25 min</div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#0066FF', color: '#FFFFFF', padding: '3px 8px', borderRadius: '4px' }}>
                      Summary
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748B', padding: '3px 8px' }}>Transcript</span>
                    <span style={{ fontSize: '10px', color: '#64748B', padding: '3px 8px' }}>Action Items</span>
                    <span style={{ fontSize: '10px', color: '#64748B', padding: '3px 8px' }}>Insights</span>
                  </div>

                  {/* Key Takeaways */}
                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>Key Takeaways</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10.5px', color: '#475569' }}>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#0066FF' }} />
                        <span>Q4 roadmap is on track</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#0066FF' }} />
                        <span>Focus on user testing and feedback</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#0066FF' }} />
                        <span>Next release planned for October</span>
                      </li>
                    </ul>
                  </div>

                  {/* Waveform Player */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: '#F1F5F9', borderRadius: '6px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
                      <Play size={9} style={{ marginLeft: '1px' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }} className="tabular-nums">0:00 / 25:00</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
                      {[40, 70, 90, 60, 45, 80, 65, 95, 50, 85, 40, 60, 75, 45].map((h, i) => (
                        <div key={i} style={{ width: '3px', height: `${h * 0.14}px`, backgroundColor: '#0066FF', borderRadius: '1px' }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Portraits */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: '8px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E40AF', fontWeight: 700, fontSize: '15px' }}>
                    H
                  </div>
                  <div style={{ width: '46px', height: '46px', borderRadius: '8px', backgroundColor: '#FCE7F3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9D174D', fontWeight: 700, fontSize: '15px' }}>
                    A
                  </div>
                  <div style={{ width: '46px', height: '46px', borderRadius: '8px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065F46', fontWeight: 700, fontSize: '15px' }}>
                    M
                  </div>
                </div>
              </div>
            </div>

            {/* Cyan Handwriting Annotation (Bottom Right) */}
            <div
              style={{
                position: 'absolute',
                bottom: '-28px',
                right: '-10px',
                zIndex: 10,
              }}
            >
              <span className="doodle-text" style={{ fontSize: '20px' }}>...to meaningful progress.</span>
            </div>
          </div>

          {/* Bottom Tag */}
          <div style={{ marginTop: '54px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#94A3B8', textTransform: 'uppercase' }}>
            BUILT FOR A MORE PRODUCTIVE TOMORROW
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: TOP BAR, AUTH CARD, QUOTE & FOOTER
            ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Top Right Switcher */}
          <div style={{ width: '100%', maxWidth: '440px', display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{mode === 'signin' ? 'New here?' : 'Already have an account?'}</span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#0066FF',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                }}
              >
                {mode === 'signin' ? 'Create an account' : 'Sign In'}
              </button>
            </div>
          </div>

          {/* Main White Auth Card */}
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.08), 0 8px 16px -4px rgba(15, 23, 42, 0.04)',
              padding: '36px 36px 32px',
            }}
          >
            {/* Centered Logo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ position: 'relative', width: '36px', height: '36px' }}>
                <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
              </div>
              <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.035em', color: '#0F172A' }}>recap</span>
            </div>

            {/* Title & Subtitle */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0 }}>
                {mode === 'signin'
                  ? 'Sign in to continue to your meetings and insights.'
                  : 'Get started with recap for free.'}
              </p>
            </div>

            {/* Segmented Tabs (Sign In / Sign Up) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid #E2E8F0',
                marginBottom: '24px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                style={{
                  padding: '10px 16px',
                  fontSize: '13.5px',
                  fontWeight: mode === 'signin' ? 700 : 500,
                  color: mode === 'signin' ? '#0066FF' : '#64748B',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: mode === 'signin' ? '2.5px solid #0066FF' : '2.5px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                style={{
                  padding: '10px 16px',
                  fontSize: '13.5px',
                  fontWeight: mode === 'signup' ? 700 : 500,
                  color: mode === 'signup' ? '#0066FF' : '#64748B',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: mode === 'signup' ? '2.5px solid #0066FF' : '2.5px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Sign Up
              </button>
            </div>

            {/* Alerts */}
            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FEE2E2',
                  color: '#DC2626',
                  fontSize: '12.5px',
                  marginBottom: '18px',
                }}
              >
                <AlertCircle size={16} flexShrink={0} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #DCFCE7',
                  color: '#16A34A',
                  fontSize: '12.5px',
                  marginBottom: '18px',
                }}
              >
                <CheckCircle2 size={16} flexShrink={0} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {mode === 'signup' && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: '#0F172A',
                      marginBottom: '6px',
                    }}
                  >
                    Full Name
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User
                      size={16}
                      color="#94A3B8"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Harsh Vardhan"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13.5px',
                        color: '#0F172A',
                        outline: 'none',
                        backgroundColor: '#FFFFFF',
                      }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#0F172A',
                    marginBottom: '6px',
                  }}
                >
                  Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    color="#94A3B8"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="harsh@example.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13.5px',
                      color: '#0F172A',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#0F172A',
                    marginBottom: '6px',
                  }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={16}
                    color="#94A3B8"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{
                      width: '100%',
                      padding: '10px 38px 10px 36px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13.5px',
                      color: '#0F172A',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              {mode === 'signin' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Password reset link will be sent to your registered email.');
                    }}
                    style={{
                      fontSize: '12px',
                      color: '#0066FF',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Forgot your password?
                  </a>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#0066FF',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.8 : 1,
                  transition: 'background-color 150ms ease',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {/* Divider: OR CONTINUE WITH */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: '24px 0 20px',
                color: '#94A3B8',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }} />
              <span style={{ padding: '0 12px' }}>OR CONTINUE WITH</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }} />
            </div>

            {/* Social Logins (Google, Microsoft, GitHub) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
              {/* Google */}
              <button
                type="button"
                onClick={() => alert('Social authentication available with configured OAuth providers.')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google</span>
              </button>

              {/* Microsoft */}
              <button
                type="button"
                onClick={() => alert('Social authentication available with configured OAuth providers.')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                <span>Microsoft</span>
              </button>

              {/* GitHub */}
              <button
                type="button"
                onClick={() => alert('Social authentication available with configured OAuth providers.')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#0F172A">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub</span>
              </button>
            </div>

            {/* Bottom Link */}
            <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748B' }}>
              <span>{mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}</span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0066FF',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </button>
            </div>
          </div>

          {/* Quote Under Card */}
          <div style={{ textAlign: 'center', marginTop: '28px', maxWidth: '380px' }}>
            <p style={{ fontSize: '13px', color: '#64748B', fontStyle: 'italic', margin: 0 }}>
              &ldquo;Better conversations. A clearer tomorrow.&rdquo;
            </p>
            <span style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
              &mdash; recap
            </span>
          </div>

          {/* Footer Links (Privacy, Terms, Support) */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '24px', fontSize: '12px', color: '#94A3B8' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Terms</Link>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F8FAFC',
          }}
        >
          <Loader2 size={24} color="#0066FF" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
