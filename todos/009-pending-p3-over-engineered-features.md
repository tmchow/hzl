---
status: pending
priority: p3
issue_id: "009"
tags: [code-review, simplicity, hzl-web, hzl-cli]
dependencies: []
---

# Over-Engineered Features Beyond Requirements

## Problem Statement

Several features exceed the stated requirements ("lightweight Kanban dashboard with polling, filters, and mobile support") and add maintenance burden.

## Findings

**Excess features identified:**

1. **Background mode with PID management** (~130 LOC)
   - Location: `serve.ts` lines 24-156
   - Users can use `nohup`, `&`, or systemd directly

2. **systemd unit generation** (~22 LOC)
   - Location: `serve.ts` lines 107-128
   - Users who need systemd can write 12 lines themselves

3. **Activity panel** (~170 LOC)
   - Location: `index.html` lines 399-490, 893-919
   - The Kanban board already shows current state

4. **Checkpoints in modal** (~17 LOC)
   - Not in stated requirements

5. **localStorage preferences** (~20 LOC)
   - Nice UX but not required

**Estimated total: ~440 LOC that could be removed.**

**From code-simplicity-reviewer agent review.**

## Proposed Solutions

### Option 1: Keep all features, document as v1
**Pros:** Features are already built and working
**Cons:** Maintenance burden
**Effort:** None
**Risk:** Low

### Option 2: Remove background mode
**Pros:** ~130 LOC saved, users use standard tools
**Cons:** Less convenient for some users
**Effort:** Small
**Risk:** Low

### Option 3: Remove activity panel
**Pros:** ~170 LOC saved, simpler UI
**Cons:** Less visibility into changes
**Effort:** Small
**Risk:** Low

## Recommended Action

_To be filled during triage - consider which features add real value_

## Technical Details

**Affected Files:**
- `packages/hzl-cli/src/commands/serve.ts`
- `packages/hzl-web/src/ui/index.html`

## Acceptance Criteria

- [ ] Decision made on which features to keep
- [ ] If removing, clean removal without breaking changes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | YAGNI considerations |

## Resources

- PR: feature/hzl-web-dashboard
- Code-simplicity-reviewer agent review
