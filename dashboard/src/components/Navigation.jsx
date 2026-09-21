'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  BookOpen,
  Settings,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [meetingCount, setMeetingCount] = useState(null);

  useEffect(() => {
    async function checkData() {
      try {
        // 1. Worker heartbeat
        const { data } = await supabase
          .from('system_events')
          .select('*')
          .eq('event_type', 'heartbeat')
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const hb = data[0];
          const diffMinutes = (Date.now() - new Date(hb.created_at).getTime()) / (1000 * 60);
          setIsOnline(diffMinutes < 10);
        }

        // 2. Meeting count
        const { count } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true });
        setMeetingCount(count);
      } catch (err) {
        console.error('Sidebar data fetch error:', err);
      }
    }

    checkData();
    const interval = setInterval(checkData, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/meetings', label: 'Meetings', icon: CalendarDays, badge: meetingCount },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="brand">
        <img
          src="/logo.png"
          alt="recap"
          className="brand-logo-img"
        />
        <div>
          <div className="brand-name">recap</div>
          <div className="brand-tagline">From Meetings to Meaning</div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-inner">
                <Icon size={15} aria-hidden="true" strokeWidth={1.75} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                <span className="nav-badge tabular-nums">{item.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Worker Status at Bottom */}
      <div className="user-profile">
        <div className="user-avatar">H</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">Harsh</div>
          <div className="user-status" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              className="status-dot-sm"
              style={{
                backgroundColor: isOnline ? 'var(--status-success)' : 'var(--status-error)',
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {isOnline ? 'Oracle VM Active' : 'Worker Offline'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
