# Production Deployment & Data Cleanliness Rule

## Mandatory Pre-Deployment Gate: Zero Test & Seed Data in Production

**NEVER deploy to production (Vercel, Git main, Supabase Production) with active test data, dummy meetings, or mock seed fixtures.**

### Pre-Deployment Checklist (Every box MUST be checked before `git push origin main` or `vercel deploy --prod`):
- [ ] **Database Cleanliness Gate**: Run verification query on Supabase `meetings` to ensure NO dummy/test records exist (e.g. titles containing `[Test]`, `seed`, dummy links `meet.google.com/abc-defg-hij`, or test ID patterns).
- [ ] **Foreign Key Cascades**: Ensure associated records in `mom`, `transcripts`, `speaker_turns`, `jobs`, and `system_events` for any test meetings are completely purged.
- [ ] **Storage Bucket Gate**: Verify Supabase Storage `recordings/` bucket contains NO test meeting audio (`audio.wav`) or test artifacts.
- [ ] **Local Artifacts Gate**: Check `data/recordings/` and `data/jobs/` to ensure no temporary test directories remain that could be re-ingested or synced by local daemons.
- [ ] **No Hardcoded Seed Data in UI**: Verify frontend components ([calendar/page.jsx](file:///d:/meet%20recorder/dashboard/src/app/calendar/page.jsx), [dashboard/page.jsx](file:///d:/meet%20recorder/dashboard/src/app/dashboard/page.jsx), [meetings/page.jsx](file:///d:/meet%20recorder/dashboard/src/app/meetings/page.jsx)) contain ZERO hardcoded mock items, fake statistics, or dummy fallbacks. All data must originate strictly from authentic user Supabase records.
- [ ] **Execute Cleaner Script**: Run `python scratch/clean_all_test_data.py` before initiating deployment to guarantee 100% clean production state.
