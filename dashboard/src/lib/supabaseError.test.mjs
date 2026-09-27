import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unwrap,
  tryUnwrap,
  classifyError,
  readErrorMessage,
  toMessage,
  SupabaseFailure,
  ERROR_KIND,
} from './supabaseError.js';

test('unwrap returns data on success', () => {
  assert.deepEqual(unwrap({ data: [{ id: 1 }], error: null }, 'load'), [{ id: 1 }]);
});

test('unwrap throws SupabaseFailure instead of silently returning null', () => {
  // This is the bug the audit found: supabase-js does not throw, so code that
  // ignores `error` pretends the write succeeded.
  assert.throws(
    () => unwrap({ data: null, error: { message: 'boom', code: '23505' } }, 'create team'),
    (e) => e instanceof SupabaseFailure && e.kind === ERROR_KIND.CONFLICT
  );
});

test('classifyError separates permission from not-found from server', () => {
  assert.equal(classifyError({ status: 403, message: 'no' }).kind, ERROR_KIND.FORBIDDEN);
  assert.equal(classifyError({ status: 401, message: 'jwt expired' }).kind, ERROR_KIND.UNAUTHENTICATED);
  assert.equal(classifyError({ status: 500, message: 'oops' }).kind, ERROR_KIND.SERVER);
  assert.equal(
    classifyError({ code: 'PGRST116', message: '0 rows' }).kind,
    ERROR_KIND.NOT_FOUND
  );
  assert.equal(
    classifyError({ code: 'PGRST202', message: 'function missing' }).kind,
    ERROR_KIND.NOT_FOUND
  );
});

test('classifyError detects offline / DNS failures as network', () => {
  assert.equal(classifyError({ message: 'Failed to fetch' }).kind, ERROR_KIND.NETWORK);
  assert.equal(classifyError({ message: 'net::ERR_NAME_NOT_RESOLVED' }).kind, ERROR_KIND.NETWORK);
});

test('user-facing message never leaks the raw PostgREST body', () => {
  const f = classifyError({
    code: 'PGRST202',
    message:
      "Could not find the function public.invite_member in the schema cache. Searched for ...",
  });
  assert.ok(!f.message.includes('schema cache'));
  assert.ok(!f.message.includes('public.'));
  assert.match(f.message, /not available yet|contact support/i);
});

test('RLS violation reads as a permission problem, not a generic failure', () => {
  const f = classifyError({ code: '42501', message: 'new row violates row-level security policy' });
  assert.equal(f.kind, ERROR_KIND.FORBIDDEN);
  assert.match(f.message, /permission/i);
});

test('readErrorMessage keeps a failed read distinguishable from empty data', () => {
  const permission = readErrorMessage(classifyError({ status: 403, message: 'x' }));
  const network = readErrorMessage(classifyError({ message: 'Failed to fetch' }));
  assert.notEqual(permission, network);
  assert.match(permission, /permission/i);
  assert.match(network, /connection/i);
  assert.equal(readErrorMessage(null), null);
});

test('tryUnwrap never throws', () => {
  const ok = tryUnwrap({ data: [1], error: null });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data, [1]);
  const bad = tryUnwrap({ data: null, error: { status: 500, message: 'x' } });
  assert.equal(bad.ok, false);
  assert.equal(bad.data, null);
  assert.equal(bad.error.kind, ERROR_KIND.SERVER);
});

test('toMessage always yields readable copy', () => {
  assert.match(toMessage(new SupabaseFailure(ERROR_KIND.SERVER, 'x')), /./);
  assert.equal(toMessage('plain string'), 'plain string');
  assert.equal(toMessage(null, 'fallback'), 'fallback');
});
