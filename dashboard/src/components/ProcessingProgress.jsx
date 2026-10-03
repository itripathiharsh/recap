'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Mic,
  FileText,
  Users,
  Sparkles,
  Send,
  Radio,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyWorkspaceScope, useWorkspace } from '../lib/workspace';

/**
 * The six stages the worker actually reports, in pipeline order. The keys must
 * match the `stage` values passed to db_record_pipeline_stage() in src/worker.py.
 */
const STAGES = [
  { key: 'audio_capture', label: 'Audio Capture', icon: Mic },
  { key: 'transcription', label: 'Transcription', icon: FileText },
  { key: 'voice_diarization', label: 'Voice Diarization', icon: Users },
  { key: 'speaker_identification', label: 'Speaker Identification', icon: Users },
  { key: 'executive_mom', label: 'Executive MOM', icon: Sparkles },
  { key: 'delivery', label: 'Delivery', icon: Send },
];

const STAGE_KEYS = STAGES.map((s) => s.key);

function clock(totalSeconds) {
  if (totalSeconds == null) return null;
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Turn raw `pipeline_stage` metadata objects into per-stage state + real
 * durations. Only timestamps the worker actually wrote are used.
 */
function readStages(rows, nowMs) {
  const byKey = new Map();
  for (const key of STAGE_KEYS) {
    byKey.set(key, { key, startedAt: null, endedAt: null, failed: false, detail: null });
  }

  for (const meta of rows || []) {
    if (!meta) continue;
    const stage = byKey.get(meta.stage);
    if (!stage) continue;
    const at = Date.parse(meta.at);
    if (Number.isNaN(at)) continue;
    if (meta.state === 'started') {
      if (stage.startedAt == null || at < stage.startedAt) stage.startedAt = at;
    } else if (meta.state === 'completed') {
      if (stage.endedAt == null || at > stage.endedAt) stage.endedAt = at;
    } else if (meta.state === 'failed') {
      stage.failed = true;
      stage.detail = meta.detail || null;
      if (stage.endedAt == null) stage.endedAt = at;
    }
  }

  return STAGE_KEYS.map((key) => {
    const s = byKey.get(key);
    const state = !s.startedAt
      ? 'pending'
      : s.endedAt
        ? s.failed
          ? 'failed'
          : 'done'
        : 'active';
    return {
      ...s,
      state,
      durationMs:
        s.startedAt != null && s.endedAt != null ? Math.max(0, s.endedAt - s.startedAt) : null,
      liveMs: s.startedAt != null && s.endedAt == null ? Math.max(0, nowMs - s.startedAt) : null,
    };
  });
}

export default function ProcessingProgress({ meeting }) {
  const { activeOrgId } = useWorkspace();
  const status = meeting?.status;

  const [rows, setRows] = useState(null); // null = not loaded yet
  const [averages, setAverages] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  /* ------------------------------------------------- live "now" heartbeat */
  useEffect(() => {
    if (status !== 'processing') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  /* --------------------------------------- real stage rows for this meeting */
  useEffect(() => {
    if (!meeting?.id) return;
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('system_events')
        .select('metadata')
        .eq('meeting_id', meeting.id)
        .eq('event_type', 'pipeline_stage')
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data || []).map((r) => r.metadata).filter(Boolean));
    }

    load();
    // Real-time keeps the active stage timer honest without polling the DB hard.
    const channel = supabase
      .channel(`pipeline-stage-${meeting.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_events', filter: `meeting_id=eq.${meeting.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [meeting?.id]);

  /* ------------------- average real duration per stage, from past runs only */
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;

    async function loadAverages() {
      const { data: pastMeetings } = await applyWorkspaceScope(
        supabase.from('meetings').select('id').eq('status', 'completed').limit(20),
        activeOrgId
      );
      const ids = (pastMeetings || []).map((m) => m.id);
      if (ids.length === 0) {
        if (!cancelled) setAverages({});
        return;
      }

      const { data: pastEvents } = await supabase
        .from('system_events')
        .select('metadata, meeting_id')
        .eq('event_type', 'pipeline_stage')
        .in('meeting_id', ids)
        .limit(2000);

      if (cancelled) return;

      const starts = new Map(); // `${meeting}:${stage}` -> ms
      const totals = new Map(); // stage -> [ms]
      for (const row of pastEvents || []) {
        const meta = row?.metadata || {};
        if (!STAGE_KEYS.includes(meta.stage)) continue;
        const at = Date.parse(meta.at);
        if (Number.isNaN(at)) continue;
        const key = `${row.meeting_id}:${meta.stage}`;
        if (meta.state === 'started') {
          starts.set(key, at);
        } else if (meta.state === 'completed' || meta.state === 'failed') {
          const s = starts.get(key);
          if (s != null) {
            if (!totals.has(meta.stage)) totals.set(meta.stage, []);
            totals.get(meta.stage).push(Math.max(0, at - s));
          }
        }
      }

      const avg = {};
      for (const [stage, list] of totals) {
        if (list.length === 0) continue;
        avg[stage] = list.reduce((a, b) => a + b, 0) / list.length;
      }
      setAverages(avg);
    }

    loadAverages();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  /* ------------------------------------------------------------- derived */

  const stages = useMemo(() => readStages(rows, now), [rows, now]);

  const activeStage = stages.find((s) => s.state === 'active') || null;
  const doneCount = stages.filter((s) => s.state === 'done' || s.state === 'failed').length;

  // Real progress: completed stages over total. No animation-driven guesswork.
  const progressPct = Math.round((doneCount / STAGES.length) * 100);

  const hasData = rows !== null && stages.some((s) => s.startedAt != null);

  /* Real ETA: the current stage's measured average, plus the measured averages
     of every stage still ahead. Null when we have no history to base it on. */
  const remainingMs = useMemo(() => {
    if (!activeStage || !averages) return null;
    const idx = STAGES.findIndex((s) => s.key === activeStage.key);
    let total = 0;
    for (let i = idx; i < STAGES.length; i += 1) {
      const avg = averages[STAGES[i].key];
      if (avg == null) return null; // incomplete history -> no honest estimate
      total += avg;
    }
    return Math.max(0, total - (activeStage.liveMs || 0));
  }, [activeStage, averages]);

  /* ----------------------------------------------------------- recording */
  if (status === 'recording' || status === 'joining' || status === 'stopping') {
    return (
      <div className="pp-rec">
        <div className="pp-rec-pulse" aria-hidden="true" />
        <div className="pp-rec-text">
          <div className="pp-rec-title">
            {status === 'joining'
              ? 'Joining Meeting'
              : status === 'stopping'
              ? 'Stopping & Preparing Processing'
              : 'Live Recording In Progress'}
          </div>
          <div className="pp-rec-sub">
            {status === 'joining'
              ? 'The recap bot is joining the call.'
              : status === 'stopping'
              ? 'Stopping audio capture and launching speech-to-text pipeline...'
              : 'The recap bot is inside the call capturing audio.'}
          </div>
        </div>
      </div>
    );
  }

  // Only a meeting that finished recording and is mid-pipeline gets the panel.
  if (status !== 'processing') return null;

  return (
    <div className="pp-card">
      <div className="pp-head">
        <div className="pp-head-left">
          <span className="pp-head-icon" aria-hidden="true">
            <Loader2 size={18} style={{ animation: 'spin 1.2s linear infinite' }} />
          </span>
          <div>
            <div className="pp-title">Processing Meeting Intelligence</div>
            <div className="pp-stage-line">
              Current Stage:{' '}
              <span className="pp-stage-name">
                {activeStage
                  ? STAGES.find((s) => s.key === activeStage.key).label
                  : hasData
                    ? 'Finishing up'
                    : 'Waiting for the worker to report progress'}
              </span>
            </div>
          </div>
        </div>

        {activeStage?.liveMs != null && (
          <span className="pill pill-live tabular-nums">
            <Clock size={13} aria-hidden="true" />
            {clock(activeStage.liveMs / 1000)} in this stage
          </span>
        )}
        {remainingMs != null && (
          <span className="pill pill-eta tabular-nums">
            <Clock size={13} aria-hidden="true" />
            ~{clock(remainingMs / 1000)} left
          </span>
        )}
      </div>

      {!hasData && (
        <div className="pp-note">
          <AlertCircle size={14} aria-hidden="true" />
          <span>
            This meeting is marked as processing, but the worker has not reported any stage
            timings yet — so no stage times are shown rather than guessed ones.
          </span>
        </div>
      )}

      {hasData && remainingMs == null && (
        <div className="pp-note">
          <AlertCircle size={14} aria-hidden="true" />
          <span>
            No completed runs to compare against yet, so there is no honest time estimate. Stage
            timings below are measured.
          </span>
        </div>
      )}

      <div
        className="pp-bar"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pipeline progress"
      >
        <span className="pp-bar-fill" style={{ width: `${Math.max(progressPct, 2)}%` }} />
      </div>

      <div className="pp-stages">
        {STAGES.map((stage) => {
          const data = stages.find((s) => s.key === stage.key);
          const state = data?.state || 'pending';
          const Icon = stage.icon;
          const timing =
            state === 'done' || state === 'failed'
              ? clock((data.durationMs || 0) / 1000)
              : state === 'active'
                ? clock((data.liveMs || 0) / 1000)
                : null;

          return (
            <div key={stage.key} className={`pp-stage ${state}`} title={data?.detail || undefined}>
              <span className="pp-stage-icon" aria-hidden="true">
                {state === 'done' ? (
                  <CheckCircle2 size={13} />
                ) : state === 'failed' ? (
                  <AlertCircle size={13} />
                ) : state === 'active' ? (
                  <Loader2 size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                ) : (
                  <Icon size={13} />
                )}
              </span>
              <span className="pp-stage-label">{stage.label}</span>
              {timing && <span className="pp-stage-time tabular-nums">{timing}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
