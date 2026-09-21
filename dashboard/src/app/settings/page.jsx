'use client';

import React, { useEffect, useState } from 'react';
import {
  Sliders,
  User,
  Video,
  Mic,
  Bell,
  Terminal,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');
  const [supabaseConnected, setSupabaseConnected] = useState(null);
  const [dbStats, setDbStats] = useState({ meetings: 0, mom: 0 });

  useEffect(() => {
    async function testConnection() {
      try {
        const { count: mCount, error: mErr } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true });

        const { count: momCount, error: momErr } = await supabase
          .from('mom')
          .select('*', { count: 'exact', head: true });

        if (mErr) throw mErr;
        setSupabaseConnected(true);
        setDbStats({ meetings: mCount || 0, mom: momCount || 0 });
      } catch (err) {
        console.error('Supabase check error:', err);
        setSupabaseConnected(false);
      }
    }
    testConnection();
  }, []);

  const sections = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'account', label: 'Account', icon: User },
    { id: 'google_meet', label: 'Google Meet', icon: Video },
    { id: 'recording', label: 'Recording', icon: Mic },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'system', label: 'System', icon: Terminal },
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
                <input type="text" className="form-input" value="Harsh" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Authentication Mode</label>
                <input type="text" className="form-input" value="Personal Single-User (Supabase Auth)" disabled />
              </div>
            </div>
          )}

          {/* Google Meet Section */}
          {activeSection === 'google_meet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                Google Meet Bot Configuration
              </h2>

              <div className="form-group">
                <label className="form-label">Bot Display Name</label>
                <input type="text" className="form-input" value="Notetaker Bot (Recording)" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Initial Hardware State</label>
                <input type="text" className="form-input" value="Microphone & Camera Muted" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Persistent Chrome Profile Path</label>
                <input type="text" className="form-input" value="D:\meet recorder\.temp\chrome_profile" disabled />
              </div>
            </div>
          )}

          {/* Recording Section */}
          {activeSection === 'recording' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                Recording &amp; Retention Policy
              </h2>

              <div className="form-group">
                <label className="form-label">Audio Retention Period</label>
                <input type="text" className="form-input" value="7 days (automatically cleaned from Oracle VM)" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Speech-to-Text Model</label>
                <input type="text" className="form-input" value="faster-whisper (small)" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Speaker Diarization Model</label>
                <input type="text" className="form-input" value="pyannote.audio (speaker-diarization-3.1)" disabled />
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
                <input type="text" className="form-input" value="Logged to Supabase system_events" disabled />
              </div>
            </div>
          )}

          {/* System Section */}
          {activeSection === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                System &amp; Infrastructure
              </h2>

              {/* Supabase Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-soft)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={14} color="var(--brand-blue)" aria-hidden="true" />
                  <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    Supabase Database
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                  <span
                    className="status-dot-sm"
                    style={{ backgroundColor: supabaseConnected ? 'var(--status-success)' : 'var(--status-error)' }}
                  />
                  <span>{supabaseConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              {/* Systemd reference */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Oracle VM Systemd Service:
                </div>
                <pre
                  style={{
                    backgroundColor: 'var(--bg-soft)',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    border: '1px solid var(--border)',
                    overflowX: 'auto',
                  }}
                >
{`sudo systemctl status meeting-recorder-worker.service
journalctl -u meeting-recorder-worker -f`}
                </pre>
              </div>

              {/* Security Checklist */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Secret Isolation:
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} color="var(--status-success)" aria-hidden="true" />
                    <span>Google credentials &amp; cookies: strictly isolated on worker host.</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} color="var(--status-success)" aria-hidden="true" />
                    <span>HuggingFace &amp; LLM tokens: never sent to browser client.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
