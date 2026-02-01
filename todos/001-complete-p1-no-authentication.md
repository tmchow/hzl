---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, security, hzl-web]
dependencies: []
---

# No Authentication on Web Dashboard

## Problem Statement

The hzl-web dashboard server has no authentication mechanism. It binds to `0.0.0.0` by default, making all task data accessible to anyone who can reach the server on the network.

This is a critical security issue when:
- Running on a shared network
- Exposed via Tailscale or other VPN
- Running on a multi-user machine

## Findings

**Location:** `/packages/hzl-web/src/server.ts` line 438

```typescript
server.listen(port, '0.0.0.0');
```

**Exposed data includes:**
- Task titles, descriptions, and metadata
- Comments and checkpoints (may contain sensitive information)
- Agent IDs and claim information
- Project names and organizational structure

**From security-sentinel agent review.**

## Proposed Solutions

### Option 1: Add localhost-only mode (Recommended)
**Pros:** Simple, secure by default
**Cons:** Requires explicit opt-in for network access
**Effort:** Small
**Risk:** Low

Add `--host` flag defaulting to `127.0.0.1`:
```typescript
server.listen(port, host ?? '127.0.0.1');
```

### Option 2: Add basic authentication
**Pros:** Allows network access with protection
**Cons:** More complex, password management
**Effort:** Medium
**Risk:** Low

Add `--password` flag for HTTP Basic Auth.

### Option 3: Token-based authentication
**Pros:** Better for programmatic access
**Cons:** Token management complexity
**Effort:** Medium-High
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`
- `packages/hzl-cli/src/commands/serve.ts`

## Acceptance Criteria

- [ ] Server binds to 127.0.0.1 by default
- [ ] Network binding requires explicit opt-in (e.g., `--host 0.0.0.0`)
- [ ] Warning displayed when binding to non-localhost
- [ ] Documentation updated

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Critical for network deployments |

## Resources

- PR: feature/hzl-web-dashboard
- Security-sentinel agent review
