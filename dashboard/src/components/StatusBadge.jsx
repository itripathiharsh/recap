import React from 'react';

export default function StatusBadge({ status }) {
  const getStatusConfig = (st) => {
    switch (st?.toLowerCase()) {
      case 'completed':
        return {
          color: 'var(--status-success)',
          label: 'Completed',
        };
      case 'recording':
        return {
          color: 'var(--status-warning)',
          label: 'Recording',
        };
      case 'joining':
      case 'waiting_for_admission':
        return {
          color: 'var(--status-warning)',
          label: 'Joining Call',
        };
      case 'processing':
        return {
          color: 'var(--brand-blue)',
          label: 'Processing',
        };
      case 'failed':
        return {
          color: 'var(--status-error)',
          label: 'Failed',
        };
      case 'scheduled':
        return {
          color: 'var(--status-neutral)',
          label: 'Scheduled',
        };
      case 'queued':
        return {
          color: 'var(--brand-teal)',
          label: 'Queued',
        };
      case 'cancelled':
        return {
          color: 'var(--text-muted)',
          label: 'Cancelled',
        };
      default:
        return {
          color: 'var(--status-neutral)',
          label: st || 'Unknown',
        };
    }
  };

  const { color, label } = getStatusConfig(status);

  return (
    <span className="status-indicator">
      <span className="status-dot-sm" style={{ backgroundColor: color }} />
      <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{label}</span>
    </span>
  );
}
