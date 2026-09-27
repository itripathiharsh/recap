'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Plug,
  Zap,
  FileText,
  Users,
  ShieldCheck,
  MoreHorizontal,
  Code2,
  ArrowRight,
  Info,
  X,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

/**
 * The provider catalogue. `mark` picks the inline SVG below — these are
 * simplified brand marks drawn in each vendor's own colour, not official assets.
 */
const GROUPS = [
  {
    id: 'calendar',
    title: 'Calendar Integrations',
    sub: 'Sync your calendar to automatically find, record and organise meetings.',
    providers: [
      {
        id: 'google_calendar',
        name: 'Google Calendar',
        blurb: 'Sync meetings from your Google Calendar.',
        mark: 'gcal',
      },
      {
        id: 'outlook_calendar',
        name: 'Outlook Calendar',
        blurb: 'Sync meetings from your Microsoft Outlook calendar.',
        mark: 'outlook',
      },
      {
        id: 'apple_calendar',
        name: 'Apple Calendar',
        blurb: 'Sync meetings from your Apple Calendar.',
        mark: 'applecal',
      },
    ],
  },
  {
    id: 'meetings',
    title: 'Meeting Platform Integrations',
    sub: 'Allow recap to join and record meetings automatically.',
    providers: [
      { id: 'google_meet', name: 'Google Meet', blurb: 'Auto-join and record Meet meetings.', mark: 'gmeet' },
      { id: 'zoom', name: 'Zoom', blurb: 'Auto-join and record Zoom meetings.', mark: 'zoom' },
      {
        id: 'microsoft_teams',
        name: 'Microsoft Teams',
        blurb: 'Auto-join and record Teams meetings.',
        mark: 'teams',
      },
    ],
  },
  {
    id: 'productivity',
    title: 'Productivity Integrations',
    sub: 'Send summaries, share action items, and integrate with your workflow.',
    providers: [
      { id: 'slack', name: 'Slack', blurb: 'Get meeting summaries in Slack channels.', mark: 'slack' },
      { id: 'notion', name: 'Notion', blurb: 'Send meeting notes to Notion.', mark: 'notion' },
      { id: 'gmail', name: 'Gmail', blurb: 'Send meeting summaries via email.', mark: 'gmail' },
    ],
  },
];

const ALL_PROVIDERS = GROUPS.flatMap((g) => g.providers);

const BENEFITS = [
  { icon: Zap, label: 'Auto record meetings', sub: 'Recap joins and records automatically' },
  { icon: FileText, label: 'Sync meeting data', sub: 'All your meetings in one place' },
  { icon: Users, label: 'Better collaboration', sub: 'Share insights with your existing tools' },
  { icon: ShieldCheck, label: 'Secure and private', sub: 'Your data stays protected' },
];

