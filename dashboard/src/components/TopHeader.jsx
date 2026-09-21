'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Bell,
  CheckCircle2,
  Calendar,
  Settings,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Video,
  Clock,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AddMeetingModal from './AddMeetingModal';

export default function TopHeader({
  searchQuery = '',
  onSearchChange,
  placeholder = 'Search meetings, transcripts, topics, speakers...',
}) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(2);
  const [userProfile, setUserProfile] = useState({
    name: 'Harsh Vardhan Tripathi',
    email: 'harsh@sentio.in',
  });

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch real notifications and user session
  useEffect(() => {
    async function loadHeaderData() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          const user = sessionData.session.user;
          setUserProfile({
            name: user.user_metadata?.name || 'Harsh Vardhan Tripathi',
            email: user.email || 'harsh@sentio.in',
          });
        }

        // Fetch recent meetings for notifications
        const { data: recentMeetings } = await supabase
          .from('meetings')
          .select('id, title, status, scheduled_start, created_at')
          .order('created_at', { ascending: false })
          .limit(4);

        if (recentMeetings && recentMeetings.length > 0) {
          const formatted = recentMeetings.map((m) => {
            let desc = 'Meeting scheduled';
            let icon = Calendar;
            let iconColor = '#0066FF';

            if (m.status === 'completed') {
              desc = 'Audio recorded, transcribed & MOM generated';
              icon = CheckCircle2;
              iconColor = '#10B981';
            } else if (m.status === 'recording' || m.status === 'joining') {
              desc = 'Call currently in progress';
              icon = Video;
              iconColor = '#F59E0B';
            } else if (m.status === 'processing') {
              desc = 'Generating transcript & speaker notes';
              icon = Sparkles;
              iconColor = '#8B5CF6';
            }

            return {
              id: m.id,
              title: m.title || 'Untitled Meeting',
              desc,
              time: formatRelativeTime(m.created_at),
              icon,
              iconColor,
              link: `/meetings/${m.id}`,
            };
          });
          setNotifications(formatted);
        }
      } catch (err) {
        console.error('Error fetching header notifications:', err);
      }
    }

    loadHeaderData();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleClearNotifications = () => {
    setUnreadCount(0);
    setShowNotifications(false);
  };

  return (
    <>
      <header className="dashboard-topbar">
        {/* Search Input */}
        <div className="dashboard-search-wrap">
          <Search size={16} color="#94A3B8" aria-hidden="true" />
          <input
            type="text"
            className="dashboard-search-input"
            placeholder={placeholder}
            value={searchQuery}
            onChange={onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
          />
        </div>

        {/* Right Actions */}
        <div className="dashboard-topbar-actions">
          {/* Schedule Meeting Button */}
          <button
            type="button"
            className="btn-schedule-meeting"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            <span>Schedule Meeting</span>
          </button>

          {/* Notifications Button & Dropdown */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Notifications"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
                setUnreadCount(0);
              }}
              style={{
                cursor: 'pointer',
                backgroundColor: showNotifications ? '#EFF6FF' : undefined,
                borderColor: showNotifications ? '#BFDBFE' : undefined,
              }}
            >
              <Bell size={18} strokeWidth={1.8} color={showNotifications ? '#0066FF' : '#475569'} />
              {unreadCount > 0 && <span className="topbar-badge-dot" />}
            </button>

            {/* Notifications Popover */}
            {showNotifications && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '320px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #E2E8F0',
                  zIndex: 50,
                  overflow: 'hidden',
                  animation: 'fadeIn 120ms ease-out',
                }}
              >
                {/* Popover Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: '#FAFAFA',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                      Notifications
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        backgroundColor: '#EFF6FF',
                        color: '#0066FF',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '10px',
                      }}
                    >
                      {notifications.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearNotifications}
                    style={{
                      fontSize: '11.5px',
                      color: '#64748B',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Mark as read
                  </button>
                </div>

                {/* Notifications List */}
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {notifications.length > 0 ? (
                    notifications.map((notif) => {
                      const Icon = notif.icon;
                      return (
                        <Link
                          key={notif.id}
                          href={notif.link}
                          onClick={() => setShowNotifications(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '12px 16px',
                            borderBottom: '1px solid #F8FAFC',
                            textDecoration: 'none',
                            transition: 'background-color 100ms ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              backgroundColor: '#F1F5F9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            <Icon size={14} color={notif.iconColor} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#0F172A',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {notif.title}
                            </div>
                            <div
                              style={{
                                fontSize: '11.5px',
                                color: '#64748B',
                                marginTop: '1px',
                                lineHeight: 1.4,
                              }}
                            >
                              {notif.desc}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>
                              {notif.time}
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                      No new notifications
                    </div>
                  )}
                </div>

                {/* Popover Footer */}
                <div
                  style={{
                    padding: '8px 16px',
                    borderTop: '1px solid #F1F5F9',
                    backgroundColor: '#FAFAFA',
                    textAlign: 'center',
                  }}
                >
                  <Link
                    href="/meetings"
                    onClick={() => setShowNotifications(false)}
                    style={{ fontSize: '12px', color: '#0066FF', fontWeight: 600, textDecoration: 'none' }}
                  >
                    View all meetings &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Profile Avatar & Dropdown Menu */}
          <div style={{ position: 'relative' }} ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className="topbar-avatar-btn"
              title={userProfile.name}
              style={{
                cursor: 'pointer',
                border: showProfileMenu ? '2px solid #0066FF' : 'none',
              }}
            >
              <span>{userProfile.name ? userProfile.name[0].toUpperCase() : 'H'}</span>
            </button>

            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '240px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #E2E8F0',
                  zIndex: 50,
                  overflow: 'hidden',
                  animation: 'fadeIn 120ms ease-out',
                }}
              >
                {/* User Info Lockup */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                    {userProfile.name}
                  </div>
                  <div
                    style={{
                      fontSize: '11.5px',
                      color: '#64748B',
                      marginTop: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {userProfile.email}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        backgroundColor: '#ECFDF5',
                        color: '#059669',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ShieldCheck size={11} /> Pro Active
                    </span>
                  </div>
                </div>

                {/* Menu Items */}
                <div style={{ padding: '6px 0' }}>
                  <Link
                    href="/meetings"
                    onClick={() => setShowProfileMenu(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      color: '#334155',
                      textDecoration: 'none',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Calendar size={15} color="#64748B" />
                    <span>My Meetings</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      color: '#334155',
                      textDecoration: 'none',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Settings size={15} color="#64748B" />
                    <span>Settings &amp; Preferences</span>
                  </Link>
                </div>

                {/* Sign Out Button */}
                <div style={{ padding: '6px 0', borderTop: '1px solid #F1F5F9' }}>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px',
                      fontSize: '13px',
                      color: '#EF4444',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <LogOut size={15} color="#EF4444" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Schedule Meeting Modal */}
      {isModalOpen && (
        <AddMeetingModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onMeetingAdded={() => {
            setIsModalOpen(false);
            router.push('/meetings');
          }}
        />
      )}
    </>
  );
}

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
