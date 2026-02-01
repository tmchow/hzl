---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, testing, hzl-web, hzl-cli]
dependencies: []
---

# Missing Test Coverage for Serve Command and Web Server

## Problem Statement

The new `serve` command and `hzl-web` server have no automated tests, unlike other CLI commands which have corresponding test files.

## Findings

**Missing test files:**
- `packages/hzl-cli/src/commands/serve.test.ts` - does not exist
- `packages/hzl-web/src/server.test.ts` - does not exist

**Existing pattern:**
- `lock.ts` has `lock.test.ts`
- `status.ts` has `status.test.ts`

**From pattern-recognition-specialist agent review.**

## Proposed Solutions

### Option 1: Add unit tests for API routes
**Pros:** Catches regressions, documents behavior
**Cons:** Test setup time
**Effort:** Medium
**Risk:** Low

Test cases needed:
- Each API endpoint returns correct data
- Error responses (404, 500)
- Query parameter handling (since, project filters)

### Option 2: Add integration test for server startup
**Pros:** Verifies E2E behavior
**Cons:** Slower tests
**Effort:** Medium
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- New: `packages/hzl-cli/src/commands/serve.test.ts`
- New: `packages/hzl-web/src/server.test.ts`

## Acceptance Criteria

- [ ] Unit tests for all API endpoints
- [ ] Test for server startup/shutdown
- [ ] Tests pass in CI

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Test coverage gap |

## Resources

- PR: feature/hzl-web-dashboard
- Pattern-recognition-specialist agent review
