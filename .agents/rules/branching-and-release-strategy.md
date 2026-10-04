# Branching & Release Strategy Rule

## 1. Protected Main Branch (`main`)
- **`main` is strictly the stable production branch.**
- Antigravity and automated agents must **NEVER** push unverified experimental work, breaking changes, or unfinished features directly to `main`.
- `main` must remain in an always-working, production-ready, deployable state.

## 2. Active Development Branch (`v2`)
- **All new work, features, UI updates, and backend refactors MUST be developed on the `v2` branch** (or scoped feature branches branched off `v2`).
- The agent must always ensure the current working branch is `v2` before making code changes or committing.
- Do not commit directly to `main` without completing the full validation protocol on `v2`.

## 3. Merge & Pull Request Protocol (`v2` -> `main`)
Code moves from `v2` into `main` **only** after satisfying all release gates:
1. **Automated Test Gate**: Full Python test suite (`pytest tests/`) passes with 0 failures.
2. **Frontend Build Gate**: Next.js production build (`npm run build` in `dashboard`) compiles with 0 errors.
3. **Clean Data Gate**: Follows `production-cleanliness.md` (no lingering test fixtures or test records).
4. **Pull Request Protocol**:
   - Create a Pull Request from `v2` into `main` using `gh pr create --base main --head v2`.
   - Review and verify diff against `main`.
   - Merge into `main` only after verified functionality.
