'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Building2,
  Users,
  UsersRound,
  CalendarCog,
  Plug,
  Database,
  CreditCard,
  Upload,
  FileText,
  Languages,
  Lock,
  AlertTriangle,
  UserCog,
  Trash2,
  ChevronRight,
  Check,
  Info,
  AlertCircle,
  HardDrive,
  ExternalLink,
  Globe,
  Building,
  MapPin,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';
import MembersAccessPanel from '../../../components/MembersAccessPanel';
import TeamsPanel from '../../../components/TeamsPanel';
import MeetingSettingsPanel from '../../../components/MeetingSettingsPanel';
import IntegrationsPanel from '../../../components/IntegrationsPanel';
import BillingPanel from '../../../components/BillingPanel';

const INDUSTRIES = [
  'Technology',
  'Healthcare & Wellness',
  'Financial Services',
  'Education',
  'Retail & E-commerce',
  'Manufacturing',
  'Media & Entertainment',
  'Professional Services',
  'Non-profit',
  'Other',
];

const ORG_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

const TIMEZONES = [
  'Asia/Kolkata (IST)',
  'Asia/Singapore (SGT)',
  'Asia/Dubai (GST)',
  'Europe/London (GMT)',
  'Europe/Berlin (CET)',
  'America/New_York (EST)',
  'America/Los_Angeles (PST)',
  'Australia/Sydney (AEST)',
  'UTC',
];

const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese'];

const PRIVACY_OPTIONS = ['Team (Workspace)', 'Organisation only', 'Private'];

const DESCRIPTION_MAX = 500;
const ADDRESS_MAX = 200;

const SECTIONS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'profile', label: 'Organisation Profile', icon: Building2 },
  { id: 'access', label: 'Members & Access', icon: Users },
  { id: 'teams', label: 'Teams', icon: UsersRound },
  { id: 'meetings', label: 'Meeting Settings', icon: CalendarCog },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'data', label: 'Data & Storage', icon: Database },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

/** Only these sections are built; the rest route to the pages that own them. */
const SECTION_ROUTES = {};

