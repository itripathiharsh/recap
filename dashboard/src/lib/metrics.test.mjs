import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countActiveMembers,
  recordedMinutes,
  recordedHours,
  countParticipants,
  isPlaceholderSpeaker,
  participantBreakdown,
  speakingShare,
  collectActionItems,
  buildMetrics,
  completedMeetings,
} from './metrics.js';

const M = (over = {}) => ({
  id: 'm',
  status: 'completed',
  started_at: '2026-09-26T04:30:00+00:00',
  ended_at: '2026-09-26T05:15:00+00:00',
  ...over,
});

test('active members counted once, from one definition', () => {
  const members = [
    { id: 1, status: 'active' },
    { id: 2, status: 'active' },
    { id: 3, status: 'suspended' },
    { id: 4, status: null },
  ];
  assert.equal(countActiveMembers(members), 3);
  assert.equal(countActiveMembers(null), 0);
});

test('recorded minutes come only from real timestamps', () => {
  const rows = [M(), M({ started_at: '2026-09-26T06:00:00+00:00', ended_at: '2026-09-26T06:30:00+00:00' })];
  assert.equal(recordedMinutes(rows).minutes, 75);
  assert.equal(recordedHours(rows), 1.3);
});

test('a meeting with no usable timestamps is reported as uncounted, not guessed', () => {
  const rows = [M({ started_at: null, ended_at: null }), M()];
  const r = recordedMinutes(rows);
  assert.equal(r.minutes, 45);
  assert.equal(r.counted, 1);
  assert.equal(r.uncounted, 1);
});

test('non-completed meetings never contribute hours', () => {
  const rows = [M({ status: 'scheduled' }), M({ status: 'processing' })];
  assert.equal(recordedMinutes(rows).minutes, 0);
  assert.equal(recordedHours(rows), 0);
});

test('diarization placeholders are not counted as people', () => {
  assert.equal(isPlaceholderSpeaker('SPEAKER_02'), true);
  assert.equal(isPlaceholderSpeaker('UNKNOWN'), true);
  assert.equal(isPlaceholderSpeaker('Harsh Vardhan Tripathi'), false);
  const turns = [
    { speaker: 'Harsh Vardhan Tripathi' },
    { speaker: 'Maya Rao' },
    { speaker: 'SPEAKER_02' },
    { speaker: 'UNKNOWN' },
    { speaker: '   ' },
  ];
  assert.equal(countParticipants(turns), 2);
});

test('speaking share needs real durations or it returns nothing', () => {
  assert.deepEqual(speakingShare([{ speaker: 'A', start_time: 0, end_time: 0 }]), []);
  const share = speakingShare([
    { speaker: 'A', start_time: 0, end_time: 60 },
    { speaker: 'B', start_time: 0, end_time: 40 },
  ]);
  assert.equal(share[0].name, 'A');
  assert.equal(share[0].share, 60);
  assert.equal(share[1].share, 40);
});

test('participant breakdown is deterministic', () => {
  const rows = [
    { speaker: 'B' },
    { speaker: 'A' },
    { speaker: 'A' },
    { speaker: 'SPEAKER_01' },
  ];
  assert.deepEqual(participantBreakdown(rows), [
    { name: 'A', turns: 2 },
    { name: 'B', turns: 1 },
  ]);
});

test('action items are read from mom jsonb and never rendered as raw json', () => {
  const moms = [
    {
      meeting_id: 'm1',
      action_items: [
        { task: 'Publish postmortem', owner: 'Tom', due: '2026-10-01' },
        { task: '   ' },
        'a bare string that must be skipped',
        null,
      ],
    },
  ];
  const byId = new Map([['m1', { title: 'Reliability Review' }]]);
  const items = collectActionItems(moms, byId);
  assert.equal(items.length, 1);
  assert.equal(items[0].task, 'Publish postmortem');
  assert.equal(items[0].owner, 'Tom');
  assert.equal(items[0].due, '2026-10-01');
  assert.equal(items[0].meetingTitle, 'Reliability Review');
  assert.equal(items[0].status, 'open');
});

test('buildMetrics is the one shape every page must use', () => {
  const m = buildMetrics({
    meetings: [M(), M({ status: 'scheduled' })],
    members: [{ status: 'active' }, { status: 'banned' }],
    teams: [{ id: 't' }],
    turns: [{ speaker: 'A' }, { speaker: 'SPEAKER_00' }],
    moms: [{ meeting_id: 'm', action_items: [{ task: 'x' }] }],
  });
  assert.equal(m.totalMeetings, 2);
  assert.equal(m.completedMeetings, 1);
  assert.equal(m.upcomingMeetings, 1);
  assert.equal(m.activeMembers, 1);
  assert.equal(m.totalTeams, 1);
  assert.equal(m.participants, 1);
  assert.equal(m.actionItems, 1);
  assert.equal(m.recordedMinutes, 45);
});

test('missing inputs produce null, never a fabricated zero-as-truth', () => {
  const m = buildMetrics({});
  assert.equal(m.totalMeetings, null);
  assert.equal(m.recordedHours, null);
  assert.equal(m.participants, null);
  assert.equal(m.actionItems, null);
});
