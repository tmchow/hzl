# Stale Claim Warning — Design

## Problem

HZL has no way to distinguish "claimed and actively working" from "claimed and silent." Both look identical in `hzl task list` and the dashboard. If an agent claims a task then fails before doing any work, the task sits in `in_progress` with zero checkpoints indefinitely.

The existing `hzl task stuck` command only catches expired leases — it misses the case where the lease is still active but no checkpoint was ever written.

## Terminology

| State | Meaning | Detection |
|-------|---------|-----------|
| **Stuck** | Lease expired | `lease_until < now` (existing) |
| **Stale** | Claimed, no proof of life | Zero checkpoints AND `claimed_at` older than threshold |

Future (out of scope): **Went quiet** — had checkpoints but last one is older than threshold. Different failure mode, different recovery action.

## Approach

Computed at query time from existing data. No new events, no new projection columns, no schema migration.

The "stale" check is: `status = 'in_progress' AND NOT EXISTS (SELECT 1 FROM task_checkpoints WHERE task_id = t.task_id) AND claimed_at < datetime('now', '-N minutes')`.

Threshold is configurable per-query via CLI flag / API parameter, with a default of 10 minutes.

## CLI: `hzl task list`

New flag: `--stale-threshold <minutes>` (default: 10).

In-progress tasks with zero checkpoints past the threshold display a warning indicator:

```
Tasks:
  → [abc123] Implement auth (backend)         agent:coder-1
  ⚠ [def456] Fix pagination (backend)         agent:coder-2  [stale 23m]
  ○ [ghi789] Add search (backend)
```

- `→` becomes `⚠` for stale tasks
- `[stale Nm]` suffix shows duration since claim with no checkpoint
- `--stale-threshold 0` disables the indicator

JSON output adds two fields to each in-progress task:

```json
{
  "task_id": "def456",
  "status": "in_progress",
  "claimed_at": "2026-03-03T10:00:00Z",
  "stale": true,
  "stale_minutes": 23
}
```

`stale` is `false` and `stale_minutes` is `null` for non-stale / non-in-progress tasks.

## CLI: `hzl task stuck`

New flag: `--stale` — includes stale tasks alongside lease-expired tasks.

New flag: `--stale-threshold <minutes>` (default: 10) — controls threshold when `--stale` is used.

```bash
hzl task stuck              # Existing behavior — lease-expired only
hzl task stuck --stale      # Also include stale claims
hzl task stuck --stale --stale-threshold 5
```

Output groups by reason:

```
Stuck tasks:
  [abc123] Fix auth — agent:coder-1 — lease expired 12m ago

Stale tasks (no checkpoints):
  [def456] Fix pagination — agent:coder-2 — claimed 23m ago, 0 checkpoints
```

JSON output adds `"reason": "lease_expired" | "stale"`.

## Web Dashboard

**Task card**: Stale in-progress cards get an amber left border or amber dot. No text on the card.

**Task modal**: Shows a warning line when stale: "Stale — claimed 23 minutes ago with no checkpoints."

**Agent roster**: Stale tasks under an agent get the same amber indicator.

Threshold passed as API query parameter (`?staleThreshold=10`) with server-side default.

## Query Shape (hzl-core)

```sql
SELECT t.*,
  CASE
    WHEN t.status = 'in_progress'
      AND NOT EXISTS (SELECT 1 FROM task_checkpoints c WHERE c.task_id = t.task_id)
      AND t.claimed_at < datetime('now', '-' || ? || ' minutes')
    THEN 1 ELSE 0
  END AS stale
FROM tasks_current t
```

Designed so "went quiet" can be added later by changing `NOT EXISTS` to a `MAX(timestamp)` comparison in the same position.

## Out of Scope

- No auto-expiry or auto-steal of stale tasks
- No new events or projection columns
- No config file setting for threshold (CLI flag + API param only)
- No "went quiet" detection
