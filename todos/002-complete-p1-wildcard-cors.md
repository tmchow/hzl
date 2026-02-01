---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, security, hzl-web]
dependencies: []
---

# Wildcard CORS Allows Cross-Origin Data Exfiltration

## Problem Statement

The API returns `Access-Control-Allow-Origin: *` for all responses, allowing any website to make cross-origin requests to the API. Combined with the lack of authentication, this enables malicious websites to exfiltrate task data.

## Findings

**Location:** `/packages/hzl-web/src/server.ts` lines 106-111

```typescript
function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',  // Vulnerable
  });
  res.end(JSON.stringify(data));
}
```

**Attack scenario:**
1. User has hzl dashboard running locally
2. User visits attacker's website
3. Attacker's JavaScript fetches `http://localhost:3456/api/tasks`
4. Task data is exfiltrated to attacker's server

**From security-sentinel agent review.**

## Proposed Solutions

### Option 1: Remove CORS header entirely (Recommended)
**Pros:** Simplest, most secure
**Cons:** Breaks cross-origin access if needed
**Effort:** Small
**Risk:** Low

The dashboard is served from the same origin, so CORS is unnecessary.

### Option 2: Same-origin CORS
**Pros:** Allows only same-origin access
**Cons:** May break legitimate cross-origin use cases
**Effort:** Small
**Risk:** Low

Return the request origin only if it matches the server's origin.

### Option 3: Configurable CORS origins
**Pros:** Flexible
**Cons:** Configuration complexity
**Effort:** Medium
**Risk:** Medium

Add `--cors-origin` flag to specify allowed origins.

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`

## Acceptance Criteria

- [ ] CORS header removed or restricted
- [ ] Dashboard still works from same origin
- [ ] If CORS needed, must be configurable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | CORS + no auth = data exfiltration |

## Resources

- PR: feature/hzl-web-dashboard
- Security-sentinel agent review
