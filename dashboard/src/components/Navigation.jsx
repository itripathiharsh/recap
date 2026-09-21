'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  BookOpen,
  Lightbulb,
  Settings,
  MoreVertical,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const [meetingCount, setMeetingCount] = useState(null);

  useEffect(() => {
    async function checkData() {
      try {
        const { count } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true });
        setMeetingCount(count);
      } catch (err) {
        console.error('Sidebar meeting count fetch error:', err);
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
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar-ref">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <Link href="/" className="sidebar-brand-link">
          <div className="sidebar-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="#0066FF" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="50 15" />
              <circle cx="12" cy="12" r="4.5" fill="#0066FF" />
            </svg>
          </div>
          <span className="sidebar-brand-name">recap</span>
        </Link>
      </div>

      {/* Navigation Items */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
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
        })}
      </nav>

      {/* Bottom Section: User Profile */}
      <div className="sidebar-footer">
        {/* User Profile Lockup */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">H</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">Harsh Vardhan</div>
            <div className="sidebar-user-email">harsh@example.com</div>
          </div>
          <button type="button" className="sidebar-user-more" aria-label="More user options">
            <MoreVertical size={16} color="#94A3B8" />
          </button>
        </div>
      </div>
    </aside>
  );
}
