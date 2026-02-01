---
status: complete
priority: p3
issue_id: "010"
tags: [code-review, quality, hzl-web]
dependencies: []
---

# Magic Numbers in Time Calculations

## Problem Statement

The frontend contains unexplained numeric constants for time calculations, making code harder to understand.

## Findings

**Location:** `/packages/hzl-web/src/ui/index.html` lines 1113-1128

```javascript
if (diff < 60000) return 'just now';      // What is 60000?
if (diff < 3600000) return `...`;          // What is 3600000?
if (diff < 86400000) return `...`;         // What is 86400000?
```

**From pattern-recognition-specialist agent review.**

## Proposed Solutions

### Option 1: Extract named constants (Recommended)
**Pros:** Self-documenting code
**Cons:** Minor refactor
**Effort:** Small
**Risk:** Low

```javascript
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/ui/index.html`

## Acceptance Criteria

- [ ] Time constants extracted to named variables
- [ ] All magic numbers replaced

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Code clarity |

## Resources

- PR: feature/hzl-web-dashboard
- Pattern-recognition-specialist agent review
