---
layout: doc
title: Hooks
parent: Reference
nav_order: 3
---

# Hooks Reference

Configuration, payload format, and delivery semantics for HZL lifecycle hooks.

See [Lifecycle Hooks](../concepts/lifecycle-hooks) for the design rationale and integration patterns.

## Configuration

Hooks are configured in `config.json`:

```json
{
  "hooks": {
    "on_done": {
      "url": "https://example.com/events/inject",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

Config file location:
- Production: `$XDG_CONFIG_HOME/hzl/config.json` (typically `~/.config/hzl/config.json`)
- Dev mode: `.config/hzl/config.json` (in repo root)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hooks.on_done.url` | string | Yes | HTTP(S) endpoint to receive POST requests |
| `hooks.on_done.headers` | object | No | Additional headers sent with each request |

If `hooks.on_done.url` is not set, no outbox rows are created and `hzl hook drain` is a no-op.

## Supported triggers

| Trigger | Event | Status |
|---------|-------|--------|
| `on_done` | Task transitions to `done` | Supported |

Only `on_done` is currently supported. Other lifecycle events (creation, blocking, lease expiry) are not hooked — use polling for those.

## Payload format

Each delivery is an HTTP POST with `Content-Type: application/json`:

```json
{
  "trigger": "on_done",
  "task": {
    "task_id": "01KJNYR7...",
    "title": "Implement auth flow",
    "project": "my-project",
    "status": "done",
    "priority": 1,
    "agent": "worker-1",
    "lease_until": "2026-03-01T14:00:00.000Z"
  },
  "transition": {
    "from": "in_progress",
    "to": "done"
  },
  "timestamp": "2026-03-01T12:30:00.000Z",
  "context": {
    "author": "worker-1",
    "agent_id": "run-2026-03-01-01",
    "session_id": null,
    "correlation_id": null,
    "causation_id": null
  }
}
```

| Field | Description |
|-------|-------------|
| `trigger` | Always `"on_done"` for this hook type |
| `task` | Snapshot of task state at completion time |
| `transition.from` | Previous status (`in_progress` or `blocked`) |
| `transition.to` | Always `"done"` |
| `timestamp` | ISO 8601 time when the hook was enqueued |
| `context` | Event metadata from the completing command |

## Delivery

### Running the drain

```bash
# Process all queued hooks
hzl hook drain

# Process at most 10 hooks this run
hzl hook drain --limit 10

# JSON output for scripting
hzl hook drain --json
```

`hzl hook drain` is a one-shot command. It processes queued deliveries and exits. Schedule it externally:

```bash
# cron (every 2 minutes)
*/2 * * * * hzl hook drain

# systemd timer, launchd plist, or orchestrator scheduler
```

### Drain output

```json
{
  "worker_id": "hook-drain-12345-abc...",
  "claimed": 3,
  "attempted": 3,
  "delivered": 2,
  "retried": 1,
  "failed": 0,
  "reclaimed": 0,
  "reclaimed_failed": 0,
  "preflight_failed": 0,
  "duration_ms": 450
}
```

| Field | Description |
|-------|-------------|
| `claimed` | Rows claimed for processing this run |
| `delivered` | Successfully delivered |
| `retried` | Failed but will retry on next drain |
| `failed` | Permanently failed (max attempts or TTL exceeded) |
| `reclaimed` | Stale processing locks recovered to queued |
| `reclaimed_failed` | Stale locks moved directly to failed |

### Retry and backoff

Failed deliveries retry with exponential backoff:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max attempts | 5 | Total delivery attempts before permanent failure |
| TTL | 24 hours | Maximum age before a queued record expires |
| Backoff base | 30 seconds | Initial retry delay |
| Backoff max | 6 hours | Maximum retry delay |
| Jitter | 20% | Random variance on backoff to avoid thundering herd |
| Lock timeout | 5 minutes | Processing lock expiry (prevents stuck drains) |
| Request timeout | 10 seconds | HTTP request timeout per delivery |

A delivery is permanently marked `failed` when either max attempts or TTL is exceeded.

### Concurrency safety

Multiple `hzl hook drain` processes can run concurrently. Each drain claims rows with an exclusive lock token. Stale locks (from a crashed drain process) are automatically reclaimed on the next run.

## Debugging

### Check outbox state

The outbox table lives in `cache.db`. Inspect it directly for stuck or failed deliveries:

```bash
sqlite3 ~/.local/share/hzl/cache.db \
  "SELECT id, status, attempts, last_error, created_at FROM hook_outbox ORDER BY created_at DESC LIMIT 10"
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hooks never deliver | `hzl hook drain` not scheduled | Add to cron or orchestrator scheduler |
| `delivered: 0, retried: N` | Target endpoint returning errors | Check endpoint availability, review `last_error` |
| `reclaimed: N` on every drain | Previous drain process crashing | Check for OOM or timeout issues in drain host |
| No outbox rows created | `hooks.on_done.url` not configured | Set URL in config.json |