function ProviderMark({ mark, size = 34 }) {
  const s = { width: size, height: size };
  const r = Math.round(size * 0.24);

  switch (mark) {
    case 'gcal':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <rect x="1" y="1" width="38" height="12" rx="8" fill="#4285F4" />
          <rect x="1" y="9" width="38" height="6" fill="#4285F4" />
          <text
            x="20"
            y="31"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontSize="15"
            fontWeight="800"
            fill="#4285F4"
          >
            31
          </text>
          <rect x="31" y="17" width="4" height="4" rx="1.5" fill="#EA4335" />
        </svg>
      );
    case 'outlook':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#0F6CBD" />
          <rect x="7" y="11" width="26" height="18" rx="3" fill="#FFFFFF" />
          <path d="M7 12 L20 23 L33 12" stroke="#0F6CBD" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'applecal':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <rect x="1" y="1" width="38" height="11" rx="8" fill="#E2483B" />
          <rect x="1" y="8" width="38" height="6" fill="#E2483B" />
          <text
            x="20"
            y="17.5"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontSize="7.5"
            fontWeight="800"
            fill="#FFFFFF"
          >
            JUL
          </text>
          <text
            x="20"
            y="33"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontSize="16"
            fontWeight="800"
            fill="#1C1C1E"
          >
            17
          </text>
        </svg>
      );
    case 'gmeet':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <path d="M4 13a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#00897B" />
          <path d="M25 19l9-5.5a1 1 0 0 1 1.6.8v11.4a1 1 0 0 1-1.6.8L25 21z" fill="#34A853" />
          <path d="M10 16h8M10 20h8M10 24h5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'zoom':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#2D8CFF" />
          <rect x="7" y="13" width="17" height="14" rx="4" fill="#FFFFFF" />
          <path d="M27 18l6-3.6a.9.9 0 0 1 1.4.7v9.8a.9.9 0 0 1-1.4.7L27 22z" fill="#FFFFFF" opacity="0.92" />
        </svg>
      );
    case 'teams':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#6264A7" />
          <rect x="17" y="8" width="16" height="18" rx="3" fill="#FFFFFF" />
          <text
            x="25"
            y="22"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontSize="13"
            fontWeight="800"
            fill="#6264A7"
          >
            T
          </text>
          <circle cx="15" cy="29" r="6" fill="#FFFFFF" opacity="0.95" />
          <circle cx="24" cy="30" r="5" fill="#7B83EB" />
        </svg>
      );
    case 'slack':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <rect x="9" y="16" width="9" height="17" rx="4" fill="#36C5F0" />
          <rect x="16" y="9" width="17" height="9" rx="4" fill="#2EB67D" />
          <rect x="22" y="16" width="9" height="17" rx="4" fill="#ECB22E" />
          <rect x="16" y="22" width="17" height="9" rx="4" fill="#E01E5A" />
        </svg>
      );
    case 'notion':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <rect x="10" y="7" width="20" height="26" rx="2" fill="#0F172A" />
          <path
            d="M15 12h4.4c1.6 0 2.4.7 2.4 2.2V24c0 1.5-.8 2.2-2.4 2.2H15V12zm1.6 1.6v9h2.4c.6 0 .9-.3.9-.9v-7.2c0-.6-.3-.9-.9-.9h-2.4z"
            fill="#FFFFFF"
          />
        </svg>
      );
    case 'gmail':
      return (
        <svg viewBox="0 0 40 40" style={s} aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="#FFFFFF" />
          <path d="M7 13.5a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#EA4335" />
          <path d="M7.6 13.2L20 23l12.4-9.8" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M7.6 26.8L16 20M32.4 26.8L24 20" stroke="#C5221F" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <span
          style={{
            ...s,
            borderRadius: r,
            background: '#EAF2FF',
            color: '#0066FF',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plug size={size * 0.5} />
        </span>
      );
  }
}

/**
 * Settings -> Integrations.
 *
 * Connection state comes from the `integrations` table. There is no OAuth flow
 * in the app yet, so "Connect" cannot complete a real handshake — it says so
 * rather than marking a provider connected without one.
 */