const EXTENDED_COLUMNS = 'description, website, logo_url, industry, org_size, timezone, address, contact_email, contact_phone';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) {
    const rounded = Math.round(gb * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** "1-10" -> "1–10 members", "1000+" -> "1000+ members" */
function sizeLabel(size) {
  if (!size) return null;
  const core = size.includes('-') ? size.replace('-', '–') : size;
  return `${core} members`;
}

export default function OrganisationSettingsPage() {
  const router = useRouter();
  const { activeOrgId, activeOrgRole, session } = useWorkspace();

  const [org, setOrg] = useState(null);
  const [settings, setSettings] = useState(null);
  const [memberCount, setMemberCount] = useState(null);

  const [section, setSection] = useState('profile');
  const [draft, setDraft] = useState(null);
  const [defaults, setDefaults] = useState(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [status, setStatus] = useState(null);
  const [logoName, setLogoName] = useState(null);

  const canEdit = activeOrgRole === 'owner';
  const isAdmin = canEdit || activeOrgRole === 'admin';

  /* ------------------------------------------------------------------ load */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) {
        setOrg(null);
        setSettings(null);
        setMemberCount(null);
        return;
      }

      // Base columns always exist, so the page still renders if the optional
      // settings migration has not been applied yet.
      const [baseRes, extRes, setRes, countRes] = await Promise.all([
        supabase
          .from('organisations')
          .select('id, name, owner_id, created_at')
          .eq('id', activeOrgId)
          .maybeSingle(),
        supabase
          .from('organisations')
          .select(EXTENDED_COLUMNS)
          .eq('id', activeOrgId)
          .maybeSingle(),
        supabase.from('organisation_settings').select('*').eq('organisation_id', activeOrgId).maybeSingle(),
        supabase
          .from('organisation_members')
          .select('id', { count: 'exact', head: true })
          .eq('organisation_id', activeOrgId)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;

      const base = baseRes.data || null;
      const ext = extRes.error ? null : extRes.data;
      setOrg(base ? { ...base, ...(ext || {}) } : null);

      const row = setRes.error ? null : setRes.data;
      setSettings(row);
      setMemberCount(countRes.count ?? 0);

      setDraft({
        name: base?.name || '',
        description: ext?.description ?? '',
        website: ext?.website ?? '',
        industry: ext?.industry ?? '',
        org_size: ext?.org_size ?? '',
        timezone: ext?.timezone ?? '',
        address: ext?.address ?? '',
        contact_email: ext?.contact_email ?? '',
        contact_phone: ext?.contact_phone ?? '',
      });
      setDefaults({
        auto_record_meetings: row?.auto_record_meetings ?? true,
        auto_summaries: row?.auto_summaries ?? true,
        default_language: row?.default_language ?? 'English',
        default_privacy: row?.default_privacy ?? 'Team (Workspace)',
      });
    }

    load().catch((err) => console.error('Organisation settings load error:', err));
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  useEffect(() => {
    setStatus(null);
  }, [section]);

  const setField = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  /* ------------------------------------------------------------------ save */

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!activeOrgId || !draft) return;
    setSavingProfile(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from('organisations')
        .update({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          website: draft.website.trim() || null,
          industry: draft.industry || null,
          org_size: draft.org_size || null,
          timezone: draft.timezone || null,
          address: draft.address.trim() || null,
          contact_email: draft.contact_email.trim() || null,
          contact_phone: draft.contact_phone.trim() || null,
        })
        .eq('id', activeOrgId);
      if (error) throw error;
      setOrg((o) => ({ ...o, ...draft }));
      setStatus({ kind: 'ok', text: 'Organisation profile saved.' });
    } catch (err) {
      setStatus({
        kind: 'error',
        text:
          err.message ||
          'Could not save. If this mentions a missing column, apply supabase/migrations/20260926120000_organisation_settings.sql.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveDefaults = async () => {
    if (!activeOrgId || !defaults) return;
    setSavingDefaults(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from('organisation_settings')
        .update(defaults)
        .eq('organisation_id', activeOrgId);
      if (error) throw error;
      setSettings((s) => ({ ...(s || {}), ...defaults }));
      setStatus({ kind: 'ok', text: 'Default settings saved.' });
    } catch (err) {
      setStatus({
        kind: 'error',
        text:
          err.message ||
          'Could not save. If this mentions a missing table, apply supabase/migrations/20260926120000_organisation_settings.sql.',
      });
    } finally {
      setSavingDefaults(false);
    }
  };

  const toggleDefault = (key) => () => setDefaults((d) => (d ? { ...d, [key]: !d[key] } : d));

  const onLogoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoName(file.name);
    setStatus({
      kind: 'info',
      text: `Selected ${file.name}. Logo upload needs a Supabase Storage bucket — see the migration file.`,
    });
  };

  /* ------------------------------------------------------------------ plan */

  const plan = useMemo(() => {
    const quota = settings?.storage_quota_bytes ?? null;
    const used = settings?.storage_used_bytes ?? null;
    return {
      tier: settings?.plan ?? null,
      members: memberCount,
      memberLimit: settings?.member_limit ?? null,
      usedLabel: formatBytes(used),
      quotaLabel: formatBytes(quota),
      usedPct: quota && used ? Math.min(100, Math.round((used / quota) * 100)) : null,
    };
  }, [settings, memberCount]);

  /* ---------------------------------------------------------------- render */

  const goToSection = (id) => {
    const route = SECTION_ROUTES[id];
    if (route) {
      router.push(route);
      return;
    }
    setSection(id);
  };

  const d = draft || {};
  const descLen = (d.description || '').length;
  const addrLen = (d.address || '').length;
  const logoLetter = (d.name || org?.name || '?').slice(0, 1).toUpperCase();

  const notBuilt = (title, body) => (
    <div className="org-st-card">
      <div className="org-st-panel-note">
        <Settings size={22} color="#94A3B8" aria-hidden="true" />
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );

  /* ------------------------------------------------------- profile form */

  const profileForm = (
    <form className="org-st-card" onSubmit={saveProfile}>
      <div className="org-st-card-head">
        <div>
          <div className="org-st-card-title">Organisation Profile</div>
          <div className="org-st-card-sub">
            Manage your organisation&apos;s details and branding. This information will be visible
            to your members.
          </div>
        </div>
        <button
          type="submit"
          className="org-st-btn primary"
          disabled={savingProfile || !canEdit || !draft}
        >
          {savingProfile ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {!canEdit && (
        <div className="org-st-notice info" style={{ marginBottom: 16 }}>
          <Lock size={14} aria-hidden="true" />
          <span>Only the organisation owner can edit these details.</span>
        </div>
      )}

      <div className="org-st-label" style={{ marginBottom: 8 }}>
        Organisation Logo
      </div>
      <div className="org-st-logo-row">
        <span className="org-st-logo">
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt="" />
          ) : (
            logoLetter
          )}
        </span>
        <div>
          <label className="org-st-logo-btn" htmlFor="org-logo-input">
            <Upload size={14} strokeWidth={2.2} aria-hidden="true" />
            Upload Logo
          </label>
          <input
            id="org-logo-input"
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={onLogoPick}
            style={{ display: 'none' }}
            disabled={!canEdit}
          />
          <div className="org-st-hint">
            {logoName ? `${logoName} · ` : ''}JPG, PNG, SVG (Max 2MB)
          </div>
        </div>
      </div>

      <div className="org-st-grid">
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-name">
            Organisation Name
            <span className="org-st-req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="org-name"
            className="org-st-input"
            value={d.name ?? ''}
            onChange={setField('name')}
            disabled={!canEdit}
            required
            maxLength={120}
          />
        </div>
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-website">
            Website
          </label>
          <input
            id="org-website"
            className="org-st-input"
            value={d.website ?? ''}
            onChange={setField('website')}
            disabled={!canEdit}
            placeholder="https://"
          />
        </div>

        <div className="org-st-field full">
          <label className="org-st-label" htmlFor="org-description">
            Description
          </label>
          <div className="org-st-textarea-wrap">
            <textarea
              id="org-description"
              className="org-st-textarea"
              value={d.description ?? ''}
              onChange={setField('description')}
              disabled={!canEdit}
              rows={3}
              maxLength={DESCRIPTION_MAX}
            />
            <span className={`org-st-counter ${descLen > DESCRIPTION_MAX ? 'over' : ''}`}>
              {descLen}/{DESCRIPTION_MAX}
            </span>
          </div>
        </div>
      </div>

      <div className="org-st-grid three" style={{ marginTop: 16 }}>
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-industry">
            Industry
          </label>
          <select
            id="org-industry"
            className="org-st-select"
            value={d.industry ?? ''}
            onChange={setField('industry')}
            disabled={!canEdit}
          >
            <option value="">Select…</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-size">
            Organisation Size
          </label>
          <select
            id="org-size"
            className="org-st-select"
            value={d.org_size ?? ''}
            onChange={setField('org_size')}
            disabled={!canEdit}
          >
            <option value="">Select…</option>
            {ORG_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-timezone">
            Timezone
          </label>
          <select
            id="org-timezone"
            className="org-st-select"
            value={d.timezone ?? ''}
            onChange={setField('timezone')}
            disabled={!canEdit}
          >
            <option value="">Select…</option>
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="org-st-field full">
          <label className="org-st-label" htmlFor="org-address">
            Address
          </label>
          <div className="org-st-textarea-wrap">
            <textarea
              id="org-address"
              className="org-st-textarea"
              value={d.address ?? ''}
              onChange={setField('address')}
              disabled={!canEdit}
              rows={2}
              maxLength={ADDRESS_MAX}
            />
            <span className={`org-st-counter ${addrLen > ADDRESS_MAX ? 'over' : ''}`}>
              {addrLen}/{ADDRESS_MAX}
            </span>
          </div>
        </div>

        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-contact-email">
            Contact Email
          </label>
          <input
            id="org-contact-email"
            type="email"
            className="org-st-input"
            value={d.contact_email ?? ''}
            onChange={setField('contact_email')}
            disabled={!canEdit}
            placeholder="support@example.com"
          />
        </div>
        <div className="org-st-field">
          <label className="org-st-label" htmlFor="org-contact-phone">
            Contact Phone
          </label>
          <input
            id="org-contact-phone"
            type="tel"
            className="org-st-input"
            value={d.contact_phone ?? ''}
            onChange={setField('contact_phone')}
            disabled={!canEdit}
            placeholder="+91 00000 00000"
          />
        </div>
      </div>
    </form>
  );

  /* --------------------------------------------------------- profile rail */

  const profileRail = (
    <>
      <div className="org-st-card">
        <div className="org-st-card-head" style={{ marginBottom: 14 }}>
          <div>
            <div className="org-st-card-title">Organisation Preview</div>
            <div className="org-st-card-sub">
              This is how your organisation appears to members.
            </div>
          </div>
        </div>

        <div className="org-st-preview">
          <div className="org-st-preview-head">
            <span className="org-st-preview-logo">
              {org?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt="" />
              ) : (
                logoLetter
              )}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="org-st-preview-name">{d.name || org?.name || 'Organisation'}</span>
              <span className="org-st-preview-kind">Organisation Workspace</span>
            </span>
            <a
              className="org-st-preview-link"
              href={d.website || '#'}
              target="_blank"
              rel="noreferrer"
              aria-label="Open website"
            >
              <ExternalLink size={15} strokeWidth={2} />
            </a>
          </div>

          {d.description && <p className="org-st-preview-desc">{d.description}</p>}

          <div className="org-st-preview-rows">
            {d.website && (
              <div className="org-st-preview-row">
                <Globe size={14} strokeWidth={2} aria-hidden="true" />
                <span className="org-st-preview-value">
                  <a href={d.website} target="_blank" rel="noreferrer">
                    {d.website}
                  </a>
                </span>
              </div>
            )}
            {d.industry && (
              <div className="org-st-preview-row">
                <Building size={14} strokeWidth={2} aria-hidden="true" />
                <span className="org-st-preview-value">{d.industry}</span>
              </div>
            )}
            {sizeLabel(d.org_size) && (
              <div className="org-st-preview-row">
                <Users size={14} strokeWidth={2} aria-hidden="true" />
                <span className="org-st-preview-value">{sizeLabel(d.org_size)}</span>
              </div>
            )}
            {d.address && (
              <div className="org-st-preview-row">
                <MapPin size={14} strokeWidth={2} aria-hidden="true" />
                <span className="org-st-preview-value" title={d.address}>
                  {d.address}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="org-st-card">
        <div className="org-st-card-title">Branding Guidelines</div>
        <div className="org-st-card-sub">
          Use your logo and brand details consistently across emails, meeting summaries and
          invitations.
        </div>
        <button
          type="button"
          className="org-st-guide-btn"
          onClick={() =>
            setStatus({
              kind: 'info',
              text: 'No branding guide has been uploaded for this workspace yet.',
            })
          }
        >
          <FileText size={16} strokeWidth={2} aria-hidden="true" />
          View Branding Guide
          <ChevronRight size={15} className="chev" aria-hidden="true" />
        </button>
      </div>

      <div className="org-st-notice info">
        <Info size={15} aria-hidden="true" />
        <div className="org-st-notice-body">
          Need to update legal information?
          <div style={{ color: '#475569', marginTop: 2 }}>
            For changes to organisation ownership, legal name or other official details, contact
            support.
          </div>
          <a className="org-st-notice-link" href="mailto:support@sentio.in">
            Contact Support
            <ChevronRight size={13} strokeWidth={2.4} aria-hidden="true" />
          </a>
        </div>
      </div>
    </>
  );

  /* ------------------------------------------------------------ default set */

  const defaultSettingsCard = (
    <div className="org-st-card">
      <div className="org-st-card-head">
        <div>
          <div className="org-st-card-title">Default Settings</div>
          <div className="org-st-card-sub">
            These settings apply to all members in your organisation.
          </div>
        </div>
        <button
          type="button"
          className="org-st-btn primary"
          onClick={saveDefaults}
          disabled={savingDefaults || !isAdmin || !defaults}
        >
          {savingDefaults ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="org-st-rows">
        <div className="org-st-row">
          <span className="org-st-row-icon">
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-row-text">
            <span className="org-st-row-label">Auto Record Meetings</span>
            <span className="org-st-row-sub">Automatically record meetings for all members.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(defaults?.auto_record_meetings)}
            aria-label="Auto Record Meetings"
            className="org-st-toggle"
            onClick={toggleDefault('auto_record_meetings')}
            disabled={!isAdmin}
          />
        </div>

        <div className="org-st-row">
          <span className="org-st-row-icon">
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-row-text">
            <span className="org-st-row-label">Auto Generate Summaries</span>
            <span className="org-st-row-sub">
              Generate AI summaries and action items automatically.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(defaults?.auto_summaries)}
            aria-label="Auto Generate Summaries"
            className="org-st-toggle"
            onClick={toggleDefault('auto_summaries')}
            disabled={!isAdmin}
          />
        </div>

        <div className="org-st-row">
          <span className="org-st-row-icon">
            <Languages size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-row-text">
            <span className="org-st-row-label">Default Language</span>
            <span className="org-st-row-sub">Language for transcripts and summaries.</span>
          </span>
          <span className="org-st-row-control">
            <select
              className="org-st-select"
              value={defaults?.default_language ?? 'English'}
              onChange={(e) =>
                setDefaults((v) => (v ? { ...v, default_language: e.target.value } : v))
              }
              disabled={!isAdmin}
              aria-label="Default Language"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div className="org-st-row">
          <span className="org-st-row-icon">
            <Lock size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-row-text">
            <span className="org-st-row-label">Default Meeting Privacy</span>
            <span className="org-st-row-sub">Set default privacy for new meetings.</span>
          </span>
          <span className="org-st-row-control">
            <select
              className="org-st-select"
              value={defaults?.default_privacy ?? 'Team (Workspace)'}
              onChange={(e) =>
                setDefaults((v) => (v ? { ...v, default_privacy: e.target.value } : v))
              }
              disabled={!isAdmin}
              aria-label="Default Meeting Privacy"
            >
              {PRIVACY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>
    </div>
  );

  /* ----------------------------------------------------------- plan rail */

  const planRail = (
    <>
      <div className="org-st-card">
        <div className="org-st-plan-head">
          <span className="org-st-card-title">Current Plan</span>
          <span className="org-st-plan-badge">{plan.tier || '—'}</span>
        </div>

        <div className="org-st-plan-name">{org?.name || 'Organisation'}</div>
        <div className="org-st-plan-tag">
          {plan.tier ? 'For growing teams and organisations.' : 'No active subscription on record.'}
        </div>

        <div className="org-st-stat">
          <div>
            <div className="org-st-stat-value">
              {plan.members ?? '—'}
              {plan.memberLimit ? <small> / {plan.memberLimit}</small> : null}
            </div>
            <div className="org-st-stat-label">Active Members</div>
          </div>
          <span className="org-st-stat-icon">
            <Users size={16} strokeWidth={2} aria-hidden="true" />
          </span>
        </div>

        <div className="org-st-stat" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="org-st-stat-value">
                {plan.usedLabel || '—'}
                {plan.quotaLabel ? <small> / {plan.quotaLabel}</small> : null}
              </div>
              <div className="org-st-stat-label">Storage Used</div>
            </div>
            <span className="org-st-stat-icon">
              <HardDrive size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          {plan.usedPct !== null && (
            <div className="org-st-meter">
              <span className="org-st-meter-track">
                <span className="org-st-meter-fill" style={{ width: `${plan.usedPct}%` }} />
              </span>
              <span className="org-st-meter-pct">{plan.usedPct}%</span>
            </div>
          )}
        </div>

        <Link
          href="/organisation/billing"
          className="org-st-btn soft"
          style={{ marginTop: 14, textDecoration: 'none' }}
        >
          Manage Billing
          <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>

      <div className="org-st-card">
        <div className="org-st-danger-head">
          <AlertTriangle size={18} strokeWidth={2.1} aria-hidden="true" />
          <span>Danger Zone</span>
        </div>

        <button
          type="button"
          className="org-st-danger-item"
          disabled={!canEdit}
          onClick={() =>
            setStatus({
              kind: 'info',
              text: 'Ownership transfer calls the transfer_organisation_ownership RPC from the migration file.',
            })
          }
        >
          <span className="org-st-danger-icon">
            <UserCog size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-danger-text">
            <span className="org-st-danger-label">Transfer Ownership</span>
            <span className="org-st-danger-sub">
              Transfer organisation ownership to another admin.
            </span>
          </span>
          <ChevronRight size={15} color="#94A3B8" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="org-st-danger-item destructive"
          disabled={!canEdit}
          onClick={() => {
            if (
              !window.confirm(
                `Permanently delete ${org?.name || 'this organisation'} and all of its data? This cannot be undone.`
              )
            )
              return;
            setStatus({
              kind: 'error',
              text: 'Deletion is disabled in this build. Re-enable only after adding a confirmation step.',
            });
          }}
        >
          <span className="org-st-danger-icon">
            <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="org-st-danger-text">
            <span className="org-st-danger-label">Delete Organisation</span>
            <span className="org-st-danger-sub">
              Permanently delete your organisation and all associated data.
            </span>
          </span>
          <ChevronRight size={15} color="#94A3B8" aria-hidden="true" />
        </button>

        {!canEdit && (
          <div className="org-st-hint" style={{ marginTop: 12 }}>
            Signed in as {session?.user?.email} · requires owner role
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <TopHeader placeholder="Search meetings, people, teams, or insights..." />

      <OrganisationPage chrome={false}>
        <h1 className="org-st-title">Organisation Settings</h1>
        <p className="org-st-sub">
          Manage your organisation&apos;s preferences, security, integrations and more.
        </p>

        <div className="org-st">
          {/* -------------------------------------------------- section nav */}
          <nav className="org-st-nav" aria-label="Settings sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isRoute = Boolean(SECTION_ROUTES[s.id]);
              const cls = `org-st-nav-item ${section === s.id && !isRoute ? 'active' : ''}`;
              const inner = (
                <>
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  {s.label}
                </>
              );
              return isRoute ? (
                <Link key={s.id} href={SECTION_ROUTES[s.id]} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button
                  key={s.id}
                  type="button"
                  className={cls}
                  aria-current={section === s.id ? 'page' : undefined}
                  onClick={() => goToSection(s.id)}
                >
                  {inner}
                </button>
              );
            })}
          </nav>

          {/* ---------------------------------- content / members + teams */}
          {section === 'access' ? (
            <div className="org-st-access">
              <MembersAccessPanel variant="settings" />
            </div>
          ) : section === 'teams' ? (
            <div className="org-st-access">
              <TeamsPanel />
            </div>
          ) : section === 'meetings' ? (
            <div className="org-st-access">
              <MeetingSettingsPanel />
            </div>
          ) : section === 'integrations' ? (
            <div className="org-st-access">
              <IntegrationsPanel />
            </div>
          ) : section === 'billing' ? (
            <div className="org-st-access">
              <BillingPanel />
            </div>
          ) : (
            <>
              <div className="org-st-main">
                {status && (
                  <div
                    className={`org-st-notice ${status.kind}`}
                    role={status.kind === 'error' ? 'alert' : 'status'}
                  >
                    {status.kind === 'ok' ? (
                      <Check size={15} aria-hidden="true" />
                    ) : status.kind === 'error' ? (
                      <AlertCircle size={15} aria-hidden="true" />
                    ) : (
                      <Info size={15} aria-hidden="true" />
                    )}
                    <span className="org-st-notice-body">{status.text}</span>
                  </div>
                )}

            {section === 'profile' && profileForm}
            {section === 'general' && defaultSettingsCard}

            {section === 'data' &&
              notBuilt(
                'Data & Storage',
                'Storage usage appears in the Current Plan card once your billing provider reports it.'
              )}
              </div>

              {/* ---------------------------------------------------------- rail */}
              <div className="org-st-rail" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {section === 'profile' ? profileRail : planRail}
              </div>
            </>
          )}
        </div>
      </OrganisationPage>
    </>
  );
}
