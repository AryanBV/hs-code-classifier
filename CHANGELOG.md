# Changelog

## [Unreleased]

### 2026-02-09 — M1: Foundation

#### ARY-22: Fix npm test
- Installed vitest@3.2.4 + @vitest/coverage-v8@3.2.4
- Created `backend/vitest.config.ts` with `@/*` path alias support
- Updated `npm test` → `vitest run` (was: `echo "Error: no test specified" && exit 1`)
- Added `npm run test:watch` and `npm run test:coverage`
- Created `backend/src/tests/smoke.test.ts` — 9 tests, no API keys needed
- Created `backend/src/tests/classification.test.ts` — 10 integration tests (skip without env vars)
- All 24 original test files preserved unchanged
- Test results: 9 passed, 10 skipped, 0 failed

#### ARY-45: Codebase Cleanup
- Removed dead code, temp files, backup artifacts
- Commit: 8f3291a

#### ARY-21: CLAUDE.md
- Created project context file with verified file paths
- Commit: d764fe6