export default function IntegrationsPanel() {
  const { activeOrgId, activeOrgRole } = useWorkspace();

  const [rows, setRows] = useState(null); // null = table missing
  const [status, setStatus] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [busy, setBusy] = useState(null);

  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) return;
      try {
        const { data, error } = await supabase
          .from('integrations')
          .select('id, provider, status, account_email, account_name, connected_at')
          .eq('organisation_id', activeOrgId);

        if (cancelled) return;
        if (error) {
          setRows(null);
          return;
        }
        const map = new Map();
        (data || []).forEach((r) => map.set(r.provider, r));
        setRows(map);
      } catch (err) {
        console.error('Integrations load error:', err);
        if (!cancelled) setRows(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const connected = useMemo(() => {
    if (!rows) return [];
    return ALL_PROVIDERS.filter((p) => rows.get(p.id)?.status === 'connected');
  }, [rows]);

  const isConnected = (id) => rows?.get(id)?.status === 'connected';

  const requestConnect = (provider) => {
    setMenuFor(null);
    setBusy(provider.id);
    setStatus({
      kind: 'info',
      text: `${provider.name} isn't connected yet. Connecting ${provider.name} needs an authorisation step that isn't available on this workspace. Your existing data is unaffected.`,
    });
    setBusy(null);
  };

  const disconnect = async (provider) => {
    setMenuFor(null);
    if (!rows) return;
    const row = rows.get(provider.id);
    if (!row) return;
    if (!window.confirm(`Disconnect ${provider.name}?`)) return;
    setBusy(provider.id);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ status: 'disconnected', account_email: null, connected_at: null })
        .eq('id', row.id);
      if (error) throw error;
      setRows((prev) => {
        const next = new Map(prev);
        next.set(provider.id, { ...row, status: 'disconnected', account_email: null });
        return next;
      });
      setStatus({ kind: 'ok', text: `${provider.name} disconnected.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || 'Could not disconnect.' });
    } finally {
      setBusy(null);
    }
  };

  const tableMissing = rows === null;

  return (
    <div className="org-ig-root">
      {/* ------------------------------------------------------------- hero */}
      <section className="org-ig-hero">
        <span className="org-ig-hero-badge">Integrations</span>
        <h1 className="org-ig-hero-title">
          Connect your tools, <em>work smarter.</em>
        </h1>
        <p className="org-ig-hero-sub">
          Integrate with your calendar, meeting platforms and productivity tools.
        </p>

        <div className="org-ig-hero-doodle" aria-hidden="true">
          <span className="org-ig-doodle-text">
            {'Bring all your meetings\nand data together.'}
          </span>
          <svg width="40" height="44" viewBox="0 0 50 52" fill="none">
            <path
              d="M10 6 C 20 18, 30 28, 34 44 M 24 44 L 34 45 L 37 34"
              stroke="#0066FF"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="org-ig-hero-art" aria-hidden="true">
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="ig-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M40 168 C40 116, 84 88, 150 88 C216 88, 260 118, 260 168 Z" fill="url(#ig-blob)" opacity="0.75" />

            {/* dashed wiring between tiles */}
            <path
              d="M92 74 C120 50, 152 50, 176 44 M92 96 C124 118, 156 122, 180 118"
              stroke="#7FA8E0"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
              fill="none"
            />

            {/* calendar tile */}
            <rect x="52" y="48" width="72" height="72" rx="16" fill="#FFFFFF" />
            <rect x="58" y="54" width="60" height="60" rx="13" fill="#4285F4" />
            <rect x="70" y="46" width="7" height="16" rx="3.5" fill="#0F172A" opacity="0.85" />
            <rect x="99" y="46" width="7" height="16" rx="3.5" fill="#0F172A" opacity="0.85" />
            <text
              x="88"
              y="94"
              textAnchor="middle"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontSize="26"
              fontWeight="800"
              fill="#FFFFFF"
            >
              31
            </text>

            {/* meet tile */}
            <rect x="150" y="18" width="60" height="60" rx="14" fill="#FFFFFF" />
            <rect x="156" y="24" width="48" height="48" rx="11" fill="#00897B" />
            <path d="M180 40l18-10a1.4 1.4 0 0 1 2.2 1.1v13.8a1.4 1.4 0 0 1-2.2 1.1L180 45z" fill="#34A853" />

            {/* slack tile */}
            <rect x="196" y="86" width="64" height="64" rx="14" fill="#FFFFFF" />
            <rect x="202" y="92" width="52" height="52" rx="12" fill="#FFFFFF" stroke="#EDF2F9" />
            <rect x="216" y="110" width="11" height="20" rx="5" fill="#36C5F0" />
            <rect x="225" y="101" width="20" height="11" rx="5" fill="#2EB67D" />
            <rect x="232" y="110" width="11" height="20" rx="5" fill="#ECB22E" />
            <rect x="225" y="119" width="20" height="11" rx="5" fill="#E01E5A" />
          </svg>
        </div>
      </section>

      {tableMissing && !status && (
        <div className="org-ig-notice info">
          <Info size={15} aria-hidden="true" />
          <span>
            We couldn't load your saved connections. Everything else on this page still works.
          </span>
        </div>
      )}

      {status && (
        <div className={`org-ig-notice ${status.kind}`} role="status">
          {status.kind === 'ok' ? (
            <Check size={15} aria-hidden="true" />
          ) : status.kind === 'error' ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <Info size={15} aria-hidden="true" />
          )}
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------- content */}
      <div className="org-ig-split">
        <div className="org-ig-main">
          {GROUPS.map((group) => (
            <section key={group.id} className="org-ig-card">
              <div className="org-ig-card-head">
                <div className="org-ig-card-title">{group.title}</div>
                <div className="org-ig-card-sub">{group.sub}</div>
              </div>

              <div className="org-ig-grid">
                {group.providers.map((p) => {
                  const on = isConnected(p.id);
                  const meta = rows?.get(p.id);
                  return (
                    <div key={p.id} className="org-ig-tile">
                      <div className="org-ig-tile-top">
                        <ProviderMark mark={p.mark} />
                        {canManage && (
                          <button
                            type="button"
                            className="org-ig-kebab"
                            aria-label={`${p.name} options`}
                            aria-expanded={menuFor === p.id}
                            onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        )}
                      </div>

                      <div className="org-ig-tile-name" title={p.name}>
                        {p.name}
                      </div>
                      <div className="org-ig-tile-blurb">{p.blurb}</div>

                      <div className="org-ig-tile-foot">
                        {on ? (
                          <span className="org-ig-pill connected">
                            <Check size={12} strokeWidth={2.8} aria-hidden="true" />
                            Connected
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="org-ig-btn-connect"
                            onClick={() => requestConnect(p)}
                            disabled={!canManage || busy === p.id}
                          >
                            Connect
                          </button>
                        )}
                      </div>

                      {on && meta?.account_email && (
                        <div className="org-ig-tile-account">{meta.account_email}</div>
                      )}

                      {menuFor === p.id && (
                        <div className="org-ig-menu" role="menu">
                          {on ? (
                            <button
                              type="button"
                              className="org-ig-menu-item danger"
                              onClick={() => disconnect(p)}
                            >
                              Disconnect
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="org-ig-menu-item"
                              onClick={() => requestConnect(p)}
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ---------------------------------------------------------- rail */}
        <div className="org-ig-rail">
          <div className="org-ig-card org-ig-card-pad">
            <div className="org-ig-card-head">
              <div className="org-ig-card-title">Connected Integrations</div>
              <span className="org-ig-count">
                {connected.length} of {ALL_PROVIDERS.length} connected
              </span>
            </div>

            {connected.length === 0 ? (
              <p className="org-ig-none">No other integrations connected.</p>
            ) : (
              connected.map((p) => {
                const meta = rows?.get(p.id);
                return (
                  <div key={p.id} className="org-ig-connected">
                    <ProviderMark mark={p.mark} size={30} />
                    <div className="org-ig-connected-text">
                      <div className="org-ig-connected-name">{p.name}</div>
                      <div className="org-ig-connected-mail">
                        {meta?.account_email || meta?.account_name || 'Connected'}
                      </div>
                    </div>
                    <span className="org-ig-pill connected">
                      <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                      Connected
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        className="org-ig-kebab tight"
                        aria-label={`${p.name} options`}
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    )}
                  </div>
                );
              })
            )}

            <button
              type="button"
              className="org-ig-btn-soft"
              onClick={() =>
                setStatus({
                  kind: 'info',
                  text: 'The integrations catalogue is managed from the panels on the left.',
                })
              }
            >
              <Plug size={15} strokeWidth={2.1} aria-hidden="true" />
              Manage all integrations
              <ArrowRight size={14} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>

          <div className="org-ig-benefits">
            <div className="org-ig-benefits-title">Integration Benefits</div>
            <div className="org-ig-benefits-list">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.label} className="org-ig-benefit">
                    <span className="org-ig-benefit-icon">
                      <Icon size={16} strokeWidth={2.1} />
                    </span>
                    <span>
                      <span className="org-ig-benefit-label">{b.label}</span>
                      <span className="org-ig-benefit-sub">{b.sub}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="org-ig-notice info">
            <Code2 size={15} aria-hidden="true" />
            <div className="org-ig-notice-body">
              <strong>Need a custom integration?</strong>
              <div>We support custom integrations via API and webhooks.</div>
              <button
                type="button"
                className="org-ig-docs"
                onClick={() =>
                  setStatus({
                    kind: 'info',
                    text: 'No public API docs are published yet.',
                  })
                }
              >
                View API Docs
                <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
