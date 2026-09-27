'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  BookOpen,
  Lightbulb,
  Settings,
  LogOut,
  Menu,
  X,
  LayoutGrid,
  Users,
  BarChart3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function Navigation({ session }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeOrgId, isOrganisation } = useWorkspace();
  // Below 900px the sidebar is an off-canvas drawer (see globals.css), so it
  // needs an open state and a way to dismiss it.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [meetingCount, setMeetingCount] = useState(null);
  const [userProfile, setUserProfile] = useState({
    name: session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Account',
    email: session?.user?.email || '',
  });

  useEffect(() => {
    async function checkCount() {
      try {
        const { count } = await applyWorkspaceScope(
          supabase.from('meetings').select('id', { count: 'exact', head: true }),
          activeOrgId
        );
        setMeetingCount(count);
      } catch (err) {
        console.error('Sidebar data fetch error:', err);
      }
    }

    checkCount();
    const interval = setInterval(checkCount, 60000);
    return () => clearInterval(interval);
  }, [activeOrgId]);

  // Identity comes from the session, which is authoritative. The previous code
  // read `public."User"` and rewrote one specific name
  // (`name === 'Harsh' ? 'Harsh Vardhan Tripathi' : name`); that table does not
  // exist in this project, so this always fell back to the email local-part.
  useEffect(() => {
    const u = session?.user;
    if (!u) return;
    const name =
      u.user_metadata?.full_name ||
      u.user_metadata?.name ||
      (u.email ? u.email.split('@')[0] : 'Account');
    setUserProfile({ name, email: u.email || '' });
  }, [session]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/meetings', label: 'Meetings', icon: CalendarDays, badge: meetingCount },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  // The top nav is already workspace-scoped, so in organisation mode it shows
  // that organisation's data. Only organisation-management views belong here.
  const organisationItems = [
    { href: '/organisation/overview', label: 'Overview', icon: LayoutGrid },
    { href: '/organisation/members', label: 'Members', icon: Users },
    { href: '/organisation/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/organisation/settings', label: 'Org Settings', icon: Settings },
  ];

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href ||
      (item.href !== '/dashboard' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
      >
        <div className="sidebar-nav-item-inner">
          <Icon size={17} aria-hidden="true" strokeWidth={isActive ? 2.2 : 1.75} />
          <span>{item.label}</span>
        </div>
        {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
          <span className="sidebar-nav-badge tabular-nums">{item.badge}</span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile drawer trigger + scrim. Hidden at desktop widths by CSS. */}
      <button
        type="button"
        className="sidebar-drawer-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      {sidebarOpen && (
        <div
          className="sidebar-scrim"
          role="presentation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar-ref${sidebarOpen ? ' sidebar-open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <Link href="/" className="sidebar-brand-link" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
            <Image src="/logo.png" alt="recap logo" fill style={{ objectFit: 'contain' }} priority />
          </div>
          <span className="sidebar-brand-name" style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em' }}>recap</span>
        </Link>
      </div>

      {/* Workspace Switcher */}
      <WorkspaceSwitcher />

      {/* Navigation Items */}
      <nav className="sidebar-nav">
        {navItems.map(renderNavItem)}

        {isOrganisation && (
          <>
            <div className="sidebar-nav-group-label">Organisation</div>
            {organisationItems.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Bottom Section: User Profile & Sign Out */}
      <div className="sidebar-footer">
        {/* User Profile Lockup */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {userProfile.name ? userProfile.name[0].toUpperCase() : 'H'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userProfile.name}</div>
            <div className="sidebar-user-email">{userProfile.email}</div>
          </div>
          <button
            type="button"
            className="sidebar-user-more"
            onClick={handleSignOut}
            title="Sign Out"
            aria-label="Sign Out"
            style={{ cursor: 'pointer' }}
          >
            <LogOut size={16} color="#94A3B8" />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}

