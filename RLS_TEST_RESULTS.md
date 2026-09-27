# RLS_TEST_RESULTS.md

**Date:** 2026-09-27
**Project:** `pukfwaxuhmeyirkddcga`

Two independent suites were run. **Neither passes.** The security migration has not
been applied, so this document records the pre-fix state and the exact command to
re-measure afterwards.

---

## Suite 1 — existing repository suite

```
$ python -m pytest tests -q
71 passed, 1 skipped, 9 warnings, 10 errors in 30.48s
```

| Metric | Count |
|---|---|
| Passed | **71** |
| Failed | **0** |
| Skipped | **1** |
| Errors | **10** |
| Total | 82 |

### The 10 errors are all one root cause

All 10 are in `tests/test_workspace_rls.py` and all fail in the module-scoped `env`
fixture, before any assertion runs:

```
postgrest.exceptions.APIError:
  {'message': 'Could not find the function public.create_organisation(p_name)
   in the schema cache',
   'code': 'PGRST202',
   'hint': 'Perhaps you meant to call the function
            public.transfer_organisation_ownership',
   'details': 'Searched for the function public.create_organisation with
               parameter p_name or with a single unnamed json/jsonb parameter,
               but no matches were found in the schema cache.'}
```

The fixture seeds a tenant by calling `owner.rpc("create_organisation", …)`. That
function does not exist in the live database, so the fixture raises and pytest marks
every test in the module as an ERROR.

**This is a genuine failure, not an outdated test.** The tests are asserting the right
contract. They were not modified, weakened or skipped to make anything pass. They
should begin executing as soon as `create_organisation` exists.

**No security assertion has been removed.** The suite is a genuine negative-security
suite: it creates a tenant, then verifies that an outsider cannot see its meetings and
that a private meeting is visible only to its owner.

---

## Suite 2 — new executable verifier

```
$ python tools/verify_rls.py
RESULT   passed: 9   failed: 26   total: 35
SECURITY VERIFICATION FAILED
```

| Section | Passed | Failed | Skipped |
|---|---|---|---|
| 1. Anonymous SELECT returns no rows | 9 | 6 | 0 |
| 2. Anonymous INSERT denied by permission | 0 | 6 | 0 |
| 3. Anonymous RPC execution denied | 0 | 6 | 0 |
| 4. Cross-organisation isolation | 0 | 0 | 1 |
| 5. Storage private | 0 | 0 | 1 |
| 6. Required RPCs exist | 0 | 8 | 0 |
| **Total** | **9** | **26** | **2** |

### What failed, verbatim

```
1. Anonymous access must be denied
  FAIL  anon SELECT meetings returns no rows
  FAIL  anon SELECT transcripts returns no rows
  FAIL  anon SELECT mom returns no rows
  FAIL  anon SELECT speaker_turns returns no rows
  FAIL  anon SELECT jobs returns no rows
  FAIL  anon SELECT system_events returns no rows
  PASS  anon SELECT meeting_participants returns no rows
  PASS  anon SELECT organisations returns no rows
  PASS  anon SELECT organisation_members returns no rows
  PASS  anon SELECT organisation_invitations returns no rows
  PASS  anon SELECT organisation_settings returns no rows
  PASS  anon SELECT teams returns no rows
  PASS  anon SELECT team_members returns no rows
  PASS  anon SELECT integrations returns no rows
  PASS  anon SELECT profiles returns no rows

2. Anonymous writes must be denied by permission, not by constraint
  FAIL  anon INSERT meetings denied
  FAIL  anon INSERT transcripts denied
  FAIL  anon INSERT mom denied
  FAIL  anon INSERT speaker_turns denied
  FAIL  anon INSERT jobs denied
  FAIL  anon INSERT system_events denied

3. Anonymous RPC execution must be denied
  FAIL  anon RPC create_organisation denied   HTTP 404 PGRST202
  FAIL  anon RPC invite_member denied         HTTP 404 PGRST202
  FAIL  anon RPC update_member_role denied   HTTP 404 PGRST202
  FAIL  anon RPC remove_member denied        HTTP 404 PGRST202
  FAIL  anon RPC accept_invitation denied    HTTP 404 PGRST202
  FAIL  anon RPC revoke_invitation denied     HTTP 404 PGRST202

4. Cross-organisation isolation requires real sessions
  SKIP  only one organisation exists, so a live cross-tenant probe is not
        possible without seeding a second tenant.

5. Storage must be private
  SKIP  no buckets exist

6. Required RPCs must exist
  FAIL  RPC create_organisation exists
  FAIL  RPC invite_member exists
  FAIL  RPC accept_invitation exists
  FAIL  RPC revoke_invitation exists
  FAIL  RPC update_member_role exists
  FAIL  RPC remove_member exists
  FAIL  RPC can_access_meeting exists
  FAIL  RPC can_manage_meeting exists
```

The nine PASSes in section 1 are the nine organisation/profile tables whose RLS is
already correct. **The exposure is exactly the six content tables.**

Two checks are reported as SKIP rather than PASS, because there is one organisation
and no storage bucket. Claiming a pass there would be fabrication.

### A note on the INSERT probes

The verifier treats a NOT NULL violation (`23502`) as a **failure**, not a success,
because reaching a constraint means the table-level grant was already exercised. A
correctly-secured table answers `42501` (permission denied) or `401`/`403`. This is
what distinguishes "no grant" from "grant exists but the payload was invalid".

---

## Frontend suite

```
$ npm test
ℹ tests 38   ℹ pass 38   ℹ fail 0
```

All 38 pass. Coverage is 28 test blocks asserting pure functions in
`workspaceScope.mjs`, `format.js`, `metrics.js` and `supabaseError.js`. There are
**no component or integration tests**, so none of the 26 failures above would be
caught by CI. That gap is itself a finding.

---

## What must happen for these numbers to change

1. Apply `supabase/migrations/20260927120000_security_hardening.sql` to
   `pukfwaxuhmeyirkddcga`. Requires DDL access that this machine does not have.
2. Re-run `python tools/verify_rls.py`. Target: **0 failures**, exit code 0.
3. Re-run `python -m pytest tests -q`. The 10 errors should clear; target
   **0 errors, 0 failures**.
4. Seed a second organisation and re-run to convert the cross-tenant SKIP into a
   measured PASS/FAIL.
5. Create the `recordings` bucket path and re-run to convert the storage SKIP into a
   measured result.

Until step 2 reports zero failures, **unauthorised access is demonstrated to still
work**, and the application must not be described as secure.
