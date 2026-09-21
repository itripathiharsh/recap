'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import AddMeetingModal from '../../components/AddMeetingModal';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('scheduled_start', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const filterOptions = ['all', 'scheduled', 'recording', 'processing', 'completed', 'failed'];

  const filteredMeetings = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.meet_link.toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && m.status === statusFilter;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
            Meetings
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            All your recorded and scheduled meetings.
          </p>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={14} aria-hidden="true" />
          <span>Schedule Meeting</span>
        </button>
      </div>

      {/* Search Input & Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '260px' }}>
          <Search
            size={13}
            style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}
            aria-hidden="true"
          />
          <input
            type="text"
            className="form-input"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '30px', fontSize: '12.5px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '3px' }}>
          {filterOptions.map((filter) => {
            const isActive = statusFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                style={{
                  textTransform: 'capitalize',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: '5px',
                  backgroundColor: isActive ? 'var(--bg-surface)' : 'transparent',
                  color: isActive ? 'var(--brand-blue)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                  transition: 'all 150ms ease',
                }}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table */}
      <div className="surface-card">
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
            Loading meetings...
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
            No meetings found.
          </div>
        ) : (
          <table className="data-table-clean">
            <thead>
              <tr>
                <th>Meeting</th>
                <th style={{ width: '160px' }}>Date</th>
                <th style={{ width: '90px' }}>Duration</th>
                <th style={{ width: '120px' }}>Status</th>
                <th style={{ width: '100px' }}>Platform</th>
                <th style={{ width: '70px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link
                      href={`/meetings/${m.id}`}
                      style={{ fontWeight: 500, color: 'var(--text-primary)' }}
                    >
                      {m.title}
                    </Link>
                  </td>
                  <td className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(m.scheduled_start).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    &bull;{' '}
                    {new Date(m.scheduled_start).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {m.expected_duration_minutes} min
                  </td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Video size={12} color="var(--brand-blue)" aria-hidden="true" />
                      <span>Meet</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      href={`/meetings/${m.id}`}
                      className="btn-ghost"
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddMeetingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMeetingAdded={() => fetchMeetings()}
      />
    </div>
  );
}
