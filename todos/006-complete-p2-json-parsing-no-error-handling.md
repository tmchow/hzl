---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, reliability, hzl-web]
dependencies: []
---

# JSON Parsing Without Error Handling

## Problem Statement

Multiple endpoints parse JSON from database columns without try-catch. If data corruption occurs or schema evolves, `JSON.parse` will throw and crash the request.

## Findings

**Location:** `/packages/hzl-web/src/server.ts` lines 283-286

```typescript
links: JSON.parse(row.links) as string[],
tags: JSON.parse(row.tags) as string[],
metadata: JSON.parse(row.metadata) as Record<string, unknown>,
```

Also at lines 316, 350 for event data parsing.

**From data-integrity-guardian agent review.**

## Proposed Solutions

### Option 1: Safe JSON parser utility (Recommended)
**Pros:** Defensive, prevents crashes
**Cons:** Slight overhead
**Effort:** Small
**Risk:** Low

```typescript
function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

links: safeJsonParse(row.links, []),
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`

## Acceptance Criteria

- [ ] All JSON.parse calls wrapped in try-catch
- [ ] Graceful fallback to empty values
- [ ] No request crashes on malformed JSON

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Defensive programming |

## Resources

- PR: feature/hzl-web-dashboard
- Data-integrity-guardian agent review
