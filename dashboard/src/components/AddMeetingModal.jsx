'use client';

import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

export default function AddMeetingModal({ isOpen, onClose, onMeetingAdded }) {
  const { activeOrgId } = useWorkspace();
  const [title, setTitle] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [isInstant, setIsInstant] = useState(true);
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now.toTimeString().slice(0, 5);
  });
  const [duration, setDuration] = useState('30');
  const [visibility, setVisibility] = useState('organisation');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const validateMeetUrl = (url) => {
    const pattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i;
    return pattern.test(url.trim());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Meeting title is required.');
      return;
    }

    if (!validateMeetUrl(meetLink)) {
      setError('Enter a valid Google Meet link (e.g. https://meet.google.com/abc-defg-hij).');
      return;
    }

    const scheduledDateTime = isInstant ? new Date() : new Date(`${date}T${startTime}:00`);
    if (isNaN(scheduledDateTime.getTime())) {
      setError('Invalid date or time.');
      return;
    }

    setLoading(true);
    try {
      // Check for duplicate pending/scheduled meeting with the same link
      const { data: duplicates } = await supabase
        .from('meetings')
        .select('id, title, status')
        .eq('meet_link', meetLink.trim())
        .in('status', ['scheduled', 'queued', 'joining', 'recording']);

      if (duplicates && duplicates.length > 0) {
        setError(`A meeting with this link is already scheduled: "${duplicates[0].title}".`);
        setLoading(false);
        return;
      }

      const payload = {
        title: title.trim(),
        meet_link: meetLink.trim(),
        scheduled_start: scheduledDateTime.toISOString(),
        expected_duration_minutes: parseInt(duration, 10) || 30,
        status: 'scheduled',
        workspace_type: activeOrgId ? 'organisation' : 'individual',
        organisation_id: activeOrgId || null,
      };

      if (activeOrgId) {
        payload.visibility = visibility;
      }

      const { data, error: insertError } = await supabase.from('meetings').insert([payload]).select();

      if (insertError) throw insertError;

      setTitle('');
      setMeetLink('');
      if (onMeetingAdded) {
        onMeetingAdded(data?.[0]);
      }
      onClose();
    } catch (err) {
      console.error('Error scheduling meeting:', err);
      setError(err.message || 'Failed to schedule meeting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Schedule Meeting
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: 'var(--text-secondary)', padding: '2px', borderRadius: '4px' }}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: '#FEF2F2',
              color: 'var(--status-error)',
              border: '1px solid #FECACA',
              fontSize: '12.5px',
              marginBottom: '14px',
            }}
          >
            <AlertCircle size={14} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="meeting-title">
              Meeting Title
            </label>
            <input
              id="meeting-title"
              type="text"
              className="form-input"
              placeholder="e.g. Product Discussion"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="meeting-link">
              Google Meet Link
            </label>
            <input
              id="meeting-link"
              type="url"
              className="form-input"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => setIsInstant(true)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                border: isInstant ? '1px solid #0284C7' : '1px solid var(--border-color, #E2E8F0)',
                backgroundColor: isInstant ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                color: isInstant ? '#0284C7' : 'var(--text-secondary, #64748B)',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
              }}
            >
              Join Immediately
            </button>
            <button
              type="button"
              onClick={() => setIsInstant(false)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                border: !isInstant ? '1px solid #0284C7' : '1px solid var(--border-color, #E2E8F0)',
                backgroundColor: !isInstant ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                color: !isInstant ? '#0284C7' : 'var(--text-secondary, #64748B)',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
              }}
            >
              Schedule for Later
            </button>
          </div>

          {!isInstant ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="meeting-date">
                  Date
                </label>
                <input
                  id="meeting-date"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required={!isInstant}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meeting-time">
                  Start Time
                </label>
                <input
                  id="meeting-time"
                  type="time"
                  className="form-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required={!isInstant}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--text-secondary, #64748B)',
                backgroundColor: 'rgba(2, 132, 199, 0.04)',
                border: '1px dashed rgba(2, 132, 199, 0.25)',
                padding: '8px 12px',
                borderRadius: '6px',
                marginBottom: '14px',
              }}
            >
              Bot will automatically attempt to join the call within seconds of saving.
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="meeting-duration">
              Duration
            </label>
            <select
              id="meeting-duration"
              className="form-input"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </div>

          {activeOrgId && (
            <div className="form-group">
              <label className="form-label" htmlFor="meeting-visibility">
                Visibility
              </label>
              <select
                id="meeting-visibility"
                className="form-input"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="organisation">Organisation — everyone in this org</option>
                <option value="participants">Participants — invited speakers only</option>
                <option value="private">Private — only me</option>
              </select>
              <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '6px', textWrap: 'pretty' }}>
                Controls who can open this meeting&apos;s recordings, transcript
                and MOM after it runs.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (isInstant ? 'Joining...' : 'Scheduling...') : (isInstant ? 'Join Meeting Now' : 'Schedule Meeting')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
