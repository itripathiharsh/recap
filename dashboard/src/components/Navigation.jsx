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
  LayoutGrid,
  Users,
  BarChart3,
  CreditCard,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function Navigation({ session }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeOrgId, isOrganisation } = useWorkspace();
  const [meetingCount, setMeetingCount] = useState(null);
  const [userProfile, setUserProfile] = useState({
    name: session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Account',
    email: session?.user?.email || '',
  });

  useEffect(() => {
    async function checkData() {
      try {
        const { count } = await applyWorkspaceScope(
          supabase.from('meetings').select('*', { count: 'exact', head: true }),
          activeOrgId
        );
        setMeetingCount(count);

        const { data: userData } = await supabase
          .from('User')
          .select('name, email')
          .eq('email', session?.user?.email || '')
          .limit(1);

        if (userData && userData.length > 0) {
          setUserProfile({
            name: userData[0].name === 'Harsh' ? 'Harsh Vardhan Tripathi' : userData[0].name,
            email: userData[0].email,
          });
        }
      } catch (err) {
        console.error('Sidebar data fetch error:', err);
      }
    }

    checkData();
    const interval = setInterval(checkData, 30000);
    return () => clearInterval(interval);
  }, [session, activeOrgId]);

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

  const organisationItems = [
    { href: '/organisation/overview', label: 'Overview', icon: LayoutGrid },
    { href: '/organisation/meetings', label: 'Meetings', icon: CalendarDays },
    { href: '/organisation/members', label: 'Members', icon: Users },
    { href: '/organisation/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/organisation/settings', label: 'Settings', icon: Settings },
    { href: '/organisation/billing', label: 'Billing', icon: CreditCard },
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
    <aside className="sidebar-ref">
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
  );
}

