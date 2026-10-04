# Recap Engineering & Agent Guidelines

## 1. Branching & Release Strategy (MANDATORY)
- **Production Branch (`main`)**: Protected, always-working, stable release. Do NOT commit directly to `main` for active feature development or experimental changes.
- **Active Development Branch (`v2`)**: All new development, enhancements, UI changes, and bugfixes must be developed on `v2`.
- **Merge Process (`v2` -> `main`)**: Changes are merged into `main` exclusively through tested Pull Requests (`gh pr create --base main --head v2`) after all test suites pass (`pytest tests/`) and frontend build succeeds (`npm run build`).

## 2. Production Cleanliness & Data Safety
- Never leave dummy meetings, seed fixtures, or mock data in production database tables (`meetings`, `mom`, `jobs`, `transcripts`).
- Follow `.agents/rules/production-cleanliness.md` before any production deployment.

## 3. Google Meet Cloud Runner
- Cloud execution runs via GitHub Actions (`.github/workflows/record_meeting.yml`).
- Authenticated Google session is injected from GitHub Secret `GOOGLE_SESSION_STATE`.
- Default bot display name is `Recap Meet Recorder`.
