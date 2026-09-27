'use client';

import React, { useEffect, useState } from 'react';
import { Sliders, User, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../../lib/workspace';

export default function SettingsPage() {
  const { activeOrgId, session } = useWorkspace();
  const [activeSection, setActiveSection] = useState('general');

  // The signed-in identity comes from the session, which is authoritative.
  // It used to be read from `public."User"` with `.limit(1)` and no filter,
  // which displayed the first row in the table as "your" profile — and that
  // table does not exist in this project at all.
  const userProfile = session?.user || null;

  useEffect(() => {
    // Workspace-scoped sanity probe. Failures are logged, never surfaced as
    // infrastructure detail in the customer UI.
    async function testConnection() {
      try {
        await applyWorkspaceScope(
          supabase.from('meetings').select('id', { count: 'exact', head: true }),
          activeOrgId
        );
      } catch (err) {
        console.error('Workspace probe error:', err);
      }
    }
    testConnection();
  }, [activeOrgId]);

  // System / Google Meet / Recording were removed from the customer build: they
  // were read-only and exposed host paths, systemd commands, database vendor and
  // model provider names. That belongs in internal tooling, not a customer UI.
  const sections = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'account', label: 'Account', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Manage your personal meeting recorder preferences and system configuration.
        </p>
      </div>

      {/* Settings Grid: Left Subsection Nav / Right Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px' }}>
        {/* Subsection Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {sections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? 'var(--brand-blue-subtle)' : 'transparent',
                  color: isActive ? 'var(--brand-blue)' : 'var(--text-secondary)',
                  textAlign: 'left',
                  transition: 'all 150ms ease',
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Content Panel */}
        <div className="surface-card" style={{ padding: '20px 24px' }}>
          {/* General Section */}
          {activeSection === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                General Preferences
              </h2>

              <div className="form-group">
                <label className="form-label">Application Name</label>
                <input type="text" className="form-input" value="recap" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Tagline</label>
                <input type="text" className="form-input" value="From Meetings to Meaning" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Timezone</label>
                <input type="text" className="form-input" value="Asia/Kolkata (IST)" disabled />
              </div>
            </div>
          )}

          {/* Account Section */}
          {activeSection === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                Account Information
              </h2>

              <div className="form-group">
                <label className="form-label">User Profile</label>
                <input
                  type="text"
                  className="form-input"
                  value={
                    userProfile
                      ? `${userProfile.user_metadata?.full_name || userProfile.user_metadata?.name || 'Signed in'} (${userProfile.email})`
                      : 'Not signed in'
                  }
                  disabled
                />
              </div>

              <div className="form-group">
                <label className="form-label">Authentication Mode</label>
                <input type="text" className="form-input" value="Email and password" disabled />
              </div>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                Notifications &amp; Alerts
              </h2>

              <div className="form-group">
                <label className="form-label">Meeting Completed Alerts</label>
                <input type="text" className="form-input" value="Enabled (Realtime Dashboard sync)" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Failure Notifications</label>
                <input type="text" className="form-input" value="Logged for support" disabled />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
