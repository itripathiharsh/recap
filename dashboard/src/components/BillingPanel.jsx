'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Star,
  CreditCard,
  CalendarCog,
  HardDrive,
  Users,
  Check,
  Download,
  Plus,
  MoreHorizontal,
  LifeBuoy,
  Info,
  X,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';

/**
 * Public plan catalogue. Prices and allowances are marketing copy — they are
 * what a customer would be quoted, not a record of what anyone has been
 * charged. Nothing here is read back as an invoice.
 */
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 499,
    blurb: 'For individuals and small teams',
    meetings: 25,
    storageGb: 10,
    members: 3,
  },
  {
    id: 'team',
    name: 'Team',
    price: 1999,
    blurb: 'For growing teams',
    meetings: 100,
    storageGb: 50,
    members: 10,
  },
  {
    id: 'business',
    name: 'Business',
    price: 4999,
    blurb: 'For larger organisations',
    meetings: 500,
    storageGb: 250,
    members: 50,
  },
];

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

const DASH = '\u2014';

function inr(n) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function gb(bytes) {
  const g = bytes / 1024 ** 3;
  if (g >= 100) return `${Math.round(g).toLocaleString('en-IN')} GB`;
  if (Number.isInteger(g)) return `${g} GB`;
  return `${g.toFixed(1)} GB`;
}

/** Matches the loose plan strings a billing webhook may write. */
function matchPlan(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return null;
  const direct = BY_ID.get(key);
  if (direct) return direct;
  for (const p of PLANS) {
    const name = p.name.toLowerCase();
    if (key.includes(name.toLowerCase())) return p;
  }
  return null;
}

