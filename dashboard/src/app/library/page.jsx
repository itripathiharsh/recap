'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, FileText, CheckCircle2, ListTodo, Users, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function LibraryPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all, meetings, transcripts, decisions, actions
  const [meetings, setMeetings] = useState([]);
  const [moms, setMoms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const { data: meetData } = await supabase
          .from('meetings')
          .select('*')
          .order('scheduled_start', { ascending: false });

        const { data: momData } = await supabase
          .from('mom')
          .select('*');

        setMeetings(meetData || []);
        setMoms(momData || []);
      } catch (err) {
        console.error('Error loading library data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Map meeting id to mom
  const momMap = {};
  moms.forEach((m) => {
    momMap[m.meeting_id] = m;
  });

  // Filter items
  const results = [];

  meetings.forEach((m) => {
    const momObj = momMap[m.id];
    const qLower = query.toLowerCase();

    // 1. Meeting Title & Summary
    const titleMatch = m.title.toLowerCase().includes(qLower);
    const summaryMatch = momObj?.summary?.toLowerCase().includes(qLower);

    if (['all', 'meetings'].includes(filter) && (titleMatch || summaryMatch || !query)) {
      results.push({
        id: `${m.id}-meeting`,
        meetingId: m.id,
        type: 'meeting',
        title: m.title,
        date: m.scheduled_start,
        content: momObj?.summary || 'Meeting record without generated summary.',
        badge: 'Meeting',
      });
    }

    // 2. Decisions
    if (['all', 'decisions'].includes(filter) && momObj?.decisions) {
      momObj.decisions.forEach((dec, idx) => {
        if (!query || dec.toLowerCase().includes(qLower)) {
          results.push({
            id: `${m.id}-dec-${idx}`,
            meetingId: m.id,
            type: 'decision',
            title: m.title,
            date: m.scheduled_start,
            content: dec,
            badge: 'Decision',
          });
        }
      });
    }

    // 3. Action Items
    if (['all', 'actions'].includes(filter) && momObj?.action_items) {
      momObj.action_items.forEach((item, idx) => {
        const text = typeof item === 'object' ? item.task || item.action || JSON.stringify(item) : item;
        if (!query || text.toLowerCase().includes(qLower)) {
          results.push({
            id: `${m.id}-action-${idx}`,
            meetingId: m.id,
            type: 'action',
            title: m.title,
            date: m.scheduled_start,
            content: text,
            badge: 'Action Item',
          });
        }
      });
    }
  });

  return (
    <div style={{ maxWidth: '840px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
          Library
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Search your meeting history and intelligence.
        </p>
      </div>

      {/* Large Restrained Search Input */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search
          size={15}
          style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }}
          aria-hidden="true"
        />
        <input
          type="text"
          className="form-input"
          placeholder="Search meetings, transcripts, decisions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: '36px',
            paddingTop: '9px',
            paddingBottom: '9px',
            fontSize: '13.5px',
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'meetings', label: 'Meetings' },
          { id: 'decisions', label: 'Decisions' },
          { id: 'actions', label: 'Action Items' },
        ].map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              style={{
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
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Document-Style Results List */}
      <div className="surface-card">
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Searching library...
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No results found matching your search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {results.map((item, i) => (
              <Link
                key={item.id || i}
                href={`/meetings/${item.meetingId}`}
                style={{
                  padding: '14px 16px',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  transition: 'background-color 150ms ease',
                }}
                className="btn-ghost"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor:
                          item.badge === 'Decision'
                            ? 'var(--status-success-bg)'
                            : item.badge === 'Action Item'
                            ? 'var(--brand-blue-subtle)'
                            : 'var(--bg-soft)',
                        color:
                          item.badge === 'Decision'
                            ? 'var(--status-success)'
                            : item.badge === 'Action Item'
                            ? 'var(--brand-blue)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {item.badge}
                    </span>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                  </div>

                  <span className="tabular-nums" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  {item.content}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
