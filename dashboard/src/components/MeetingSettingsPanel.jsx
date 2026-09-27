'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Video,
  Bell,
  Shield,
  Bot,
  Clock,
  FileText,
  CheckSquare,
  Users,
  Languages,
  Info,
  Link2,
  Pencil,
  Check,
  AlertCircle,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

const QUALITIES = ['High (1080p)', 'Standard (720p)', 'Low (480p)'];

const DELAYS = [
  { value: 0, label: 'Immediately' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
];

const LANGUAGES = [
  'English (Auto-detect)',
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Japanese',
];

const DEFAULT_MESSAGE =
  "Hi everyone! I'm Recap Notetaker from Sentio Mind. I'll be recording this meeting to generate a transcript, summary and action items.";

/** Which settings columns this screen owns — used to detect a stale migration. */
const OWNED_COLUMNS = [
  'auto_record_meetings',
  'recording_notification',
  'recording_quality',
  'bot_name',
  'join_delay_seconds',
  'auto_summaries',
  'generate_transcripts',
  'extract_action_items',
  'detect_speakers',
  'default_language',
  'default_meeting_message',
  'allowed_domains',
  'blocked_keywords',
];

const DEFAULTS = {
  auto_record_meetings: true,
  recording_notification: true,
  recording_quality: 'High (1080p)',
  bot_name: 'Recap Notetaker',
  join_delay_seconds: 60,
  auto_summaries: true,
  generate_transcripts: true,
  extract_action_items: true,
  detect_speakers: true,
  default_language: 'English (Auto-detect)',
  default_meeting_message: DEFAULT_MESSAGE,
  allowed_domains: [],
  blocked_keywords: [],
};

/**
 * Settings -> Meeting Settings.
 *
 * Persists to `organisation_settings`. If the optional columns are not present
 * yet (migration not applied) the screen still renders real defaults and says so,
 * rather than silently pretending to save.
 */
export default function MeetingSettingsPanel() {
  const { activeOrgId, activeOrgRole } = useWorkspace();

  const [values, setValues] = useState(DEFAULTS);
  const [initial, setInitial] = useState(DEFAULTS);
  const [schemaReady, setSchemaReady] = useState(true);
  const [status, setStatus] = useState(null);
  const [savingField, setSavingField] = useState(null);
  const [editingMessage, setEditingMessage] = useState(false);
  const [listDraft, setListDraft] = useState({ key: '', entry: '' });

  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  /* ------------------------------------------------------------------ load */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeOrgId) return;
      try {
        // Only select columns we know exist in the base table, so the panel loads
        // even when the extended columns have not been added yet.
        const { data, error } = await supabase
          .from('organisation_settings')
          .select('*')
          .eq('organisation_id', activeOrgId)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          setSchemaReady(false);
          setValues(DEFAULTS);
          setInitial(DEFAULTS);
          return;
        }

        const present = OWNED_COLUMNS.filter((c) => data[c] !== undefined);
        setSchemaReady(present.length >= OWNED_COLUMNS.length - 2);

        const next = { ...DEFAULTS };
        OWNED_COLUMNS.forEach((c) => {
          if (data[c] !== undefined && data[c] !== null) next[c] = data[c];
        });
        setValues(next);
        setInitial(next);
      } catch (err) {
        console.error('Meeting settings load error:', err);
        setSchemaReady(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  /* ------------------------------------------------------------------ save */

  const persist = async (patch) => {
    if (!activeOrgId) return;
    const previous = { ...values };
    setValues((v) => ({ ...v, ...patch }));
    setStatus(null);
    try {
      const { error } = await supabase
        .from('organisation_settings')
        .update(patch)
        .eq('organisation_id', activeOrgId);
      if (error) throw error;
      setInitial((v) => ({ ...v, ...patch }));
    } catch (err) {
      setValues(previous);
      setStatus({
        kind: 'error',
        text: err.message || "We couldn't save your meeting settings. Please try again.",
      });
    }
  };

  const onToggle = (key) => async () => {
    if (!canManage) return;
    setSavingField(key);
    await persist({ [key]: !values[key] });
    setSavingField(null);
  };

  const onSelect = (key) => async (e) => {
    if (!canManage) return;
    const raw = e.target.value;
    const value = key === 'join_delay_seconds' ? Number(raw) : raw;
    setSavingField(key);
    await persist({ [key]: value });
    setSavingField(null);
  };

  const onText = (key) => async (e) => {
    if (!canManage) return;
    setSavingField(key);
    await persist({ [key]: e.target.value });
    setSavingField(null);
  };

  const saveMessage = async () => {
    setEditingMessage(false);
    await persist({ default_meeting_message: values.default_meeting_message });
  };

  const addListEntry = async (key) => {
    const entry = listDraft.entry.trim();
    if (!entry) return;
    const next = [...(values[key] || []), entry];
    setListDraft({ key: '', entry: '' });
    await persist({ [key]: next });
  };

  const removeListEntry = async (key, index) => {
    const next = (values[key] || []).filter((_, i) => i !== index);
    await persist({ [key]: next });
  };

  const dirty = useMemo(
    () => OWNED_COLUMNS.some((c) => JSON.stringify(values[c]) !== JSON.stringify(initial[c])),
    [values, initial]
  );

  const botName = values.bot_name || 'Recap Notetaker';
  const message = values.default_meeting_message || DEFAULT_MESSAGE;

  return (
    <div className="org-ms-root">
      {/* ------------------------------------------------------------- hero */}
      <section className="org-ms-hero">
        <span className="org-ms-hero-badge">Meeting Settings</span>
        <h1 className="org-ms-hero-title">
          Standardise your meetings, <em>effortlessly.</em>
        </h1>
        <p className="org-ms-hero-sub">
          Configure how meetings are recorded, processed and shared across your organisation.
        </p>

        <div className="org-ms-hero-doodle" aria-hidden="true">
          <span className="org-ms-doodle-text">
            {'Set default preferences\nfor your team meetings.'}
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

        <div className="org-ms-hero-art" aria-hidden="true">
          <svg viewBox="0 0 300 168" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="ms-blob" x1="150" y1="10" x2="150" y2="168" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8E8FD" />
                <stop offset="1" stopColor="#EEF5FE" />
              </linearGradient>
            </defs>
            <path d="M56 168 C56 118, 96 92, 156 92 C216 92, 256 120, 256 168 Z" fill="url(#ms-blob)" opacity="0.8" />

            {/* calendar */}
            <rect x="86" y="30" width="128" height="112" rx="12" fill="#FFFFFF" />
            <rect x="86.75" y="30.75" width="126.5" height="34.5" rx="11.25" fill="#0066FF" />
            <rect x="112" y="20" width="8" height="20" rx="4" fill="#0F172A" opacity="0.85" />
            <rect x="180" y="20" width="8" height="20" rx="4" fill="#0F172A" opacity="0.85" />
            <g fill="#DCE7F5">
              <rect x="104" y="78" width="20" height="16" rx="4" />
              <rect x="134" y="78" width="20" height="16" rx="4" />
              <rect x="164" y="78" width="20" height="16" rx="4" />
              <rect x="104" y="104" width="20" height="16" rx="4" />
              <rect x="134" y="104" width="20" height="16" rx="4" />
            </g>
            <rect x="164" y="104" width="20" height="16" rx="4" fill="#0066FF" opacity="0.35" />

            {/* gear badge — 8 teeth rotated around a ring reads as a gear at any size */}
            <circle cx="222" cy="112" r="34" fill="#FFFFFF" />
            <circle cx="222" cy="112" r="28" fill="#0066FF" />
            <g fill="#FFFFFF">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <rect
                  key={deg}
                  x="218.5"
                  y="93"
                  width="7"
                  height="11"
                  rx="2.5"
                  transform={`rotate(${deg} 222 112)`}
                />
              ))}
              <circle cx="222" cy="112" r="14" />
            </g>
            <circle cx="222" cy="112" r="6.5" fill="#0066FF" />
          </svg>
        </div>
      </section>

      {!schemaReady && (
        <div className="org-ms-notice info">
          <Info size={15} aria-hidden="true" />
          <span>
            We couldn't load your saved meeting settings, so these are showing defaults. Saving may
            not stick until this is resolved.
          </span>
        </div>
      )}

      {status && (
        <div className={`org-ms-notice ${status.kind}`} role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------- content */}
      <div className="org-ms-split">
        <div className="org-ms-main">
          {/* recording */}
          <section className="org-ms-card">
            <div className="org-ms-card-head">
              <div>
                <div className="org-ms-card-title">Recording Settings</div>
                <div className="org-ms-card-sub">
                  Configure how meetings are recorded across your organisation.
                </div>
              </div>
            </div>

            <div className="org-ms-rows">
              <Row
                icon={<Video size={16} strokeWidth={2} />}
                tone="blue"
                label="Auto Record Meetings"
                sub="Automatically join and record scheduled meetings."
                control={
                  <Toggle
                    label="Auto Record Meetings"
                    checked={values.auto_record_meetings}
                    onToggle={onToggle('auto_record_meetings')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Bell size={16} strokeWidth={2} />}
                tone="violet"
                label="Recording Notification"
                sub="Show a notification message when the bot joins."
                control={
                  <Toggle
                    label="Recording Notification"
                    checked={values.recording_notification}
                    onToggle={onToggle('recording_notification')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Shield size={16} strokeWidth={2} />}
                tone="green"
                label="Recording Quality"
                sub="Choose the default audio/video quality for recordings."
                control={
                  <Select
                    label="Recording Quality"
                    value={values.recording_quality}
                    options={QUALITIES}
                    onChange={onSelect('recording_quality')}
                    disabled={!canManage || savingField === 'recording_quality'}
                  />
                }
              />
              <Row
                icon={<Bot size={16} strokeWidth={2} />}
                tone="amber"
                label="Bot Name"
                sub="Name shown when the recorder joins the meeting."
                control={
                  <TextInput
                    label="Bot Name"
                    value={values.bot_name}
                    onChange={onText('bot_name')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Clock size={16} strokeWidth={2} />}
                tone="green"
                label="Join Delay"
                sub="Time to wait before joining the meeting."
                control={
                  <Select
                    label="Join Delay"
                    value={String(values.join_delay_seconds)}
                    options={DELAYS.map((d) => ({ value: String(d.value), label: d.label }))}
                    onChange={onSelect('join_delay_seconds')}
                    disabled={!canManage || savingField === 'join_delay_seconds'}
                  />
                }
              />
            </div>
          </section>

          {/* ai processing */}
          <section className="org-ms-card">
            <div className="org-ms-card-head">
              <div>
                <div className="org-ms-card-title">AI Processing Settings</div>
                <div className="org-ms-card-sub">Configure how AI processes meeting content.</div>
              </div>
            </div>

            <div className="org-ms-rows">
              <Row
                icon={<FileText size={16} strokeWidth={2} />}
                tone="blue"
                label="Generate Transcripts"
                sub="Create accurate transcripts for all meetings."
                control={
                  <Toggle
                    label="Generate Transcripts"
                    checked={values.generate_transcripts}
                    onToggle={onToggle('generate_transcripts')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Bell size={16} strokeWidth={2} />}
                tone="violet"
                label="Generate Summaries"
                sub="Create AI summaries with key points and decisions."
                control={
                  <Toggle
                    label="Generate Summaries"
                    checked={values.auto_summaries}
                    onToggle={onToggle('auto_summaries')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<CheckSquare size={16} strokeWidth={2} />}
                tone="green"
                label="Extract Action Items"
                sub="Identify and extract action items automatically."
                control={
                  <Toggle
                    label="Extract Action Items"
                    checked={values.extract_action_items}
                    onToggle={onToggle('extract_action_items')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Bot size={16} strokeWidth={2} />}
                tone="amber"
                label="Detect Speakers"
                sub="Enable speaker diarization to identify different speakers."
                control={
                  <Toggle
                    label="Detect Speakers"
                    checked={values.detect_speakers}
                    onToggle={onToggle('detect_speakers')}
                    disabled={!canManage}
                  />
                }
              />
              <Row
                icon={<Languages size={16} strokeWidth={2} />}
                tone="blue"
                label="Default Language"
                sub="Language for transcription and AI processing."
                control={
                  <Select
                    label="Default Language"
                    value={values.default_language}
                    options={LANGUAGES}
                    onChange={onSelect('default_language')}
                    disabled={!canManage || savingField === 'default_language'}
                    wide
                  />
                }
              />
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------- rail */}
        <div className="org-ms-rail">
          {/* preview */}
          <div className="org-ms-card org-ms-card-pad">
            <div className="org-ms-card-head">
              <div className="org-ms-card-title">Meeting Preview</div>
            </div>
            <div className="org-ms-card-sub" style={{ marginTop: -12, marginBottom: 12 }}>
              This is how your recorder will appear in meetings.
            </div>

            <div className="org-ms-preview">
              <div className="org-ms-preview-bar">
                <span className="org-ms-preview-chip">
                  <Video size={12} strokeWidth={2.4} />
                </span>
                <span className="org-ms-preview-chip muted">
                  <Bell size={12} strokeWidth={2.4} />
                </span>
              </div>
              <span className="org-ms-preview-logo">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                  <path
                    d="M5 4.5h9.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"
                    fill="#0066FF"
                  />
                  <path d="M8.5 9h7M8.5 12.5h5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M18 8.5l3.2 1.2a.6.6 0 0 1 0 1.1L18 12" fill="#00A3FF" />
                </svg>
              </span>
              <div className="org-ms-preview-label">
                <span className="org-ms-preview-name">{botName}</span>
                <span className="org-ms-preview-rec">
                  <span className="org-ms-preview-dot" />
                  Recording
                </span>
              </div>
            </div>

            <div className="org-ms-notice info" style={{ marginTop: 12, marginBottom: 0 }}>
              <Info size={15} aria-hidden="true" />
              <span>
                The bot will join with camera and microphone off, and display a recording
                notification.
              </span>
            </div>
          </div>

          {/* default message */}
          <div className="org-ms-card org-ms-card-pad">
            <div className="org-ms-card-head" style={{ marginBottom: 10 }}>
              <div>
                <div className="org-ms-card-title">Default Meeting Message</div>
                <div className="org-ms-card-sub">Custom message shown when the bot joins.</div>
              </div>
              {canManage && !editingMessage && (
                <button
                  type="button"
                  className="org-ms-icon-btn"
                  onClick={() => setEditingMessage(true)}
                  aria-label="Edit default meeting message"
                  title="Edit"
                >
                  <Pencil size={15} strokeWidth={2} />
                </button>
              )}
            </div>

            {editingMessage ? (
              <>
                <textarea
                  className="org-ms-textarea"
                  value={values.default_meeting_message}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, default_meeting_message: e.target.value }))
                  }
                  rows={4}
                  aria-label="Default meeting message"
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    type="button"
                    className="org-ms-ghost-btn"
                    onClick={() => {
                      setValues((v) => ({ ...v, default_meeting_message: initial.default_meeting_message }));
                      setEditingMessage(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="org-ms-blue-btn" onClick={saveMessage}>
                    <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                    Save
                  </button>
                </div>
              </>
            ) : (
              <p className="org-ms-message">{message}</p>
            )}
          </div>

          {/* meeting access */}
          <div className="org-ms-card org-ms-card-pad">
            <div className="org-ms-card-head" style={{ marginBottom: 10 }}>
              <div>
                <div className="org-ms-card-title">Meeting Access</div>
                <div className="org-ms-card-sub">Control which meetings are recorded.</div>
              </div>
            </div>

            <ListEditor
              icon={<Users size={16} strokeWidth={2} />}
              title="Allowed Domains"
              hint="Restrict meeting recording to specific domains (e.g. sentio.in)"
              items={values.allowed_domains}
              placeholder="sentio.in"
              canManage={canManage}
              draft={listDraft.key === 'allowed_domains' ? listDraft.entry : ''}
              onDraft={(v) => setListDraft({ key: 'allowed_domains', entry: v })}
              onAdd={() => addListEntry('allowed_domains')}
              onRemove={(i) => removeListEntry('allowed_domains', i)}
            />
            <ListEditor
              icon={<Link2 size={16} strokeWidth={2} />}
              title="Blocked Meetings"
              hint="Exclude specific meeting links or keywords from being recorded."
              items={values.blocked_keywords}
              placeholder="keyword or link"
              canManage={canManage}
              draft={listDraft.key === 'blocked_keywords' ? listDraft.entry : ''}
              onDraft={(v) => setListDraft({ key: 'blocked_keywords', entry: v })}
              onAdd={() => addListEntry('blocked_keywords')}
              onRemove={(i) => removeListEntry('blocked_keywords', i)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Row({ icon, tone, label, sub, control }) {
  return (
    <div className="org-ms-row">
      <span className={`org-ms-row-icon ${tone}`}>{icon}</span>
      <span className="org-ms-row-text">
        <span className="org-ms-row-label">{label}</span>
        <span className="org-ms-row-sub">{sub}</span>
      </span>
      <span className="org-ms-row-control">{control}</span>
    </div>
  );
}

function Toggle({ checked, onToggle, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      className="org-ms-toggle"
      onClick={onToggle}
      disabled={disabled}
    />
  );
}

function Select({ value, options, onChange, disabled, label, wide }) {
  return (
    <span className={`org-ms-select${wide ? ' wide' : ''}`}>
      <select value={value} onChange={onChange} disabled={disabled} aria-label={label}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="org-ms-chevron">
        <path d="m6 9 6 6 6-6" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function TextInput({ value, onChange, disabled, label }) {
  return (
    <input
      type="text"
      className="org-ms-input"
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
    />
  );
}

function ListEditor({ icon, title, hint, items, placeholder, canManage, draft, onDraft, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(items) ? items : [];

  return (
    <div className="org-ms-list">
      <button
        type="button"
        className="org-ms-list-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="org-ms-list-icon">{icon}</span>
        <span className="org-ms-list-text">
          <span className="org-ms-list-title">{title}</span>
          <span className="org-ms-list-hint">{hint}</span>
        </span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="org-ms-list-chevron"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          <path d="m9 6 6 6-6 6" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="org-ms-list-body">
          {list.length === 0 ? (
            <p className="org-ms-list-empty">Nothing configured.</p>
          ) : (
            <ul className="org-ms-list-items">
              {list.map((item, i) => (
                <li key={`${item}-${i}`} className="org-ms-list-item">
                  <span className="org-ms-list-value">{item}</span>
                  {canManage && (
                    <button
                      type="button"
                      className="org-ms-list-remove"
                      onClick={() => onRemove(i)}
                      aria-label={`Remove ${item}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="org-ms-list-add">
              <input
                type="text"
                className="org-ms-input"
                value={draft}
                placeholder={placeholder}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAdd();
                  }
                }}
                aria-label={`Add to ${title}`}
              />
              <button type="button" className="org-ms-blue-btn" onClick={onAdd} disabled={!draft.trim()}>
                <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