function UsageRow({ icon: Icon, label, value, raw, quota, quotaLabel, tone, over, note }) {
  const known =
    typeof quota === 'number' && Number.isFinite(quota) && quota > 0 && typeof raw === 'number' && Number.isFinite(raw);
  const pct = known ? Math.min(100, Math.round((raw / quota) * 100)) : null;
  const fillTone = over ? 'red' : tone;

  return (
    <div className="org-bi-usage">
      <div className="org-bi-usage-top">
        <span className="org-bi-usage-icon" data-tone={tone}>
          <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <span className="org-bi-usage-label">{label}</span>
        <span className="org-bi-usage-value">
          <strong>{value}</strong>
          <span className="org-bi-usage-quota">{known ? ` / ${quotaLabel}` : ''}</span>
          {pct != null && <span className="org-bi-usage-pct">{pct}%</span>}
        </span>
      </div>

          {known ? (
            <div
              className="org-bi-bar"
              role="progressbar"
              aria-label={label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className="org-bi-bar-fill" data-tone={fillTone} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          ) : (
            <div className="org-bi-usage-note">{note}</div>
          )}
    </div>
  );
}

/**
 * Settings -> Billing (and the standalone /organisation/billing page).
 *
 * There is no billing provider wired up, so nothing here may invent a plan, a
 * price, a renewal date, an invoice or a card. What is real is read from
 * `organisation_settings`, `organisation_members` and `meetings`; everything
 * else renders as "not reported" with an explanation.
 */
export default function BillingPanel() {
  const { activeOrgId, activeOrgRole } = useWorkspace();

  const [settings, setSettings] = useState(undefined); // undefined = loading
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [members, setMembers] = useState([]);
  const [meetings, setMeetings] = useState(null);
  const [picked, setPicked] = useState(null);
  const [status, setStatus] = useState(null);

  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) {
        setMembers([]);
        setMeetings(null);
        return;
      }
      const [settingsRes, memberRes, meetingRes] = await Promise.all([
        supabase
          .from('organisation_settings')
          .select('plan, member_limit, storage_quota_bytes, storage_used_bytes')
          .eq('organisation_id', activeOrgId)
          .maybeSingle(),
        supabase
          .from('organisation_members')
          .select('id, role, status')
          .eq('organisation_id', activeOrgId),
        applyWorkspaceScope(supabase.from('meetings').select('id'), activeOrgId),
      ]);

      if (cancelled) return;

      if (settingsRes.error) {
        setSettings(null);
        setSettingsMissing(true);
      } else {
        setSettings(settingsRes.data || null);
        setSettingsMissing(false);
      }

      setMembers(memberRes.data || []);
      setMeetings(meetingRes.error ? null : meetingRes.data || []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  /* ---------------------------------------------------------------- derived */

  const plan = useMemo(() => matchPlan(settings?.plan), [settings]);
  const rawPlan = settings?.plan?.trim() || '';
  const unknownPlan = !!rawPlan && !plan;

  const activeMembers = useMemo(
    () => members.filter((m) => (m.status || 'active') === 'active').length,
    [members]
  );

  const memberQuota = settings?.member_limit ?? plan?.members ?? null;
  const meetingQuota = plan?.meetings ?? null;
  const storageQuotaBytes = settings?.storage_quota_bytes ?? (plan ? plan.storageGb * 1024 ** 3 : null);
  const storageUsedBytes = settings?.storage_used_bytes ?? null;

  const seatCount = members.length;
  const seatsOverage = memberQuota != null ? Math.max(0, activeMembers - memberQuota) : 0;

  const meetingCount = meetings?.length ?? null;
  const meetingOverage = meetingCount != null && meetingQuota != null ? Math.max(0, meetingCount - meetingQuota) : 0;

  const storageOverage =
    storageUsedBytes != null && storageQuotaBytes ? Math.max(0, storageUsedBytes - storageQuotaBytes) : 0;

  const overages = [
    seatsOverage > 0 && `${seatsOverage} member${seatsOverage > 1 ? 's' : ''} over the seat limit`,
    meetingOverage > 0 && `${meetingOverage} meeting${meetingOverage > 1 ? 's' : ''} over the cycle limit`,
    storageOverage > 0 && `${gb(storageOverage)} over the storage limit`,
  ].filter(Boolean);

  const loading = settings === undefined;

  const selection = picked || plan?.id || null;

  const requestChangePlan = (nextId) => {
    setPicked(nextId);
    if (nextId === plan?.id) {
      setStatus({ kind: 'info', text: 'That is already the plan recorded for this organisation.' });
      return;
    }
    setStatus({
      kind: 'info',
      text: `Plan changes need a billing provider, which is not connected. Nothing has been charged — apply the change once one is wired up.`,
    });
  };

  const onCancel = () => {
    setStatus({
      kind: 'info',
      text: 'Cancelling is handled by the billing provider. No subscription is recorded for this organisation, so there is nothing to cancel.',
    });
  };

  return (
    <div className="org-bi-root">
      {/* ------------------------------------------------------------- hero */}
      <section className="org-bi-hero">
        <span className="org-bi-hero-badge">Billing</span>
        <h1 className="org-bi-hero-title">
          Simple and <em>transparent pricing.</em>
        </h1>
        <p className="org-bi-hero-sub">
          Manage your plan, usage, invoices and payment methods for your organisation.
        </p>

        <div className="org-bi-hero-doodle" aria-hidden="true">
          <span className="org-bi-doodle-text">
            {'Get the right plan\nfor your team\u2019s needs.'}
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

        <div className="org-bi-hero-art" aria-hidden="true">
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="bi-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M40 168 C40 116, 84 88, 150 88 C216 88, 260 118, 260 168 Z" fill="url(#bi-blob)" opacity="0.75" />

            {/* invoice document */}
            <rect x="58" y="22" width="96" height="118" rx="8" fill="#FFFFFF" stroke="#DCE9F9" />
            <rect x="70" y="38" width="40" height="7" rx="3.5" fill="#0F172A" opacity="0.82" />
            <rect x="70" y="53" width="72" height="5" rx="2.5" fill="#CBD5E1" />
            <rect x="70" y="63" width="60" height="5" rx="2.5" fill="#CBD5E1" />
            <rect x="70" y="80" width="72" height="5" rx="2.5" fill="#E2E8F0" />
            <rect x="70" y="90" width="64" height="5" rx="2.5" fill="#E2E8F0" />
            <rect x="70" y="100" width="72" height="5" rx="2.5" fill="#E2E8F0" />
            <circle cx="128" cy="122" r="11" fill="#D9F7E8" />
            <path d="M123 122l3.4 3.4L133 118.8" stroke="#047857" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <rect x="70" y="124" width="40" height="5" rx="2.5" fill="#CBD5E1" />

            {/* credit card */}
            <rect x="150" y="66" width="104" height="70" rx="10" fill="#FFFFFF" stroke="#DCE9F9" />
            <rect x="150" y="66" width="104" height="18" fill="#0066FF" />
            <rect x="150" y="78" width="104" height="6" fill="#0066FF" />
            <rect x="162" y="96" width="26" height="4" rx="2" fill="#CBD5E1" />
            <rect x="162" y="106" width="18" height="4" rx="2" fill="#E2E8F0" />
            <rect x="196" y="110" width="46" height="14" rx="4" fill="#F1F5F9" />
            <text
              x="219"
              y="120.5"
              textAnchor="middle"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontSize="8"
              fontWeight="800"
              fill="#0F172A"
            >
              VISA
            </text>
          </svg>
        </div>
      </section>

      {settingsMissing && (
        <div className="org-bi-notice info">
          <Info size={15} aria-hidden="true" />
          <span>
            We couldn't load your plan and usage figures just now, so this page is showing what we
            can confirm. No charges have been made.
          </span>
        </div>
      )}

      {status && (
        <div className={`org-bi-notice ${status.kind}`} role="status">
          {status.kind === 'ok' ? (
            <CheckCircle2 size={15} aria-hidden="true" />
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

      {/* ---------------------------------------------------------- row one */}
      <div className="org-bi-row">
        {/* ------------------------------------------------- current plan */}
        <section className="org-bi-card">
          <div className="org-bi-card-head">
            <div className="org-bi-card-title">Current Plan</div>
            {plan ? (
              <span className="org-bi-pill active">
                <Check size={12} strokeWidth={2.8} aria-hidden="true" />
                Active
              </span>
            ) : (
              <span className="org-bi-pill unknown">Not reported</span>
            )}
          </div>

          <div className="org-bi-plan">
            <span className="org-bi-plan-mark" aria-hidden="true">
              <Star size={20} fill="currentColor" strokeWidth={1.6} />
            </span>
            <div>
              <div className="org-bi-plan-name">{plan ? plan.name : rawPlan || 'Unknown plan'}</div>
              <div className="org-bi-plan-blurb">
                {plan
                  ? plan.blurb
                  : rawPlan
                    ? 'Not a plan in the public catalogue, so no price or allowance is quoted for it.'
                    : 'No plan is recorded for this organisation yet, so nothing is being charged or quoted here.'}
              </div>
            </div>
          </div>

          <div className="org-bi-price">
            <span className="org-bi-price-amount">{plan ? inr(plan.price) : DASH}</span>
            {plan && <span className="org-bi-price-unit">/ month</span>}
          </div>

          <div className="org-bi-renew">
            <span className="org-bi-renew-label">Next renewal</span>
            <span className="org-bi-renew-value">
              {DASH}
              <span className="org-bi-renew-note"> billing provider not connected</span>
            </span>
          </div>

          <div className="org-bi-actions">
            <button
              type="button"
              className="org-bi-btn primary"
              onClick={() =>
                setStatus({
                  kind: 'info',
                  text: 'Pick a plan from Available Plans. Upgrading needs a billing provider, so no charge is made here.',
                })
              }
            >
              Change Plan
            </button>
            <button type="button" className="org-bi-btn ghost" onClick={onCancel} disabled={!plan}>
              Cancel Plan
            </button>
          </div>

          {unknownPlan && (
            <p className="org-bi-foot-note">
              Recorded as <code>{rawPlan}</code>. A billing provider maps that value to a real plan.
            </p>
          )}
        </section>

        {/* ------------------------------------------------------- usage */}
        <section className="org-bi-card">
          <div className="org-bi-card-head">
            <div className="org-bi-card-title">Usage</div>
            <span className="org-bi-cycle">
              <CalendarCog size={13} strokeWidth={2.1} aria-hidden="true" />
              {DASH} &middot; current cycle not reported
            </span>
          </div>

          <UsageRow
            icon={CalendarCog}
            tone="blue"
            label="Meetings Recorded"
            value={meetingCount == null ? DASH : meetingCount.toLocaleString('en-IN')}
            raw={meetingCount}
            quota={meetingQuota}
            quotaLabel={meetingQuota == null ? null : meetingQuota.toLocaleString('en-IN')}
            over={meetingOverage > 0}
            note={
              meetingCount == null
                ? 'Meeting count unavailable.'
                : plan
                  ? 'Counted from recorded meetings this cycle.'
                  : 'No plan recorded, so no meeting allowance applies.'
            }
          />

          <UsageRow
            icon={HardDrive}
            tone="violet"
            label="Storage Used"
            value={storageUsedBytes == null ? DASH : gb(storageUsedBytes)}
            raw={storageUsedBytes}
            quota={storageQuotaBytes}
            quotaLabel={storageQuotaBytes == null ? null : gb(storageQuotaBytes)}
            over={storageOverage > 0}
            note="Storage usage is reported by the billing provider, which is not connected."
          />

          <UsageRow
            icon={Users}
            tone="green"
            label="Team Members"
            value={activeMembers.toLocaleString('en-IN')}
            raw={activeMembers}
            quota={memberQuota}
            quotaLabel={memberQuota == null ? null : memberQuota.toLocaleString('en-IN')}
            over={seatsOverage > 0}
            note="Seat limit is reported by the billing provider, which is not connected."
          />

          {overages.length > 0 && (
            <div className="org-bi-notice warn">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{overages.join(' and ')}.</span>
            </div>
          )}

          <p className="org-bi-foot-note">
            {seatCount} seat{seatCount === 1 ? '' : 's'} recorded
            {meetingCount == null ? '' : `, ${meetingCount} meeting${meetingCount === 1 ? '' : 's'} in this workspace`}.
          </p>
        </section>

        {/* --------------------------------------------------- available plans */}
        <section className="org-bi-card">
          <div className="org-bi-card-head">
            <div className="org-bi-card-title">Available Plans</div>
          </div>

          <div className="org-bi-plans" role="radiogroup" aria-label="Available plans">
            {PLANS.map((p) => {
              const on = selection === p.id;
              const isCurrent = plan?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`org-bi-plan-option${on ? ' on' : ''}`}
                  onClick={() => requestChangePlan(p.id)}
                >
                  <span className="org-bi-radio" aria-hidden="true">
                    {on && <span className="org-bi-radio-dot" />}
                  </span>
                  <span className="org-bi-plan-option-text">
                    <span className="org-bi-plan-option-top">
                      <span className="org-bi-plan-option-name">{p.name}</span>
                      <span className="org-bi-plan-option-price">
                        {inr(p.price)} <span className="org-bi-plan-option-unit">/ month</span>
                      </span>
                    </span>
                    <span className="org-bi-plan-option-blurb">
                      {p.blurb} &middot; up to {p.meetings} meetings, {p.storageGb} GB, {p.members} seats
                    </span>
                    {isCurrent && <span className="org-bi-plan-option-tag">Current plan</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="org-bi-btn soft full"
            onClick={() =>
              setStatus({
                kind: 'info',
                text: 'Plan comparison details are not published yet.',
              })
            }
          >
            Compare All Plans
            <ArrowRight size={14} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </section>
      </div>

      {/* ---------------------------------------------------------- row two */}
      <div className="org-bi-row org-bi-row-two">
        <section className="org-bi-card">
          <div className="org-bi-card-head">
            <div>
              <div className="org-bi-card-title">Invoices</div>
              <div className="org-bi-card-sub">View and download your past invoices.</div>
            </div>
            <label className="org-bi-select-label">
              <span className="sr-only">Invoice period</span>
              <select className="org-bi-select" defaultValue="12" disabled>
                <option value="12">Last 12 months</option>
              </select>
            </label>
          </div>

          <div className="org-bi-empty">
            <span className="org-bi-empty-icon" aria-hidden="true">
              <Download size={17} strokeWidth={2.1} />
            </span>
            <div>
              <div className="org-bi-empty-title">No invoices yet</div>
              <p className="org-bi-empty-sub">
                Invoices are issued by the billing provider once a paid subscription exists. Nothing
                has been charged for this organisation.
              </p>
            </div>
          </div>
        </section>

        <section className="org-bi-card">
          <div className="org-bi-card-head">
            <div>
              <div className="org-bi-card-title">Payment Methods</div>
              <div className="org-bi-card-sub">Manage your saved payment methods.</div>
            </div>
          </div>

          <div className="org-bi-empty">
            <span className="org-bi-empty-icon" aria-hidden="true">
              <CreditCard size={17} strokeWidth={2.1} />
            </span>
            <div>
              <div className="org-bi-empty-title">No payment method saved</div>
              <p className="org-bi-empty-sub">
                Cards are stored by the billing provider, not in this app. Adding one is disabled
                until a provider is connected.
              </p>
            </div>
          </div>

          <button type="button" className="org-bi-btn soft full" onClick={() => onCancel()} disabled>
            <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
            Add Payment Method
          </button>
        </section>
      </div>

      {/* ------------------------------------------------------------ help */}
      <div className="org-bi-notice help">
        <LifeBuoy size={16} strokeWidth={2.1} aria-hidden="true" />
        <div className="org-bi-notice-body">
          <strong>Need help with billing?</strong>
          <div>
            If you have any questions about your plan, usage or invoices, contact our support team.
          </div>
          <button
            type="button"
            className="org-bi-docs"
            onClick={() =>
              setStatus({
                kind: 'info',
                text: 'No support address is configured for this environment yet.',
              })
            }
          >
            Contact Support
            <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        {canManage && (
          <button
            type="button"
            className="org-bi-kebab"
            aria-label="Billing options"
            onClick={() =>
              setStatus({
                kind: 'info',
                text: 'Billing settings such as tax details and receipts are managed by the billing provider.',
              })
            }
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
