import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate,
  formatDateTime,
  durationMinutes,
  formatDuration,
  percent,
  formatBytes,
  numberOrDash,
} from './format.js';

test('parseDate returns null for missing and unparseable input, never Invalid Date', () => {
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('not-a-date'), null);
  assert.ok(parseDate('2026-09-26T04:30:00+00:00') instanceof Date);
});

test('formatDateTime returns null rather than "Invalid Date"', () => {
  assert.equal(formatDateTime(undefined), null);
  assert.equal(formatDateTime('garbage'), null);
  assert.equal(typeof formatDateTime('2026-09-26T04:30:00+00:00'), 'string');
});

test('durationMinutes uses the real recording window first', () => {
  const m = {
    started_at: '2026-09-26T04:30:00+00:00',
    ended_at: '2026-09-26T05:15:00+00:00',
    scheduled_start: '2026-09-26T04:00:00+00:00',
    scheduled_end: '2026-09-26T05:00:00+00:00',
  };
  assert.equal(durationMinutes(m), 45);
});

test('durationMinutes falls back to the scheduled window', () => {
  assert.equal(
    durationMinutes({
      scheduled_start: '2026-09-26T04:00:00+00:00',
      scheduled_end: '2026-09-26T05:00:00+00:00',
    }),
    60
  );
});

test('durationMinutes returns null instead of a hardcoded fallback', () => {
  assert.equal(durationMinutes({ title: 'no dates at all' }), null);
  assert.equal(durationMinutes(null), null);
  assert.equal(
    durationMinutes({ started_at: '2026-09-26T04:30:00+00:00', ended_at: null }),
    null
  );
});

test('formatDuration returns null for unknown values', () => {
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration(-5), null);
  assert.equal(formatDuration(30), '30 min');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(95), '1h 35m');
});

test('percent clamps and refuses to invent a denominator', () => {
  assert.equal(percent(1, 4), 25);
  assert.equal(percent(9, 4), 100);
  assert.equal(percent(-1, 4), 0);
  assert.equal(percent(1, 0), null);
  assert.equal(percent(1, null), null);
  assert.equal(percent(null, 4), null);
});

test('formatBytes handles zero and unknown without lying', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(null), null);
  assert.equal(formatBytes(-1), null);
  assert.equal(formatBytes(1024), '1.0 KB');
});

test('numberOrDash shows an em dash for unknown, never a made-up number', () => {
  assert.equal(numberOrDash(7), '7');
  assert.equal(numberOrDash(null), '—');
  assert.equal(numberOrDash(undefined), '—');
  assert.equal(numberOrDash(NaN), '—');
});
