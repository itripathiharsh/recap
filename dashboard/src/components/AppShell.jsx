'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navigation from './Navigation';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const isPublicRoute = pathname === '/' || pathname === '/login' || pathname === '/calendar/connect';

  useEffect(() => {
    // Initial session check once on mount
    async function getInitialSession() {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session || null);
      } catch (err) {
        console.error('AppShell session check error:', err);
      } finally {
        setLoading(false);
      }
    }

    getInitialSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'SIGNED_OUT' && !isPublicRoute) {
        router.replace('/login');
      } else if (event === 'SIGNED_IN' && pathname === '/login') {
        router.replace('/dashboard');
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Protect private routes in-memory without re-requesting network session
  useEffect(() => {
    if (!loading && !session && !isPublicRoute) {
      router.replace(`/login?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [loading, session, pathname, isPublicRoute, router]);

  // Landing page and Login page render without app chrome
  if (pathname === '/') {
    return <div className="landing-root">{children}</div>;
  }

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (pathname === '/calendar/connect') {
    return <>{children}</>;
  }

  // If loading session for a protected route, show clean loading state
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          gap: '12px',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        <div style={{ position: 'relative', width: '44px', height: '44px' }}>
          <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '13px' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  // If not authenticated on a protected route, prevent flashing protected content
  if (!session) {
    return null;
  }

  return (
    <div className="app-container">
      <Navigation session={session} />
      <main className="main-content">{children}</main>
    </div>
  );
}

