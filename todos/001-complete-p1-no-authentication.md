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

**Decision:** Keep `0.0.0.0` as default (network accessible).

**Rationale:**
- HZL is designed for multi-device/Tailscale access
- Dashboard is read-only with non-sensitive task data
- Tailscale networks are already authenticated
- Localhost-only would break the primary use case

## Technical Details

**Affected Files:**
- `packages/hzl-web/src/server.ts`
- `packages/hzl-cli/src/commands/serve.ts`

## Acceptance Criteria

- [x] Server binds to 0.0.0.0 by default (network accessible)
- [x] Localhost-only mode available via `--host 127.0.0.1`
- [x] Documentation updated to reflect default behavior

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-31 | Identified during code review | Critical for network deployments |
| 2026-02-01 | Decision: keep 0.0.0.0 default | HZL designed for Tailscale; read-only dashboard is low risk |

## Resources

- PR: feature/hzl-web-dashboard
- Security-sentinel agent review
