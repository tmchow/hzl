---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, security, hzl-web]
dependencies: []
---

# Missing HTTP Security Headers

## Problem Statement

The HTML response lacks essential security headers that protect against XSS, clickjacking, and other attacks.

## Findings

**Location:** `/packages/hzl-web/src/server.ts` lines 380-383

```typescript
function handleRoot(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(DASHBOARD_HTML);
}
```

**Missing headers:**
- `Content-Security-Policy` - Prevents XSS and code injection
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `Referrer-Policy` - Controls referrer information leakage

**From security-sentinel agent review.**

## Proposed Solutions

### Option 1: Add all recommended headers (Recommended)
**Pros:** Defense in depth
**Cons:** May need CSP tuning for inline scripts
**Effort:** Small
**Risk:** Low

```typescript
res.writeHead(200, {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
});
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`

## Acceptance Criteria

- [ ] Security headers added to HTML response
- [ ] Dashboard still functions correctly
- [ ] No CSP violations in browser console

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Defense in depth |

## Resources

- PR: feature/hzl-web-dashboard
- Security-sentinel agent review
