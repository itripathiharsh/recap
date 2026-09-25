import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkspaceScope, filterToMeetings, resolveInitialWorkspace } from './workspaceScope.mjs';

function makeQuery() {
  const calls = [];
  return {
    calls,
    eq(col, val) {
      calls.push(['eq', col, val]);
      return this;
    },
    is(col, val) {
      calls.push(['is', col, val]);
      return this;
    },
  };
}

test('applyWorkspaceScope uses organisation_id = org when org active', () => {
  const q = makeQuery();
  applyWorkspaceScope(q, 'org-123');
  assert.deepEqual(q.calls, [['eq', 'organisation_id', 'org-123']]);
});

test('applyWorkspaceScope uses organisation_id IS NULL for personal workspace', () => {
  const q = makeQuery();
  applyWorkspaceScope(q, null);
  assert.deepEqual(q.calls, [['is', 'organisation_id', null]]);
});

test('applyWorkspaceScope falls back to personal for empty string', () => {
  const q = makeQuery();
  applyWorkspaceScope(q, '');
  assert.deepEqual(q.calls, [['is', 'organisation_id', null]]);
});

test('filterToMeetings keeps only rows whose meeting_id is in scope', () => {
  const rows = [
    { meeting_id: 'a', value: 1 },
    { meeting_id: 'b', value: 2 },
    { meeting_id: 'a', value: 3 },
  ];
  const result = filterToMeetings(rows, new Set(['a']));
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.meeting_id === 'a'));
});

test('filterToMeetings handles null/undefined input', () => {
  assert.deepEqual(filterToMeetings(null, new Set()), []);
  assert.deepEqual(filterToMeetings(undefined, new Set(['a'])), []);
});

test('filterToMeetings excludes rows for meetings out of scope', () => {
  const rows = [{ meeting_id: 'x' }, { meeting_id: 'y' }];
  const result = filterToMeetings(rows, new Set(['z']));
  assert.equal(result.length, 0);
});

test('resolveInitialWorkspace honours stored personal', () => {
  assert.equal(resolveInitialWorkspace('personal', []), 'personal');
});

test('resolveInitialWorkspace honours a stored org id that still exists', () => {
  const orgs = [{ id: 'org-1' }, { id: 'org-2' }];
  assert.equal(resolveInitialWorkspace('org-2', orgs), 'org-2');
});

test('resolveInitialWorkspace falls back to personal for unknown org id', () => {
  const orgs = [{ id: 'org-1' }];
  assert.equal(resolveInitialWorkspace('org-gone', orgs), 'personal');
});

test('resolveInitialWorkspace falls back to personal when stored is empty', () => {
  assert.equal(resolveInitialWorkspace(null, [{ id: 'org-1' }]), 'personal');
  assert.equal(resolveInitialWorkspace('', [{ id: 'org-1' }]), 'personal');
});
