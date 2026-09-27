'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, FileText, ListChecks, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../lib/workspace';
import { searchWorkspace, FIELD_LABELS } from '../lib/search';
import { classifyError, readErrorMessage } from '../lib/supabaseError';
import { formatDate } from '../lib/format';

const ICON_FOR = {
  title: Search,
  transcript: FileText,
  summary: Sparkles,
  decisions: CheckCircle2,
  'action items': ListChecks,
};

/**
 * Global workspace search.
 *
 * This is a real database search, not a filter over the current page. It
 * matches meeting titles, spoken transcript text, summaries, decisions and
 * action items, and is hard-scoped to the active workspace.
 *
 * It still forwards the typed value to `onSearchChange` so any page that
 * filters its own visible list keeps working while you type.
 */
export default function WorkspaceSearch({
  value,
  onSearchChange,
  placeholder = 'Search meetings, transcripts, or insights...',
}) {
  const { activeOrgId } = useWorkspace();
  const router = useRouter();

  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (typeof value === 'string' && value !== query) setQuery(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Debounced real search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const { meetings } = await searchWorkspace({ activeOrgId, query: q });
        if (cancelled) return;
        setResults(meetings);
        setSearched(true);
      } catch (err) {
        if (cancelled) return;
        // A failed search must never look like "no results".
        setError(readErrorMessage(classifyError(err)) || "We couldn't search right now.");
        setResults([]);
        setSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, activeOrgId]);

  const go = (id) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/meetings/${id}`);
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError(null);
    onSearchChange?.('');
    inputRef.current?.focus();
  };

  return (
    <div className="dashboard-search-wrap ws-search" ref={boxRef}>
      <Search size={16} color="#94A3B8" aria-hidden="true" className="ws-search-icon" />
      <input
        ref={inputRef}
        type="search"
        className="dashboard-search-input"
        placeholder={placeholder}
        value={query}
        aria-label="Search meetings, transcripts, summaries, decisions and action items"
        onChange={(e) => {
          setQuery(e.target.value);
          onSearchChange?.(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {loading && <Loader2 size={14} className="ws-search-spin" aria-hidden="true" />}
      {query && !loading && (
        <button type="button" className="ws-search-clear" onClick={clear} aria-label="Clear search">
          <X size={14} />
        </button>
      )}

      {open && query.trim().length >= 2 && (
        <div className="ws-search-panel" role="listbox" aria-label="Search results">
          {error ? (
            <div className="ws-search-msg error">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : loading && results.length === 0 ? (
            <div className="ws-search-msg">
              <Loader2 size={15} className="ws-search-spin" aria-hidden="true" />
              <span>Searching meetings, transcripts and summaries…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="ws-search-msg">
              <span>No meetings match “{query.trim()}”.</span>
            </div>
          ) : (
            <>
              <div className="ws-search-count">
                {results.length} meeting{results.length === 1 ? '' : 's'} found
              </div>
              <ul className="ws-search-list">
                {results.map((m) => {
                  const fields = m.matchedFields || ['title'];
                  const Icon = ICON_FOR[fields[0]] || Search;
                  return (
                    <li key={m.id}>
                      <button type="button" className="ws-search-item" onClick={() => go(m.id)}>
                        <span className="ws-search-item-icon" aria-hidden="true">
                          <Icon size={15} />
                        </span>
                        <span className="ws-search-item-body">
                          <span className="ws-search-item-title">{m.title || 'Untitled meeting'}</span>
                          <span className="ws-search-item-meta">
                            {formatDate(m.scheduled_start) || 'No date'} · matched in{' '}
                            {fields.map((f) => FIELD_LABELS[f] || f).join(', ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
